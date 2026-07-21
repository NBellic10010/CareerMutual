import {
  CommonVerifierResultSchema,
  OpaqueIdSchema,
  PrivateCandidateLabelsSchema,
  SyntheticReplayNotice,
} from "@onlyboth/contracts";
import { z } from "zod";

export const SyntheticJudgeProjectionSchema = z
  .object({
    view: z.literal("SYNTHETIC_JUDGE"),
    synthetic: z.literal(true),
    notice: z.literal(SyntheticReplayNotice),
    opportunity: z.object({ id: OpaqueIdSchema, title: z.string().min(1) }).strict(),
    candidates: z.array(
      z
        .object({
          candidateId: OpaqueIdSchema,
          privateProfile: PrivateCandidateLabelsSchema,
          counterfactual: z
            .object({
              resumeRank: z.number().int().positive(),
              conventionalDecision: z.enum(["INTERVIEW", "AUTO_REJECT"]),
            })
            .strict(),
          evidence: z
            .object({
              commonVerifier: CommonVerifierResultSchema,
              profileSignalRisk: z.enum([
                "FALSE_POSITIVE_RISK_EXPOSED",
                "FALSE_NEGATIVE_RISK_SURFACED",
              ]),
            })
            .strict(),
        })
        .strict(),
    ),
  })
  .strict();

export type SyntheticJudgeProjection = z.infer<typeof SyntheticJudgeProjectionSchema>;
