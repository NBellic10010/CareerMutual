import { z } from "zod";

import { AiOpaqueRefSchema, AiSha256Schema } from "./hiring-intelligence";

const ChallengeRefSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9/-]*@[1-9][0-9]*$/u);

const AiRecommendationSelectionSchema = z
  .object({
    schema_version: z.literal("select-human-challenge-command@1"),
    selection_source: z.literal("AI_RECOMMENDATION"),
    recommendation_output_ref: AiOpaqueRefSchema,
    challenge_ref: ChallengeRefSchema,
    expected_version: z.number().int().positive(),
  })
  .strict();

const ManualCatalogSelectionSchema = z
  .object({
    schema_version: z.literal("select-human-challenge-command@1"),
    selection_source: z.literal("MANUAL_CATALOG"),
    challenge_ref: ChallengeRefSchema,
    evidence_refs: z.array(AiOpaqueRefSchema).min(1).max(30),
    expected_version: z.number().int().positive(),
  })
  .strict();

export const SelectHumanChallengeCommandSchema = z.discriminatedUnion("selection_source", [
  AiRecommendationSelectionSchema,
  ManualCatalogSelectionSchema,
]);

export const HumanAuthorizationReceiptSchema = z
  .object({
    schema_version: z.literal("human-authorization-receipt@1"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    challenge_ref: ChallengeRefSchema,
    aggregate_version: z.number().int().positive(),
    selected_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export const RecommendationStatusSchema = z.enum([
  "RUNNING",
  "READY",
  "NEEDS_HUMAN",
  "FAILED",
  "SUPERSEDED",
]);

export const EmployerChallengeOptionSchema = z
  .object({
    challenge_ref: ChallengeRefSchema,
    tests: z.array(z.string().min(1).max(500)).min(1).max(10),
    why: z.string().min(1).max(2_000),
    sources: z.array(AiOpaqueRefSchema).min(1).max(30),
    still_unknown: z.array(z.string().min(1).max(1_000)).max(20),
  })
  .strict();

export const EmployerReviewWindowProjectionSchema = z
  .object({
    schema_version: z.literal("employer-review-window-projection@1"),
    view: z.literal("EMPLOYER"),
    review_window_id: AiOpaqueRefSchema,
    aggregate_version: z.number().int().positive(),
    state: z.enum(["CHECKPOINT_PENDING", "STAGE_B_ACTIVE", "PLATFORM_ABORT"]),
    runtime_mode: z.enum(["LIVE", "CACHED_AI", "GOLDEN_REPLAY"]),
    synthetic: z.boolean(),
    disclosure: z.string().min(1).max(500),
    reviewer: z
      .object({ id: AiOpaqueRefSchema, display_name: z.string().min(1).max(200) })
      .strict(),
    candidate: z.object({ opaque_id: z.literal("Candidate 42") }).strict(),
    recommendation: z
      .object({
        status: RecommendationStatusSchema,
        output_ref: AiOpaqueRefSchema.nullable(),
        prompt_version: z.string().min(1).max(80),
        input_hash: AiSha256Schema.nullable(),
        options: z.array(EmployerChallengeOptionSchema).max(3),
        reason_code: AiOpaqueRefSchema.nullable(),
      })
      .strict(),
    authorization: HumanAuthorizationReceiptSchema.nullable(),
  })
  .strict();

const CandidateProjectionBaseSchema = z.object({
  schema_version: z.literal("candidate-review-window-projection@1"),
  view: z.literal("CANDIDATE"),
  review_window_id: AiOpaqueRefSchema,
  aggregate_version: z.number().int().positive(),
  candidate_ref: z.literal("candidate-42"),
  reviewer: z.object({ id: AiOpaqueRefSchema, display_name: z.string().min(1).max(200) }).strict(),
  runtime_mode: z.enum(["LIVE", "CACHED_AI", "GOLDEN_REPLAY"]),
  synthetic: z.boolean(),
});

const CandidateCheckpointPendingProjectionSchema = CandidateProjectionBaseSchema.extend({
  state: z.literal("CHECKPOINT_PENDING"),
  selected_challenge: z.null(),
  message: z.string().min(1).max(1_000),
}).strict();

const CandidateStageBProjectionSchema = CandidateProjectionBaseSchema.extend({
  state: z.literal("STAGE_B_ACTIVE"),
  selected_challenge: z
    .object({
      challenge_ref: ChallengeRefSchema,
      candidate_notice: z.string().min(1).max(1_000),
      sandbox_branch_ref: AiOpaqueRefSchema.nullable(),
    })
    .strict(),
  message: z.string().min(1).max(1_000),
}).strict();

const CandidatePlatformAbortProjectionSchema = CandidateProjectionBaseSchema.extend({
  state: z.literal("PLATFORM_ABORT"),
  selected_challenge: z.null(),
  message: z.string().min(1).max(1_000),
}).strict();

export const CandidateReviewWindowProjectionSchema = z.discriminatedUnion("state", [
  CandidateCheckpointPendingProjectionSchema,
  CandidateStageBProjectionSchema,
  CandidatePlatformAbortProjectionSchema,
]);

export type SelectHumanChallengeCommand = z.infer<typeof SelectHumanChallengeCommandSchema>;
export type HumanAuthorizationReceipt = z.infer<typeof HumanAuthorizationReceiptSchema>;
export type EmployerChallengeOption = z.infer<typeof EmployerChallengeOptionSchema>;
export type EmployerReviewWindowProjection = z.infer<typeof EmployerReviewWindowProjectionSchema>;
export type CandidateReviewWindowProjection = z.infer<typeof CandidateReviewWindowProjectionSchema>;
