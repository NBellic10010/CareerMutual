import { describe, expect, it } from "vitest";
import { syntheticBuildMatchEdgeInput } from "@onlyboth/demo-replay";

import { PROMPT_REGISTRY } from "./prompt-registry.js";
import {
  ChallengeRecommendationSchema,
  CompileContractInputSchema,
  CompressEvidenceInputSchema,
  ContractDraftSchema,
  MatchEdgeDraftSchema,
  RecommendChallengesInputSchema,
  VeiledCandidateForAiSchema,
} from "./schemas.js";
import {
  HiringIntelligenceUnavailableError,
  UnconfiguredHiringIntelligenceAdapter,
} from "./unconfigured-adapter.js";

const SOURCE_HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const veiledCandidate = {
  candidate_ref: "candidate-42",
  hard_facts: [
    {
      id: "hard-fact-1",
      fact_type: "required_language" as const,
      value: "TypeScript",
    },
  ],
  claims: [
    {
      id: "claim-1",
      statement: "Handled stateful payment retries.",
      source_refs: ["source-claim-1"],
    },
  ],
};

const publicProofTemplate = {
  proof_template_id: "payment-retry@1",
  version: 1,
  capability_refs: ["inspect_state_transition"],
  difficulty_band: "mvp-1",
};

describe("AI boundary schemas", () => {
  it.each(["name", "photo", "school_name", "previous_employer_name", "referral_source"])(
    "rejects sealed or unknown candidate field '%s'",
    (field) => {
      expect(
        VeiledCandidateForAiSchema.safeParse({
          ...veiledCandidate,
          [field]: "must-not-cross-the-veil",
        }).success,
      ).toBe(false);
    },
  );

  it("rejects unknown decision fields such as a candidate score", () => {
    expect(
      ContractDraftSchema.safeParse({
        schema_version: "contract-draft@1",
        status: "draft",
        critical_failures: [],
        decision_uncertainties: [],
        capabilities: [],
        hard_requirements: [],
        proof_template_ids: [],
        unknowns: [],
        candidate_score: 87,
      }).success,
    ).toBe(false);
  });

  it("accepts explicit abstain and needs-human outputs", () => {
    expect(
      MatchEdgeDraftSchema.parse({
        schema_version: "match-edge-draft@1",
        decision: "abstain",
        reason: "No bounded proof can test the stated claim.",
        missing_refs: ["proof-template-missing"],
      }).decision,
    ).toBe("abstain");

    expect(
      ChallengeRecommendationSchema.parse({
        schema_version: "challenge-recommendation@1",
        decision: "needs_human",
        recommendations: [],
        still_unknown: [],
        reason: "Stage A evidence does not support an allowlisted challenge.",
      }).decision,
    ).toBe("needs_human");
  });
});

describe("prompt registry", () => {
  it("forbids tools and remote conversation state for every operation", () => {
    const promptSpecs = Object.values(PROMPT_REGISTRY);

    expect(promptSpecs).toHaveLength(7);
    expect(promptSpecs.every((spec) => spec.permitsTools === false)).toBe(true);
    expect(promptSpecs.every((spec) => spec.permitsRemoteConversationState === false)).toBe(true);
    expect(new Set(promptSpecs.map((spec) => spec.promptId)).size).toBe(promptSpecs.length);
  });
});

describe("UnconfiguredHiringIntelligenceAdapter", () => {
  it("fails closed for all four hiring-intelligence operations", async () => {
    const adapter = new UnconfiguredHiringIntelligenceAdapter();
    const compileInput = CompileContractInputSchema.parse({
      schema_version: "compile-contract-input@1",
      request_ref: "request-compile-1",
      opportunity_ref: "opportunity-1",
      untrusted_sources: [
        {
          ref: { id: "job-source-1", kind: "job_description", sha256: SOURCE_HASH },
          content: "Senior backend engineer role.",
        },
      ],
      allowed_proof_templates: [publicProofTemplate],
    });
    const matchInput = syntheticBuildMatchEdgeInput("candidate-42");
    const recommendInput = RecommendChallengesInputSchema.parse({
      schema_version: "recommend-challenges-input@1",
      request_ref: "request-challenge-1",
      review_window_ref: "window-1",
      contract_version_ref: "contract-1@1",
      challenge_catalog_version_ref: "payment-retry@1",
      capability_refs: ["inspect_state_transition"],
      stage_a_evidence: [
        {
          evidence_ref: "evidence-1",
          evidence_type: "verification",
          summary: "The common verifier completed.",
          sha256: SOURCE_HASH,
        },
      ],
      allowed_challenges: [
        {
          challenge_id: "payment-retry/redis-failover",
          version: 1,
          capability_refs: ["inspect_state_transition"],
          candidate_notice: "Test acknowledgement loss during failover.",
        },
      ],
    });
    const compressInput = CompressEvidenceInputSchema.parse({
      schema_version: "compress-evidence-input@1",
      request_ref: "request-evidence-1",
      review_window_ref: "window-1",
      contract_version_ref: "contract-1@1",
      selected_challenge_ref: "payment-retry/redis-failover@1",
      evidence: [
        {
          evidence_ref: "verification-1",
          evidence_type: "verification",
          summary: "The deterministic verifier completed.",
          sha256: SOURCE_HASH,
        },
      ],
    });

    await expect(adapter.compileContract(compileInput)).rejects.toMatchObject({
      code: "AI_ADAPTER_NOT_CONFIGURED",
      operation: "compileContract",
    });
    await expect(adapter.buildMatchEdge(matchInput)).rejects.toMatchObject({
      code: "AI_ADAPTER_NOT_CONFIGURED",
      operation: "buildMatchEdge",
    });
    await expect(adapter.recommendChallenges(recommendInput)).rejects.toMatchObject({
      code: "AI_ADAPTER_NOT_CONFIGURED",
      operation: "recommendChallenges",
    });
    await expect(adapter.compressEvidence(compressInput)).rejects.toMatchObject({
      code: "AI_ADAPTER_NOT_CONFIGURED",
      operation: "compressEvidence",
    });

    await expect(adapter.compileContract(compileInput)).rejects.toBeInstanceOf(
      HiringIntelligenceUnavailableError,
    );
  });
});
