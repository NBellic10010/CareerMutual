import { z } from "zod";

import { IsoDateTimeSchema } from "./common";
import {
  CandidateApplicationCreditProjectionSchema,
  CandidateJobCardSchema,
} from "./functional-product";
import { AiOpaqueRefSchema, AiSha256Schema } from "./hiring-intelligence";

export const CandidateEvidenceKindSchema = z.enum([
  "GITHUB_REPOSITORY",
  "CERTIFICATION",
  "WORK_SAMPLE",
  "ONLINE_WORK_PROOF",
  "EMPLOYMENT_VERIFICATION",
]);

export const CandidateEducationLevelSchema = z.enum([
  "NO_FORMAL_DEGREE",
  "HIGH_SCHOOL",
  "ASSOCIATE",
  "BACHELOR",
  "MASTER",
  "DOCTORATE",
  "PROFESSIONAL",
  "OTHER",
]);

export const CandidateEducationRecordSchema = z
  .object({
    education_ref: AiOpaqueRefSchema,
    level: CandidateEducationLevelSchema,
    status: z.enum(["GRADUATED", "IN_PROGRESS", "NO_FORMAL_DEGREE"]),
    institution_label: z.string().trim().min(2).max(200).nullable(),
    field_of_study: z.string().trim().min(2).max(200).nullable(),
    graduation_date: z.string().date().nullable(),
    source_sha256: AiSha256Schema,
    verification_state: z.literal("SYNTHETIC_SOURCE_ATTACHED"),
    visibility: z.literal("CANDIDATE_ONLY"),
  })
  .strict()
  .superRefine((value, context) => {
    const noDegree = value.level === "NO_FORMAL_DEGREE";
    if (noDegree !== (value.status === "NO_FORMAL_DEGREE")) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "NO_FORMAL_DEGREE level and status must be selected together.",
      });
    }
    if (noDegree) {
      if (
        value.institution_label !== null ||
        value.field_of_study !== null ||
        value.graduation_date !== null
      ) {
        context.addIssue({
          code: "custom",
          message: "No-degree education cannot invent an institution, field, or graduation date.",
        });
      }
      return;
    }
    if (
      value.institution_label === null ||
      value.field_of_study === null ||
      value.graduation_date === null
    ) {
      context.addIssue({
        code: "custom",
        message: "Degree education requires institution, field, and graduation date.",
      });
    }
  });

export const CandidateEvidenceItemSchema = z
  .object({
    evidence_ref: AiOpaqueRefSchema,
    kind: CandidateEvidenceKindSchema,
    display_title: z.string().trim().min(2).max(160),
    bounded_summary: z.string().trim().min(20).max(1_200),
    contribution_summary: z.string().trim().min(10).max(800),
    occurred_from: z.string().date().nullable(),
    occurred_to: z.string().date().nullable(),
    synthetic_locator_label: z.string().trim().min(2).max(200),
    source_sha256: AiSha256Schema,
    verification_state: z.literal("SYNTHETIC_SOURCE_ATTACHED"),
    visibility: z.literal("CANDIDATE_ONLY"),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.synthetic_locator_label.startsWith("synthetic://")) {
      context.addIssue({
        code: "custom",
        path: ["synthetic_locator_label"],
        message: "MVP Passport locators must be explicit synthetic:// references.",
      });
    }
    const candidateText = [
      value.display_title,
      value.bounded_summary,
      value.contribution_summary,
      value.synthetic_locator_label,
    ].join(" ");
    if (
      /(?:https?:\/\/|\bP45\b|national insurance|\bNI number\b|tax code|salary|home address|previous employer|employer name|school name|university name|email address|phone number)/iu.test(
        candidateText,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "MVP Passport evidence cannot contain real locators or sensitive identity fields.",
      });
    }
    if (
      value.occurred_from !== null &&
      value.occurred_to !== null &&
      value.occurred_to < value.occurred_from
    ) {
      context.addIssue({
        code: "custom",
        path: ["occurred_to"],
        message: "The evidence end date cannot precede its start date.",
      });
    }
  });

