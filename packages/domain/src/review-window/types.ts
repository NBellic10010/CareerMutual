export type ReviewWindowState =
  | "RESERVED"
  | "RELEASED"
  | "STAGE_A_ACTIVE"
  | "CHECKPOINT_PENDING"
  | "STAGE_B_ACTIVE"
  | "EVIDENCE_READY"
  | "OUTCOME_RECORDED"
  | "ASK_BACK_PENDING"
  | "REVEALED"
  | "BREACHED"
  | "REMEDIATING"
  | "WITHDRAWN"
  | "PLATFORM_ABORT"
  | "SETTLING"
  | "SETTLED";

export type HumanOutcomeType = "ADVANCE" | "CLARIFY" | "CLOSE";
export type CandidateDecision = "PENDING" | "CONTINUE" | "DECLINE";
export type CreditHoldStatus = "HELD" | "RETURNED" | "FORFEITED";
export type AskBackStatus = "UNAVAILABLE" | "AVAILABLE" | "PENDING" | "ANSWERED" | "WAIVED";
export type ChallengeSelectionSource = "AI_RECOMMENDATION" | "MANUAL_CATALOG";
export type PrestartReleaseReason = "CANDIDATE_DECLINED" | "PRESTART_EXPIRED";

export interface ReviewWindowVersionPins {
  readonly contractVersionId: string;
  readonly labelPolicyVersionId: string;
  readonly proofTemplateVersionId: string;
  readonly challengeCatalogVersionId: string;
}

export interface HumanCheckpoint {
  readonly reviewerId: string;
  readonly stageASnapshotId: string;
  readonly challengeId: string;
  readonly catalogHash: string;
  readonly evidenceRefs: readonly string[];
  readonly selectionSource: ChallengeSelectionSource;
  readonly recommendationOutputRef?: string;
  readonly selectedAt: string;
}

export interface HumanOutcome {
  readonly type: HumanOutcomeType;
  readonly evidenceRefs: readonly string[];
}

export interface ReviewWindow {
  readonly id: string;
  readonly candidateId: string;
  readonly opportunityId: string;
  readonly reviewerId: string;
  readonly attentionSlotId: string;
  readonly creditHoldId: string;
  readonly creditHoldStatus: CreditHoldStatus;
  readonly matchEdgeId: string;
  readonly versionPins: ReviewWindowVersionPins;
  readonly state: ReviewWindowState;
  readonly version: number;
  readonly acceptBy?: string;
  readonly releaseReason?: PrestartReleaseReason;
  readonly stageASnapshotId?: string;
  readonly checkpoint?: HumanCheckpoint;
  readonly evidenceIds: readonly string[];
  readonly outcome?: HumanOutcome;
  readonly candidateDecision: CandidateDecision;
  readonly askBackStatus: AskBackStatus;
  readonly askBackQuestion?: string;
  readonly askBackAnswer?: string;
  readonly revealAuthorized: boolean;
}

export interface ReserveReviewWindowInput {
  readonly id: string;
  readonly candidateId: string;
  readonly opportunityId: string;
  readonly reviewerId: string;
  readonly attentionSlotId: string;
  readonly attentionSlotAvailable: boolean;
  readonly creditHoldId: string;
  readonly creditHoldStatus: CreditHoldStatus;
  readonly matchEdgeId: string;
  readonly versionPins: ReviewWindowVersionPins;
  readonly acceptBy?: string;
}

export type ReviewWindowDomainEvent =
  | {
      readonly type: "AttentionReserved";
      readonly reviewWindowId: string;
      readonly reviewerId: string;
      readonly attentionSlotId: string;
    }
  | {
      readonly type: "ProofWindowAccepted";
      readonly reviewWindowId: string;
    }
  | {
      readonly type: "ProofWindowReleased";
      readonly reviewWindowId: string;
      readonly reason: PrestartReleaseReason;
    }
  | {
      readonly type: "StageASubmitted";
      readonly reviewWindowId: string;
      readonly snapshotId: string;
    }
  | {
      readonly type: "HumanChallengeSelected";
      readonly reviewWindowId: string;
      readonly reviewerId: string;
      readonly snapshotId: string;
      readonly challengeId: string;
      readonly catalogHash: string;
      readonly evidenceRefs: readonly string[];
      readonly selectionSource: ChallengeSelectionSource;
      readonly recommendationOutputRef?: string;
      readonly selectedAt: string;
    }
  | {
      readonly type: "PlatformAborted";
      readonly reviewWindowId: string;
      readonly component: string;
      readonly reasonRef: string;
    }
  | {
      readonly type: "EvidenceBecameReady";
      readonly reviewWindowId: string;
      readonly evidenceIds: readonly string[];
    }
  | {
      readonly type: "HumanOutcomeRecorded";
      readonly reviewWindowId: string;
      readonly outcome: HumanOutcomeType;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly type: "CandidateDecisionRecorded";
      readonly reviewWindowId: string;
      readonly decision: Exclude<CandidateDecision, "PENDING">;
    }
  | {
      readonly type: "AskBackSubmitted";
      readonly reviewWindowId: string;
      readonly question: string;
    }
  | {
      readonly type: "AskBackAnswered";
      readonly reviewWindowId: string;
      readonly reviewerId: string;
      readonly answer: string;
    }
  | {
      readonly type: "AskBackWaived";
      readonly reviewWindowId: string;
    }
  | {
      readonly type: "LabelRevealAuthorized";
      readonly reviewWindowId: string;
    }
  | {
      readonly type: "ReviewWindowSettled";
      readonly reviewWindowId: string;
    };

export interface ReviewWindowTransition {
  readonly window: ReviewWindow;
  readonly events: readonly ReviewWindowDomainEvent[];
}
