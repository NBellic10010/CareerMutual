import { z } from "zod";

import { CriticalChallengePartKindSchema, IsoDateTimeSchema, RoleCategorySchema } from "./common";
import { AiOpaqueRefSchema, AiSha256Schema } from "./hiring-intelligence";

const CandidateAiPolicySchema = z.enum(["PROHIBITED", "PLATFORM_ASSISTANT_ALLOWED"]);

export const InterestQueuePolicyVersionSchema = z.literal("onlyboth.interest-queue@1");
export const RuntimeModeSchema = z.enum(["LIVE", "CACHED_AI", "GOLDEN_REPLAY"]);
export const BlindReviewCommitmentStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "CLOSING",
  "CLOSED",
  "SUSPENDED",
]);
export const CandidateInterestStateSchema = z.enum([
  "INTEREST_RECEIVED",
  "INELIGIBLE_HARD_REQUIREMENT",
  "WAITING_FOR_BACKED_SLOT",
  "BACKED_OFFERED",
  "APPLICATION_ACTIVE",
  "APPLICATION_SUBMITTED",
  "REVIEWED",
  "OFFER_DECLINED",
  "OFFER_EXPIRED",
  "OPPORTUNITY_PAUSED",
  "OPPORTUNITY_CLOSED",
]);

export const CandidateInterestHardFactSchema = z
  .object({
    fact_ref: AiOpaqueRefSchema,
    fact_type: z.enum([
      "work_authorization",
      "timezone_overlap",
      "required_language",
      "required_certification",
    ]),
    value: z.union([z.boolean(), z.number().finite(), z.string().min(1).max(500)]),
  })
  .strict();

export const PublicOpportunityProjectionSchema = z
  .object({
    schema_version: z.literal("public-opportunity-projection@1"),
    view: z.literal("PUBLIC_CANDIDATE"),
    opportunity_ref: AiOpaqueRefSchema,
    opportunity_version: z.number().int().positive(),
    title: z.string().min(1).max(200),
    role_category: RoleCategorySchema.default("TECHNOLOGY"),
    challenge_part_kinds: z.array(CriticalChallengePartKindSchema).min(1).max(12).default(["TEXT"]),
    organization_public_name: z.string().min(1).max(200),
    public_role_summary: z.string().min(1).max(4_000),
    employment_type: z.string().min(1).max(80),
    seniority_band: z.string().min(1).max(80),
    compensation_range: z.string().min(1).max(200),
    location_and_work_mode: z.string().min(1).max(200),
    public_hard_requirements: z.array(z.string().min(1).max(500)).max(30),
    capability_area_preview: z.array(z.string().min(1).max(300)).max(20),
    proof_format: z.string().min(1).max(500),
    maximum_candidate_minutes: z.number().int().positive(),
    candidate_ai_policy: CandidateAiPolicySchema,
    human_review_sla_hours: z.number().int().positive(),
    review_capacity_status: z.enum(["ACTIVE", "PAUSED", "CLOSED"]),
    interest_status: CandidateInterestStateSchema.nullable(),
  })
  .strict();

export const CandidateInterestCommandSchema = z
  .object({
    schema_version: z.literal("candidate-interest-command@1"),
    hard_facts: z.array(CandidateInterestHardFactSchema).min(1).max(40),
    consent_version: AiOpaqueRefSchema,
    expected_opportunity_version: z.number().int().positive(),
  })
  .strict();

