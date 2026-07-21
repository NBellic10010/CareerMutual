import { z } from "zod";

import { IsoDateTimeSchema } from "./common";
import {
  CandidateDiscoveryEducationForAiSchema,
  CandidateDiscoveryEvidenceForAiSchema,
} from "./candidate-discovery";
import {
  CandidateApplicationCreditProjectionSchema,
  CandidateJobCardSchema,
  CandidateJobDetailSchema,
} from "./functional-product";
import { AiOpaqueRefSchema, AiSha256Schema } from "./hiring-intelligence";
import { EligibilityBackgroundTagSchema } from "./eligibility-policy";

export * from "./eligibility-policy";

export const CandidateEligibilityOpportunityForAiSchema = z
  .object({
    opportunity_ref: AiOpaqueRefSchema,
    opportunity_version: z.number().int().positive(),
    contract_hash: AiSha256Schema,
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
    accepted_tags: z.array(EligibilityBackgroundTagSchema).min(1).max(20),
  })
  .strict();

export const CandidateEligibilityMatchInputSchema = z
  .object({
    schema_version: z.literal("candidate-eligibility-match-input@1"),
    request_ref: AiOpaqueRefSchema,
    candidate_ref: AiOpaqueRefSchema,
    passport_snapshot_ref: AiOpaqueRefSchema,
    passport_snapshot_hash: AiSha256Schema,
    education: CandidateDiscoveryEducationForAiSchema,
    evidence: z.array(CandidateDiscoveryEvidenceForAiSchema).min(1).max(20),
    opportunities: z.array(CandidateEligibilityOpportunityForAiSchema).min(1).max(100),
  })
  .strict();

export const CandidateEligibilityConnectionTypeSchema = z.enum([
  "EDUCATION",
  "WORK_EXPERIENCE",
  "CERTIFICATION",
  "WORK_SAMPLE",
  "OTHER_EVIDENCE",
]);

export const CandidateEligibilityConnectionSchema = z
  .object({
    tag_ref: AiOpaqueRefSchema,
    evidence_refs: z.array(AiOpaqueRefSchema).min(1).max(10),
    connection_type: CandidateEligibilityConnectionTypeSchema,
    bounded_reason: z.string().trim().min(20).max(800),
    still_unknown: z.array(z.string().trim().min(2).max(500)).min(1).max(10),
  })
  .strict();

export const CandidateEligibilityJobMatchSchema = z
  .object({
    opportunity_ref: AiOpaqueRefSchema,
    state: z.enum(["POSITIVE_EVIDENCE", "NO_POSITIVE_EVIDENCE"]),
    connections: z.array(CandidateEligibilityConnectionSchema).max(20),
  })
  .strict()
  .superRefine((match, context) => {
    if (match.state === "POSITIVE_EVIDENCE" && match.connections.length === 0) {
      context.addIssue({ code: "custom", message: "A positive match requires a connection." });
    }
    if (match.state === "NO_POSITIVE_EVIDENCE" && match.connections.length !== 0) {
      context.addIssue({ code: "custom", message: "A negative match cannot contain connections." });
    }
  });

export const CandidateEligibilityMatchOutputSchema = z
  .object({
    schema_version: z.literal("candidate-eligibility-match-output@1"),
    matches: z.array(CandidateEligibilityJobMatchSchema).min(1).max(100),
  })
  .strict();

export const CandidateEligibilityMatchStatusSchema = z.enum([
  "MATCHING",
  "READY",
  "PARTIAL",
  "FAILED",
  "STALE",
]);

export const CandidateEligibilityProjectionSchema = z
  .object({
    schema_version: z.literal("candidate-eligibility-projection@1"),
    candidate_ref: AiOpaqueRefSchema,
    status: CandidateEligibilityMatchStatusSchema,
    passport_snapshot_ref: AiOpaqueRefSchema.nullable(),
    projection_version: z.number().int().positive(),
    reason_code: AiOpaqueRefSchema.nullable(),
    updated_at: IsoDateTimeSchema,
  })
  .strict();

export const RefreshCandidateEligibilityCommandSchema = z
  .object({
    schema_version: z.literal("refresh-candidate-eligibility-command@1"),
    expected_projection_version: z.number().int().positive(),
  })
  .strict();

export const CandidateEligibilityAccessProjectionSchema = z
  .object({
    access_basis: z.enum(["OPEN_TO_ALL", "AI_POSITIVE_EVIDENCE", "ACTIVE_JOURNEY_PIN"]),
    match_ref: AiOpaqueRefSchema.nullable(),
    match_version: z.number().int().positive().nullable(),
    why: z.string().trim().min(1).max(1_600),
    evidence_refs: z.array(AiOpaqueRefSchema).max(20),
    tag_refs: z.array(AiOpaqueRefSchema).max(20),
    still_unknown: z.array(z.string().trim().min(1).max(500)).max(20),
    recorded_live: z.boolean(),
  })
  .strict();

export const CandidateJobCardV3Schema = CandidateJobCardSchema.omit({ schema_version: true })
  .extend({
    schema_version: z.literal("candidate-job-card@3"),
    eligibility_access: CandidateEligibilityAccessProjectionSchema,
  })
  .strict();

export const CandidateOpportunityFeedV3Schema = z
  .object({
    schema_version: z.literal("candidate-opportunity-feed@3"),
    candidate_ref: AiOpaqueRefSchema,
    credit: CandidateApplicationCreditProjectionSchema,
    eligibility_status: CandidateEligibilityMatchStatusSchema,
    eligibility_snapshot_ref: AiOpaqueRefSchema.nullable(),
    opportunities: z.array(CandidateJobCardV3Schema).max(100),
  })
  .strict();

export const CandidateJobDetailV2Schema = CandidateJobDetailSchema.omit({ schema_version: true })
  .extend({
    schema_version: z.literal("candidate-job-detail@2"),
    eligibility_access: CandidateEligibilityAccessProjectionSchema,
  })
  .strict();

export type CandidateEligibilityMatchInput = z.infer<typeof CandidateEligibilityMatchInputSchema>;
export type CandidateEligibilityMatchOutput = z.infer<typeof CandidateEligibilityMatchOutputSchema>;
export type CandidateEligibilityProjection = z.infer<typeof CandidateEligibilityProjectionSchema>;
export type RefreshCandidateEligibilityCommand = z.infer<
  typeof RefreshCandidateEligibilityCommandSchema
>;
export type CandidateEligibilityAccessProjection = z.infer<
  typeof CandidateEligibilityAccessProjectionSchema
>;
export type CandidateOpportunityFeedV3 = z.infer<typeof CandidateOpportunityFeedV3Schema>;
export type CandidateJobCardV3 = z.infer<typeof CandidateJobCardV3Schema>;
export type CandidateJobDetailV2 = z.infer<typeof CandidateJobDetailV2Schema>;
