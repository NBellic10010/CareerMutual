import { z } from "zod";

import { CriticalChallengePartKindSchema, IsoDateTimeSchema, RoleCategorySchema } from "./common";
import { CandidateInterestHardFactSchema, HumanAnswerReviewDecisionSchema } from "./blind-answer";
import { AiOpaqueRefSchema, AiSha256Schema } from "./hiring-intelligence";
import {
  AnswerProcessEvidenceSchema,
  EmployerAiReviewPolicySchema,
  EmployerAiReviewProjectionSchema,
  ReviewCriterionSchema,
} from "./employer-review-analyst";
import { EligibilityMatchPolicySchema } from "./eligibility-policy";

export const CandidateAiPolicySchema = z.enum(["PROHIBITED", "PLATFORM_ASSISTANT_ALLOWED"]);

export const SANDBOX_FOCUS_POLICY_VERSION = "sandbox-focus-policy@1" as const;
export const LEGACY_SANDBOX_FOCUS_POLICY_VERSION =
  "sandbox-focus-policy@legacy-unmonitored" as const;
export const SANDBOX_FOCUS_DISCLOSURE_VERSION = "sandbox-focus-disclosure@1" as const;

export const SandboxFocusPolicyVersionSchema = z.enum([
  SANDBOX_FOCUS_POLICY_VERSION,
  LEGACY_SANDBOX_FOCUS_POLICY_VERSION,
]);

export const SandboxFocusPolicyStateSchema = z.enum([
  "ACTIVE",
  "WARNED",
  "AUTO_SUBMIT_PENDING",
  "AUTO_SUBMITTED",
]);

export const SandboxFocusPolicyProjectionSchema = z
  .object({
    policy_version: SandboxFocusPolicyVersionSchema,
    disclosure_version: z.union([
      z.literal(SANDBOX_FOCUS_DISCLOSURE_VERSION),
      z.literal("sandbox-focus-disclosure@legacy-unmonitored"),
    ]),
    state: SandboxFocusPolicyStateSchema,
    document_visibility: z.enum(["VISIBLE", "HIDDEN"]),
    window_focus: z.enum(["FOCUSED", "BLURRED"]),
    countable_away_count: z.number().int().nonnegative(),
    cumulative_away_ms: z.number().int().nonnegative(),
    current_away_started_at: IsoDateTimeSchema.nullable(),
    warning_required: z.boolean(),
    telemetry_limitations: z.literal(
      "Browser-reported focus activity is not secure proctoring and cannot detect a second device.",
    ),
  })
  .strict();

export { RoleCategorySchema } from "./common";

export const CriticalChallengeAssetSchema = z
  .object({
    asset_ref: AiOpaqueRefSchema,
    source_kind: z.enum(["SYNTHETIC_SEED", "EMPLOYER_UPLOAD"]),
    file_name: z.string().trim().min(1).max(240),
    content_type: z.string().trim().min(3).max(200),
    content_length: z
      .number()
      .int()
      .nonnegative()
      .max(20 * 1024 * 1024),
    sha256: AiSha256Schema,
    download_url: z.string().trim().startsWith("/").max(500).nullable(),
    alt_text: z.string().trim().min(3).max(500).nullable(),
    transcript_excerpt: z.string().trim().min(3).max(2_000).nullable(),
  })
  .strict();

export { CriticalChallengePartKindSchema } from "./common";

export const CriticalChallengePartSchema = z
  .object({
    part_ref: AiOpaqueRefSchema,
    kind: CriticalChallengePartKindSchema,
    title: z.string().trim().min(2).max(200),
    instructions: z.string().trim().min(10).max(2_000),
    text_content: z.string().trim().min(10).max(8_000).nullable(),
    asset: CriticalChallengeAssetSchema.nullable(),
  })
  .strict()
  .superRefine((part, context) => {
    if (part.kind === "TEXT" && (part.text_content === null || part.asset !== null)) {
      context.addIssue({
        code: "custom",
        message: "A TEXT Challenge part requires text_content and cannot contain an asset.",
      });
    }
    if (part.kind !== "TEXT" && (part.asset === null || part.text_content !== null)) {
      context.addIssue({
        code: "custom",
        message: "A media Challenge part requires one sealed asset and no text_content.",
      });
    }
    if (part.kind === "AUDIO" && !part.asset?.content_type.startsWith("audio/")) {
      context.addIssue({ code: "custom", message: "An AUDIO part requires an audio MIME type." });
    }
    if (part.kind === "IMAGE" && !part.asset?.content_type.startsWith("image/")) {
      context.addIssue({ code: "custom", message: "An IMAGE part requires an image MIME type." });
    }
    if (part.kind === "IMAGE" && part.asset?.alt_text === null) {
      context.addIssue({ code: "custom", message: "An IMAGE part requires accessible alt text." });
    }
  });

