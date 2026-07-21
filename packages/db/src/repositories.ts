import type {
  AggregateRecord,
  JsonObject,
  TransactionContext,
  VersionedDomainEvent,
} from "./types";

export interface SaveAggregateInput<TState extends JsonObject> {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly expectedVersion: number;
  readonly nextVersion: number;
  readonly state: TState;
}

/**
 * Implementations use optimistic concurrency. They do not expose generic table
 * updates, so callers cannot bypass explicit Application Commands.
 */
export interface AggregateRepository<TState extends JsonObject> {
  load(
    transaction: TransactionContext,
    aggregateType: string,
    aggregateId: string,
  ): Promise<AggregateRecord<TState> | null>;
  save(transaction: TransactionContext, input: SaveAggregateInput<TState>): Promise<void>;
}

export interface DomainEventRepository {
  append(transaction: TransactionContext, events: readonly VersionedDomainEvent[]): Promise<void>;
}

export interface DatabaseTransactionPort {
  runInTransaction<TResult>(
    work: (transaction: TransactionContext) => Promise<TResult>,
  ): Promise<TResult>;
}
