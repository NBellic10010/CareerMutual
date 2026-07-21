import type { ClaimedOutboxMessage, OutboxMessage, TransactionContext } from "./types";
import type { DatabaseTransactionPort, DomainEventRepository } from "./repositories";

export interface ClaimOutboxBatchInput {
  readonly workerId: string;
  readonly maximumMessages: number;
  readonly leaseDurationSeconds: number;
}

export interface FailOutboxMessageInput {
  readonly messageId: string;
  readonly leaseOwner: string;
  readonly attempt: number;
  readonly retryAt: Date;
  readonly errorCode: string;
}

export interface OutboxRepository {
  enqueue(transaction: TransactionContext, messages: readonly OutboxMessage[]): Promise<void>;
  claimBatch(
    transaction: TransactionContext,
    input: ClaimOutboxBatchInput,
  ): Promise<readonly ClaimedOutboxMessage[]>;
  markProcessed(
    transaction: TransactionContext,
    messageId: string,
    leaseOwner: string,
    attempt: number,
  ): Promise<void>;
  markFailed(transaction: TransactionContext, input: FailOutboxMessageInput): Promise<void>;
}

/**
 * Aggregate persistence, domain-event append, and outbox enqueue must receive
 * the same TransactionContext and commit atomically in a concrete adapter.
 */
export interface AtomicPersistencePorts<TAggregateRepository> {
  readonly transactions: DatabaseTransactionPort;
  readonly aggregates: TAggregateRepository;
  readonly events: DomainEventRepository;
  readonly outbox: OutboxRepository;
}
