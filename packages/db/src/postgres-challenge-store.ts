import type {
  ChallengeReviewProjectionQueryPort,
  ChallengeSelectionTransaction,
  ChallengeSelectionUnitOfWork,
  DomainEventAppend,
  OutboxEnqueue,
  StoredChallengeRecommendationOutput,
  StoredCommandReceipt,
} from "@onlyboth/application";
import {
  CandidateReviewWindowProjectionSchema,
  ChallengeRecommendationSchema,
  EmployerReviewWindowProjectionSchema,
  HumanAuthorizationReceiptSchema,
  type CandidateReviewWindowProjection,
  type EmployerReviewWindowProjection,
} from "@onlyboth/contracts";
import type { ReviewWindow } from "@onlyboth/domain";
import type { Pool, PoolClient } from "pg";

export class PostgresOptimisticConcurrencyError extends Error {
  public override readonly name = "PostgresOptimisticConcurrencyError";
  public readonly code = "OPTIMISTIC_CONCURRENCY_CONFLICT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseReviewWindow(value: unknown): ReviewWindow {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.candidateId !== "string" ||
    typeof value.reviewerId !== "string" ||
    typeof value.state !== "string" ||
    typeof value.version !== "number" ||
    !isRecord(value.versionPins) ||
    !Array.isArray(value.evidenceIds)
  ) {
    throw new Error("Persisted ReviewWindow does not satisfy its storage contract.");
  }
  return structuredClone(value) as unknown as ReviewWindow;
}

class PostgresChallengeSelectionTransaction implements ChallengeSelectionTransaction {
  public constructor(
    private readonly client: PoolClient,
    public readonly databaseNow: Date,
  ) {}

  public async loadReviewWindow(reviewWindowId: string): Promise<ReviewWindow | undefined> {
    const result = await this.client.query<{ aggregate_json: unknown }>(
      "SELECT aggregate_json FROM review_windows WHERE id = $1 FOR UPDATE",
      [reviewWindowId],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : parseReviewWindow(row.aggregate_json);
  }

  public async saveReviewWindow(window: ReviewWindow, expectedVersion: number): Promise<void> {
    const result = await this.client.query(
      `UPDATE review_windows
         SET state = $1,
             version = $2,
             stage_a_snapshot_id = $3,
             aggregate_json = $4::jsonb,
             updated_at = $5
       WHERE id = $6 AND version = $7`,
      [
        window.state,
        window.version,
        window.stageASnapshotId ?? null,
        JSON.stringify(window),
        this.databaseNow,
        window.id,
        expectedVersion,
      ],
    );
    if (result.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError(
        `ReviewWindow '${window.id}' changed before compare-and-swap.`,
      );
    }
  }

  public async listStageAEvidenceRefs(reviewWindowId: string): Promise<readonly string[]> {
    const result = await this.client.query<{ evidence_ref: string }>(
      `SELECT evidence_ref
         FROM stage_a_evidence
        WHERE review_window_id = $1
        ORDER BY evidence_ref`,
      [reviewWindowId],
    );
    return result.rows.map((row) => row.evidence_ref);
  }

  public async loadRecommendationOutput(
    outputRef: string,
  ): Promise<StoredChallengeRecommendationOutput | null> {
    const result = await this.client.query<{
      id: string;
      review_window_id: string;
      aggregate_version: number;
      catalog_ref: string;
      catalog_hash: string;
      validated_json: unknown;
      command_id: string | null;
    }>(
      `SELECT output.id,
              request.review_window_id,
              request.aggregate_version,
              request.catalog_ref,
              request.catalog_hash,
              output.validated_json,
              consumption.command_id
         FROM ai_outputs AS output
         JOIN hiring_intelligence_requests AS request ON request.id = output.request_id
         LEFT JOIN ai_output_consumptions AS consumption ON consumption.output_id = output.id
        WHERE output.id = $1`,
      [outputRef],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      outputRef: row.id,
      reviewWindowId: row.review_window_id,
      aggregateVersion: row.aggregate_version,
      catalogRef: row.catalog_ref,
      catalogHash: row.catalog_hash,
      output: ChallengeRecommendationSchema.parse(row.validated_json),
      consumedByCommandId: row.command_id,
    };
  }

  public async consumeRecommendationOutput(outputRef: string, commandId: string): Promise<void> {
    const result = await this.client.query(
      `INSERT INTO ai_output_consumptions (output_id, command_id, consumed_at)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [outputRef, commandId, this.databaseNow],
    );
    if (result.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError(
        `AI output '${outputRef}' was already consumed.`,
      );
    }
  }

  public async findCommandReceipt(
    actorId: string,
    idempotencyKey: string,
  ): Promise<StoredCommandReceipt | null> {
    const consumer = `employer-command:${actorId}`;
    await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${consumer}:${idempotencyKey}`,
    ]);
    const result = await this.client.query<{
      payload_hash: string;
      result_json: unknown;
    }>(
      `SELECT payload_hash, result_json
       FROM inbox_messages
        WHERE consumer = $1 AND idempotency_key = $2`,
      [consumer, idempotencyKey],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      actorId,
      idempotencyKey,
      commandFingerprint: row.payload_hash,
      receipt: HumanAuthorizationReceiptSchema.parse(row.result_json),
    };
  }

