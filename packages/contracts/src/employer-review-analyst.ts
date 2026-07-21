import { z } from "zod";

import { IsoDateTimeSchema } from "./common";
import { AiOpaqueRefSchema, AiSha256Schema } from "./hiring-intelligence";

export const EmployerAiReviewPolicySchema = z.enum(["OFF", "ANSWER_ONLY", "ANSWER_PLUS_PROCESS"]);

export const ReviewCriterionSchema = z
  .object({
    criterion_ref: AiOpaqueRefSchema,
    capability_ref: AiOpaqueRefSchema,
    statement: z.string().trim().min(10).max(1_000),
    support_indicators: z.array(z.string().trim().min(2).max(500)).min(1).max(12),
    contradiction_indicators: z.array(z.string().trim().min(2).max(500)).min(1).max(12),
    bounded_limitations: z.array(z.string().trim().min(2).max(500)).min(1).max(12),
  })
  .strict();

export const ReviewEvidenceSourceKindSchema = z.enum([
  "ANSWER_FINAL",
  "VOICE_TRANSCRIPT",
  "PLATFORM_GPT_TRACE",
  "PROCESS",
]);

export const ReviewEvidenceSourceBlockSchema = z
  .object({
    source_block_ref: AiOpaqueRefSchema,
    artifact_ref: AiOpaqueRefSchema.nullable(),
    source_kind: ReviewEvidenceSourceKindSchema,
    text: z.string().min(1).max(20_000),
    sha256: AiSha256Schema,
    derived: z.boolean(),
  })
  .strict();

export const AnswerProcessRevisionSchema = z
  .object({
    artifact_ref: AiOpaqueRefSchema,
    revision: z.number().int().positive(),
    sha256: AiSha256Schema,
    recorded_at: IsoDateTimeSchema,
    plain_text_length: z.number().int().nonnegative().max(10_000),
    final: z.boolean(),
  })
  .strict();

const AnswerProcessEvidenceBaseSchema = z
  .object({
    process_evidence_ref: AiOpaqueRefSchema,
    answer_session_ref: AiOpaqueRefSchema,
    answer_submission_ref: AiOpaqueRefSchema,
    started_at: IsoDateTimeSchema,
    submitted_at: IsoDateTimeSchema,
    answer_due_at: IsoDateTimeSchema,
    allowed_duration_seconds: z.number().int().positive(),
    elapsed_seconds: z.number().int().nonnegative(),
    first_non_empty_revision_at: IsoDateTimeSchema.nullable(),
    draft_revision_count: z.number().int().nonnegative(),
    longest_no_server_recorded_revision_seconds: z.number().int().nonnegative(),
    net_growth_revision_count: z.number().int().nonnegative(),
    net_shrink_revision_count: z.number().int().nonnegative(),
    maximum_absolute_net_length_change: z.number().int().nonnegative(),
    platform_gpt_turn_count: z.number().int().nonnegative(),
    platform_gpt_turn_times: z.array(IsoDateTimeSchema).max(100),
    voice_memo_count: z.number().int().nonnegative(),
    voice_memo_times: z.array(IsoDateTimeSchema).max(100),
    submission_source: z.enum(["MANUAL", "DEADLINE_AUTO", "FOCUS_POLICY_AUTO"]),
    seconds_remaining_at_submit: z.number().int(),
    known_platform_failures: z.array(z.string().trim().min(1).max(200)).max(100),
    revision_manifest: z.array(AnswerProcessRevisionSchema).max(500),
    wording_guard: z.literal("no server-recorded revision"),
    created_at: IsoDateTimeSchema,
  })
  .strict();

export const AnswerBehaviorSeveritySchema = z.enum(["GREEN", "YELLOW", "RED"]);

export const AnswerBehaviorSignalKindSchema = z.enum([
  "FIRST_CONTENT_DELAY",
  "REVISION_GAP",
  "REVISION_VOLATILITY",
  "SUBMISSION_PRESSURE",
  "DISCLOSED_PLATFORM_ASSISTANCE",
  "PLATFORM_RELIABILITY",
]);