export const SaveCandidateEvidencePassportDraftCommandSchema = z
  .object({
    schema_version: z.literal("save-candidate-evidence-passport-draft-command@2"),
    expected_draft_version: z.number().int().nonnegative(),
    education: CandidateEducationRecordSchema,
    evidence_items: z.array(CandidateEvidenceItemSchema).min(1).max(20),
  })
  .strict();

export const PublishCandidateEvidencePassportCommandSchema = z
  .object({
    schema_version: z.literal("publish-candidate-evidence-passport-command@1"),
    expected_draft_version: z.number().int().positive(),
    discovery_consent_version: z.literal("candidate-discovery-consent@1"),
  })
  .strict();

export const RefreshCandidateDiscoveryCommandSchema = z
  .object({
    schema_version: z.literal("refresh-candidate-discovery-command@1"),
    expected_projection_version: z.number().int().positive(),
  })
  .strict();

export const CandidateEvidencePassportDraftSchema = z
  .object({
    schema_version: z.literal("candidate-evidence-passport-draft@2"),
    candidate_ref: AiOpaqueRefSchema,
    draft_version: z.number().int().nonnegative(),
    education: CandidateEducationRecordSchema.nullable(),
    evidence_items: z.array(CandidateEvidenceItemSchema).max(20),
    has_unpublished_changes: z.boolean(),
    updated_at: IsoDateTimeSchema,
  })
  .strict();

export const CandidateEvidencePassportSnapshotSummarySchema = z
  .object({
    snapshot_ref: AiOpaqueRefSchema,
    snapshot_version: z.number().int().positive(),
    draft_version: z.number().int().positive(),
    snapshot_hash: AiSha256Schema,
    education_ref: AiOpaqueRefSchema,
    evidence_count: z.number().int().positive(),
    discovery_consent_version: AiOpaqueRefSchema,
    published_at: IsoDateTimeSchema,
  })
  .strict();

export const CandidateDiscoveryStatusSchema = z.enum([
  "READY",
  "GENERATING",
  "STALE",
  "NEEDS_HUMAN",
  "FAILED",
]);

export const CandidateEvidencePassportProjectionSchema = z
  .object({
    schema_version: z.literal("candidate-evidence-passport-projection@2"),
    candidate_ref: AiOpaqueRefSchema,
    projection_version: z.number().int().positive(),
    current_draft: CandidateEvidencePassportDraftSchema,
    last_published_snapshot: CandidateEvidencePassportSnapshotSummarySchema.nullable(),
    discovery: z
      .object({
        status: CandidateDiscoveryStatusSchema,
        current_signal_set_ref: AiOpaqueRefSchema.nullable(),
        last_ready_signal_set_ref: AiOpaqueRefSchema.nullable(),
        job_set_hash: AiSha256Schema.nullable(),
        synthetic_preloaded: z.boolean(),
        reason_code: AiOpaqueRefSchema.nullable(),
        updated_at: IsoDateTimeSchema,
      })
      .strict(),
    disclosure: z.literal(
      "Synthetic Evidence Passport — Candidate-only discovery input; not employer-visible.",
    ),
  })
  .strict();

export const CandidateEvidencePassportReceiptSchema = z
  .object({
    schema_version: z.literal("candidate-evidence-passport-receipt@2"),
    command_id: AiOpaqueRefSchema,
    event_id: AiOpaqueRefSchema,
    candidate_ref: AiOpaqueRefSchema,
    draft_version: z.number().int().positive(),
    snapshot_ref: AiOpaqueRefSchema.nullable(),
    snapshot_version: z.number().int().positive().nullable(),
    signal_set_ref: AiOpaqueRefSchema.nullable(),
    discovery_status: CandidateDiscoveryStatusSchema,
    projection_version: z.number().int().positive(),
    occurred_at: IsoDateTimeSchema,
  })
  .strict();

export const CandidateDiscoveryEvidenceForAiSchema = z
  .object({
    evidence_ref: AiOpaqueRefSchema,
    kind: CandidateEvidenceKindSchema,
    verification_state: z.literal("SYNTHETIC_SOURCE_ATTACHED"),
    sanitized_summary: z.string().trim().min(20).max(1_200),
    sanitized_contribution: z.string().trim().min(10).max(800),
    occurred_from: z.string().date().nullable(),
    occurred_to: z.string().date().nullable(),
    source_sha256: AiSha256Schema,
  })
  .strict();

