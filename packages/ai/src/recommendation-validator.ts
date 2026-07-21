import type {
  ChallengeRecommendation,
  ChallengeRecommendationItem,
  RecommendChallengesInput,
} from "@onlyboth/contracts";
import type { CatalogVersionPin, ChallengeCatalogRegistry } from "@onlyboth/challenge-catalog";

import { HiringIntelligenceError } from "./errors";

const FORBIDDEN_DECISION_LANGUAGE =
  /\b(?:score|scoring|rank|ranking|best candidate|hire|hiring recommendation|reject|advance|close|culture fit|personality|emotion|cheating probability|integrity score)\b/iu;
const EXECUTABLE_CONTENT =
  /(?:```|\b(?:sudo|curl|wget|bash|powershell|process\.env|rm\s+-rf)\b|(?:^|\s)\/(?:etc|usr|var)\/)/iu;
const SEALED_LABEL_LANGUAGE =
  /\b(?:school name|previous employer|referral source|legal name|candidate photo|pedigree)\b/iu;

function recommendationRef(item: ChallengeRecommendationItem): string {
  return `${item.challenge_id}@${item.version}`;
}

function reject(
  code: "AI_SOURCE_REF_INVALID" | "AI_CATALOG_INVALID" | "AI_OUTPUT_POLICY_VIOLATION",
  message: string,
): never {
  throw new HiringIntelligenceError(code, "recommendChallenges", false, message);
}

export function validateChallengeRecommendation(
  input: RecommendChallengesInput,
  output: ChallengeRecommendation,
  catalog: ChallengeCatalogRegistry,
  catalogPin: CatalogVersionPin,
): ChallengeRecommendation {
  if (input.challenge_catalog_version_ref !== catalogPin.catalog_ref) {
    reject("AI_CATALOG_INVALID", "Input does not match the pinned Catalog version.");
  }

  const inputOptionRefs = input.allowed_challenges.map(
    (option) => `${option.challenge_id}@${option.version}`,
  );
  if (new Set(inputOptionRefs).size !== inputOptionRefs.length) {
    reject("AI_CATALOG_INVALID", "Input contains duplicate Catalog options.");
  }
  for (const option of input.allowed_challenges) {
    try {
      const catalogOption = catalog.resolveExecutableChallenge(
        `${option.challenge_id}@${option.version}`,
        catalogPin,
      );
      const expectedCapabilities = [...catalogOption.capability_refs].sort();
      const actualCapabilities = [...option.capability_refs].sort();
      if (
        JSON.stringify(expectedCapabilities) !== JSON.stringify(actualCapabilities) ||
        catalogOption.candidate_notice !== option.candidate_notice
      ) {
        reject("AI_CATALOG_INVALID", "Input option does not match the locked Catalog record.");
      }
    } catch (error: unknown) {
      if (error instanceof HiringIntelligenceError) {
        throw error;
      }
      reject("AI_CATALOG_INVALID", "Input contains an option outside the locked Catalog.");
    }
  }

  const policyText = [output.reason ?? "", ...output.still_unknown];
  if (
    policyText.some(
      (value) =>
        FORBIDDEN_DECISION_LANGUAGE.test(value) ||
        EXECUTABLE_CONTENT.test(value) ||
        SEALED_LABEL_LANGUAGE.test(value),
    )
  ) {
    reject("AI_OUTPUT_POLICY_VIOLATION", "Output metadata contains prohibited decision content.");
  }

  if (output.decision === "needs_human") {
    return structuredClone(output);
  }

  const refs = output.recommendations.map(recommendationRef);
  try {
    catalog.validateRecommendations(refs, catalogPin);
  } catch {
    reject("AI_CATALOG_INVALID", "Recommendation does not match the pinned Catalog lock.");
  }

  const allowedEvidenceRefs = new Set(
    input.stage_a_evidence.map((evidence) => evidence.evidence_ref),
  );
  const allowedCapabilityRefs = new Set(input.capability_refs);
  const allowedOptions = new Map(
    input.allowed_challenges.map((option) => [
      `${option.challenge_id}@${option.version}`,
      new Set(option.capability_refs),
    ]),
  );

  for (const item of output.recommendations) {
    const ref = recommendationRef(item);
    const optionCapabilityRefs = allowedOptions.get(ref);
    if (optionCapabilityRefs === undefined) {
      reject("AI_CATALOG_INVALID", "Recommendation references a Catalog option outside the input.");
    }
    if (item.evidence_refs.some((reference) => !allowedEvidenceRefs.has(reference))) {
      reject("AI_SOURCE_REF_INVALID", "Recommendation contains an unknown Evidence reference.");
    }
    if (
      item.capability_refs.some(
        (reference) =>
          !allowedCapabilityRefs.has(reference) || !optionCapabilityRefs.has(reference),
      )
    ) {
      reject("AI_CATALOG_INVALID", "Recommendation exceeds the allowed capability band.");
    }
    if (
      FORBIDDEN_DECISION_LANGUAGE.test(item.rationale) ||
      EXECUTABLE_CONTENT.test(item.rationale) ||
      SEALED_LABEL_LANGUAGE.test(item.rationale)
    ) {
      reject("AI_OUTPUT_POLICY_VIOLATION", "Recommendation contains prohibited decision content.");
    }
  }

  return structuredClone(output);
}
