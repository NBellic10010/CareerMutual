import { z } from "zod";

export const AiOpaqueRefSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/u);

export const AiSha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

export const SourceRefSchema = z
  .object({
    id: AiOpaqueRefSchema,
    kind: z.enum([
      "job_description",
      "ticket",
      "repository",
      "claim",
      "artifact",
      "diff",
      "event",
      "verification",
    ]),
    sha256: AiSha256Schema,
  })
  .strict();

const UntrustedSourceSchema = z
  .object({
    ref: SourceRefSchema,
    content: z.string().max(100_000),
  })
  .strict();

const ClaimSchema = z
  .object({
    id: AiOpaqueRefSchema,
    statement: z.string().min(1).max(2_000),
    source_refs: z.array(AiOpaqueRefSchema).min(1).max(20),
  })
  .strict();

const HardFactSchema = z
  .object({
    id: AiOpaqueRefSchema,
    fact_type: z.enum([
      "work_authorization",
      "timezone_overlap",
      "required_language",
      "required_certification",
    ]),
    value: z.string().min(1).max(500),
  })
  .strict();

export const VeiledCandidateForAiSchema = z
  .object({
    candidate_ref: AiOpaqueRefSchema,
    hard_facts: z.array(HardFactSchema).max(40),
    claims: z.array(ClaimSchema).max(100),
  })
  .strict();

const PublicProofTemplateSchema = z
  .object({
    proof_template_id: AiOpaqueRefSchema,
    version: z.number().int().positive(),
    capability_refs: z.array(AiOpaqueRefSchema).min(1).max(30),
    difficulty_band: AiOpaqueRefSchema,
  })
  .strict();

export const PublicChallengeOptionForAiSchema = z
  .object({
    challenge_id: AiOpaqueRefSchema,
    version: z.number().int().positive(),
    capability_refs: z.array(AiOpaqueRefSchema).min(1).max(30),
    candidate_notice: z.string().min(1).max(1_000),
  })
  .strict();

export const CompileContractInputSchema = z
  .object({
    schema_version: z.literal("compile-contract-input@1"),
    request_ref: AiOpaqueRefSchema,
    opportunity_ref: AiOpaqueRefSchema,
    untrusted_sources: z.array(UntrustedSourceSchema).min(1).max(20),
    allowed_proof_templates: z.array(PublicProofTemplateSchema).min(1).max(50),
  })
  .strict();

const ContractItemSchema = z
  .object({
    id: AiOpaqueRefSchema,
    statement: z.string().min(1).max(2_000),
    source_refs: z.array(AiOpaqueRefSchema).min(1).max(20),
  })
  .strict();

export const ContractDraftSchema = z
  .object({
    schema_version: z.literal("contract-draft@1"),
    status: z.enum(["draft", "needs_human"]),
    critical_failures: z.array(ContractItemSchema).max(20),
    decision_uncertainties: z.array(ContractItemSchema).max(30),
    capabilities: z.array(ContractItemSchema).max(40),
    hard_requirements: z.array(ContractItemSchema).max(30),
    proof_template_ids: z.array(AiOpaqueRefSchema).max(20),
    unknowns: z.array(z.string().min(1).max(1_000)).max(30),
  })
  .strict();

export const BuildMatchEdgeInputSchema = z
  .object({
    schema_version: z.literal("build-match-edge-input@1"),
    request_ref: AiOpaqueRefSchema,
    opportunity_ref: AiOpaqueRefSchema,
    contract_version_ref: AiOpaqueRefSchema,
    uncertainty_ids: z.array(AiOpaqueRefSchema).min(1).max(30),
    veiled_candidate: VeiledCandidateForAiSchema,
    allowed_proof_templates: z.array(PublicProofTemplateSchema).min(1).max(50),
  })
  .strict();

const ProposedMatchEdgeSchema = z
  .object({
    schema_version: z.literal("match-edge-draft@1"),
    decision: z.literal("propose"),
    uncertainty_id: AiOpaqueRefSchema,
    claim_ids: z.array(AiOpaqueRefSchema).min(1).max(10),
    proof_template_id: AiOpaqueRefSchema,
    source_refs: z.array(AiOpaqueRefSchema).min(1).max(30),
    verifiable_reason: z.string().min(1).max(2_000),
    still_unknown: z.array(z.string().min(1).max(1_000)).max(20),
  })
  .strict();

const AbstainedMatchEdgeSchema = z
  .object({
    schema_version: z.literal("match-edge-draft@1"),
    decision: z.literal("abstain"),
    reason: z.string().min(1).max(2_000),
    missing_refs: z.array(AiOpaqueRefSchema).max(30),
  })
  .strict();

export const MatchEdgeDraftSchema = z.discriminatedUnion("decision", [
  ProposedMatchEdgeSchema,
  AbstainedMatchEdgeSchema,
]);