  public async saveCommandReceipt(receipt: StoredCommandReceipt): Promise<void> {
    await this.client.query(
      `INSERT INTO inbox_messages (
         consumer, message_id, idempotency_key, payload_hash, result_json, processed_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        `employer-command:${receipt.actorId}`,
        receipt.receipt.command_id,
        receipt.idempotencyKey,
        receipt.commandFingerprint,
        JSON.stringify(receipt.receipt),
        this.databaseNow,
      ],
    );
  }

  public async appendDomainEvent(event: DomainEventAppend): Promise<void> {
    await this.client.query(
      `INSERT INTO domain_events (
         event_id, event_type, event_version, aggregate_type, aggregate_id,
         aggregate_version, correlation_id, occurred_at, payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        event.eventId,
        event.eventType,
        event.eventVersion,
        event.aggregateType,
        event.aggregateId,
        event.aggregateVersion,
        event.correlationId,
        event.occurredAt,
        JSON.stringify(event.payload),
      ],
    );
  }

  public async enqueueOutbox(message: OutboxEnqueue): Promise<void> {
    await this.client.query(
      `INSERT INTO outbox_messages (
         message_id, message_type, message_version, event_id, idempotency_key,
         correlation_id, payload, available_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        message.messageId,
        message.messageType,
        message.messageVersion,
        message.eventId,
        message.idempotencyKey,
        message.correlationId,
        JSON.stringify(message.payload),
        message.availableAt,
      ],
    );
  }

  public async completeClaimedWorkerMessage(
    messageId: string,
    leaseOwner: string,
    attempt: number,
  ): Promise<void> {
    const result = await this.client.query(
      `UPDATE outbox_messages
          SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
        WHERE message_id = $2
          AND lease_owner = $3
          AND attempt_count = $4
          AND processed_at IS NULL`,
      [this.databaseNow, messageId, leaseOwner, attempt],
    );
    if (result.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError(
        `Outbox message '${messageId}' no longer has the expected lease.`,
      );
    }
  }
}

export class PostgresChallengeStore
  implements ChallengeSelectionUnitOfWork, ChallengeReviewProjectionQueryPort
{
  public constructor(private readonly pool: Pool) {}

  public async runInTransaction<TResult>(
    work: (transaction: ChallengeSelectionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const nowResult = await client.query<{ database_now: Date }>(
        "SELECT clock_timestamp() AS database_now",
      );
      const databaseNow = nowResult.rows[0]?.database_now;
      if (databaseNow === undefined) {
        throw new Error("PostgreSQL did not return database time.");
      }
      const result = await work(new PostgresChallengeSelectionTransaction(client, databaseNow));
      await client.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async getEmployerProjection(
    reviewWindowId: string,
  ): Promise<EmployerReviewWindowProjection | null> {
    const result = await this.pool.query<{ projection_json: unknown }>(
      "SELECT projection_json FROM employer_review_window_projections WHERE review_window_id = $1",
      [reviewWindowId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : EmployerReviewWindowProjectionSchema.parse(row.projection_json);
  }

  public async getCandidateProjection(
    reviewWindowId: string,
  ): Promise<CandidateReviewWindowProjection | null> {
    const result = await this.pool.query<{ projection_json: unknown }>(
      "SELECT projection_json FROM candidate_review_window_projections WHERE review_window_id = $1",
      [reviewWindowId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : CandidateReviewWindowProjectionSchema.parse(row.projection_json);
  }
}
