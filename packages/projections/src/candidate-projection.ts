import { OpaqueIdSchema, OutcomeTypeSchema, ReviewWindowStateSchema } from "@onlyboth/contracts";
import { z } from "zod";

export const CandidateProjectionSchema = z
  .object({
    view: z.literal("CANDIDATE"),
    candidateId: OpaqueIdSchema,
    opportunity: z.object({ id: OpaqueIdSchema, title: z.string().min(1) }).strict(),
    reviewer: z.object({ id: OpaqueIdSchema, displayName: z.string().min(1) }).strict(),
    reviewWindow: z.object({ id: OpaqueIdSchema, state: ReviewWindowStateSchema }).strict(),
    selectedChallenge: z.object({ id: OpaqueIdSchema, label: z.string().min(1) }).strict(),
    outcome: OutcomeTypeSchema,
    labelsRevealedToEmployer: z.boolean(),
    message: z.string().min(1),
  })
  .strict();

export type CandidateProjection = z.infer<typeof CandidateProjectionSchema>;
