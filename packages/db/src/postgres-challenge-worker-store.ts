import type {
  ChallengeRecommendationWorkerStore,
  ClaimedChallengeWorkerMessage,
  RecommendationCompletion,
  StageARecommendationContext,
  StoredRecommendationRequest,
  SelectedChallengeWorkerContext,
} from "@onlyboth/application";
import {
  CandidateReviewWindowProjectionSchema,
  EmployerReviewWindowProjectionSchema,
  HumanAuthorizationReceiptSchema,
  RecommendChallengesInputSchema,
} from "@onlyboth/contracts";
import type { Pool, PoolClient } from "pg";

import { PostgresOptimisticConcurrencyError } from "./postgres-challenge-store";

const MESSAGE_TYPES = [
  "StageASubmitted",
  "RecommendChallengesRequested",
  "HumanChallengeSelected",
  "PlatformAborted",
] as const;

type MessageType = (typeof MESSAGE_TYPES)[number];

interface ClaimedMessageRow {
  readonly message_id: string;
  readonly message_type: string;
  readonly event_id: string;
  readonly correlation_id: string;
  readonly payload: unknown;
  readonly attempt_count: number;
  readonly lease_owner: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Persisted '${field}' must be a string array.`);
  }
  return value;
}

function parseMessageType(value: string): MessageType {
  if (!MESSAGE_TYPES.includes(value as MessageType)) {
    throw new Error(`Unsupported outbox message type '${value}'.`);
  }
  return value as MessageType;
}

function parseClaimedMessage(row: ClaimedMessageRow): ClaimedChallengeWorkerMessage {
  if (!isRecord(row.payload)) {
    throw new Error(`Outbox message '${row.message_id}' has an invalid payload.`);
  }
  return {
    messageId: row.message_id,
    messageType: parseMessageType(row.message_type),
    eventId: row.event_id,
    correlationId: row.correlation_id,
    payload: row.payload,
    attempt: row.attempt_count,
    leaseOwner: row.lease_owner,
  };
}

function payloadString(message: ClaimedChallengeWorkerMessage, key: string): string {
  const value = message.payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Outbox message '${message.messageId}' is missing '${key}'.`);
  }
  return value;
}

async function databaseNow(client: PoolClient): Promise<Date> {
  const result = await client.query<{ database_now: Date }>(
    "SELECT clock_timestamp() AS database_now",
  );
  const value = result.rows[0]?.database_now;
  if (value === undefined) {
    throw new Error("PostgreSQL did not return database time.");
  }
  return value;
}

async function assertLease(
  client: PoolClient,
  message: ClaimedChallengeWorkerMessage,
): Promise<void> {
  const result = await client.query(
    `SELECT 1
       FROM outbox_messages
      WHERE message_id = $1
        AND lease_owner = $2
        AND attempt_count = $3
        AND processed_at IS NULL
        AND lease_expires_at >= clock_timestamp()
      FOR UPDATE`,
    [message.messageId, message.leaseOwner, message.attempt],
  );
  if (result.rowCount !== 1) {
    throw new PostgresOptimisticConcurrencyError(
      `Outbox message '${message.messageId}' no longer has the expected lease.`,
    );
  }
}

async function markProcessed(
  client: PoolClient,
  message: ClaimedChallengeWorkerMessage,
  now: Date,
  outcome: string,
): Promise<void> {
  await client.query(
    `INSERT INTO inbox_messages (
       consumer, message_id, idempotency_key, payload_hash, result_json, processed_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (consumer, message_id) DO NOTHING`,
    [
      "challenge-recommendation-worker",
      message.messageId,
      message.messageId,
      message.messageId,
      JSON.stringify({ outcome }),
      now,
    ],
  );
  const updated = await client.query(
    `UPDATE outbox_messages
        SET processed_at = $1,
            lease_owner = NULL,
            lease_expires_at = NULL
      WHERE message_id = $2
        AND lease_owner = $3
        AND attempt_count = $4
        AND processed_at IS NULL`,
    [now, message.messageId, message.leaseOwner, message.attempt],
  );
  if (updated.rowCount !== 1) {
    throw new PostgresOptimisticConcurrencyError(
      `Outbox message '${message.messageId}' changed before completion.`,
    );
  }
}