export const CandidateDiscoveryEducationForAiSchema = z
  .object({
    education_ref: AiOpaqueRefSchema,
    level: CandidateEducationLevelSchema,
    status: z.enum(["GRADUATED", "IN_PROGRESS", "NO_FORMAL_DEGREE"]),
    field_of_study: z.string().trim().min(2).max(200).nullable(),
    graduation_date: z.string().date().nullable(),
    source_sha256: AiSha256Schema,
    verification_state: z.literal("SYNTHETIC_SOURCE_ATTACHED"),
  })
  .strict();

export const CandidateDiscoveryPriorityPolicySchema = z
  .object({
    policy_version: z.literal("candidate-discovery-evidence-priority@1"),
    as_of_date: z.string().date(),
    graduation_recency: z.enum(["WITHIN_TWO_YEARS", "OVER_TWO_YEARS", "NO_FORMAL_DEGREE"]),
    ordered_evidence_groups: z
      .array(z.enum(["EDUCATION", "WORK_AND_CREDENTIALS", "OTHER"]))
      .length(3),
  })
  .strict()
  .superRefine((value, context) => {
    const expected =
      value.graduation_recency === "WITHIN_TWO_YEARS"
        ? ["EDUCATION", "WORK_AND_CREDENTIALS", "OTHER"]
        : ["WORK_AND_CREDENTIALS", "OTHER", "EDUCATION"];
    if (value.ordered_evidence_groups.some((group, index) => group !== expected[index])) {
      context.addIssue({
        code: "custom",
        path: ["ordered_evidence_groups"],
        message: "Evidence precedence does not match the frozen graduation-recency policy.",
      });
    }
  });

