import {
  BuildMatchEdgeInputV2Schema,
  MatchEdgeDraftV2Schema,
  type BuildMatchEdgeInputV2,
  type MatchEdgeDraftV2,
} from "@onlyboth/contracts";

import { HiringIntelligenceError } from "./errors";

const FORBIDDEN_DECISION_LANGUAGE =
  /\b(?:score|scoring|rank|ranking|best candidate|hire|hiring recommendation|reject|advance|close|direct|explore|culture fit|personality|emotion|cheating|integrity)\b/iu;
const SEALED_LABEL_LANGUAGE =
  /\b(?:school|university|college|previous employer|referral|legal name|candidate photo|pedigree)\b/iu;
const EXECUTABLE_CONTENT =
  /(?:```|https?:\/\/|\b(?:sudo|curl|wget|bash|powershell|process\.env|rm\s+-rf|npm\s+run|pnpm\s+run)\b|(?:^|\s)\/(?:etc|usr|var)\/)/iu;

function reject(
  code:
    | "AI_SCHEMA_MISMATCH"
    | "AI_SOURCE_REF_INVALID"
    | "AI_CATALOG_INVALID"
    | "AI_OUTPUT_POLICY_VIOLATION",
  message: string,
): never {
  throw new HiringIntelligenceError(code, "buildMatchEdge", false, message);
}

function intersectsAll(capabilitySets: readonly ReadonlySet<string>[]): boolean {
  const first = capabilitySets[0];
  if (first === undefined) return false;
  return [...first].some((capability) => capabilitySets.every((set) => set.has(capability)));
}

export interface CurrentMatchPins {
  readonly matchingCycleRef: string;
  readonly matchingCycleVersion: number;
  readonly contractVersionRef: string;
  readonly contractHash: string;
  readonly claimSnapshotRef: string;
  readonly claimSnapshotVersion: number;
}

export function matchInputPinsAreCurrent(
  input: BuildMatchEdgeInputV2,
  current: CurrentMatchPins,
): boolean {
  return (
    input.matching_cycle.matching_cycle_ref === current.matchingCycleRef &&
    input.matching_cycle.version === current.matchingCycleVersion &&
    input.sealed_contract.contract_version_ref === current.contractVersionRef &&
    input.sealed_contract.contract_hash === current.contractHash &&
    input.claim_snapshot.claim_snapshot_ref === current.claimSnapshotRef &&
    input.claim_snapshot.version === current.claimSnapshotVersion
  );
}

export function validateMatchEdgeDraft(
  rawInput: BuildMatchEdgeInputV2,
  rawOutput: MatchEdgeDraftV2,
): MatchEdgeDraftV2 {
  const input = BuildMatchEdgeInputV2Schema.parse(rawInput);
  const output = MatchEdgeDraftV2Schema.parse(rawOutput);
  const sourceRefs = new Set(input.source_refs.map((source) => source.id));
  const uncertaintyByRef = new Map(
    input.sealed_contract.uncertainties.map((uncertainty) => [
      uncertainty.uncertainty_ref,
      uncertainty,
    ]),
  );
  const claimByRef = new Map(input.claim_snapshot.claims.map((claim) => [claim.claim_ref, claim]));
  const templateByRef = new Map(
    input.allowed_proof_templates.map((template) => [template.proof_template_ref, template]),
  );
  const allInputRefs = new Set<string>([
    input.request_ref,
    input.matching_cycle.matching_cycle_ref,
    input.matching_cycle.opportunity_ref,
    input.sealed_contract.contract_version_ref,
    input.claim_snapshot.claim_snapshot_ref,
    input.claim_snapshot.candidate_ref,
    ...sourceRefs,
    ...uncertaintyByRef.keys(),
    ...claimByRef.keys(),
    ...templateByRef.keys(),
  ]);

  const outputText =
    output.decision === "propose"
      ? [output.verifiable_reason ?? "", ...output.still_unknown]
      : [output.explanation ?? ""];
  if (
    outputText.some(
      (value) =>
        FORBIDDEN_DECISION_LANGUAGE.test(value) ||
        SEALED_LABEL_LANGUAGE.test(value) ||
        EXECUTABLE_CONTENT.test(value),
    )
  ) {
    reject("AI_OUTPUT_POLICY_VIOLATION", "MatchEdge output contains prohibited content.");
  }

  if (output.decision === "abstain") {
    if (output.related_refs.some((reference) => !allInputRefs.has(reference))) {
      reject("AI_SOURCE_REF_INVALID", "Abstain contains a ref outside the frozen input.");
    }
    return structuredClone(output);
  }

  if (
    output.uncertainty_ref === null ||
    output.proof_template_ref === null ||
    output.verifiable_reason === null
  ) {
    reject("AI_SCHEMA_MISMATCH", "Proposal fields are incomplete.");
  }

  const uncertainty = uncertaintyByRef.get(output.uncertainty_ref);
  const claims = output.claim_refs.map((reference) => claimByRef.get(reference));
  const template = templateByRef.get(output.proof_template_ref);
  if (uncertainty === undefined || template === undefined || claims.some((claim) => !claim)) {
    reject("AI_SOURCE_REF_INVALID", "Proposal references an object outside the frozen input.");
  }
  if (new Set(output.claim_refs).size !== output.claim_refs.length) {
    reject("AI_SOURCE_REF_INVALID", "Proposal contains duplicate claim refs.");
  }
  const resolvedClaims = claims.filter((claim) => claim !== undefined);
  const capabilitySets = [
    new Set(uncertainty.capability_refs),
    ...resolvedClaims.map((claim) => new Set(claim.capability_refs)),
    new Set(template.capability_refs),
  ];
  if (!intersectsAll(capabilitySets)) {
    reject(
      "AI_CATALOG_INVALID",
      "Uncertainty, claims, and Proof Template do not share a capability.",
    );
  }
  if (output.source_refs.some((reference) => !sourceRefs.has(reference))) {
    reject("AI_SOURCE_REF_INVALID", "Proposal contains an unknown source ref.");
  }
  const requiredSourceRefs = new Set([
    ...uncertainty.source_refs,
    ...resolvedClaims.flatMap((claim) => claim.source_refs),
  ]);
  if ([...requiredSourceRefs].some((reference) => !output.source_refs.includes(reference))) {
    reject(
      "AI_SOURCE_REF_INVALID",
      "Proposal does not cover the selected uncertainty and every selected claim source.",
    );
  }
  return structuredClone(output);
}