export const CriticalChallengeSchema = z
  .object({
    schema_version: z.literal("critical-challenge@1"),
    challenge_ref: AiOpaqueRefSchema,
    title: z.string().trim().min(3).max(240),
    objective: z.string().trim().min(20).max(2_000),
    parts: z.array(CriticalChallengePartSchema).min(1).max(12),
  })
  .strict()
  .superRefine((challenge, context) => {
    const refs = challenge.parts.map((part) => part.part_ref);
    if (new Set(refs).size !== refs.length) {
      context.addIssue({ code: "custom", message: "Critical Challenge part refs must be unique." });
    }
  });

const LegacyCriticalChallenge = CriticalChallengeSchema.parse({
  schema_version: "critical-challenge@1",
  challenge_ref: "critical-challenge:legacy-text",
  title: "Sealed critical challenge",
  objective: "Respond to the sealed role question using the required bounded proof format.",
  parts: [
    {
      part_ref: "challenge-part:legacy-text",
      kind: "TEXT",
      title: "Role question",
      instructions: "Use the sealed role question and allowed assumptions as the complete prompt.",
      text_content: "The authoritative role question appears directly above this Challenge.",
      asset: null,
    },
  ],
});

const LegacyReviewCriterion = ReviewCriterionSchema.parse({
  criterion_ref: "criterion:bounded-role-evidence",
  capability_ref: "capability:bounded-role-evidence",
  statement: "The answer provides verifiable evidence relevant to the sealed role challenge.",
  support_indicators: ["A concrete decision is tied to an observable artifact or outcome."],
  contradiction_indicators: ["The answer directly conflicts with a sealed task requirement."],
  bounded_limitations: ["This challenge cannot establish overall job performance or hiring fit."],
});

