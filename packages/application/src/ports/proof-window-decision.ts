import type { ProofWindowDecisionReceipt } from "@onlyboth/contracts";
import type { ReviewWindow } from "@onlyboth/domain";

export interface AuthenticatedCandidateActor {
  readonly role: "CANDIDATE";
  readonly actorId: string;
}

export interface StoredProofWindowDecisionReceipt {
  readonly actorRef: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly receipt: ProofWindowDecisionReceipt;
}

export interface ProofSessionStartRecord {
  readonly proofSessionRef: string;
  readonly runtimeMode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly replayId: string | null;
  readonly sandboxSessionRef: string;
  readonly replaySessionKey: string;
  readonly recommendationRequestRef: string;
  readonly capabilityRefs: readonly string[];
  readonly baseSnapshotVersion: string;
  readonly stageAPatchRef: string;
  readonly stageAArtifactRef: string;
  readonly stageASnapshotRef: string;
  readonly remainingTimeSeconds: number;
}

export interface PersistProofWindowDecision {
  readonly actorRef: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly commandId: string;
  readonly eventId: string;
  readonly outboxId: string;
  readonly correlationId: string;
  readonly previousWindow: ReviewWindow;
  readonly nextWindow: ReviewWindow;
  readonly proofSession: ProofSessionStartRecord | null;
  readonly receipt: ProofWindowDecisionReceipt;
}

export interface ProofWindowDecisionTransaction {
  readonly databaseNow: Date;
  findReceipt(
    actorRef: string,
    idempotencyKey: string,
  ): Promise<StoredProofWindowDecisionReceipt | null>;
  loadWindowForUpdate(reviewWindowRef: string): Promise<ReviewWindow | null>;
  findExpiredWindowForUpdate(): Promise<ReviewWindow | null>;
  persistDecision(input: PersistProofWindowDecision): Promise<void>;
}

export interface ProofWindowDecisionUnitOfWork {
  runInTransaction<TResult>(
    work: (transaction: ProofWindowDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface ProofWindowDecisionIdFactory {
  nextId(kind: "command" | "event" | "outbox"): string;
}
