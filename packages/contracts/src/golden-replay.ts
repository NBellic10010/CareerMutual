import { z } from "zod";

import {
  AllocationKindSchema,
  CommonVerifierResultSchema,
  OpaqueIdSchema,
  OutcomeTypeSchema,
  ReviewWindowStateSchema,
  VeiledCandidateSchema,
} from "./common";

export const SyntheticReplayNotice = "Synthetic — Pre-recorded external inputs" as const;

export const PrivateCandidateLabelsSchema = z
  .object({
    name: z.string().min(1),
    schoolName: z.string().min(1),
    previousEmployerName: z.string().min(1),
    referralSource: z.string().min(1),
  })
  .strict();

export const ReplayCandidateSchema = z
  .object({
    candidateId: OpaqueIdSchema,
    allocationKind: AllocationKindSchema,
    veiledCandidate: VeiledCandidateSchema,
    privateLabels: PrivateCandidateLabelsSchema,
    counterfactual: z
      .object({
        resumeRank: z.number().int().positive(),
        conventionalDecision: z.enum(["INTERVIEW", "AUTO_REJECT"]),
      })
      .strict(),
    reviewWindow: z
      .object({
        id: OpaqueIdSchema,
        checkpointState: z.literal("CHECKPOINT_PENDING"),
        finalState: ReviewWindowStateSchema,
      })
      .strict(),
    proof: z
      .object({
        selectedChallengeId: OpaqueIdSchema,
        selectedChallengeLabel: z.string().min(1),
        commonVerifier: CommonVerifierResultSchema,
        scenarioFinding: z.string().min(1),
      })
      .strict(),
    outcome: OutcomeTypeSchema,
    candidateContinues: z.boolean(),
    revealAuthorized: z.boolean(),
    profileSignalRisk: z.enum(["FALSE_POSITIVE_RISK_EXPOSED", "FALSE_NEGATIVE_RISK_SURFACED"]),
  })
  .strict();

export const GoldenReplaySchema = z
  .object({
    schemaVersion: z.literal(1),
    replayId: z.literal("payment-retry-v1"),
    synthetic: z.literal(true),
    notice: z.literal(SyntheticReplayNotice),
    opportunity: z
      .object({
        id: OpaqueIdSchema,
        title: z.string().min(1),
      })
      .strict(),
    reviewer: z
      .object({
        id: OpaqueIdSchema,
        displayName: z.string().min(1),
      })
      .strict(),
    candidates: z.array(ReplayCandidateSchema).length(2),
  })
  .strict()
  .superRefine(({ candidates }, context) => {
    const opaqueIds = new Set(candidates.map(({ veiledCandidate }) => veiledCandidate.opaqueId));
    const candidateIds = new Set(candidates.map(({ candidateId }) => candidateId));

    if (opaqueIds.size !== candidates.length || candidateIds.size !== candidates.length) {
      context.addIssue({
        code: "custom",
        message: "Replay candidates must have unique candidate and opaque IDs",
      });
    }

    for (const candidate of candidates) {
      const shouldReveal = candidate.outcome === "ADVANCE" && candidate.candidateContinues;
      if (candidate.revealAuthorized !== shouldReveal) {
        context.addIssue({
          code: "custom",
          message: `Reveal authorization is inconsistent for ${candidate.candidateId}`,
        });
      }
    }
  });

export type PrivateCandidateLabels = z.infer<typeof PrivateCandidateLabelsSchema>;
export type ReplayCandidate = z.infer<typeof ReplayCandidateSchema>;
export type GoldenReplay = z.infer<typeof GoldenReplaySchema>;
