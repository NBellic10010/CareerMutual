import { z } from "zod";

export const OpaqueIdSchema = z.string().trim().min(1);
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const ReviewWindowStateSchema = z.enum([
  "RESERVED",
  "STAGE_A_ACTIVE",
  "CHECKPOINT_PENDING",
  "STAGE_B_ACTIVE",
  "EVIDENCE_READY",
  "OUTCOME_RECORDED",
  "ASK_BACK_PENDING",
  "REVEALED",
  "BREACHED",
  "REMEDIATING",
  "WITHDRAWN",
  "PLATFORM_ABORT",
  "SETTLING",
  "SETTLED",
]);

export const OutcomeTypeSchema = z.enum(["ADVANCE", "CLARIFY", "CLOSE"]);
export const CreditHoldStatusSchema = z.enum(["HELD", "RETURNED", "FORFEITED"]);
export const AllocationKindSchema = z.enum(["DIRECT", "EXPLORE"]);
export const RoleCategorySchema = z.enum([
  "TECHNOLOGY",
  "FINANCE",
  "BUSINESS_DEVELOPMENT",
  "CREATIVE",
  "SALES",
  "MARKETING",
  "PRODUCT",
  "OPERATIONS",
  "PEOPLE",
  "LEGAL",
  "HEALTHCARE",
  "SUSTAINABILITY",
]);
export const CriticalChallengePartKindSchema = z.enum(["TEXT", "AUDIO", "IMAGE", "FILE"]);

export const VersionPinsSchema = z
  .object({
    contractVersionId: OpaqueIdSchema,
    labelPolicyVersionId: OpaqueIdSchema,
    proofTemplateVersionId: OpaqueIdSchema,
    challengeCatalogVersionId: OpaqueIdSchema,
  })
  .strict();

export const HardFactSchema = z
  .object({
    key: OpaqueIdSchema,
    label: z.string().trim().min(1),
    value: z.string().trim().min(1),
  })
  .strict();

export const CandidateClaimSchema = z
  .object({
    id: OpaqueIdSchema,
    capabilityRef: OpaqueIdSchema,
    statement: z.string().trim().min(1),
  })
  .strict();

export const VeiledCandidateSchema = z
  .object({
    opaqueId: OpaqueIdSchema,
    eligibility: z.literal("ELIGIBLE"),
    hardFacts: z.array(HardFactSchema),
    claims: z.array(CandidateClaimSchema).min(1),
  })
  .strict();

export const CommonVerifierResultSchema = z
  .object({
    passed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  })
  .strict()
  .refine(({ passed, total }) => passed <= total, {
    message: "passed cannot exceed total",
  });

export type ReviewWindowState = z.infer<typeof ReviewWindowStateSchema>;
export type OutcomeType = z.infer<typeof OutcomeTypeSchema>;
export type CreditHoldStatus = z.infer<typeof CreditHoldStatusSchema>;
export type AllocationKind = z.infer<typeof AllocationKindSchema>;
export type RoleCategory = z.infer<typeof RoleCategorySchema>;
export type CriticalChallengePartKind = z.infer<typeof CriticalChallengePartKindSchema>;
export type VersionPins = z.infer<typeof VersionPinsSchema>;
export type VeiledCandidate = z.infer<typeof VeiledCandidateSchema>;
export type CommonVerifierResult = z.infer<typeof CommonVerifierResultSchema>;