export const JobPostDraftInputSchema = z
  .object({
    organization_public_name: z.string().trim().min(2).max(200),
    title: z.string().trim().min(2).max(200),
    role_category: RoleCategorySchema.default("TECHNOLOGY"),
    public_role_summary: z.string().trim().min(20).max(4_000),
    employment_type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]),
    seniority_band: z.enum(["MID", "SENIOR", "STAFF", "PRINCIPAL"]),
    compensation_range: z.string().trim().min(3).max(200),
    location_and_work_mode: z.string().trim().min(3).max(200),
    public_hard_requirements: z.array(z.string().trim().min(2).max(500)).min(1).max(20),
    hard_predicates: z
      .array(
        z
          .object({
            predicate_ref: AiOpaqueRefSchema,
            fact_type: CandidateInterestHardFactSchema.shape.fact_type,
            operator: z.enum(["EQUALS", "GTE", "CONTAINS"]),
            expected: z.union([z.string(), z.number().finite(), z.boolean()]),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    capability_areas: z.array(z.string().trim().min(2).max(300)).min(1).max(20),
    eligibility_match_policy: z
      .lazy(() => EligibilityMatchPolicySchema)
      .default({
        schema_version: "eligibility-match-policy@1",
        access_mode: "OPEN_TO_ALL",
        open_reasons: ["NO_BACKGROUND_REQUIRED"],
      }),
    critical_question: z.string().trim().min(20).max(4_000),
    critical_challenge: CriticalChallengeSchema.default(LegacyCriticalChallenge),
    allowed_assumptions: z.array(z.string().trim().min(2).max(500)).max(20),
    proof_format: z.string().trim().min(3).max(500),
    maximum_candidate_minutes: z.number().int().min(2).max(30).default(6),
    answer_review_sla_hours: z.number().int().min(1).max(168).default(24),
    offer_expiry_hours: z.number().int().min(1).max(168).default(24),
    answer_review_wip: z.number().int().min(1).max(8).default(2),
    advancement_cohort_size: z.number().int().min(2).max(20).default(8),
    credit_per_answer_review: z.number().int().min(1).max(100).default(1),
    candidate_ai_policy: CandidateAiPolicySchema.default("PLATFORM_ASSISTANT_ALLOWED"),
    employer_ai_review_policy: EmployerAiReviewPolicySchema.default("OFF"),
    employer_ai_review_disclosure_version: AiOpaqueRefSchema.default(
      "employer-ai-review-disclosure@2",
    ),
    review_criteria: z.array(ReviewCriterionSchema).min(1).max(8).default([LegacyReviewCriterion]),
    terms_version: AiOpaqueRefSchema.default("candidate-application-terms@2"),
    ai_disclosure_version: AiOpaqueRefSchema.default("candidate-ai-disclosure@1"),
    conditional_reveal_consent_version: AiOpaqueRefSchema.default("resume-reveal-consent@1"),
    sandbox_focus_policy_version: z
      .literal(SANDBOX_FOCUS_POLICY_VERSION)
      .default(SANDBOX_FOCUS_POLICY_VERSION),
    focus_tracking_disclosure_version: z
      .literal(SANDBOX_FOCUS_DISCLOSURE_VERSION)
      .default(SANDBOX_FOCUS_DISCLOSURE_VERSION),
  })
  .strict();

export const CreateJobPostDraftCommandSchema = z
  .object({
    schema_version: z.literal("create-job-post-draft-command@1"),
    draft: JobPostDraftInputSchema,
    expected_wallet_version: z.number().int().positive(),
  })
  .strict();

export const UpdateJobPostDraftCommandSchema = z
  .object({
    schema_version: z.literal("update-job-post-draft-command@1"),
    draft: JobPostDraftInputSchema,
    expected_draft_version: z.number().int().positive(),
  })
  .strict();

export const PublishJobPostCommandSchema = z
  .object({
    schema_version: z.literal("publish-job-post-command@1"),
    expected_draft_version: z.number().int().positive(),
    expected_wallet_version: z.number().int().positive(),
  })
  .strict();

export const JobPostDraftProjectionSchema = z
  .object({
    schema_version: z.literal("job-post-draft-projection@1"),
    draft_ref: AiOpaqueRefSchema,
    owner_ref: AiOpaqueRefSchema,
    state: z.enum(["DRAFT", "PUBLISHED"]),
    version: z.number().int().positive(),
    draft: JobPostDraftInputSchema,
    published_opportunity_ref: AiOpaqueRefSchema.nullable(),
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
  })
  .strict();

export const EmployerAttentionWalletProjectionSchema = z
  .object({
    schema_version: z.literal("employer-attention-wallet-projection@1"),
    owner_ref: AiOpaqueRefSchema,
    available_credits: z.number().int().nonnegative(),
    committed_credits: z.number().int().nonnegative(),
    forfeited_credits: z.number().int().nonnegative(),
    version: z.number().int().positive(),
  })
  .strict();

export const EmployerJobPostSummarySchema = z
  .object({
    schema_version: z.literal("employer-job-post-summary@1"),
    opportunity_ref: AiOpaqueRefSchema,
    title: z.string().min(1).max(200),
    organization_public_name: z.string().min(1).max(200),
    role_category: RoleCategorySchema.default("TECHNOLOGY"),
    status: z.enum(["OPEN", "CLOSED"]),
    commitment_state: z.enum(["ACTIVE", "PAUSED", "CLOSING", "CLOSED", "SUSPENDED"]),
    answer_review_wip: z.number().int().positive(),
    available_slot_count: z.number().int().nonnegative(),
    outstanding_obligation_count: z.number().int().nonnegative(),
    pending_review_count: z.number().int().nonnegative(),
    waiting_interest_count: z.number().int().nonnegative(),
    published_at: IsoDateTimeSchema,
  })
  .strict();

export const EmployerJobDashboardSchema = z
  .object({
    schema_version: z.literal("employer-job-dashboard@1"),
    reviewer_ref: AiOpaqueRefSchema,
    wallet: EmployerAttentionWalletProjectionSchema,
    drafts: z.array(JobPostDraftProjectionSchema).max(100),
    job_posts: z.array(EmployerJobPostSummarySchema).max(100),
  })
  .strict();

export const PublishJobPostReceiptSchema = z
  .object({
    schema_version: z.literal("publish-job-post-receipt@1"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    draft_ref: AiOpaqueRefSchema,
    opportunity_ref: AiOpaqueRefSchema,
    commitment_ref: AiOpaqueRefSchema,
    slot_refs: z.array(AiOpaqueRefSchema).min(1).max(8),
    committed_credits: z.number().int().positive(),
    new_wallet_version: z.number().int().positive(),
    published_at: IsoDateTimeSchema,
  })
  .strict();

export const CandidateApplicationCreditProjectionSchema = z
  .object({
    schema_version: z.literal("candidate-application-credit-projection@1"),
    account_ref: AiOpaqueRefSchema,
    candidate_ref: AiOpaqueRefSchema,
    period_ref: AiOpaqueRefSchema,
    allowance: z.number().int().nonnegative(),
    available_credits: z.number().int().nonnegative(),
    consumed_credits: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    period_ends_at: IsoDateTimeSchema,
  })
  .strict();

export const CandidateJobCardSchema = z
  .object({
    schema_version: z.literal("candidate-job-card@1"),
    opportunity_ref: AiOpaqueRefSchema,
    opportunity_version: z.number().int().positive(),
    title: z.string().min(1).max(200),
    organization_public_name: z.string().min(1).max(200),
    role_category: RoleCategorySchema.default("TECHNOLOGY"),
    public_role_summary: z.string().min(1).max(4_000),
    employment_type: z.string().min(1).max(80),
    seniority_band: z.string().min(1).max(80),
    compensation_range: z.string().min(1).max(200),
    location_and_work_mode: z.string().min(1).max(200),
    maximum_candidate_minutes: z.number().int().positive(),
    human_review_sla_hours: z.number().int().positive(),
    candidate_ai_policy: CandidateAiPolicySchema,
    employer_ai_review_policy: EmployerAiReviewPolicySchema.default("OFF"),
    challenge_part_kinds: z.array(CriticalChallengePartKindSchema).min(1).max(12).default(["TEXT"]),
    interest_state: z
      .enum([
        "NOT_REGISTERED",
        "WAITING_FOR_BACKED_SLOT",
        "BACKED_OFFERED",
        "APPLICATION_ACTIVE",
        "APPLICATION_SUBMITTED",
        "REVIEWED",
        "EMPLOYER_BREACH",
        "OFFER_DECLINED",
        "OFFER_EXPIRED",
      ])
      .default("NOT_REGISTERED"),
    backed_offer: z
      .object({
        invitation_ref: AiOpaqueRefSchema,
        obligation_ref: AiOpaqueRefSchema,
        slot_ref: AiOpaqueRefSchema,
        expected_obligation_version: z.number().int().positive(),
        expected_slot_version: z.number().int().positive(),
        reviewer_display_name: z.string().min(1).max(200),
        offered_at: IsoDateTimeSchema,
        offer_expires_at: IsoDateTimeSchema,
      })
      .strict()
      .nullable(),
    active_answer_session_ref: AiOpaqueRefSchema.nullable().default(null),
  })
  .strict();

export const CandidateOpportunityFeedSchema = z
  .object({
    schema_version: z.literal("candidate-opportunity-feed@1"),
    candidate_ref: AiOpaqueRefSchema,
    credit: CandidateApplicationCreditProjectionSchema,
    opportunities: z.array(CandidateJobCardSchema).max(100),
  })
  .strict();

export const CandidateJobDetailSchema = CandidateJobCardSchema.extend({
  schema_version: z.literal("candidate-job-detail@1"),
  public_hard_requirements: z.array(z.string().min(1).max(500)).max(30),
  capability_areas: z.array(z.string().min(1).max(300)).max(20),
  critical_question_preview: z.string().min(1).max(500),
  critical_challenge: CriticalChallengeSchema.default(LegacyCriticalChallenge),
  proof_format: z.string().min(1).max(500),
  answer_review_wip: z.number().int().positive(),
  available_slot_count: z.number().int().nonnegative(),
  waiting_interest_count: z.number().int().nonnegative(),
  terms_version: AiOpaqueRefSchema,
  ai_disclosure_version: AiOpaqueRefSchema,
  conditional_reveal_consent_version: AiOpaqueRefSchema,
  sandbox_focus_policy_version: z.literal(SANDBOX_FOCUS_POLICY_VERSION),
  focus_tracking_disclosure_version: z.literal(SANDBOX_FOCUS_DISCLOSURE_VERSION),
  employer_ai_review_disclosure_version: AiOpaqueRefSchema,
  review_criteria: z.array(ReviewCriterionSchema).min(1).max(8),
}).strict();

export const StartBackedApplicationCommandSchema = z
  .object({
    schema_version: z.literal("start-backed-application-command@3"),
    terms_version: AiOpaqueRefSchema,
    ai_disclosure_version: AiOpaqueRefSchema,
    conditional_reveal_consent_version: AiOpaqueRefSchema,
    sandbox_focus_policy_version: z.literal(SANDBOX_FOCUS_POLICY_VERSION),
    focus_tracking_disclosure_version: z.literal(SANDBOX_FOCUS_DISCLOSURE_VERSION),
    employer_ai_review_policy: EmployerAiReviewPolicySchema,
    employer_ai_review_disclosure_version: AiOpaqueRefSchema,
    expected_obligation_version: z.number().int().positive(),
    expected_slot_version: z.number().int().positive(),
    expected_candidate_credit_version: z.number().int().positive(),
  })
  .strict();

export const StartBackedApplicationReceiptSchema = z
  .object({
    schema_version: z.literal("start-backed-application-receipt@1"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    invitation_ref: AiOpaqueRefSchema,
    obligation_ref: AiOpaqueRefSchema,
    answer_session_ref: AiOpaqueRefSchema,
    terms_acceptance_ref: AiOpaqueRefSchema,
    candidate_credit_ledger_ref: AiOpaqueRefSchema,
    candidate_credit_remaining: z.number().int().nonnegative(),
    new_candidate_credit_version: z.number().int().positive(),
    new_obligation_version: z.number().int().positive(),
    new_slot_version: z.number().int().positive(),
    answer_due_at: IsoDateTimeSchema,
    occurred_at: IsoDateTimeSchema,
  })
  .strict();

export interface RichTextNode {
  readonly type:
    | "doc"
    | "paragraph"
    | "text"
    | "heading"
    | "bulletList"
    | "orderedList"
    | "listItem"
    | "blockquote"
    | "codeBlock"
    | "hardBreak";
  readonly text?: string | undefined;
  readonly attrs?: Readonly<Record<string, string | number | boolean | null>> | undefined;
  readonly marks?: readonly { readonly type: "bold" | "italic" | "strike" | "code" }[] | undefined;
  readonly content?: readonly RichTextNode[] | undefined;
}

const RichTextMarkSchema = z
  .object({ type: z.enum(["bold", "italic", "strike", "code"]) })
  .strict();

export const RichTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "doc",
        "paragraph",
        "text",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "blockquote",
        "codeBlock",
        "hardBreak",
      ]),
      text: z.string().max(10_000).optional(),
      attrs: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .optional(),
      marks: z.array(RichTextMarkSchema).max(8).optional(),
      content: z.array(RichTextNodeSchema).max(500).optional(),
    })
    .strict(),
);