export const TypedHardFactValueSchema = z.union([
  z.boolean(),
  z.number().finite(),
  z.string().min(1).max(500),
]);

export const MatchingCyclePinForAiSchema = z
  .object({
    matching_cycle_ref: AiOpaqueRefSchema,
    version: z.number().int().positive(),
    opportunity_ref: AiOpaqueRefSchema,
  })
  .strict();

export const MatchUncertaintyForAiSchema = z
  .object({
    uncertainty_ref: AiOpaqueRefSchema,
    capability_refs: z.array(AiOpaqueRefSchema).min(1).max(30),
    source_refs: z.array(AiOpaqueRefSchema).min(1).max(20),
  })
  .strict();

export const SealedMatchContractForAiSchema = z
  .object({
    contract_version_ref: AiOpaqueRefSchema,
    contract_hash: AiSha256Schema,
    uncertainties: z.array(MatchUncertaintyForAiSchema).min(1).max(30),
  })
  .strict();

export const MatchClaimForAiSchema = z
  .object({
    claim_ref: AiOpaqueRefSchema,
    statement: z.string().min(1).max(2_000),
    capability_refs: z.array(AiOpaqueRefSchema).min(1).max(30),
    source_refs: z.array(AiOpaqueRefSchema).min(1).max(20),
  })
  .strict();

export const TypedHardFactForAiSchema = z
  .object({
    fact_ref: AiOpaqueRefSchema,
    fact_type: z.enum([
      "work_authorization",
      "timezone_overlap",
      "required_language",
      "required_certification",
    ]),
    value: TypedHardFactValueSchema,
    source_refs: z.array(AiOpaqueRefSchema).min(1).max(20),
  })
  .strict();

export const CandidateClaimSnapshotForAiSchema = z
  .object({
    claim_snapshot_ref: AiOpaqueRefSchema,
    version: z.number().int().positive(),
    candidate_ref: AiOpaqueRefSchema,
    claims: z.array(MatchClaimForAiSchema).max(100),
    hard_facts: z.array(TypedHardFactForAiSchema).max(40),
  })
  .strict();

export const PublicProofTemplateV2Schema = z
  .object({
    proof_template_ref: AiOpaqueRefSchema,
    version: z.number().int().positive(),
    capability_refs: z.array(AiOpaqueRefSchema).min(1).max(30),
  })
  .strict();

/**
 * The V2 MatchEdge boundary pins every mutable source. V1 remains exported for
 * persisted replay compatibility, while new application calls use this schema.
 */
export const BuildMatchEdgeInputV2Schema = z
  .object({
    schema_version: z.literal("build-match-edge-input@2"),
    request_ref: AiOpaqueRefSchema,
    matching_cycle: MatchingCyclePinForAiSchema,
    sealed_contract: SealedMatchContractForAiSchema,
    claim_snapshot: CandidateClaimSnapshotForAiSchema,
    source_refs: z.array(SourceRefSchema).min(1).max(200),
    allowed_proof_templates: z.array(PublicProofTemplateV2Schema).min(1).max(50),
  })
  .strict();

export const MatchEdgeAbstainReasonCodeSchema = z.enum([
  "NO_VERIFIABLE_SOURCE_CONNECTION",
  "NO_SHARED_CAPABILITY",
  "NO_ALLOWED_PROOF_TEMPLATE",
  "INSUFFICIENT_BOUNDED_PROOF",
]);

export const MatchEdgeDraftV2Schema = z
  .object({
    schema_version: z.literal("match-edge-draft@2"),
    decision: z.enum(["propose", "abstain"]),
    uncertainty_ref: AiOpaqueRefSchema.nullable(),
    claim_refs: z.array(AiOpaqueRefSchema).max(10),
    proof_template_ref: AiOpaqueRefSchema.nullable(),
    source_refs: z.array(AiOpaqueRefSchema).max(40),
    verifiable_reason: z.string().min(1).max(2_000).nullable(),
    still_unknown: z.array(z.string().min(1).max(1_000)).max(20),
    reason_code: MatchEdgeAbstainReasonCodeSchema.nullable(),
    explanation: z.string().min(1).max(1_000).nullable(),
    related_refs: z.array(AiOpaqueRefSchema).max(40),
  })
  .strict()
  .superRefine((value, context) => {
    const isProposal = value.decision === "propose";
    if (
      isProposal &&
      (value.uncertainty_ref === null ||
        value.claim_refs.length === 0 ||
        value.proof_template_ref === null ||
        value.source_refs.length === 0 ||
        value.verifiable_reason === null ||
        value.reason_code !== null ||
        value.explanation !== null ||
        value.related_refs.length !== 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "propose requires only complete proposal fields.",
      });
    }
    if (
      !isProposal &&
      (value.uncertainty_ref !== null ||
        value.claim_refs.length !== 0 ||
        value.proof_template_ref !== null ||
        value.source_refs.length !== 0 ||
        value.verifiable_reason !== null ||
        value.still_unknown.length !== 0 ||
        value.reason_code === null ||
        value.explanation === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "abstain requires only a reason code, explanation, and related refs.",
      });
    }
  });