async function inTransaction<TResult>(
  pool: Pool,
  work: (client: PoolClient, now: Date) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = await databaseNow(client);
    const result = await work(client, now);
    await client.query("COMMIT");
    return result;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresChallengeRecommendationWorkerStore implements ChallengeRecommendationWorkerStore {
  public constructor(private readonly pool: Pool) {}

  public async claimNext(
    workerId: string,
    leaseDurationSeconds: number,
  ): Promise<ClaimedChallengeWorkerMessage | null> {
    return inTransaction(this.pool, async (client) => {
      const result = await client.query<ClaimedMessageRow>(
        `WITH next_message AS (
           SELECT message_id
             FROM outbox_messages
            WHERE processed_at IS NULL
              AND available_at <= clock_timestamp()
              AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
              AND message_type = ANY($1::text[])
            ORDER BY available_at, created_at, message_id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
         UPDATE outbox_messages AS message
            SET lease_owner = $2,
                lease_expires_at = clock_timestamp() + ($3 * interval '1 second'),
                attempt_count = attempt_count + 1
           FROM next_message
          WHERE message.message_id = next_message.message_id
         RETURNING message.message_id, message.message_type, message.event_id,
                   message.correlation_id, message.payload, message.attempt_count,
                   message.lease_owner`,
        [MESSAGE_TYPES, workerId, leaseDurationSeconds],
      );
      const row = result.rows[0];
      return row === undefined ? null : parseClaimedMessage(row);
    });
  }

  public async loadStageAContext(
    reviewWindowId: string,
  ): Promise<StageARecommendationContext | null> {
    const result = await this.pool.query<{
      review_window_id: string;
      candidate_id: string;
      aggregate_version: number;
      state: string;
      contract_version_id: string;
      challenge_catalog_version_id: string;
      capability_refs: unknown;
      recommendation_request_ref: string;
      runtime_mode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
      replay_id: string | null;
    }>(
      `SELECT review_window.id AS review_window_id,
              review_window.candidate_id,
              review_window.version AS aggregate_version,
              review_window.state,
              review_window.contract_version_id,
              review_window.challenge_catalog_version_id,
              proof.capability_refs,
              proof.recommendation_request_ref,
              proof.runtime_mode,
              proof.replay_id
         FROM review_windows AS review_window
         JOIN proof_sessions AS proof ON proof.review_window_id = review_window.id
        WHERE review_window.id = $1`,
      [reviewWindowId],
    );
    const row = result.rows[0];
    if (
      row === undefined ||
      row.candidate_id !== "candidate-42" ||
      row.state !== "CHECKPOINT_PENDING"
    ) {
      return null;
    }
    const evidenceResult = await this.pool.query<{
      evidence_ref: string;
      evidence_type: "event" | "artifact" | "diff" | "command" | "verification";
      summary: string;
      sha256: string;
    }>(
      `SELECT evidence_ref, evidence_type, summary, sha256
         FROM stage_a_evidence
        WHERE review_window_id = $1
        ORDER BY ordinal`,
      [reviewWindowId],
    );
    return {
      reviewWindowId: row.review_window_id,
      candidateId: "candidate-42",
      aggregateVersion: row.aggregate_version,
      state: "CHECKPOINT_PENDING",
      contractVersionRef: row.contract_version_id,
      challengeCatalogVersionRef: row.challenge_catalog_version_id,
      capabilityRefs: parseStringArray(row.capability_refs, "capability_refs"),
      evidence: evidenceResult.rows.map((evidence) => ({
        evidence_ref: evidence.evidence_ref,
        evidence_type: evidence.evidence_type,
        summary: evidence.summary,
        sha256: evidence.sha256,
      })),
      recommendationRequestRef: row.recommendation_request_ref,
      runtimeMode: row.runtime_mode,
      replayId: row.replay_id,
    };
  }

  public async createRecommendationRequest(
    message: ClaimedChallengeWorkerMessage,
    request: StoredRecommendationRequest,
    prompt: {
      readonly promptId: string;
      readonly promptVersion: string;
      readonly promptHash: string;
      readonly inputSchemaVersion: string;
      readonly outputSchemaVersion: string;
    },
  ): Promise<void> {
    await inTransaction(this.pool, async (client, now) => {
      await assertLease(client, message);
      const idempotencyKey = `recommendChallenges:${request.input.review_window_ref}:${request.aggregateVersion}:${request.inputHash}:${prompt.promptVersion}`;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO hiring_intelligence_requests (
           id, operation, review_window_id, aggregate_version, runtime_mode, replay_id,
           prompt_id, prompt_version, prompt_hash, input_schema_version,
           output_schema_version, catalog_ref, catalog_hash, input_hash, input_json,
           idempotency_key, status, next_attempt_at, created_at
         ) VALUES (
           $1, 'recommendChallenges', $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14::jsonb, $15, 'QUEUED', $16, $16
         )
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [
          request.requestId,
          request.input.review_window_ref,
          request.aggregateVersion,
          request.runtimeMode,
          request.replayId,
          prompt.promptId,
          prompt.promptVersion,
          prompt.promptHash,
          prompt.inputSchemaVersion,
          prompt.outputSchemaVersion,
          request.catalogRef,
          request.catalogHash,
          request.inputHash,
          JSON.stringify(request.input),
          idempotencyKey,
          now,
        ],
      );
      const persisted = await client.query<{ id: string; input_hash: string }>(
        "SELECT id, input_hash FROM hiring_intelligence_requests WHERE idempotency_key = $1",
        [idempotencyKey],
      );
      const row = persisted.rows[0];
      if (
        row === undefined ||
        row.id !== request.requestId ||
        row.input_hash !== request.inputHash
      ) {
        throw new PostgresOptimisticConcurrencyError(
          "A recommendation request idempotency key resolved to different input.",
        );
      }
      if (inserted.rowCount === 1) {
        for (const evidence of request.input.stage_a_evidence) {
          await client.query(
            `INSERT INTO ai_source_refs (request_id, source_ref, source_kind, sha256)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (request_id, source_ref) DO NOTHING`,
            [request.requestId, evidence.evidence_ref, evidence.evidence_type, evidence.sha256],
          );
        }
        await client.query(
          `INSERT INTO employer_review_window_projections (
             review_window_id, projection_version, projection_json, updated_at
           ) VALUES ($1, $2, $3::jsonb, $4)
           ON CONFLICT (review_window_id) DO UPDATE
             SET projection_version = EXCLUDED.projection_version,
                 projection_json = EXCLUDED.projection_json,
                 updated_at = EXCLUDED.updated_at`,
          [
            request.input.review_window_ref,
            request.aggregateVersion,
            JSON.stringify(request.employerProjection),
            now,
          ],
        );
        await client.query(
          `INSERT INTO outbox_messages (
             message_id, message_type, message_version, event_id, idempotency_key,
             correlation_id, payload, available_at
           ) VALUES ($1, 'RecommendChallengesRequested', 1, $2, $3, $4, $5::jsonb, $6)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            `recommend-job:${request.requestId}`,
            message.eventId,
            `RecommendChallengesRequested:${request.requestId}`,
            message.correlationId,
            JSON.stringify({ requestId: request.requestId }),
            now,
          ],
        );
      }
      await markProcessed(client, message, now, "recommendation_requested");
    });
  }

  public async loadRecommendationRequest(
    requestId: string,
  ): Promise<StoredRecommendationRequest | null> {
    const result = await this.pool.query<{
      id: string;
      input_json: unknown;
      input_hash: string;
      aggregate_version: number;
      runtime_mode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
      replay_id: string | null;
      catalog_ref: string;
      catalog_hash: string;
      projection_json: unknown;
    }>(
      `SELECT request.id, request.input_json, request.input_hash,
              request.aggregate_version, request.runtime_mode, request.replay_id,
              request.catalog_ref, request.catalog_hash,
              projection.projection_json
         FROM hiring_intelligence_requests AS request
         JOIN employer_review_window_projections AS projection
           ON projection.review_window_id = request.review_window_id
        WHERE request.id = $1`,
      [requestId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      requestId: row.id,
      input: RecommendChallengesInputSchema.parse(row.input_json),
      inputHash: row.input_hash,
      aggregateVersion: row.aggregate_version,
      runtimeMode: row.runtime_mode,
      replayId: row.replay_id,
      catalogRef: row.catalog_ref,
      catalogHash: row.catalog_hash,
      employerProjection: EmployerReviewWindowProjectionSchema.parse(row.projection_json),
    };
  }

  public async completeRecommendation(
    message: ClaimedChallengeWorkerMessage,
    completion: RecommendationCompletion,
  ): Promise<void> {
    await inTransaction(this.pool, async (client, now) => {
      await assertLease(client, message);
      const requestId = payloadString(message, "requestId");
      const current = await client.query<{
        aggregate_version: number;
        version: number;
        state: string;
      }>(
        `SELECT request.aggregate_version, review_window.version, review_window.state
           FROM hiring_intelligence_requests AS request
           JOIN review_windows AS review_window
             ON review_window.id = request.review_window_id
          WHERE request.id = $1
          FOR UPDATE OF request, review_window`,
        [requestId],
      );
      const currentRow = current.rows[0];
      if (
        currentRow === undefined ||
        currentRow.aggregate_version !== currentRow.version ||
        currentRow.state !== "CHECKPOINT_PENDING"
      ) {
        const error = new Error("The AI result is stale.") as Error & {
          code: string;
          retryable: boolean;
        };
        error.code = "AI_STALE_RESULT";
        error.retryable = false;
        throw error;
      }
      await client.query(
        `INSERT INTO ai_model_runs (
           id, request_id, attempt, adapter_id, requested_model, resolved_model,
           prompt_id, prompt_version, prompt_hash, input_schema_version,
           output_schema_version, status, input_bytes, output_bytes, duration_ms,
           started_at, completed_at
         )
         SELECT $1, id, $2,
                CASE runtime_mode WHEN 'LIVE' THEN 'openai-responses' ELSE 'golden-replay' END,
                CASE runtime_mode WHEN 'LIVE' THEN 'gpt-5.6-sol' ELSE NULL END,
                CASE runtime_mode WHEN 'LIVE' THEN 'gpt-5.6-sol' ELSE NULL END,
                prompt_id, prompt_version, prompt_hash, input_schema_version,
                output_schema_version, $3, octet_length(input_json::text), $4, 0,
                $5, $5
           FROM hiring_intelligence_requests WHERE id = $6`,
        [
          completion.runId,
          message.attempt,
          completion.status === "SUCCEEDED" ? "SUCCEEDED" : "NEEDS_HUMAN",
          Buffer.byteLength(JSON.stringify(completion.output), "utf8"),
          now,
          requestId,
        ],
      );
      await client.query(
        `INSERT INTO ai_outputs (
           id, request_id, output_schema_version, validated_json, output_hash,
           validation_policy_version, created_at
         )
         SELECT $1, id, output_schema_version, $2::jsonb, $3,
                'challenge-recommendation-policy@1', $4
           FROM hiring_intelligence_requests WHERE id = $5`,
        [
          completion.outputRef,
          JSON.stringify(completion.output),
          completion.outputHash,
          now,
          requestId,
        ],
      );
      await client.query(
        `UPDATE hiring_intelligence_requests
            SET status = $1, completed_at = $2, attempt_count = $3
          WHERE id = $4`,
        [completion.status, now, message.attempt, requestId],
      );
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, $2, 1, 'HiringIntelligenceRequest', $3, 1, $4, $5, $6::jsonb)`,
        [
          completion.eventId,
          completion.status === "SUCCEEDED"
            ? "ChallengeRecommendationsCompleted"
            : "ChallengeRecommendationsNeedHuman",
          requestId,
          message.correlationId,
          now,
          JSON.stringify({ requestId, outputRef: completion.outputRef }),
        ],
      );
      await client.query(
        `UPDATE employer_review_window_projections
            SET projection_json = $1::jsonb, updated_at = $2
          WHERE review_window_id = $3`,
        [
          JSON.stringify(completion.employerProjection),
          now,
          completion.employerProjection.review_window_id,
        ],
      );
      await markProcessed(client, message, now, completion.status.toLowerCase());
    });
  }

  public async completeRecommendationFailure(
    message: ClaimedChallengeWorkerMessage,
    input: {
      readonly requestId: string;
      readonly runId: string;
      readonly status: "NEEDS_HUMAN" | "FAILED_PERMANENT" | "SUPERSEDED";
      readonly errorCode: string;
      readonly employerProjection: ReturnType<typeof EmployerReviewWindowProjectionSchema.parse>;
    },
  ): Promise<void> {
    await inTransaction(this.pool, async (client, now) => {
      await assertLease(client, message);
      await client.query(
        `INSERT INTO ai_model_runs (
           id, request_id, attempt, adapter_id, requested_model, resolved_model,
           prompt_id, prompt_version, prompt_hash, input_schema_version,
           output_schema_version, status, error_code, input_bytes, duration_ms,
           started_at, completed_at
         )
         SELECT $1, id, $2,
                CASE runtime_mode WHEN 'LIVE' THEN 'openai-responses' ELSE 'golden-replay' END,
                CASE runtime_mode WHEN 'LIVE' THEN 'gpt-5.6-sol' ELSE NULL END,
                NULL, prompt_id, prompt_version, prompt_hash, input_schema_version,
                output_schema_version,
                CASE $3 WHEN 'NEEDS_HUMAN' THEN 'NEEDS_HUMAN' ELSE 'FAILED_PERMANENT' END,
                $4, octet_length(input_json::text), 0, $5, $5
           FROM hiring_intelligence_requests WHERE id = $6
         ON CONFLICT (request_id, attempt) DO NOTHING`,
        [input.runId, message.attempt, input.status, input.errorCode, now, input.requestId],
      );
      await client.query(
        `UPDATE hiring_intelligence_requests
            SET status = $1, completed_at = $2, attempt_count = $3
          WHERE id = $4`,
        [input.status, now, message.attempt, input.requestId],
      );
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, $2, 1, 'HiringIntelligenceRequest', $3, 1, $4, $5, $6::jsonb)
         ON CONFLICT (aggregate_type, aggregate_id, aggregate_version) DO NOTHING`,
        [
          `event:${input.runId}`,
          input.status === "SUPERSEDED"
            ? "ChallengeRecommendationsSuperseded"
            : input.status === "NEEDS_HUMAN"
              ? "ChallengeRecommendationsNeedHuman"
              : "ChallengeRecommendationsFailed",
          input.requestId,
          message.correlationId,
          now,
          JSON.stringify({ requestId: input.requestId, errorCode: input.errorCode }),
        ],
      );
      await client.query(
        `UPDATE employer_review_window_projections
            SET projection_json = $1::jsonb, updated_at = $2
          WHERE review_window_id = $3`,
        [JSON.stringify(input.employerProjection), now, input.employerProjection.review_window_id],
      );
      await markProcessed(client, message, now, input.status.toLowerCase());
    });
  }

  public async retryRecommendation(
    message: ClaimedChallengeWorkerMessage,
    input: {
      readonly requestId: string;
      readonly runId: string;
      readonly errorCode: string;
      readonly retryAt: Date;
    },
  ): Promise<void> {
    await inTransaction(this.pool, async (client, now) => {
      await assertLease(client, message);
      await client.query(
        `INSERT INTO ai_model_runs (
           id, request_id, attempt, adapter_id, requested_model, resolved_model,
           prompt_id, prompt_version, prompt_hash, input_schema_version,
           output_schema_version, status, error_code, input_bytes, duration_ms,
           started_at, completed_at
         )
         SELECT $1, id, $2,
                CASE runtime_mode WHEN 'LIVE' THEN 'openai-responses' ELSE 'golden-replay' END,
                CASE runtime_mode WHEN 'LIVE' THEN 'gpt-5.6-sol' ELSE NULL END,
                NULL, prompt_id, prompt_version, prompt_hash, input_schema_version,
                output_schema_version, 'FAILED_RETRYABLE', $3,
                octet_length(input_json::text), 0, $4, $4
           FROM hiring_intelligence_requests WHERE id = $5
         ON CONFLICT (request_id, attempt) DO NOTHING`,
        [input.runId, message.attempt, input.errorCode, now, input.requestId],
      );
      await client.query(
        `UPDATE hiring_intelligence_requests
            SET status = 'RETRYABLE', attempt_count = $1, next_attempt_at = $2
          WHERE id = $3`,
        [message.attempt, input.retryAt, input.requestId],
      );
      const updated = await client.query(
        `UPDATE outbox_messages
            SET available_at = $1,
                lease_owner = NULL,
                lease_expires_at = NULL,
                last_error_code = $2
          WHERE message_id = $3
            AND lease_owner = $4
            AND attempt_count = $5
            AND processed_at IS NULL`,
        [input.retryAt, input.errorCode, message.messageId, message.leaseOwner, message.attempt],
      );
      if (updated.rowCount !== 1) {
        throw new PostgresOptimisticConcurrencyError("Recommendation retry lease was lost.");
      }
    });
  }

  public async loadSelectedChallengeContext(
    message: ClaimedChallengeWorkerMessage,
  ): Promise<SelectedChallengeWorkerContext | null> {
    const reviewWindowId = payloadString(message, "reviewWindowId");
    const challengeRef = payloadString(message, "challengeRef");
    const candidateNotice = payloadString(message, "candidateNotice");
    const result = await this.pool.query<{
      aggregate_json: unknown;
      aggregate_version: number;
      proof_ref: string;
      runtime_mode: string;
      replay_session_key: string | null;
      sandbox_session_ref: string;
      base_snapshot_version: string;
      stage_a_patch_ref: string;
      stage_a_artifact_ref: string;
      stage_a_snapshot_ref: string;
      remaining_time_seconds: number;
      challenge_catalog_version_id: string;
      candidate_projection: unknown;
      employer_projection: unknown;
    }>(
      `SELECT review_window.aggregate_json,
              review_window.version AS aggregate_version,
              proof.id AS proof_ref,
              proof.runtime_mode,
              proof.replay_session_key,
              proof.sandbox_session_ref,
              proof.base_snapshot_version,
              proof.stage_a_patch_ref,
              proof.stage_a_artifact_ref,
              proof.stage_a_snapshot_ref,
              proof.remaining_time_seconds,
              review_window.challenge_catalog_version_id,
              candidate.projection_json AS candidate_projection,
              employer.projection_json AS employer_projection
         FROM review_windows AS review_window
         JOIN proof_sessions AS proof ON proof.review_window_id = review_window.id
         JOIN candidate_review_window_projections AS candidate
           ON candidate.review_window_id = review_window.id
         JOIN employer_review_window_projections AS employer
           ON employer.review_window_id = review_window.id
        WHERE review_window.id = $1 AND review_window.state = 'STAGE_B_ACTIVE'`,
      [reviewWindowId],
    );
    const row = result.rows[0];
    if (!isRecord(row?.aggregate_json) || row.replay_session_key === null) {
      return null;
    }
    const checkpoint = row.aggregate_json.checkpoint;
    if (!isRecord(checkpoint) || checkpoint.challengeId !== challengeRef) {
      return null;
    }
    const receiptResult = await this.pool.query<{ result_json: unknown }>(
      `SELECT result_json
         FROM inbox_messages
        WHERE consumer LIKE 'employer-command:%'
          AND result_json ->> 'event_id' = $1
        LIMIT 1`,
      [message.eventId],
    );
    const receipt = HumanAuthorizationReceiptSchema.parse(receiptResult.rows[0]?.result_json);
    const employerProjection = EmployerReviewWindowProjectionSchema.parse({
      ...EmployerReviewWindowProjectionSchema.parse(row.employer_projection),
      authorization: receipt,
    });
    return {
      reviewWindowId,
      aggregateVersion: row.aggregate_version,
      challengeRef,
      candidateNotice,
      sessionKey: row.replay_session_key,
      proofRef: row.proof_ref,
      sessionId: row.sandbox_session_ref,
      baseSnapshotVersion: row.base_snapshot_version,
      patchRef: row.stage_a_patch_ref,
      artifactRef: row.stage_a_artifact_ref,
      snapshotRef: row.stage_a_snapshot_ref,
      remainingTimeSeconds: row.remaining_time_seconds,
      catalogRef: row.challenge_catalog_version_id,
      catalogHash: typeof checkpoint.catalogHash === "string" ? checkpoint.catalogHash : "",
      candidateProjection: CandidateReviewWindowProjectionSchema.parse(row.candidate_projection),
      employerProjection,
    };
  }

  public async completeSelectedChallenge(
    message: ClaimedChallengeWorkerMessage,
    input: {
      readonly sandboxBranchRef: string;
      readonly candidateProjection: ReturnType<typeof CandidateReviewWindowProjectionSchema.parse>;
      readonly employerProjection: ReturnType<typeof EmployerReviewWindowProjectionSchema.parse>;
    },
  ): Promise<void> {
    await inTransaction(this.pool, async (client, now) => {
      await assertLease(client, message);
      const reviewWindowId = payloadString(message, "reviewWindowId");
      const challengeRef = payloadString(message, "challengeRef");
      await client.query(
        `UPDATE proof_sessions
            SET selected_challenge_ref = $1, sandbox_branch_ref = $2, updated_at = $3
          WHERE review_window_id = $4`,
        [challengeRef, input.sandboxBranchRef, now, reviewWindowId],
      );
      await client.query(
        `UPDATE candidate_review_window_projections
            SET projection_version = $1, projection_json = $2::jsonb, updated_at = $3
          WHERE review_window_id = $4`,
        [
          input.candidateProjection.aggregate_version,
          JSON.stringify(input.candidateProjection),
          now,
          reviewWindowId,
        ],
      );
      await client.query(
        `UPDATE employer_review_window_projections
            SET projection_version = $1, projection_json = $2::jsonb, updated_at = $3
          WHERE review_window_id = $4`,
        [
          input.employerProjection.aggregate_version,
          JSON.stringify(input.employerProjection),
          now,
          reviewWindowId,
        ],
      );
      await markProcessed(client, message, now, "sandbox_branch_applied");
    });
  }

  public async completePlatformAbortProjection(
    message: ClaimedChallengeWorkerMessage,
    reviewWindowId: string,
  ): Promise<void> {
    await inTransaction(this.pool, async (client, now) => {
      await assertLease(client, message);
      const result = await client.query<{
        version: number;
        state: string;
        candidate_projection: unknown;
        employer_projection: unknown;
      }>(
        `SELECT review_window.version, review_window.state,
                candidate.projection_json AS candidate_projection,
                employer.projection_json AS employer_projection
           FROM review_windows AS review_window
           JOIN candidate_review_window_projections AS candidate
             ON candidate.review_window_id = review_window.id
           JOIN employer_review_window_projections AS employer
             ON employer.review_window_id = review_window.id
          WHERE review_window.id = $1`,
        [reviewWindowId],
      );
      const row = result.rows[0];
      if (row !== undefined && row.state === "PLATFORM_ABORT") {
        const candidate = CandidateReviewWindowProjectionSchema.parse({
          ...CandidateReviewWindowProjectionSchema.parse(row.candidate_projection),
          aggregate_version: row.version,
          state: "PLATFORM_ABORT",
          selected_challenge: null,
          message:
            "The platform could not load Stage B. No Candidate failure or Employer Breach was recorded.",
        });
        const employer = EmployerReviewWindowProjectionSchema.parse({
          ...EmployerReviewWindowProjectionSchema.parse(row.employer_projection),
          aggregate_version: row.version,
          state: "PLATFORM_ABORT",
        });
        await client.query(
          `UPDATE candidate_review_window_projections
              SET projection_version = $1, projection_json = $2::jsonb, updated_at = $3
            WHERE review_window_id = $4`,
          [row.version, JSON.stringify(candidate), now, reviewWindowId],
        );
        await client.query(
          `UPDATE employer_review_window_projections
              SET projection_version = $1, projection_json = $2::jsonb, updated_at = $3
            WHERE review_window_id = $4`,
          [row.version, JSON.stringify(employer), now, reviewWindowId],
        );
      }
      await markProcessed(client, message, now, "platform_abort_projected");
    });
  }

  public async retryMessage(
    message: ClaimedChallengeWorkerMessage,
    errorCode: string,
    retryAt: Date,
  ): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      await assertLease(client, message);
      const updated = await client.query(
        `UPDATE outbox_messages
            SET available_at = $1,
                lease_owner = NULL,
                lease_expires_at = NULL,
                last_error_code = $2
          WHERE message_id = $3
            AND lease_owner = $4
            AND attempt_count = $5
            AND processed_at IS NULL`,
        [retryAt, errorCode, message.messageId, message.leaseOwner, message.attempt],
      );
      if (updated.rowCount !== 1) {
        throw new PostgresOptimisticConcurrencyError("Outbox retry lease was lost.");
      }
    });
  }

  public async markMessageProcessed(message: ClaimedChallengeWorkerMessage): Promise<void> {
    await inTransaction(this.pool, async (client, now) => {
      await assertLease(client, message);
      await markProcessed(client, message, now, "ignored_or_duplicate");
    });
  }
}