function richTextPlainText(node: RichTextNode): string {
  return [node.text ?? "", ...(node.content ?? []).map(richTextPlainText)].join(" ").trim();
}

export const RichTextDocumentSchema = RichTextNodeSchema.superRefine((document, context) => {
  if (document.type !== "doc") {
    context.addIssue({ code: "custom", message: "The rich-text root must be a doc node." });
  }
  if (richTextPlainText(document).length > 10_000) {
    context.addIssue({
      code: "custom",
      message: "The rich-text answer exceeds 10,000 characters.",
    });
  }
});

export const SaveAnswerDraftCommandSchema = z
  .object({
    schema_version: z.literal("save-answer-draft-command@1"),
    document: RichTextDocumentSchema,
    expected_session_version: z.number().int().positive(),
  })
  .strict();

export const SaveAnswerDraftReceiptSchema = z
  .object({
    schema_version: z.literal("save-answer-draft-receipt@1"),
    artifact_ref: AiOpaqueRefSchema,
    sha256: AiSha256Schema,
    saved_at: IsoDateTimeSchema,
    session_version: z.number().int().positive(),
  })
  .strict();

export const AnswerArtifactKindSchema = z.enum([
  "RICH_TEXT",
  "VOICE_MEMO",
  "VOICE_TRANSCRIPT",
  "GPT_TURN",
  "GPT_TRACE",
]);

