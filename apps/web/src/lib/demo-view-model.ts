import type { OutcomeType, ReviewWindowState } from "@onlyboth/contracts";

export const SYNTHETIC_REPLAY_LABEL = "Synthetic — Pre-recorded external inputs" as const;

export type HardFact = Readonly<{
  label: string;
  value: string;
}>;

export type VerifiableClaim = Readonly<{
  claimId: string;
  capability: string;
  statement: string;
}>;

export type VeiledCandidate = Readonly<{
  alias: string;
  allocation: "Direct" | "Explore";
  eligibility: "Eligible";
  hardFacts: readonly HardFact[];
  claims: readonly VerifiableClaim[];
  sealedFields: readonly string[];
  reviewWindowState: ReviewWindowState;
  selectedChallenge: Readonly<{ id: string; label: string }>;
  commonVerifier: Readonly<{ passed: number; total: number }>;
  scenarioFinding: string;
  outcome: OutcomeType;
  revealAuthorized: boolean;
}>;

export type EmployerProjectionModel = Readonly<{
  runtimeLabel: typeof SYNTHETIC_REPLAY_LABEL;
  reviewer: string;
  opportunity: string;
  criticalFailure: string;
  decisionUncertainty: string;
  activeWindows: number;
  nextCandidateAccess: "LOCKED" | "UNLOCKED";
  checkpointSla: string;
  candidates: readonly VeiledCandidate[];
}>;

export type CandidateProjectionModel = Readonly<{
  runtimeLabel: typeof SYNTHETIC_REPLAY_LABEL;
  alias: string;
  opportunity: string;
  status: ReviewWindowState;
  statusLabel: string;
  reviewer: string;
  checkpointSla: string;
  proofDuration: string;
  candidateAiPolicy: string;
  sealedFields: readonly string[];
  selectedChallenge: Readonly<{ id: string; label: string }>;
  outcome: OutcomeType;
  labelsRevealedToEmployer: boolean;
}>;

export type CounterfactualCandidate = Readonly<{
  counterfactualAlias: string;
  veiledAlias: string;
  profileSignal: string;
  traditionalRank: string;
  traditionalOutcome: string;
  challenge: string;
  verification: string;
  disagreement: "False-positive risk exposed" | "False-negative risk surfaced";
}>;

export type AuditProjectionModel = Readonly<{
  runtimeLabel: typeof SYNTHETIC_REPLAY_LABEL;
  accessBoundary: string;
  candidates: readonly CounterfactualCandidate[];
  invariants: readonly string[];
  timeline: readonly Readonly<{
    at: string;
    event: string;
    source: string;
  }>[];
}>;

export type ColdOpenProjectionModel = Readonly<{
  runtimeLabel: typeof SYNTHETIC_REPLAY_LABEL;
  counterfactualCandidates: readonly CounterfactualCandidate[];
  veiledCandidates: readonly Pick<VeiledCandidate, "alias" | "allocation" | "eligibility">[];
  reviewer: string;
  checkpointSla: string;
  finalLine: string;
}>;
