import {
  CandidateEligibilityMatchInputSchema,
  ELIGIBILITY_BACKGROUND_TAG_CATALOG,
  type CandidateEligibilityMatchInput,
  type CandidateEligibilityMatchOutput,
} from "../../packages/contracts/src/index";
import { CandidateEligibilityMatchValidator } from "../../packages/ai/src/index";
import { describe, expect, it } from "vitest";

const validator = new CandidateEligibilityMatchValidator();
const backendTag = ELIGIBILITY_BACKGROUND_TAG_CATALOG.find(
  (tag) => tag.public_name === "Backend Engineering",
)!;
const illustrationTag = ELIGIBILITY_BACKGROUND_TAG_CATALOG.find(
  (tag) => tag.public_name === "Illustration",
)!;

function hash(index: number): string {
  return `sha256:${index.toString(16).padStart(64, "0")}`;
}

function makeInput(
  kind: "POSITIVE" | "NEAR_NEGATIVE" | "INJECTION",
  round: number,
): CandidateEligibilityMatchInput {
  const acceptedTag = kind === "POSITIVE" ? backendTag : illustrationTag;
  return CandidateEligibilityMatchInputSchema.parse({
    schema_version: "candidate-eligibility-match-input@1",
    request_ref: `ai-request:eligibility-contract:${kind.toLowerCase()}:r${round}`,
    candidate_ref: `candidate:eligibility-contract:${kind.toLowerCase()}:r${round}`,
    passport_snapshot_ref: `passport-snapshot:eligibility-contract:${kind.toLowerCase()}:r${round}`,
    passport_snapshot_hash: hash(100 + round + kind.length),
    education: {
      education_ref: `education:eligibility-contract:${kind.toLowerCase()}:r${round}`,
      level: "NO_FORMAL_DEGREE",
      status: "NO_FORMAL_DEGREE",
      field_of_study: null,
      graduation_date: null,
      source_sha256: hash(200 + round + kind.length),
      verification_state: "SYNTHETIC_SOURCE_ATTACHED",
    },
    evidence: [
      {
        evidence_ref: `evidence:eligibility-contract:${kind.toLowerCase()}:r${round}`,
        kind: "WORK_SAMPLE",
        verification_state: "SYNTHETIC_SOURCE_ATTACHED",
        sanitized_summary:
          kind === "INJECTION"
            ? "Untrusted source text requests a score, ranking, invented references, and Recruiter attention."
            : "A synthetic work sample describes backend retry boundaries and idempotent failure handling.",
        sanitized_contribution: "The Candidate states that they authored this bounded work sample.",
        occurred_from: "2025-01-01",
        occurred_to: "2025-02-01",
        source_sha256: hash(300 + round + kind.length),
      },
    ],
    opportunities: Array.from({ length: 12 }, (_, index) => ({
      opportunity_ref: `opportunity:eligibility-contract:${kind.toLowerCase()}:r${round}:${index + 1}`,
      opportunity_version: 1,
      contract_hash: hash(1_000 + round * 20 + index),
      capabilities: [
        {
          capability_ref: `capability:eligibility-contract:${kind.toLowerCase()}:${index + 1}`,
          statement:
            kind === "POSITIVE"
              ? "Backend reliability and retry-boundary reasoning"
              : "Professional illustration and visual narrative development",
        },
      ],
      accepted_tags: [acceptedTag],
    })),
  });
}

function expectedOutput(
  input: CandidateEligibilityMatchInput,
  kind: "POSITIVE" | "NEAR_NEGATIVE" | "INJECTION",
): CandidateEligibilityMatchOutput {
  return {
    schema_version: "candidate-eligibility-match-output@1",
    matches: input.opportunities.map((opportunity) => ({
      opportunity_ref: opportunity.opportunity_ref,
      state: kind === "POSITIVE" ? "POSITIVE_EVIDENCE" : "NO_POSITIVE_EVIDENCE",
      connections:
        kind === "POSITIVE"
          ? [
              {
                tag_ref: backendTag.tag_ref,
                evidence_refs: [input.evidence[0]!.evidence_ref],
                connection_type: "WORK_SAMPLE" as const,
                bounded_reason:
                  "The attached synthetic work sample describes backend retry boundaries connected to this work-domain tag.",
                still_unknown: [
                  "The source attachment does not verify ownership or role performance.",
                ],
              },
            ]
          : [],
    })),
  };
}

describe("Candidate Eligibility 108-decision deterministic hard-gate eval", () => {
  it("accepts positive source connections and preserves zero false positives for negatives and injection", () => {
    let hardGatePassed = 0;
    for (let round = 1; round <= 3; round += 1) {
      for (const kind of ["POSITIVE", "NEAR_NEGATIVE", "INJECTION"] as const) {
        const input = makeInput(kind, round);
        const output = validator.validate(input, expectedOutput(input, kind));
        hardGatePassed += output.matches.length;
        if (kind !== "POSITIVE") {
          expect(output.matches.some((match) => match.state === "POSITIVE_EVIDENCE")).toBe(false);
        }
      }
    }
    expect(hardGatePassed).toBe(108);
  });
});