export const CreateAnswerArtifactUploadCommandSchema = z
  .object({
    schema_version: z.literal("create-answer-artifact-upload-command@1"),
    kind: z.literal("VOICE_MEMO"),
    content_type: z.enum(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]),
    content_length: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    expected_session_version: z.number().int().positive(),
  })
  .strict();

export const AnswerArtifactUploadReceiptSchema = z
  .object({
    schema_version: z.literal("answer-artifact-upload-receipt@1"),
    artifact_ref: AiOpaqueRefSchema,
    upload_url: z.string().min(1),
    required_upload_headers: z
      .object({
        "If-None-Match": z.literal("*"),
      })
      .strict(),
    upload_expires_at: IsoDateTimeSchema,
    content_type: z.string().min(1),
    content_length: z.number().int().positive(),
  })
  .strict();

export const CompleteAnswerArtifactUploadCommandSchema = z
  .object({
    schema_version: z.literal("complete-answer-artifact-upload-command@1"),
    artifact_ref: AiOpaqueRefSchema,
    sha256: AiSha256Schema,
    expected_session_version: z.number().int().positive(),
  })
  .strict();

export const CompleteAnswerArtifactUploadReceiptSchema = z
  .object({
    schema_version: z.literal("complete-answer-artifact-upload-receipt@1"),
    artifact_ref: AiOpaqueRefSchema,
    state: z.literal("VERIFIED"),
    sha256: AiSha256Schema,
    verified_at: IsoDateTimeSchema,
  })
  .strict();

export const CandidateAssistantTurnCommandSchema = z
  .object({
    schema_version: z.literal("candidate-assistant-turn-command@1"),
    message: z.string().trim().min(1).max(4_000),
    expected_session_version: z.number().int().positive(),
  })
  .strict();

export const CandidateAssistantTurnReceiptSchema = z
  .object({
    schema_version: z.literal("candidate-assistant-turn-receipt@1"),
    exchange_ref: AiOpaqueRefSchema,
    user_turn_ref: AiOpaqueRefSchema,
    status: z.literal("QUEUED"),
    created_at: IsoDateTimeSchema,
  })
  .strict();

