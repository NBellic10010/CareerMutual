import { GoldenReplaySchema, type GoldenReplay } from "@onlyboth/contracts";
import {
  CandidateProjectionSchema,
  EmployerProjectionSchema,
  SyntheticJudgeProjectionSchema,
  type CandidateProjection,
  type EmployerProjection,
  type SyntheticJudgeProjection,
} from "@onlyboth/projections";

import { loadGoldenReplay } from "./loader";

export interface GoldenReplayViews {
  readonly employer: EmployerProjection;
  readonly candidates: Readonly<Record<string, CandidateProjection>>;
  readonly judge: SyntheticJudgeProjection;
}

export function buildGoldenReplayViews(
  replay: GoldenReplay = loadGoldenReplay(),
): GoldenReplayViews {
  const validatedReplay = GoldenReplaySchema.parse(replay);
  const employer = EmployerProjectionSchema.parse({
    view: "EMPLOYER",
    opportunity: validatedReplay.opportunity,
    reviewer: validatedReplay.reviewer,
    attention: {
      activeReviews: 0,
      nextCandidateAccess: "UNLOCKED",
    },
    candidates: validatedReplay.candidates.map((candidate) => ({
      candidate: candidate.veiledCandidate,
      allocationKind: candidate.allocationKind,
      reviewWindow: {
        id: candidate.reviewWindow.id,
        state: candidate.reviewWindow.finalState,
      },
      proof: {
        selectedChallenge: {
          id: candidate.proof.selectedChallengeId,
          label: candidate.proof.selectedChallengeLabel,
        },
        commonVerifier: candidate.proof.commonVerifier,
        scenarioFinding: candidate.proof.scenarioFinding,
      },
      outcome: candidate.outcome,
      revealAuthorized: candidate.revealAuthorized,
    })),
  });

  const candidates = Object.fromEntries(
    validatedReplay.candidates.map((candidate) => [
      candidate.candidateId,
      CandidateProjectionSchema.parse({
        view: "CANDIDATE",
        candidateId: candidate.candidateId,
        opportunity: validatedReplay.opportunity,
        reviewer: validatedReplay.reviewer,
        reviewWindow: {
          id: candidate.reviewWindow.id,
          state: candidate.reviewWindow.finalState,
        },
        selectedChallenge: {
          id: candidate.proof.selectedChallengeId,
          label: candidate.proof.selectedChallengeLabel,
        },
        outcome: candidate.outcome,
        labelsRevealedToEmployer: candidate.revealAuthorized,
        message:
          candidate.outcome === "ADVANCE"
            ? "Sarah reviewed your evidence and unlocked a human interview."
            : "Sarah reviewed your evidence and explicitly closed this window.",
      }),
    ]),
  );

  const judge = SyntheticJudgeProjectionSchema.parse({
    view: "SYNTHETIC_JUDGE",
    synthetic: true,
    notice: validatedReplay.notice,
    opportunity: validatedReplay.opportunity,
    candidates: validatedReplay.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      privateProfile: candidate.privateLabels,
      counterfactual: candidate.counterfactual,
      evidence: {
        commonVerifier: candidate.proof.commonVerifier,
        profileSignalRisk: candidate.profileSignalRisk,
      },
    })),
  });

  return { employer, candidates, judge };
}