export const EvidenceInputItemSchema = z
  .object({
    evidence_ref: AiOpaqueRefSchema,
    evidence_type: z.enum(["event", "artifact", "diff", "command", "verification"]),
    summary: z.string().min(1).max(4_000),
    sha256: AiSha256Schema,
  })
  .strict();

export const RecommendChallengesInputSchema = z
  .object({
    schema_version: z.literal("recommend-challenges-input@1"),
    request_ref: AiOpaqueRefSchema,
    review_window_ref: AiOpaqueRefSchema,
    contract_version_ref: AiOpaqueRefSchema,
    challenge_catalog_version_ref: AiOpaqueRefSchema,
    capability_refs: z.array(AiOpaqueRefSchema).min(1).max(30),
    stage_a_evidence: z.array(EvidenceInputItemSchema).min(1).max(100),
    allowed_challenges: z.array(PublicChallengeOptionForAiSchema).min(1).max(30),
  })
  .strict();

export const ChallengeRecommendationItemSchema = z
  .object({
    challenge_id: AiOpaqueRefSchema,
    version: z.number().int().positive(),
    capability_refs: z.array(AiOpaqueRefSchema).min(1).max(20),
    evidence_refs: z.array(AiOpaqueRefSchema).min(1).max(30),
    rationale: z.string().min(1).max(2_000),
  })
  .strict();

export const ChallengeRecommendationSchema = z
  .object({
    schema_version: z.literal("challenge-recommendation@1"),
    decision: z.enum(["recommend", "needs_human"]),
    recommendations: z.array(ChallengeRecommendationItemSchema).max(3),
    still_unknown: z.array(z.string().min(1).max(1_000)).max(20),
    reason: z.string().min(1).max(2_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.decision === "recommend" &&
      (value.recommendations.length === 0 || value.reason !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "A recommendation requires one to three options and a null reason.",
      });
    }
    if (
      value.decision === "needs_human" &&
      (value.recommendations.length !== 0 || value.reason === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "needs_human requires an empty option list and a non-null reason.",
      });
    }
  });

export const CompressEvidenceInputSchema = z
  .object({
    schema_version: z.literal("compress-evidence-input@1"),
    request_ref: AiOpaqueRefSchema,
    review_window_ref: AiOpaqueRefSchema,
    contract_version_ref: AiOpaqueRefSchema,
    selected_challenge_ref: AiOpaqueRefSchema,
    evidence: z.array(EvidenceInputItemSchema).min(1).max(200),
  })
  .strict();

const EvidenceCardItemSchema = z
  .object({
    statement: z.string().min(1).max(2_000),
    source_refs: z.array(AiOpaqueRefSchema).min(1).max(30),
  })
  .strict();

export const EvidenceCardDraftSchema = z
  .object({
    schema_version: z.literal("evidence-card-draft@1"),
    status: z.enum(["draft", "needs_human"]),
    observed: z.array(EvidenceCardItemSchema).max(30),
    verified: z.array(EvidenceCardItemSchema).max(30),
    revised: z.array(EvidenceCardItemSchema).max(30),
    unresolved: z.array(EvidenceCardItemSchema).max(30),
  })
  .strict();

export type CompileContractInput = z.infer<typeof CompileContractInputSchema>;
export type ContractDraft = z.infer<typeof ContractDraftSchema>;
export type BuildMatchEdgeInput = z.infer<typeof BuildMatchEdgeInputSchema>;
export type MatchEdgeDraft = z.infer<typeof MatchEdgeDraftSchema>;
export type BuildMatchEdgeInputV2 = z.infer<typeof BuildMatchEdgeInputV2Schema>;
export type MatchEdgeDraftV2 = z.infer<typeof MatchEdgeDraftV2Schema>;
export type MatchEdgeAbstainReasonCode = z.infer<typeof MatchEdgeAbstainReasonCodeSchema>;
export type TypedHardFactValue = z.infer<typeof TypedHardFactValueSchema>;
export type RecommendChallengesInput = z.infer<typeof RecommendChallengesInputSchema>;
export type ChallengeRecommendation = z.infer<typeof ChallengeRecommendationSchema>;
export type ChallengeRecommendationItem = z.infer<typeof ChallengeRecommendationItemSchema>;
export type CompressEvidenceInput = z.infer<typeof CompressEvidenceInputSchema>;
export type EvidenceCardDraft = z.infer<typeof EvidenceCardDraftSchema>;
export type EvidenceInputItem = z.infer<typeof EvidenceInputItemSchema>;
export type PublicChallengeOptionForAi = z.infer<typeof PublicChallengeOptionForAiSchema>;