export const AnswerBehaviorSignalSchema = z
  .object({
    signal_ref: AiOpaqueRefSchema,
    kind: AnswerBehaviorSignalKindSchema,
    severity: AnswerBehaviorSeveritySchema,
    title: z.string().trim().min(2).max(160),
    observed_value: z.string().trim().min(1).max(500),
    applied_rule: z.string().trim().min(5).max(500),
    reviewer_caveat: z.string().trim().min(5).max(500),
    attribution: z.enum(["CANDIDATE_SESSION", "PLATFORM_CONDITION"]),
  })
  .strict();

export const AnswerProcessEvidenceV1Schema = AnswerProcessEvidenceBaseSchema.extend({
  schema_version: z.literal("answer-process-evidence@1"),
}).strict();

export const AnswerProcessEvidenceV2Schema = AnswerProcessEvidenceBaseSchema.extend({
  schema_version: z.literal("answer-process-evidence@2"),
  behavior_rule_set_ref: z.literal("onlyboth.answer-behavior-severity@1"),
  behavior_signals: z.array(AnswerBehaviorSignalSchema).length(6),
  interpretation_boundary: z.literal(
    "Severity is a review signal for this disclosed answer session, not proof of intent or external AI use.",
  ),
}).strict();

export const AnswerProcessEvidenceSchema = z.discriminatedUnion("schema_version", [
  AnswerProcessEvidenceV1Schema,
  AnswerProcessEvidenceV2Schema,
]);

const EmployerProcessContextV1Schema = AnswerProcessEvidenceV1Schema.omit({
  revision_manifest: true,
  platform_gpt_turn_times: true,
  voice_memo_times: true,
}).strip();

const EmployerProcessContextV2Schema = AnswerProcessEvidenceV2Schema.omit({
  revision_manifest: true,
  platform_gpt_turn_times: true,
  voice_memo_times: true,
}).strip();

export const EmployerProcessContextSchema = z.discriminatedUnion("schema_version", [
  EmployerProcessContextV1Schema,
  EmployerProcessContextV2Schema,
]);

export const BuildAnswerEvidenceEdgeInputSchema = z
  .object({
    schema_version: z.literal("build-answer-evidence-edge-input@1"),
    request_ref: AiOpaqueRefSchema,
    answer_submission_ref: AiOpaqueRefSchema,
    contract_version_ref: AiOpaqueRefSchema,
    contract_hash: AiSha256Schema,
    question_version_ref: AiOpaqueRefSchema,
    policy: z.enum(["ANSWER_ONLY", "ANSWER_PLUS_PROCESS"]),
    critical_question: z.string().trim().min(10).max(8_000),
    review_criteria: z.array(ReviewCriterionSchema).min(1).max(8),
    source_blocks: z.array(ReviewEvidenceSourceBlockSchema).max(300),
    process_evidence: AnswerProcessEvidenceSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasProcess = value.source_blocks.some(({ source_kind }) => source_kind === "PROCESS");
    if (value.policy === "ANSWER_ONLY" && (value.process_evidence !== null || hasProcess)) {
      context.addIssue({ code: "custom", message: "ANSWER_ONLY cannot include process evidence." });
    }
    if (value.policy === "ANSWER_PLUS_PROCESS" && value.process_evidence === null) {
      context.addIssue({
        code: "custom",
        message: "ANSWER_PLUS_PROCESS requires process evidence.",
      });
    }
  });

export const EvidenceQuoteSchema = z
  .object({
    source_block_ref: AiOpaqueRefSchema,
    exact_quote: z.string().min(1).max(1_000),
    occurrence_index: z.number().int().nonnegative(),
  })
  .strict();

export const CriterionEvidenceStatusSchema = z.enum([
  "SUPPORTED",
  "CONTRADICTED",
  "NOT_ADDRESSED",
  "INSUFFICIENT_EVIDENCE",
]);

