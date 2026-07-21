import type { AttentionAllocationReceipt, EmployerMatchingProjection } from "@onlyboth/contracts";
import type {
  AttentionCommitmentSnapshot,
  AttentionSlotSnapshot,
  CreditAccountSnapshot,
  ExploreCandidate,
  ReviewWindow,
} from "@onlyboth/domain";

export interface MatchingAllocationSnapshot {
  readonly matchingCycle: {
    readonly matchingCycleRef: string;
    readonly opportunityRef: string;
    readonly contractVersionRef: string;
    readonly contractHash: string;
    readonly state: "EVALUATING" | "NEEDS_HUMAN" | "READY_FOR_DIRECT" | "ALLOCATED";
    readonly version: number;
    readonly publicSeed: string;
    readonly allocatorVersion: "onlyboth.direct-explore@1";
  };
  readonly commitment: AttentionCommitmentSnapshot & {
    readonly acceptSlaHours: number;
    readonly checkpointSlaSeconds: number;
    readonly finalReviewSlaHours: number;
  };
  readonly slots: readonly AttentionSlotSnapshot[];
  readonly creditAccount: CreditAccountSnapshot;
  readonly activeWindowCount: number;
  readonly activeCandidateRefs: ReadonlySet<string>;
  readonly candidateActiveWindowCounts: Readonly<Record<string, number>>;
  readonly candidates: readonly ExploreCandidate[];
  readonly versionPins: {
    readonly contractVersionId: string;
    readonly labelPolicyVersionId: string;
    readonly proofTemplateVersionId: string;
    readonly challengeCatalogVersionId: string;
  };
  readonly employerProjection: EmployerMatchingProjection;
}

export interface StoredMatchingCommandReceipt {
  readonly actorRef: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly receipt: AttentionAllocationReceipt;
}

export interface PersistedAttentionAllocation {
  readonly actorRef: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly commandId: string;
  readonly eventId: string;
  readonly outboxIds: readonly [string, string];
  readonly allocationRunRef: string;
  readonly commitmentRef: string;
  readonly creditAccountRef: string;
  readonly expectedMatchingCycleVersion: number;
  readonly expectedCommitmentVersion: number;
  readonly windows: readonly [ReviewWindow, ReviewWindow];
  readonly allocations: readonly [
    {
      readonly allocationKind: "DIRECT";
      readonly candidateRef: string;
      readonly matchEdgeRef: string;
      readonly publicHash: null;
      readonly attentionSlotRef: string;
      readonly creditHoldRef: string;
    },
    {
      readonly allocationKind: "EXPLORE";
      readonly candidateRef: string;
      readonly matchEdgeRef: string;
      readonly publicHash: string;
      readonly attentionSlotRef: string;
      readonly creditHoldRef: string;
    },
  ];
  readonly receipt: AttentionAllocationReceipt;
  readonly correlationId: string;
}

export interface MatchingAllocationTransaction {
  readonly databaseNow: Date;
  findReceipt(
    actorRef: string,
    idempotencyKey: string,
  ): Promise<StoredMatchingCommandReceipt | null>;
  loadForUpdate(opportunityRef: string): Promise<MatchingAllocationSnapshot | null>;
  persist(allocation: PersistedAttentionAllocation): Promise<void>;
}

export interface MatchingAllocationUnitOfWork {
  runInTransaction<TResult>(
    work: (transaction: MatchingAllocationTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface MatchingIdFactory {
  nextId(
    kind: "command" | "event" | "outbox" | "allocation-run" | "review-window" | "credit-hold",
  ): string;
  boundId(
    kind: "review-window" | "credit-hold",
    candidateRef: string,
    matchingCycleRef: string,
  ): string;
}