export const CandidateAssistantTurnProjectionSchema = z
  .object({
    turn_ref: AiOpaqueRefSchema,
    ordinal: z.number().int().positive(),
    role: z.enum(["USER", "ASSISTANT"]),
    status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]),
    content: z.string().max(8_000).nullable(),
    error_code: z.string().max(200).nullable(),
    created_at: IsoDateTimeSchema,
  })
  .strict();

export const AnswerArtifactProjectionSchema = z
  .object({
    artifact_ref: AiOpaqueRefSchema,
    kind: AnswerArtifactKindSchema,
    state: z.enum(["UPLOAD_ISSUED", "VERIFIED", "SEALED", "FAILED"]),
    content_type: z.string().min(1).max(200),
    content_length: z.number().int().nonnegative(),
    sha256: AiSha256Schema.nullable(),
    transcript_artifact_ref: AiOpaqueRefSchema.nullable(),
    transcription_status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]).nullable(),
    transcription_error_code: z.string().max(200).nullable(),
  })
  .strict();

export const CandidateSandboxActivityEventTypeSchema = z.enum([
  "VISIBILITY_HIDDEN",
  "VISIBILITY_VISIBLE",
  "WINDOW_BLURRED",
  "WINDOW_FOCUSED",
  "SYSTEM_DIALOG_STARTED",
  "SYSTEM_DIALOG_ENDED",
]);

export const RecordCandidateSandboxActivityCommandSchema = z
  .object({
    schema_version: z.literal("candidate-sandbox-activity-command@1"),
    event_ref: AiOpaqueRefSchema,
    event_type: CandidateSandboxActivityEventTypeSchema,
    system_dialog_type: z.literal("MIC_PERMISSION").nullable(),
    client_sequence: z.number().int().nonnegative(),
    client_monotonic_ms: z.number().finite().nonnegative(),
    policy_version: z.literal(SANDBOX_FOCUS_POLICY_VERSION),
  })
  .strict()
  .superRefine((value, context) => {
    const isDialog = value.event_type.startsWith("SYSTEM_DIALOG_");
    if (isDialog !== (value.system_dialog_type === "MIC_PERMISSION")) {
      context.addIssue({
        code: "custom",
        message: "system_dialog_type is required only for system-dialog activity events.",
      });
    }
  });

export const CandidateSandboxActivityReceiptSchema = z
  .object({
    schema_version: z.literal("candidate-sandbox-activity-receipt@1"),
    event_ref: AiOpaqueRefSchema,
    answer_session_ref: AiOpaqueRefSchema,
    recorded_at: IsoDateTimeSchema,
    focus: SandboxFocusPolicyProjectionSchema,
    auto_submit_requested: z.boolean(),
  })
  .strict();

export const CandidateAnswerSessionProjectionSchema = z
  .object({
    schema_version: z.literal("candidate-answer-session-projection@2"),
    answer_session_ref: AiOpaqueRefSchema,
    opportunity_ref: AiOpaqueRefSchema,
    candidate_ref: AiOpaqueRefSchema,
    invitation_ref: AiOpaqueRefSchema,
    obligation_ref: AiOpaqueRefSchema,
    state: z.enum([
      "ACTIVE",
      "FOCUS_POLICY_AUTO_SUBMIT_PENDING",
      "SUBMITTED",
      "EXPIRED_EMPTY",
      "FOCUS_POLICY_TERMINATED_EMPTY",
      "WITHDRAWN",
      "PLATFORM_ABORT",
    ]),
    version: z.number().int().positive(),
    title: z.string().min(1).max(200),
    organization_public_name: z.string().min(1).max(200),
    reviewer_display_name: z.string().min(1).max(200),
    critical_question: z.string().min(1).max(4_000),
    critical_challenge: CriticalChallengeSchema.default(LegacyCriticalChallenge),
    allowed_assumptions: z.array(z.string().min(1).max(500)).max(20),
    proof_format: z.string().min(1).max(500),
    candidate_ai_policy: CandidateAiPolicySchema,
    started_at: IsoDateTimeSchema,
    answer_due_at: IsoDateTimeSchema,
    submitted_at: IsoDateTimeSchema.nullable(),
    latest_document: RichTextDocumentSchema.nullable(),
    latest_rich_text_artifact_ref: AiOpaqueRefSchema.nullable(),
    artifacts: z.array(AnswerArtifactProjectionSchema).max(100),
    assistant_turns: z.array(CandidateAssistantTurnProjectionSchema).max(100),
    focus: SandboxFocusPolicyProjectionSchema,
    process_evidence: AnswerProcessEvidenceSchema.nullable().default(null),
  })
  .strict();

export const SubmitFunctionalAnswerCommandSchema = z
  .object({
    schema_version: z.literal("submit-functional-answer-command@1"),
    final_artifact_refs: z.array(AiOpaqueRefSchema).min(1).max(20),
    expected_session_version: z.number().int().positive(),
  })
  .strict();

