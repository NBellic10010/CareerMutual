import { SyntheticReplayNotice, type GoldenReplay } from "@onlyboth/contracts";

export const paymentRetryV1Fixture = {
  schemaVersion: 1,
  replayId: "payment-retry-v1",
  synthetic: true,
  notice: SyntheticReplayNotice,
  opportunity: {
    id: "opp-senior-backend-1",
    title: "Senior Backend Engineer",
  },
  reviewer: {
    id: "reviewer-sarah-chen",
    displayName: "Sarah Chen",
  },
  candidates: [
    {
      candidateId: "candidate-17",
      allocationKind: "DIRECT",
      veiledCandidate: {
        opaqueId: "Candidate 17",
        eligibility: "ELIGIBLE",
        hardFacts: [
          { key: "work_authorization", label: "Work authorization", value: "Eligible" },
          { key: "timezone_overlap", label: "Timezone overlap", value: "4 hours" },
          { key: "required_language", label: "Required language", value: "TypeScript" },
        ],
        claims: [
          {
            id: "claim-17-retry",
            capabilityRef: "failure_boundary_reasoning",
            statement: "Designed retry behavior for a stateful payment workflow.",
          },
        ],
      },
      privateLabels: {
        name: "Alex Mercer",
        schoolName: "Northstar Institute of Technology",
        previousEmployerName: "Atlas Systems",
        referralSource: "Executive referral",
      },
      counterfactual: {
        resumeRank: 1,
        conventionalDecision: "INTERVIEW",
      },
      reviewWindow: {
        id: "review-window-17",
        checkpointState: "CHECKPOINT_PENDING",
        finalState: "SETTLED",
      },
      proof: {
        selectedChallengeId: "payment-retry/duplicate-webhook@1",
        selectedChallengeLabel: "Duplicate webhook delivery",
        commonVerifier: { passed: 2, total: 6 },
        scenarioFinding: "The revision still permits duplicate execution after replay.",
      },
      outcome: "CLOSE",
      candidateContinues: false,
      revealAuthorized: false,
      profileSignalRisk: "FALSE_POSITIVE_RISK_EXPOSED",
    },
    {
      candidateId: "candidate-42",
      allocationKind: "EXPLORE",
      veiledCandidate: {
        opaqueId: "Candidate 42",
        eligibility: "ELIGIBLE",
        hardFacts: [
          { key: "work_authorization", label: "Work authorization", value: "Eligible" },
          { key: "timezone_overlap", label: "Timezone overlap", value: "5 hours" },
          { key: "required_language", label: "Required language", value: "TypeScript" },
        ],
        claims: [
          {
            id: "claim-42-recovery",
            capabilityRef: "failure_boundary_reasoning",
            statement: "Handled recovery after partial persistence failures.",
          },
        ],
      },
      privateLabels: {
        name: "Jordan Lee",
        schoolName: "Riverside Community College",
        previousEmployerName: "Cedar Local Commerce",
        referralSource: "Open application",
      },
      counterfactual: {
        resumeRank: 73,
        conventionalDecision: "AUTO_REJECT",
      },
      reviewWindow: {
        id: "review-window-42",
        checkpointState: "CHECKPOINT_PENDING",
        finalState: "SETTLED",
      },
      proof: {
        selectedChallengeId: "payment-retry/redis-failover@1",
        selectedChallengeLabel: "Redis failover after payment acceptance",
        commonVerifier: { passed: 6, total: 6 },
        scenarioFinding:
          "The revision preserves a single committed transition after acknowledgement loss.",
      },
      outcome: "ADVANCE",
      candidateContinues: true,
      revealAuthorized: true,
      profileSignalRisk: "FALSE_NEGATIVE_RISK_SURFACED",
    },
  ],
} satisfies GoldenReplay;
