import {
  BuildMatchEdgeInputV2Schema,
  MatchEdgeDraftV2Schema,
  type BuildMatchEdgeInputV2,
  type MatchEdgeDraftV2,
} from "@onlyboth/contracts";

export const MATCHING_REPLAY_ID = "matching-v1";
export const MATCHING_OPPORTUNITY_REF = "opp-senior-backend-1";
export const MATCHING_CYCLE_REF = "matching-cycle-senior-backend-1";
export const MATCHING_CONTRACT_VERSION_REF = "contract-payment-retry@1";
export const MATCHING_CONTRACT_HASH = `sha256:${"1".repeat(64)}`;
export const MATCHING_LABEL_POLICY_REF = "label-policy@1";
export const MATCHING_PROOF_TEMPLATE_REF = "payment-retry@1";
export const MATCHING_CHALLENGE_CATALOG_REF = "payment-retry@1";
export const MATCHING_PUBLIC_SEED = "onlyboth-explore-v1-00024";
export const MATCHING_ALGORITHM_VERSION = "onlyboth.direct-explore@1";
export const MATCHING_REVIEWER_REF = "reviewer-sarah-chen";
export const MATCHING_UNCERTAINTY_REF = "uncertainty:atomicity-and-failure-boundaries";
export const MATCHING_CAPABILITY_REF = "capability:inspect-state-transition";
export const MATCHING_PROOF_TEMPLATE_AI_REF = "proof-template:payment-retry@1";

export const MATCHING_CANDIDATE_REFS = Object.freeze([
  ...Array.from({ length: 19 }, (_, index) => `candidate-${String(index + 1).padStart(2, "0")}`),
  "candidate-42",
]);

export const PROOFABLE_CANDIDATE_REFS = Object.freeze([
  "candidate-03",
  "candidate-05",
  "candidate-07",
  "candidate-08",
  "candidate-11",
  "candidate-17",
  "candidate-19",
  "candidate-42",
]);

export function candidateDisplayRef(candidateRef: string): string {
  return `Candidate ${candidateRef.slice("candidate-".length)}`;
}

export function matchEdgeRef(candidateRef: string): string {
  return `match-edge-${candidateRef.slice("candidate-".length)}`;
}

export function syntheticBuildMatchEdgeInput(candidateRef: string): BuildMatchEdgeInputV2 {
  const proofable = PROOFABLE_CANDIDATE_REFS.includes(candidateRef);
  const candidateToken = candidateRef.slice("candidate-".length);
  const contractSourceRef = "source:contract:atomicity-risk";
  const claimSourceRef = `source:claim:${candidateToken}`;
  const hardFactSourceRef = `source:hard-facts:${candidateToken}`;
  return BuildMatchEdgeInputV2Schema.parse({
    schema_version: "build-match-edge-input@2",
    request_ref: `match-request:${candidateToken}`,
    matching_cycle: {
      matching_cycle_ref: MATCHING_CYCLE_REF,
      version: 1,
      opportunity_ref: MATCHING_OPPORTUNITY_REF,
    },
    sealed_contract: {
      contract_version_ref: MATCHING_CONTRACT_VERSION_REF,
      contract_hash: MATCHING_CONTRACT_HASH,
      uncertainties: [
        {
          uncertainty_ref: MATCHING_UNCERTAINTY_REF,
          capability_refs: [MATCHING_CAPABILITY_REF],
          source_refs: [contractSourceRef],
        },
      ],
    },
    claim_snapshot: {
      claim_snapshot_ref: `claim-snapshot:${candidateToken}@1`,
      version: 1,
      candidate_ref: candidateRef,
      claims: [
        {
          claim_ref: `claim:${candidateToken}:retry-analysis`,
          statement: proofable
            ? "A source-backed claim about reasoning through retry state transitions."
            : "A source-backed claim outside the Contract's bounded capability.",
          capability_refs: [
            proofable ? MATCHING_CAPABILITY_REF : "capability:unrelated-observability",
          ],
          source_refs: [claimSourceRef],
        },
      ],
      hard_facts: [
        {
          fact_ref: `fact:${candidateToken}:work-authorization`,
          fact_type: "work_authorization",
          value: "US",
          source_refs: [hardFactSourceRef],
        },
        {
          fact_ref: `fact:${candidateToken}:timezone-overlap`,
          fact_type: "timezone_overlap",
          value: 6,
          source_refs: [hardFactSourceRef],
        },
        {
          fact_ref: `fact:${candidateToken}:required-language`,
          fact_type: "required_language",
          value: "TypeScript,SQL",
          source_refs: [hardFactSourceRef],
        },
      ],
    },
    source_refs: [
      {
        id: contractSourceRef,
        kind: "job_description",
        sha256: `sha256:${"2".repeat(64)}`,
      },
      {
        id: claimSourceRef,
        kind: "claim",
        sha256: `sha256:${candidateToken.padStart(64, "0")}`,
      },
      {
        id: hardFactSourceRef,
        kind: "claim",
        sha256: `sha256:${candidateToken.padEnd(64, "0")}`,
      },
    ],
    allowed_proof_templates: [
      {
        proof_template_ref: MATCHING_PROOF_TEMPLATE_AI_REF,
        version: 1,
        capability_refs: [MATCHING_CAPABILITY_REF],
      },
    ],
  });
}

export function syntheticMatchEdgeOutput(candidateRef: string): MatchEdgeDraftV2 {
  const candidateToken = candidateRef.slice("candidate-".length);
  if (!PROOFABLE_CANDIDATE_REFS.includes(candidateRef)) {
    return MatchEdgeDraftV2Schema.parse({
      schema_version: "match-edge-draft@2",
      decision: "abstain",
      uncertainty_ref: null,
      claim_refs: [],
      proof_template_ref: null,
      source_refs: [],
      verifiable_reason: null,
      still_unknown: [],
      reason_code: "NO_SHARED_CAPABILITY",
      explanation: "The frozen claim has no source-backed connection to the sealed uncertainty.",
      related_refs: [MATCHING_UNCERTAINTY_REF, `claim:${candidateToken}:retry-analysis`],
    });
  }
  return MatchEdgeDraftV2Schema.parse({
    schema_version: "match-edge-draft@2",
    decision: "propose",
    uncertainty_ref: MATCHING_UNCERTAINTY_REF,
    claim_refs: [`claim:${candidateToken}:retry-analysis`],
    proof_template_ref: MATCHING_PROOF_TEMPLATE_AI_REF,
    source_refs: ["source:contract:atomicity-risk", `source:claim:${candidateToken}`],
    verifiable_reason:
      "A six-minute payment-retry proof can test the claimed state-transition reasoning against the sealed uncertainty.",
    still_unknown: ["Behavior under a reviewer-selected failure branch remains unknown."],
    reason_code: null,
    explanation: null,
    related_refs: [],
  });
}

export const SYNTHETIC_MATCH_EDGE_CASES = Object.freeze(
  MATCHING_CANDIDATE_REFS.map((candidateRef) => ({
    candidateRef,
    input: syntheticBuildMatchEdgeInput(candidateRef),
    output: syntheticMatchEdgeOutput(candidateRef),
  })),
);