export const FunctionalAnswerSubmissionReceiptSchema = z
  .object({
    schema_version: z.literal("functional-answer-submission-receipt@2"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    answer_session_ref: AiOpaqueRefSchema,
    answer_submission_ref: AiOpaqueRefSchema,
    process_evidence_ref: AiOpaqueRefSchema,
    obligation_ref: AiOpaqueRefSchema,
    submission_source: z.enum(["MANUAL", "DEADLINE_AUTO", "FOCUS_POLICY_AUTO"]),
    artifact_refs: z.array(AiOpaqueRefSchema).min(1).max(20),
    submission_hash: AiSha256Schema,
    submitted_at: IsoDateTimeSchema,
    new_session_version: z.number().int().positive(),
    new_obligation_version: z.number().int().positive(),
  })
  .strict();

export const EmployerCurrentReviewProjectionSchema = z
  .object({
    schema_version: z.literal("employer-current-review-projection@3"),
    opportunity_ref: AiOpaqueRefSchema,
    title: z.string().min(1).max(200),
    reviewer_ref: AiOpaqueRefSchema,
    queue: z
      .object({
        pending_review_count: z.number().int().nonnegative(),
        available_slot_count: z.number().int().nonnegative(),
        waiting_interest_count: z.number().int().nonnegative(),
      })
      .strict(),
    current: z
      .object({
        obligation_ref: AiOpaqueRefSchema,
        obligation_version: z.number().int().positive(),
        cohort_ref: AiOpaqueRefSchema,
        cohort_version: z.number().int().positive(),
        answer_submission_ref: AiOpaqueRefSchema,
        opaque_candidate_label: z.string().min(1).max(100),
        submitted_at: IsoDateTimeSchema,
        critical_question: z.string().min(1).max(4_000),
        critical_challenge: CriticalChallengeSchema.default(LegacyCriticalChallenge),
        rich_text_document: RichTextDocumentSchema.nullable(),
        rich_text_plain_text: z.string().max(10_000).nullable(),
        artifacts: z.array(AnswerArtifactProjectionSchema).max(100),
        assistant_trace: z.array(CandidateAssistantTurnProjectionSchema).max(100),
        permitted_evidence_refs: z.array(AiOpaqueRefSchema).min(1).max(100),
        focus_policy_auto_submitted: z.boolean(),
        ai_review: EmployerAiReviewProjectionSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

export const RecordFunctionalHumanReviewCommandSchema = z
  .object({
    schema_version: z.literal("record-functional-human-review-command@2"),
    decision: HumanAnswerReviewDecisionSchema,
    evidence_refs: z.array(AiOpaqueRefSchema).min(1).max(50),
    review_comment: z.string().trim().min(10).max(4_000),
    still_unknown: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20),
    consulted_ai_output_ref: AiOpaqueRefSchema.nullable().default(null),
    expected_obligation_version: z.number().int().positive(),
    expected_cohort_version: z.number().int().positive(),
  })
  .strict();

export const FunctionalHumanReviewReceiptSchema = z
  .object({
    schema_version: z.literal("functional-human-review-receipt@3"),
    command_id: AiOpaqueRefSchema,
    event_ids: z.array(AiOpaqueRefSchema).min(2).max(10),
    human_review_ref: AiOpaqueRefSchema,
    answer_submission_ref: AiOpaqueRefSchema,
    obligation_ref: AiOpaqueRefSchema,
    slot_ref: AiOpaqueRefSchema,
    decision: HumanAnswerReviewDecisionSchema,
    evidence_refs: z.array(AiOpaqueRefSchema).min(1).max(50),
    review_comment: z.string().min(10).max(4_000),
    still_unknown: z.array(z.string().min(1).max(1_000)).min(1).max(20),
    consulted_ai_output_ref: AiOpaqueRefSchema.nullable(),
    slot_state: z.literal("AVAILABLE"),
    next_offer_requested: z.literal(true),
    resume_reveal_ref: AiOpaqueRefSchema.nullable(),
    reviewed_at: IsoDateTimeSchema,
  })
  .strict();

export const CandidateResumeSnapshotSchema = z
  .object({
    schema_version: z.literal("candidate-resume-snapshot@1"),
    resume_snapshot_ref: AiOpaqueRefSchema,
    candidate_ref: AiOpaqueRefSchema,
    snapshot_version: z.number().int().positive(),
    display_name: z.string().trim().min(2).max(160),
    headline: z.string().trim().min(2).max(240),
    location: z.string().trim().min(2).max(200),
    contact_email: z.string().email().max(320),
    summary: z.string().trim().min(20).max(2_000),
    education: z
      .array(
        z
          .object({
            institution: z.string().trim().min(2).max(200),
            credential: z.string().trim().min(2).max(200),
            field_of_study: z.string().trim().min(2).max(200),
            graduation_date: z.string().date(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    experience: z
      .array(
        z
          .object({
            organization: z.string().trim().min(2).max(200),
            title: z.string().trim().min(2).max(200),
            started_on: z.string().date(),
            ended_on: z.string().date().nullable(),
            highlights: z.array(z.string().trim().min(10).max(500)).min(1).max(8),
          })
          .strict(),
      )
      .max(20),
    certifications: z.array(z.string().trim().min(2).max(200)).max(20),
    skills: z.array(z.string().trim().min(2).max(100)).min(1).max(40),
    source_sha256: AiSha256Schema,
    synthetic: z.boolean(),
    sealed_at: IsoDateTimeSchema,
  })
  .strict();

export const EmployerRevealedCandidateSchema = z
  .object({
    reveal_ref: AiOpaqueRefSchema,
    opportunity_ref: AiOpaqueRefSchema,
    opportunity_title: z.string().trim().min(2).max(200),
    human_review_ref: AiOpaqueRefSchema,
    answer_submission_ref: AiOpaqueRefSchema,
    review_comment: z.string().trim().min(10).max(4_000),
    revealed_at: IsoDateTimeSchema,
    resume: CandidateResumeSnapshotSchema,
  })
  .strict();

export const EmployerRevealedCandidatePageSchema = z
  .object({
    schema_version: z.literal("employer-revealed-candidate-page@1"),
    reviewer_ref: AiOpaqueRefSchema,
    page: z.number().int().positive(),
    page_size: z.literal(1),
    total_items: z.number().int().nonnegative(),
    total_pages: z.number().int().nonnegative(),
    items: z.array(EmployerRevealedCandidateSchema).max(1),
  })
  .strict();

export type JobPostDraftInput = z.infer<typeof JobPostDraftInputSchema>;
export type { RoleCategory } from "./common";
export type CriticalChallenge = z.infer<typeof CriticalChallengeSchema>;
export type CriticalChallengePart = z.infer<typeof CriticalChallengePartSchema>;
export type CreateJobPostDraftCommand = z.infer<typeof CreateJobPostDraftCommandSchema>;
export type UpdateJobPostDraftCommand = z.infer<typeof UpdateJobPostDraftCommandSchema>;
export type PublishJobPostCommand = z.infer<typeof PublishJobPostCommandSchema>;
export type JobPostDraftProjection = z.infer<typeof JobPostDraftProjectionSchema>;
export type CandidateOpportunityFeed = z.infer<typeof CandidateOpportunityFeedSchema>;
export type CandidateJobCard = z.infer<typeof CandidateJobCardSchema>;
export type CandidateJobDetail = z.infer<typeof CandidateJobDetailSchema>;
export type StartBackedApplicationCommand = z.infer<typeof StartBackedApplicationCommandSchema>;
export type StartBackedApplicationReceipt = z.infer<typeof StartBackedApplicationReceiptSchema>;
export type SaveAnswerDraftCommand = z.infer<typeof SaveAnswerDraftCommandSchema>;
export type CompleteAnswerArtifactUploadCommand = z.infer<
  typeof CompleteAnswerArtifactUploadCommandSchema
>;
export type CandidateAssistantTurnCommand = z.infer<typeof CandidateAssistantTurnCommandSchema>;
export type RecordCandidateSandboxActivityCommand = z.infer<
  typeof RecordCandidateSandboxActivityCommandSchema
>;
export type CandidateSandboxActivityReceipt = z.infer<typeof CandidateSandboxActivityReceiptSchema>;
export type CandidateAnswerSessionProjection = z.infer<
  typeof CandidateAnswerSessionProjectionSchema
>;
export type EmployerJobDashboard = z.infer<typeof EmployerJobDashboardSchema>;
export type EmployerCurrentReviewProjection = z.infer<typeof EmployerCurrentReviewProjectionSchema>;
export type SubmitFunctionalAnswerCommand = z.infer<typeof SubmitFunctionalAnswerCommandSchema>;
export type FunctionalAnswerSubmissionReceipt = z.infer<
  typeof FunctionalAnswerSubmissionReceiptSchema
>;
export type RecordFunctionalHumanReviewCommand = z.infer<
  typeof RecordFunctionalHumanReviewCommandSchema
>;
export type FunctionalHumanReviewReceipt = z.infer<typeof FunctionalHumanReviewReceiptSchema>;
export type CandidateResumeSnapshot = z.infer<typeof CandidateResumeSnapshotSchema>;
export type EmployerRevealedCandidatePage = z.infer<typeof EmployerRevealedCandidatePageSchema>;