export const CandidateDiscoveryOpportunityForAiSchema = z
  .object({
    opportunity_ref: AiOpaqueRefSchema,
    opportunity_version: z.number().int().positive(),
    contract_hash: AiSha256Schema,
    public_role_summary: z.string().trim().min(20).max(4_000),
    capabilities: z
      .array(
        z
          .object({
            capability_ref: AiOpaqueRefSchema,
            statement: z.string().trim().min(2).max(300),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export const CandidateJobDiscoveryInputSchema = z
  .object({
    schema_version: z.literal("candidate-job-discovery-input@2"),
    request_ref: AiOpaqueRefSchema,
    candidate_ref: AiOpaqueRefSchema,
    passport_snapshot_ref: AiOpaqueRefSchema,
    passport_snapshot_hash: AiSha256Schema,
    job_set_hash: AiSha256Schema,
    education: CandidateDiscoveryEducationForAiSchema,
    evidence_priority: CandidateDiscoveryPriorityPolicySchema,
    evidence: z.array(CandidateDiscoveryEvidenceForAiSchema).min(1).max(20),
    opportunities: z.array(CandidateDiscoveryOpportunityForAiSchema).min(1).max(100),
  })
  .strict();

export const CandidateDiscoveryBandSchema = z.enum([
  "EVIDENCE_CONNECTED",
  "ADJACENT",
  "INSUFFICIENT_SOURCE",
]);

export const CandidateJobDiscoveryConnectionSchema = z
  .object({
    capability_ref: AiOpaqueRefSchema,
    evidence_refs: z.array(AiOpaqueRefSchema).min(1).max(10),
    bounded_reason: z.string().trim().min(20).max(800),
    still_unknown: z.array(z.string().trim().min(2).max(500)).min(1).max(10),
  })
  .strict();

export const CandidateJobDiscoverySignalSchema = z
  .object({
    opportunity_ref: AiOpaqueRefSchema,
    discovery_band: CandidateDiscoveryBandSchema,
    connections: z.array(CandidateJobDiscoveryConnectionSchema).max(10),
  })
  .strict()
  .superRefine((value, context) => {
    const connected = value.discovery_band !== "INSUFFICIENT_SOURCE";
    if (connected && value.connections.length === 0) {
      context.addIssue({ code: "custom", message: "A connected band requires a connection." });
    }
    if (!connected && value.connections.length !== 0) {
      context.addIssue({
        code: "custom",
        message: "INSUFFICIENT_SOURCE cannot contain evidence connections.",
      });
    }
  });

export const CandidateJobDiscoveryOutputSchema = z
  .object({
    schema_version: z.literal("candidate-job-discovery-output@1"),
    status: z.enum(["ready", "abstain"]),
    opportunity_signals: z.array(CandidateJobDiscoverySignalSchema).max(100),
    reason_code: z.enum(["NO_BOUNDED_SOURCE", "NO_OPEN_OPPORTUNITY", "SOURCE_CONFLICT"]).nullable(),
    explanation: z.string().trim().min(10).max(800).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === "ready" &&
      (value.opportunity_signals.length === 0 ||
        value.reason_code !== null ||
        value.explanation !== null)
    ) {
      context.addIssue({ code: "custom", message: "ready requires signals only." });
    }
    if (
      value.status === "abstain" &&
      (value.opportunity_signals.length !== 0 ||
        value.reason_code === null ||
        value.explanation === null)
    ) {
      context.addIssue({ code: "custom", message: "abstain requires a bounded reason." });
    }
  });

export const CandidateJobDiscoveryProjectionSchema = z
  .object({
    status: z.enum([
      "NOT_EVALUATED",
      "EVIDENCE_CONNECTED",
      "ADJACENT",
      "INSUFFICIENT_SOURCE",
      "STALE",
    ]),
    signal_set_ref: AiOpaqueRefSchema.nullable(),
    synthetic_preloaded: z.boolean(),
    why: z.string().min(1).max(800).nullable(),
    evidence_refs: z.array(AiOpaqueRefSchema).max(20),
    capability_refs: z.array(AiOpaqueRefSchema).max(20),
    still_unknown: z.array(z.string().min(1).max(500)).max(20),
  })
  .strict();

export const CandidateJobCardV2Schema = CandidateJobCardSchema.omit({
  schema_version: true,
})
  .extend({
    schema_version: z.literal("candidate-job-card@2"),
    discovery: CandidateJobDiscoveryProjectionSchema,
  })
  .strict();

export const CandidateOpportunityFeedV2Schema = z
  .object({
    schema_version: z.literal("candidate-opportunity-feed@2"),
    candidate_ref: AiOpaqueRefSchema,
    credit: CandidateApplicationCreditProjectionSchema,
    discovery_status: CandidateDiscoveryStatusSchema,
    discovery_snapshot_ref: AiOpaqueRefSchema.nullable(),
    opportunities: z.array(CandidateJobCardV2Schema).max(100),
  })
  .strict();

export type CandidateEvidenceItem = z.infer<typeof CandidateEvidenceItemSchema>;
export type CandidateEvidenceKind = z.infer<typeof CandidateEvidenceKindSchema>;
export type CandidateEducationRecord = z.infer<typeof CandidateEducationRecordSchema>;
export type SaveCandidateEvidencePassportDraftCommand = z.infer<
  typeof SaveCandidateEvidencePassportDraftCommandSchema
>;
export type PublishCandidateEvidencePassportCommand = z.infer<
  typeof PublishCandidateEvidencePassportCommandSchema
>;
export type RefreshCandidateDiscoveryCommand = z.infer<
  typeof RefreshCandidateDiscoveryCommandSchema
>;
export type CandidateEvidencePassportProjection = z.infer<
  typeof CandidateEvidencePassportProjectionSchema
>;
export type CandidateEvidencePassportReceipt = z.infer<
  typeof CandidateEvidencePassportReceiptSchema
>;
export type CandidateJobDiscoveryInput = z.infer<typeof CandidateJobDiscoveryInputSchema>;
export type CandidateJobDiscoveryOutput = z.infer<typeof CandidateJobDiscoveryOutputSchema>;
export type CandidateJobDiscoverySignal = z.infer<typeof CandidateJobDiscoverySignalSchema>;
export type CandidateJobDiscoveryProjection = z.infer<typeof CandidateJobDiscoveryProjectionSchema>;
export type CandidateOpportunityFeedV2 = z.infer<typeof CandidateOpportunityFeedV2Schema>;
export type CandidateJobCardV2 = z.infer<typeof CandidateJobCardV2Schema>;
