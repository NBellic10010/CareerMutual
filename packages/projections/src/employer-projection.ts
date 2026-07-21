import {
  AllocationKindSchema,
  CommonVerifierResultSchema,
  OpaqueIdSchema,
  OutcomeTypeSchema,
  ReviewWindowStateSchema,
  VeiledCandidateSchema,
} from "@onlyboth/contracts";
import { z } from "zod";

export const EmployerProjectionSchema = z
  .object({
    view: z.literal("EMPLOYER"),
    opportunity: z.object({ id: OpaqueIdSchema, title: z.string().min(1) }).strict(),
    reviewer: z.object({ id: OpaqueIdSchema, displayName: z.string().min(1) }).strict(),
    attention: z
      .object({
        activeReviews: z.number().int().nonnegative(),
        nextCandidateAccess: z.enum(["LOCKED", "UNLOCKED"]),
      })
      .strict(),
    candidates: z.array(
      z
        .object({
          candidate: VeiledCandidateSchema,
          allocationKind: AllocationKindSchema,
          reviewWindow: z.object({ id: OpaqueIdSchema, state: ReviewWindowStateSchema }).strict(),
          proof: z
            .object({
              selectedChallenge: z
                .object({ id: OpaqueIdSchema, label: z.string().min(1) })
                .strict(),
              commonVerifier: CommonVerifierResultSchema,
              scenarioFinding: z.string().min(1),
            })
            .strict(),
          outcome: OutcomeTypeSchema,
          revealAuthorized: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export type EmployerProjection = z.infer<typeof EmployerProjectionSchema>;
