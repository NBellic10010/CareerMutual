export type HardFactValue = boolean | number | string;

export interface CandidateInterest {
  readonly interestId: string;
  readonly opportunityRef: string;
  readonly candidateRef: string;
  readonly claimSnapshotRef: string;
  readonly claimSnapshotVersion: number;
  readonly submittedAt: string;
}

export type EligibilityPredicate =
  | {
      readonly predicateRef: string;
      readonly factRef: string;
      readonly operator: "EQUALS";
      readonly expected: HardFactValue;
    }
  | {
      readonly predicateRef: string;
      readonly factRef: string;
      readonly operator: "GTE";
      readonly minimum: number;
    }
  | {
      readonly predicateRef: string;
      readonly factRef: string;
      readonly operator: "CONTAINS";
      readonly member: string;
    };

export interface EligibilityPredicateResult {
  readonly predicateRef: string;
  readonly factRef: string;
  readonly passed: boolean;
  readonly reasonRef: string;
}

export interface EligibilityEdge {
  readonly schemaVersion: "eligibility-edge@1" | "eligibility-edge@2";
  readonly eligibilityEdgeRef: string;
  readonly opportunityRef: string;
  readonly candidateRef: string;
  readonly contractVersionRef: string;
  readonly eligible: boolean;
  readonly predicateResults: readonly EligibilityPredicateResult[];
  readonly backgroundAccessBasis: "OPEN_TO_ALL" | "AI_POSITIVE_EVIDENCE" | null;
  readonly eligibilityPolicyRef: string | null;
  readonly passportSnapshotRef: string | null;
  readonly eligibilityMatchRef: string | null;
}

export interface MatchEdge {
  readonly matchEdgeRef: string;
  readonly matchingCycleRef: string;
  readonly matchingCycleVersion: number;
  readonly opportunityRef: string;
  readonly candidateRef: string;
  readonly contractVersionRef: string;
  readonly contractHash: string;
  readonly claimSnapshotRef: string;
  readonly claimSnapshotVersion: number;
  readonly aiOutputRef: string;
  readonly uncertaintyRef: string;
  readonly claimRefs: readonly string[];
  readonly proofTemplateRef: string;
  readonly sourceRefs: readonly string[];
  readonly verifiableReason: string;
  readonly stillUnknown: readonly string[];
}

export type MatchingCycleState = "EVALUATING" | "NEEDS_HUMAN" | "READY_FOR_DIRECT" | "ALLOCATED";

export interface MatchingCycle {
  readonly matchingCycleRef: string;
  readonly opportunityRef: string;
  readonly contractVersionRef: string;
  readonly contractHash: string;
  readonly expectedInterestCount: number;
  readonly proposeCount: number;
  readonly abstainCount: number;
  readonly needsHumanCount: number;
  readonly state: MatchingCycleState;
  readonly version: number;
}

export interface ExploreCandidate {
  readonly candidateRef: string;
  readonly matchEdgeRef: string;
}

export interface AllocationDecision {
  readonly allocationKind: "DIRECT" | "EXPLORE";
  readonly candidateRef: string;
  readonly matchEdgeRef: string;
  readonly publicHash: string | null;
}

export interface AttentionCommitmentSnapshot {
  readonly commitmentRef: string;
  readonly version: number;
  readonly reviewerRef: string;
  readonly activeWip: number;
  readonly directSlots: number;
  readonly exploreSlots: number;
  readonly creditPerWindow: number;
}

export interface AttentionSlotSnapshot {
  readonly slotRef: string;
  readonly slotKind: "DIRECT" | "EXPLORE";
  readonly available: boolean;
}

export interface CreditAccountSnapshot {
  readonly accountRef: string;
  readonly availableCredits: number;
}
