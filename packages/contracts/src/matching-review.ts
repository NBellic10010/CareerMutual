import { z } from "zod";

import { AiOpaqueRefSchema, AiSha256Schema } from "./hiring-intelligence";

export const MatchingCandidateCardSchema = z
  .object({
    candidate_ref: AiOpaqueRefSchema,
    opaque_id: z.string().min(1).max(80),
    status: z.enum(["PROCESSING", "PROOFABLE", "NO_BOUNDED_PROOF", "NEEDS_HUMAN"]),
    match_edge_ref: AiOpaqueRefSchema.nullable(),
    uncertainty_ref: AiOpaqueRefSchema.nullable(),
    claim_refs: z.array(AiOpaqueRefSchema).max(10),
    proof_template_ref: AiOpaqueRefSchema.nullable(),
    source_refs: z.array(AiOpaqueRefSchema).max(40),
    why: z.string().max(2_000).nullable(),
    still_unknown: z.array(z.string().min(1).max(1_000)).max(20),
    abstain_reason_code: z.string().max(100).nullable(),
  })
  .strict();

export const AllocatedWindowSummarySchema = z
  .object({
    allocation_kind: z.enum(["DIRECT", "EXPLORE"]),
    candidate_ref: AiOpaqueRefSchema,
    match_edge_ref: AiOpaqueRefSchema,
    review_window_ref: AiOpaqueRefSchema,
    attention_slot_ref: AiOpaqueRefSchema,
    credit_hold_ref: AiOpaqueRefSchema,
    credits: z.number().int().positive(),
    public_hash: z.string().nullable(),
  })
  .strict();

export const EmployerMatchingProjectionSchema = z
  .object({
    schema_version: z.literal("employer-matching-projection@1"),
    view: z.literal("EMPLOYER"),
    opportunity_ref: AiOpaqueRefSchema,
    matching_cycle_ref: AiOpaqueRefSchema,
    matching_cycle_version: z.number().int().positive(),
    commitment_ref: AiOpaqueRefSchema,
    commitment_version: z.number().int().positive(),
    reviewer: z
      .object({ id: AiOpaqueRefSchema, display_name: z.string().min(1).max(100) })
      .strict(),
    state: z.enum(["EVALUATING", "NEEDS_HUMAN", "READY_FOR_DIRECT", "ALLOCATED"]),
    eligible_count: z.number().int().nonnegative(),
    proofable_count: z.number().int().nonnegative(),
    abstain_count: z.number().int().nonnegative(),
    needs_human_count: z.number().int().nonnegative(),
    attention_slots: z.number().int().positive(),
    public_seed: z.string().min(1).max(200),
    allocator_version: z.literal("onlyboth.direct-explore@1"),
    runtime_mode: z.enum(["LIVE", "CACHED_AI", "GOLDEN_REPLAY"]),
    synthetic: z.boolean(),
    disclosure: z.string().min(1).max(200),
    cards: z.array(MatchingCandidateCardSchema).max(100),
    allocation_run_ref: AiOpaqueRefSchema.nullable(),
    allocations: z.array(AllocatedWindowSummarySchema).max(2),
  })
  .strict();

export const CandidateOpportunityProjectionSchema = z
  .object({
    schema_version: z.literal("candidate-opportunity-projection@1"),
    view: z.literal("CANDIDATE"),
    opportunity_ref: AiOpaqueRefSchema,
    candidate_ref: AiOpaqueRefSchema,
    state: z.enum([
      "INTEREST_RECEIVED",
      "HUMAN_REVIEW_RESERVED",
      "STAGE_A_ACTIVE",
      "CHECKPOINT_PENDING",
      "STAGE_B_ACTIVE",
      "RELEASED",
      "PLATFORM_ABORT",
    ]),
    runtime_mode: z.enum(["LIVE", "CACHED_AI", "GOLDEN_REPLAY"]),
    synthetic: z.boolean(),
    reviewer: z
      .object({ id: AiOpaqueRefSchema, display_name: z.string().min(1).max(100) })
      .strict()
      .nullable(),
    review_window_ref: AiOpaqueRefSchema.nullable(),
    review_window_version: z.number().int().positive().nullable(),
    accept_by: z.string().datetime().nullable(),
    checkpoint_sla_seconds: z.number().int().positive().nullable(),
    final_review_sla_hours: z.number().int().positive().nullable(),
    candidate_effort_limit_minutes: z.number().int().positive().nullable(),
    candidate_ai_policy: z.enum(["PROHIBITED"]).nullable(),
    message: z.string().min(1).max(500),
  })
  .strict();

export const ReserveMatchedAttentionCommandSchema = z
  .object({
    schema_version: z.literal("reserve-matched-attention-command@1"),
    direct_match_edge_ref: AiOpaqueRefSchema,
    expected_matching_cycle_version: z.number().int().positive(),
    expected_commitment_version: z.number().int().positive(),
  })
  .strict();

export const AttentionAllocationReceiptSchema = z
  .object({
    schema_version: z.literal("attention-allocation-receipt@1"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    allocation_run_ref: AiOpaqueRefSchema,
    matching_cycle_ref: AiOpaqueRefSchema,
    new_matching_cycle_version: z.number().int().positive(),
    new_commitment_version: z.number().int().positive(),
    public_seed: z.string().min(1).max(200),
    allocator_version: z.literal("onlyboth.direct-explore@1"),
    direct: AllocatedWindowSummarySchema,
    explore: AllocatedWindowSummarySchema,
    occurred_at: z.string().datetime(),
  })
  .strict();

export const ProofWindowDecisionCommandSchema = z
  .object({
    schema_version: z.literal("proof-window-decision-command@1"),
    expected_version: z.number().int().positive(),
  })
  .strict();

export const ProofWindowDecisionReceiptSchema = z
  .object({
    schema_version: z.literal("proof-window-decision-receipt@1"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    review_window_ref: AiOpaqueRefSchema,
    new_version: z.number().int().positive(),
    state: z.enum(["STAGE_A_ACTIVE", "RELEASED"]),
    proof_session_ref: AiOpaqueRefSchema.nullable(),
    occurred_at: z.string().datetime(),
  })
  .strict();

export const MatchingStageAReceiptSchema = z
  .object({
    schema_version: z.literal("matching-stage-a-receipt@1"),
    review_window_ref: AiOpaqueRefSchema,
    snapshot_ref: AiOpaqueRefSchema,
    snapshot_hash: AiSha256Schema,
    new_version: z.number().int().positive(),
    state: z.literal("CHECKPOINT_PENDING"),
  })
  .strict();

export type EmployerMatchingProjection = z.infer<typeof EmployerMatchingProjectionSchema>;
export type CandidateOpportunityProjection = z.infer<typeof CandidateOpportunityProjectionSchema>;
export type ReserveMatchedAttentionCommand = z.infer<typeof ReserveMatchedAttentionCommandSchema>;
export type AttentionAllocationReceipt = z.infer<typeof AttentionAllocationReceiptSchema>;
export type ProofWindowDecisionCommand = z.infer<typeof ProofWindowDecisionCommandSchema>;
export type ProofWindowDecisionReceipt = z.infer<typeof ProofWindowDecisionReceiptSchema>;
export type MatchingStageAReceipt = z.infer<typeof MatchingStageAReceiptSchema>;
