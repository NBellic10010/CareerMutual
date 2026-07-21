import type { MatchingStageAReceipt } from "@onlyboth/contracts";
import type { ReviewWindow } from "@onlyboth/domain";

export interface ClaimedStageAReplayMessage {
  readonly messageId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly reviewWindowRef: string;
  readonly leaseOwner: string;
  readonly attempt: number;
}

export interface StageAReplayContext {
  readonly reviewWindowRef: string;
  readonly candidateRef: string;
  readonly proofSessionRef: string;
  readonly replaySessionKey: string;
  readonly baseSnapshotVersion: string;
  readonly patchRef: string;
  readonly expectedArtifactRef: string;
  readonly expectedSnapshotRef: string;
  readonly remainingTimeSeconds: number;
}

export interface StageAReplayResult {
  readonly sandboxSessionRef: string;
  readonly artifactRef: string;
  readonly artifactHash: string;
  readonly visibleTestRunRef: string;
  readonly visibleTestResultHash: string;
  readonly snapshotRef: string;
  readonly snapshotHash: string;
  readonly remainingTimeSeconds: number;
}

export interface StageAReplayMessageStore {
  claimNext(
    workerId: string,
    leaseDurationSeconds: number,
  ): Promise<ClaimedStageAReplayMessage | null>;
  loadContext(reviewWindowRef: string): Promise<StageAReplayContext | null>;
  scheduleRetry(
    message: ClaimedStageAReplayMessage,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<void>;
}

export interface StageAReplayExecutionPort {
  execute(context: StageAReplayContext): Promise<StageAReplayResult>;
}

export interface MatchingStageATransaction {
  readonly databaseNow: Date;
  loadWindowForUpdate(reviewWindowRef: string): Promise<ReviewWindow | null>;
  persistSubmission(input: {
    readonly message: ClaimedStageAReplayMessage;
    readonly previousWindow: ReviewWindow;
    readonly nextWindow: ReviewWindow;
    readonly result: StageAReplayResult;
    readonly eventId: string;
    readonly outboxId: string;
    readonly receipt: MatchingStageAReceipt;
  }): Promise<void>;
  persistPlatformAbort(input: {
    readonly message: ClaimedStageAReplayMessage;
    readonly previousWindow: ReviewWindow;
    readonly nextWindow: ReviewWindow;
    readonly reasonRef: string;
    readonly eventId: string;
    readonly outboxId: string;
  }): Promise<void>;
}

export interface MatchingStageAUnitOfWork {
  runInTransaction<TResult>(
    work: (transaction: MatchingStageATransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface MatchingStageAIdFactory {
  nextId(kind: "event" | "outbox"): string;
}

export interface SubmitMatchingStageACommandPort {
  submit(
    message: ClaimedStageAReplayMessage,
    result: StageAReplayResult,
  ): Promise<MatchingStageAReceipt>;
  abort(message: ClaimedStageAReplayMessage, reasonRef: string): Promise<void>;
}
