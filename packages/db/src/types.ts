export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface TransactionContext {
  readonly transactionId: string;
  /** Database time captured inside the transaction; browser time has no authority. */
  readonly databaseNow: Date;
}

export interface AggregateRecord<TState extends JsonObject> {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly state: TState;
}

export interface VersionedDomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly correlationId: string;
  readonly occurredAt: Date;
  readonly payload: JsonObject;
}

export interface OutboxMessage {
  readonly messageId: string;
  readonly messageType: string;
  readonly messageVersion: number;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly availableAt: Date;
  readonly payload: JsonObject;
}

export interface ClaimedOutboxMessage extends OutboxMessage {
  readonly attempt: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Date;
}
