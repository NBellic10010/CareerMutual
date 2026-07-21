import type {
  CandidateEligibilityMatchInput,
  CandidateEligibilityMatchOutput,
  CandidateEvidenceKind,
} from "@onlyboth/contracts";

import { HiringIntelligenceError } from "./errors.js";

const PROHIBITED =
  /(?:\b(?:scores?|scoring|ranks?|ranking|fit|hire|hired|reject|rejected|queue|attention|direct|explore|best|top|verified|proven|proves|confirmed|qualified|unqualified|school|university|employer|personality|integrity)\b|\b\d{1,3}\s*%|<script|```|rm\s+-rf|\$\()/iu;

const TYPE_BY_KIND: Readonly<Record<CandidateEvidenceKind, string>> = {
  EMPLOYMENT_VERIFICATION: "WORK_EXPERIENCE",
  CERTIFICATION: "CERTIFICATION",
  WORK_SAMPLE: "WORK_SAMPLE",
  GITHUB_REPOSITORY: "OTHER_EVIDENCE",
  ONLINE_WORK_PROOF: "OTHER_EVIDENCE",
};

export function validateCandidateEligibilityMatchOutput(
  input: CandidateEligibilityMatchInput,
  output: CandidateEligibilityMatchOutput,
): CandidateEligibilityMatchOutput {
  const inputOpportunityRefs = new Set(input.opportunities.map((job) => job.opportunity_ref));
  const outputOpportunityRefs = output.matches.map((match) => match.opportunity_ref);
  if (
    outputOpportunityRefs.length !== inputOpportunityRefs.size ||
    new Set(outputOpportunityRefs).size !== outputOpportunityRefs.length ||
    outputOpportunityRefs.some((reference) => !inputOpportunityRefs.has(reference)) ||
    [...inputOpportunityRefs].some((reference) => !outputOpportunityRefs.includes(reference))
  ) {
    throw new HiringIntelligenceError(
      "AI_SOURCE_REF_INVALID",
      "deriveCandidateEligibilityMatches",
      false,
      "Eligibility output must contain every input opportunity exactly once.",
    );
  }

  const evidenceKinds = new Map(input.evidence.map((item) => [item.evidence_ref, item.kind]));
  const jobs = new Map(input.opportunities.map((job) => [job.opportunity_ref, job]));
  for (const match of output.matches) {
    const job = jobs.get(match.opportunity_ref);
    if (job === undefined) {
      throw new HiringIntelligenceError(
        "AI_SOURCE_REF_INVALID",
        "deriveCandidateEligibilityMatches",
        false,
        "Eligibility output references an unknown opportunity.",
      );
    }
    const tags = new Map(job.accepted_tags.map((tag) => [tag.tag_ref, tag]));
    for (const connection of match.connections) {
      if (PROHIBITED.test([connection.bounded_reason, ...connection.still_unknown].join(" "))) {
        throw new HiringIntelligenceError(
          "AI_OUTPUT_POLICY_VIOLATION",
          "deriveCandidateEligibilityMatches",
          false,
          "Eligibility output contains prohibited decision, identity, or authority language.",
        );
      }
      const tag = tags.get(connection.tag_ref);
      if (tag === undefined) {
        throw new HiringIntelligenceError(
          "AI_SOURCE_REF_INVALID",
          "deriveCandidateEligibilityMatches",
          false,
          "Eligibility output references an unknown accepted tag.",
        );
      }
      if (connection.connection_type === "EDUCATION") {
        if (
          tag.tag_kind !== "EDUCATION_FIELD" ||
          connection.evidence_refs.some((reference) => reference !== input.education.education_ref)
        ) {
          throw new HiringIntelligenceError(
            "AI_SOURCE_REF_INVALID",
            "deriveCandidateEligibilityMatches",
            false,
            "Education connections require the education ref and an education-field tag.",
          );
        }
        continue;
      }
      if (
        tag.tag_kind !== "WORK_DOMAIN" ||
        connection.evidence_refs.includes(input.education.education_ref)
      ) {
        throw new HiringIntelligenceError(
          "AI_SOURCE_REF_INVALID",
          "deriveCandidateEligibilityMatches",
          false,
          "Non-education evidence may connect only to work-domain tags.",
        );
      }
      for (const reference of connection.evidence_refs) {
        const kind = evidenceKinds.get(reference);
        if (kind === undefined || TYPE_BY_KIND[kind] !== connection.connection_type) {
          throw new HiringIntelligenceError(
            "AI_SOURCE_REF_INVALID",
            "deriveCandidateEligibilityMatches",
            false,
            "Eligibility connection type does not match its evidence source.",
          );
        }
      }
    }
  }
  return output;
}

export class CandidateEligibilityMatchValidator {
  public validate(
    input: CandidateEligibilityMatchInput,
    output: CandidateEligibilityMatchOutput,
  ): CandidateEligibilityMatchOutput {
    return validateCandidateEligibilityMatchOutput(input, output);
  }
}
