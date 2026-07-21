import type {
  CandidateReviewWindowProjection,
  ChallengeRecommendation,
  EmployerReviewWindowProjection,
  HumanAuthorizationReceipt,
} from "@onlyboth/contracts";
import type { ReviewWindow, ReviewWindowDomainEvent } from "@onlyboth/domain";

export interface AuthenticatedEmployerActor {
  readonly role: "EMPLOYER";
  readonly actorId: string;
}

export interface StoredChallengeRecommendationOutput {
  readonly outputRef: string;
  readonly reviewWindowId: string;
  readonly aggregateVersion: number;
  readonly catalogRef: string;
  readonly catalogHash: string;
  readonly output: ChallengeRecommendation;
  readonly consumedByCommandId: string | null;
}

export interface StoredCommandReceipt {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly receipt: HumanAuthorizationReceipt;
}

export interface DomainEventAppend {
  readonly eventId: string;
  readonly eventType: ReviewWindowDomainEvent["type"];
  readonly eventVersion: 1;
  readonly aggregateType: "ReviewWindow";
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly correlationId: string;
  readonly occurredAt: Date;
  readonly payload: ReviewWindowDomainEvent;
}

export interface OutboxEnqueue {
  readonly messageId: string;
  readonly messageType: "HumanChallengeSelected" | "PlatformAborted";
  readonly messageVersion: 1;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly availableAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ChallengeSelectionTransaction {
  readonly databaseNow: Date;
  loadReviewWindow(reviewWindowId: string): Promise<ReviewWindow | undefined>;
  saveReviewWindow(window: ReviewWindow, expectedVersion: number): Promise<void>;
  listStageAEvidenceRefs(reviewWindowId: string): Promise<readonly string[]>;
  loadRecommendationOutput(outputRef: string): Promise<StoredChallengeRecommendationOutput | null>;
  consumeRecommendationOutput(outputRef: string, commandId: string): Promise<void>;
  findCommandReceipt(actorId: string, idempotencyKey: string): Promise<StoredCommandReceipt | null>;
  saveCommandReceipt(receipt: StoredCommandReceipt): Promise<void>;
  appendDomainEvent(event: DomainEventAppend): Promise<void>;
  enqueueOutbox(message: OutboxEnqueue): Promise<void>;
  completeClaimedWorkerMessage(
    messageId: string,
    leaseOwner: string,
    attempt: number,
  ): Promise<void>;
}

export interface ChallengeSelectionUnitOfWork {
  runInTransaction<TResult>(
    work: (transaction: ChallengeSelectionTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface ResolvedPublicChallenge {
  readonly challengeRef: string;
  readonly candidateNotice: string;
  readonly capabilityRefs: readonly string[];
}

export interface ChallengeCatalogSelectionPort {
  readonly catalogRef: string;
  readonly catalogHash: string;
  listRecommendationOptions(capabilityRefs: readonly string[]): readonly {
    readonly challengeId: string;
    readonly version: number;
    readonly capabilityRefs: readonly string[];
    readonly candidateNotice: string;
  }[];
  resolveChallenge(challengeRef: string): ResolvedPublicChallenge;
}

export interface ApplicationIdFactory {
  nextId(kind: "command" | "event" | "outbox" | "ai-run" | "ai-output"): string;
}

export interface ChallengeReviewProjectionQueryPort {
  getEmployerProjection(reviewWindowId: string): Promise<EmployerReviewWindowProjection | null>;
  getCandidateProjection(reviewWindowId: string): Promise<CandidateReviewWindowProjection | null>;
}