export const AnswerEvidenceEdgeDraftV1Schema = z
  .object({
    schema_version: z.literal("answer-evidence-edge-draft@1"),
    readiness: z.enum(["ready", "needs_human"]),
    summary: z
      .array(
        z
          .object({
            sentence: z.string().trim().min(1).max(1_000),
            sources: z.array(EvidenceQuoteSchema).min(1).max(8),
          })
          .strict(),
      )
      .max(12),
    criterion_findings: z
      .array(
        z
          .object({
            criterion_ref: AiOpaqueRefSchema,
            status: CriterionEvidenceStatusSchema,
            explanation: z.string().trim().min(1).max(1_000),
            supporting_evidence: z.array(EvidenceQuoteSchema).max(12),
            contradicting_evidence: z.array(EvidenceQuoteSchema).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    still_unknown: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20),
    reviewer_questions: z
      .array(
        z
          .object({
            question: z.string().trim().min(3).max(1_000),
            sources: z.array(EvidenceQuoteSchema).min(1).max(8),
          })
          .strict(),
      )
      .max(12),
    process_timeline: z
      .array(
        z
          .object({
            statement: z.string().trim().min(1).max(1_000),
            source_block_ref: AiOpaqueRefSchema,
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export const BoundedAnswerVerdictSchema = z.enum(["GOOD_ANSWER", "BAD_ANSWER"]);

export const AnswerLanguageDimensionSchema = z.enum([
  "LOGICAL_STRUCTURE",
  "CLARITY",
  "INTERNAL_CONSISTENCY",
  "RESPONSIVENESS",
]);

export const AnswerLanguageFindingSchema = z
  .object({
    dimension: AnswerLanguageDimensionSchema,
    status: z.enum(["CLEAR", "MIXED", "CONCERN"]),
    severity: AnswerBehaviorSeveritySchema,
    observation: z.string().trim().min(1).max(1_000),
    evidence: z.array(EvidenceQuoteSchema).min(1).max(8),
  })
  .strict();

export const AnswerEvidenceEdgeDraftV2Schema = AnswerEvidenceEdgeDraftV1Schema.omit({
  schema_version: true,
})
  .extend({
    schema_version: z.literal("answer-evidence-edge-draft@2"),
    answer_verdict: z
      .object({
        verdict: BoundedAnswerVerdictSchema,
        explanation: z.string().trim().min(1).max(1_000),
        evidence: z.array(EvidenceQuoteSchema).min(1).max(8),
        scope: z.literal("THIS_SEALED_CHALLENGE_ONLY"),
      })
      .strict(),
    language_findings: z.array(AnswerLanguageFindingSchema).length(4),
  })
  .strict();

export const AnswerEvidenceEdgeDraftSchema = z.discriminatedUnion("schema_version", [
  AnswerEvidenceEdgeDraftV1Schema,
  AnswerEvidenceEdgeDraftV2Schema,
]);

export const EmployerAiReviewAnalysisStatusSchema = z.enum([
  "DISABLED",
  "ANALYZING",
  "READY",
  "NEEDS_HUMAN",
  "FAILED",
  "SUPERSEDED",
]);

export const EmployerAiReviewProjectionSchema = z
  .object({
    schema_version: z.literal("employer-ai-review-projection@1"),
    policy: EmployerAiReviewPolicySchema,
    status: EmployerAiReviewAnalysisStatusSchema,
    answer_submission_ref: AiOpaqueRefSchema,
    process_evidence: EmployerProcessContextSchema.nullable(),
    analysis: AnswerEvidenceEdgeDraftSchema.nullable(),
    ai_output_ref: AiOpaqueRefSchema.nullable(),
    error_code: z.string().trim().min(1).max(200).nullable(),
    synthetic: z.boolean(),
    disclosure: z.string().trim().min(1).max(500),
  })
  .strict();

export type EmployerAiReviewPolicy = z.infer<typeof EmployerAiReviewPolicySchema>;
export type ReviewCriterion = z.infer<typeof ReviewCriterionSchema>;
export type AnswerProcessEvidence = z.infer<typeof AnswerProcessEvidenceSchema>;
export type AnswerProcessEvidenceV1 = z.infer<typeof AnswerProcessEvidenceV1Schema>;
export type AnswerProcessEvidenceV2 = z.infer<typeof AnswerProcessEvidenceV2Schema>;
export type AnswerBehaviorSignal = z.infer<typeof AnswerBehaviorSignalSchema>;
export type EmployerProcessContext = z.infer<typeof EmployerProcessContextSchema>;
export type BuildAnswerEvidenceEdgeInput = z.infer<typeof BuildAnswerEvidenceEdgeInputSchema>;
export type AnswerEvidenceEdgeDraft = z.infer<typeof AnswerEvidenceEdgeDraftSchema>;
export type AnswerEvidenceEdgeDraftV2 = z.infer<typeof AnswerEvidenceEdgeDraftV2Schema>;
export type EmployerAiReviewProjection = z.infer<typeof EmployerAiReviewProjectionSchema>;