export const CandidateInterestReceiptSchema = z
  .object({
    schema_version: z.literal("candidate-interest-receipt@1"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    interest_ref: AiOpaqueRefSchema,
    opportunity_ref: AiOpaqueRefSchema,
    state: z.literal("INTEREST_RECEIVED"),
    new_opportunity_version: z.number().int().positive(),
    occurred_at: IsoDateTimeSchema,
  })
  .strict();

export const ActivateBlindReviewCommitmentCommandSchema = z
  .object({
    schema_version: z.literal("activate-blind-review-commitment-command@1"),
    answer_review_wip: z.number().int().min(1).max(100),
    answer_review_sla_hours: z.number().int().min(1).max(168),
    advancement_cohort_size: z.number().int().min(2).max(100),
    queue_policy_version: InterestQueuePolicyVersionSchema,
    credit_per_answer_review: z.number().int().positive(),
    expected_opportunity_version: z.number().int().positive(),
    // Zero is the compare-and-swap sentinel for creating a Commitment that does not exist yet.
    expected_commitment_version: z.number().int().nonnegative(),
  })
  .strict();

export const BlindReviewCommitmentReceiptSchema = z
  .object({
    schema_version: z.literal("blind-review-commitment-receipt@1"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    commitment_ref: AiOpaqueRefSchema,
    new_commitment_version: z.number().int().positive(),
    slot_refs: z.array(AiOpaqueRefSchema).min(1).max(100),
    state: z.literal("ACTIVE"),
    activated_at: IsoDateTimeSchema,
  })
  .strict();

export const BackedAnswerOfferSchema = z
  .object({
    schema_version: z.literal("backed-answer-offer@1"),
    invitation_ref: AiOpaqueRefSchema,
    obligation_ref: AiOpaqueRefSchema,
    slot_ref: AiOpaqueRefSchema,
    cohort_ref: AiOpaqueRefSchema,
    cohort_seat_ref: AiOpaqueRefSchema,
    candidate_ref: AiOpaqueRefSchema,
    reviewer: z
      .object({
        reviewer_ref: AiOpaqueRefSchema,
        display_name: z.string().min(1).max(200),
      })
      .strict(),
    credit_hold_ref: AiOpaqueRefSchema,
    question_version_ref: AiOpaqueRefSchema,
    queue_policy_version: InterestQueuePolicyVersionSchema,
    public_tie_break: AiSha256Schema,
    offered_at: IsoDateTimeSchema,
    offer_expires_at: IsoDateTimeSchema,
    answer_review_sla_hours: z.number().int().positive(),
    effort_limit_minutes: z.number().int().positive(),
    candidate_ai_policy: CandidateAiPolicySchema,
  })
  .strict();

export const AnswerInvitationDecisionCommandSchema = z
  .object({
    schema_version: z.literal("answer-invitation-decision-command@1"),
    decision: z.enum(["ACCEPT", "DECLINE"]),
    expected_obligation_version: z.number().int().positive(),
    expected_slot_version: z.number().int().positive(),
  })
  .strict();

const AnswerInvitationDecisionReceiptBaseSchema = z.object({
  schema_version: z.literal("answer-invitation-decision-receipt@1"),
  command_id: AiOpaqueRefSchema,
  event_id: AiOpaqueRefSchema,
  invitation_ref: AiOpaqueRefSchema,
  obligation_ref: AiOpaqueRefSchema,
  slot_ref: AiOpaqueRefSchema,
  new_obligation_version: z.number().int().positive(),
  new_slot_version: z.number().int().positive(),
  occurred_at: IsoDateTimeSchema,
});

export const AnswerInvitationDecisionReceiptSchema = z.discriminatedUnion("decision", [
  AnswerInvitationDecisionReceiptBaseSchema.extend({
    decision: z.literal("ACCEPT"),
    obligation_state: z.literal("ANSWER_ACTIVE"),
    answer_session_ref: AiOpaqueRefSchema,
    answer_due_at: IsoDateTimeSchema,
  }).strict(),
  AnswerInvitationDecisionReceiptBaseSchema.extend({
    decision: z.literal("DECLINE"),
    obligation_state: z.literal("SETTLED"),
    answer_session_ref: z.null(),
    answer_due_at: z.null(),
  }).strict(),
]);

export const SubmitBlindAnswerCommandSchema = z
  .object({
    schema_version: z.literal("submit-blind-answer-command@1"),
    invitation_ref: AiOpaqueRefSchema,
    answer_submission_ref: AiOpaqueRefSchema,
    snapshot_ref: AiOpaqueRefSchema,
    artifact_refs: z.array(AiOpaqueRefSchema).min(1).max(50),
    event_refs: z.array(AiOpaqueRefSchema).min(1).max(200),
    expected_obligation_version: z.number().int().positive(),
  })
  .strict();

export const BlindAnswerSubmissionReceiptSchema = z
  .object({
    schema_version: z.literal("blind-answer-submission-receipt@1"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    obligation_ref: AiOpaqueRefSchema,
    answer_submission_ref: AiOpaqueRefSchema,
    snapshot_ref: AiOpaqueRefSchema,
    cohort_ref: AiOpaqueRefSchema,
    cohort_seat_ref: AiOpaqueRefSchema,
    new_obligation_version: z.number().int().positive(),
    submitted_at: IsoDateTimeSchema,
  })
  .strict();

export const HumanAnswerReviewDecisionSchema = z.enum([
  "ADVANCE_ELIGIBLE",
  "NO_FURTHER_PROOF",
  "INCONCLUSIVE",
]);

export const HumanAnswerReviewCommandSchema = z
  .object({
    schema_version: z.literal("human-answer-review-command@1"),
    decision: HumanAnswerReviewDecisionSchema,
    evidence_refs: z.array(AiOpaqueRefSchema).min(1).max(50),
    still_unknown: z.array(z.string().min(1).max(1_000)).max(20),
    expected_obligation_version: z.number().int().positive(),
    expected_cohort_version: z.number().int().positive(),
  })
  .strict();

export const HumanAnswerReviewReceiptSchema = z
  .object({
    schema_version: z.literal("human-answer-review-receipt@1"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    human_review_ref: AiOpaqueRefSchema,
    reviewer_ref: AiOpaqueRefSchema,
    answer_submission_ref: AiOpaqueRefSchema,
    obligation_ref: AiOpaqueRefSchema,
    decision: HumanAnswerReviewDecisionSchema,
    evidence_refs: z.array(AiOpaqueRefSchema).min(1).max(50),
    still_unknown: z.array(z.string().min(1).max(1_000)).max(20),
    reviewed_at: IsoDateTimeSchema,
  })
  .strict();

export const AnswerReviewSettlementReceiptSchema = z
  .object({
    schema_version: z.literal("answer-review-settlement-receipt@1"),
    command_id: AiOpaqueRefSchema,
    event_ids: z.array(AiOpaqueRefSchema).min(2).max(10),
    obligation_ref: AiOpaqueRefSchema,
    slot_ref: AiOpaqueRefSchema,
    credit_hold_ref: AiOpaqueRefSchema,
    slot_state: z.literal("AVAILABLE"),
    next_offer_requested: z.literal(true),
    new_obligation_version: z.number().int().positive(),
    new_slot_version: z.number().int().positive(),
    settled_at: IsoDateTimeSchema,
  })
  .strict();

export const AdvancementCohortProjectionSchema = z
  .object({
    schema_version: z.literal("advancement-cohort-projection@1"),
    cohort_ref: AiOpaqueRefSchema,
    sequence: z.number().int().positive(),
    target_size: z.number().int().min(2).max(100),
    submitted_count: z.number().int().nonnegative(),
    reviewed_count: z.number().int().nonnegative(),
    state: z.enum([
      "COLLECTING",
      "REVIEWING",
      "READY_FOR_ADVANCEMENT",
      "ALLOCATED",
      "CLOSED_NO_ALLOCATION",
    ]),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine(({ reviewed_count, submitted_count, target_size }, context) => {
    if (reviewed_count > submitted_count || submitted_count > target_size) {
      context.addIssue({
        code: "custom",
        message: "Cohort counts must satisfy reviewed <= submitted <= target.",
      });
    }
  });

const EmployerBlindReviewBaseSchema = z.object({
  schema_version: z.literal("employer-blind-review-projection@2"),
  view: z.literal("EMPLOYER"),
  opportunity_ref: AiOpaqueRefSchema,
  commitment_ref: AiOpaqueRefSchema,
  commitment_version: z.number().int().positive(),
  queue_policy_version: InterestQueuePolicyVersionSchema,
  eligible_interest_count: z.number().int().nonnegative(),
  waiting_interest_count: z.number().int().nonnegative(),
  answer_review_wip: z.number().int().positive(),
  available_slot_count: z.number().int().nonnegative(),
  outstanding_obligation_count: z.number().int().nonnegative(),
  disclosure: z.string().min(1).max(500),
  runtime_mode: RuntimeModeSchema,
  synthetic: z.boolean(),
});

const EmployerBlindReviewPreAnswerProjectionSchema = EmployerBlindReviewBaseSchema.extend({
  phase: z.literal("PRE_ANSWER"),
}).strict();

const AnonymousAnswerReviewCardSchema = z
  .object({
    opaque_answer_ref: AiOpaqueRefSchema,
    cohort_ref: AiOpaqueRefSchema,
    review_state: z.enum(["EVIDENCE_PENDING", "REVIEW_PENDING", "REVIEWED", "NEEDS_HUMAN"]),
    evidence_refs: z.array(AiOpaqueRefSchema).max(50),
    still_unknown: z.array(z.string().min(1).max(1_000)).max(20),
  })
  .strict();

const EmployerBlindReviewAnswerProjectionSchema = EmployerBlindReviewBaseSchema.extend({
  phase: z.literal("ANSWER_REVIEW"),
  cohort: AdvancementCohortProjectionSchema,
  anonymous_answers: z.array(AnonymousAnswerReviewCardSchema).max(100),
}).strict();

export const EmployerBlindReviewProjectionSchema = z.discriminatedUnion("phase", [
  EmployerBlindReviewPreAnswerProjectionSchema,
  EmployerBlindReviewAnswerProjectionSchema,
]);

export const CandidateOpportunityProjectionV3Schema = z
  .object({
    schema_version: z.literal("candidate-opportunity-projection@3"),
    view: z.literal("CANDIDATE"),
    state: z.enum([
      "INTEREST_RECEIVED",
      "INELIGIBLE_HARD_REQUIREMENT",
      "WAITING_FOR_BACKED_SLOT",
      "BACKED_OFFERED",
      "ANSWER_ACTIVE",
      "REVIEW_PENDING",
      "REVIEWED",
      "DEEP_PROOF_RESERVED",
      "CHECKPOINT_PENDING",
      "STAGE_B_ACTIVE",
      "OPPORTUNITY_PAUSED",
      "OPPORTUNITY_CLOSED",
      "RELEASED",
      "PLATFORM_ABORT",
    ]),
    opportunity_ref: AiOpaqueRefSchema,
    candidate_ref: AiOpaqueRefSchema,
    queue_policy_version: InterestQueuePolicyVersionSchema,
    eligible_interests_ahead: z.number().int().nonnegative().nullable(),
    commitment_status: BlindReviewCommitmentStatusSchema,
    invitation_ref: AiOpaqueRefSchema.nullable().optional(),
    obligation_ref: AiOpaqueRefSchema.nullable().optional(),
    credit_hold_ref: AiOpaqueRefSchema.nullable().optional(),
    answer_session_ref: AiOpaqueRefSchema.nullable().optional(),
    answer_due_at: IsoDateTimeSchema.nullable().optional(),
    reviewer: z
      .object({ reviewer_ref: AiOpaqueRefSchema, display_name: z.string().min(1).max(200) })
      .strict()
      .nullable()
      .optional(),
    closure_receipt_ref: AiOpaqueRefSchema.nullable().optional(),
    message: z.string().min(1).max(1_000),
    runtime_mode: RuntimeModeSchema,
    synthetic: z.boolean(),
  })
  .strict()
  .superRefine((projection, context) => {
    if (
      projection.state === "BACKED_OFFERED" &&
      (projection.invitation_ref == null ||
        projection.obligation_ref == null ||
        projection.credit_hold_ref == null ||
        projection.reviewer == null)
    ) {
      context.addIssue({
        code: "custom",
        message: "BACKED_OFFERED requires the backed Invitation, Obligation, Hold, and Reviewer.",
      });
    }
    if (
      projection.state === "ANSWER_ACTIVE" &&
      (projection.invitation_ref == null ||
        projection.obligation_ref == null ||
        projection.credit_hold_ref == null ||
        projection.answer_session_ref == null ||
        projection.answer_due_at == null ||
        projection.reviewer == null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "ANSWER_ACTIVE requires the backed Invitation, Obligation, Hold, Session, deadline, and Reviewer.",
      });
    }
    if (
      projection.state === "RELEASED" &&
      (projection.answer_session_ref != null || projection.answer_due_at != null)
    ) {
      context.addIssue({
        code: "custom",
        message: "RELEASED cannot expose an active Answer Session or deadline.",
      });
    }
  });

export type CandidateInterestCommand = z.infer<typeof CandidateInterestCommandSchema>;
export type CandidateInterestReceipt = z.infer<typeof CandidateInterestReceiptSchema>;
export type ActivateBlindReviewCommitmentCommand = z.infer<
  typeof ActivateBlindReviewCommitmentCommandSchema
>;
export type BlindReviewCommitmentReceipt = z.infer<typeof BlindReviewCommitmentReceiptSchema>;
export type BackedAnswerOffer = z.infer<typeof BackedAnswerOfferSchema>;
export type AnswerInvitationDecisionCommand = z.infer<typeof AnswerInvitationDecisionCommandSchema>;
export type AnswerInvitationDecisionReceipt = z.infer<typeof AnswerInvitationDecisionReceiptSchema>;
export type SubmitBlindAnswerCommand = z.infer<typeof SubmitBlindAnswerCommandSchema>;
export type HumanAnswerReviewCommand = z.infer<typeof HumanAnswerReviewCommandSchema>;
export type HumanAnswerReviewReceipt = z.infer<typeof HumanAnswerReviewReceiptSchema>;
export type AnswerReviewSettlementReceipt = z.infer<typeof AnswerReviewSettlementReceiptSchema>;
export type EmployerBlindReviewProjection = z.infer<typeof EmployerBlindReviewProjectionSchema>;
export type CandidateOpportunityProjectionV3 = z.infer<
  typeof CandidateOpportunityProjectionV3Schema
>;
