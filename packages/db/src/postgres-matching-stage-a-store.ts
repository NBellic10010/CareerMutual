import type {
  ClaimedStageAReplayMessage,
  MatchingStageATransaction,
  MatchingStageAUnitOfWork,
  StageAReplayContext,
  StageAReplayMessageStore,
} from "@onlyboth/application";
import {
  CandidateOpportunityProjectionSchema,
  CandidateReviewWindowProjectionSchema,
  EmployerReviewWindowProjectionSchema,
} from "@onlyboth/contracts";
import type { ReviewWindow } from "@onlyboth/domain";
import type { Pool, PoolClient } from "pg";

import { PostgresOptimisticConcurrencyError } from "./postgres-challenge-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseWindow(value: unknown): ReviewWindow {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.version !== "number") {
    throw new Error("Persisted ReviewWindow is invalid.");
  }
  return structuredClone(value) as unknown as ReviewWindow;
}

function parseClaimed(row: {
  readonly message_id: string;
  readonly event_id: string;
  readonly correlation_id: string;
  readonly payload: unknown;
  readonly lease_owner: string;
  readonly attempt_count: number;
}): ClaimedStageAReplayMessage {
  if (!isRecord(row.payload) || typeof row.payload.reviewWindowId !== "string") {
    throw new Error("ProofWindowAccepted payload is invalid.");
  }
  return {
    messageId: row.message_id,
    eventId: row.event_id,
    correlationId: row.correlation_id,
    reviewWindowRef: row.payload.reviewWindowId,
    leaseOwner: row.lease_owner,
    attempt: row.attempt_count,
  };
}

async function assertLease(client: PoolClient, message: ClaimedStageAReplayMessage): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM outbox_messages
      WHERE message_id = $1 AND lease_owner = $2 AND attempt_count = $3
        AND processed_at IS NULL AND lease_expires_at >= clock_timestamp()
      FOR UPDATE`,
    [message.messageId, message.leaseOwner, message.attempt],
  );
  if (result.rowCount !== 1) {
    throw new PostgresOptimisticConcurrencyError("Stage A replay message lost its lease.");
  }
}

async function completeMessage(
  client: PoolClient,
  message: ClaimedStageAReplayMessage,
  now: Date,
  outcome: string,
): Promise<void> {
  await client.query(
    `INSERT INTO inbox_messages (
       consumer, message_id, idempotency_key, payload_hash, result_json, processed_at
     ) VALUES ('stage-a-replay-worker', $1, $1, $1, $2::jsonb, $3)
     ON CONFLICT (consumer, message_id) DO NOTHING`,
    [message.messageId, JSON.stringify({ outcome }), now],
  );
  const updated = await client.query(
    `UPDATE outbox_messages SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
      WHERE message_id = $2 AND lease_owner = $3 AND attempt_count = $4
        AND processed_at IS NULL`,
    [now, message.messageId, message.leaseOwner, message.attempt],
  );
  if (updated.rowCount !== 1) {
    throw new PostgresOptimisticConcurrencyError("Stage A replay message changed.");
  }
}

class PostgresMatchingStageATransaction implements MatchingStageATransaction {
  public constructor(
    private readonly client: PoolClient,
    public readonly databaseNow: Date,
  ) {}

  public async loadWindowForUpdate(reviewWindowRef: string): Promise<ReviewWindow | null> {
    const result = await this.client.query<{ aggregate_json: unknown }>(
      "SELECT aggregate_json FROM review_windows WHERE id = $1 FOR UPDATE",
      [reviewWindowRef],
    );
    const row = result.rows[0];
    return row === undefined ? null : parseWindow(row.aggregate_json);
  }

  public async persistSubmission(
    input: Parameters<MatchingStageATransaction["persistSubmission"]>[0],
  ): Promise<void> {
    await assertLease(this.client, input.message);
    const updated = await this.client.query(
      `UPDATE review_windows
          SET state = 'CHECKPOINT_PENDING', version = $1, stage_a_snapshot_id = $2,
              aggregate_json = $3::jsonb, updated_at = $4
        WHERE id = $5 AND version = $6 AND state = 'STAGE_A_ACTIVE'`,
      [
        input.nextWindow.version,
        input.result.snapshotRef,
        JSON.stringify(input.nextWindow),
        this.databaseNow,
        input.nextWindow.id,
        input.previousWindow.version,
      ],
    );
    if (updated.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError("Review Window changed before Stage A submit.");
    }
    const proofUpdated = await this.client.query(
      `UPDATE proof_sessions
          SET sandbox_session_ref = $1, stage_a_artifact_ref = $2,
              stage_a_snapshot_ref = $3, remaining_time_seconds = $4, updated_at = $5
        WHERE review_window_id = $6 AND stage_a_artifact_ref = $2
          AND stage_a_snapshot_ref = $3`,
      [
        input.result.sandboxSessionRef,
        input.result.artifactRef,
        input.result.snapshotRef,
        input.result.remainingTimeSeconds,
        this.databaseNow,
        input.nextWindow.id,
      ],
    );
    if (proofUpdated.rowCount !== 1) {
      throw new Error("Replay Stage A outputs do not match the pinned Proof Session.");
    }
    const evidence = [
      {
        ref: "evidence-E17",
        ordinal: 1,
        type: "verification",
        summary: "The common verifier exercised concurrent retries against the Stage A artifact.",
        hash: input.result.visibleTestResultHash,
      },
      {
        ref: "evidence-D04",
        ordinal: 2,
        type: "diff",
        summary: "The Stage A change moved the idempotency guard ahead of payment execution.",
        hash: input.result.artifactHash,
      },
      {
        ref: "evidence-C09",
        ordinal: 3,
        type: "event",
        summary: "The candidate explicitly marked acknowledgement loss as unresolved.",
        hash: input.result.snapshotHash,
      },
    ] as const;
    for (const item of evidence) {
      await this.client.query(
        `INSERT INTO stage_a_evidence (
           evidence_ref, review_window_id, ordinal, evidence_type, summary, sha256, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          item.ref,
          input.nextWindow.id,
          item.ordinal,
          item.type,
          item.summary,
          item.hash,
          this.databaseNow,
        ],
      );
    }
    await this.client.query(
      `INSERT INTO domain_events (
         event_id, event_type, event_version, aggregate_type, aggregate_id,
         aggregate_version, correlation_id, occurred_at, payload
       ) VALUES ($1, 'StageASubmitted', 1, 'ReviewWindow', $2, $3, $4, $5, $6::jsonb)`,
      [
        input.eventId,
        input.nextWindow.id,
        input.nextWindow.version,
        input.message.correlationId,
        this.databaseNow,
        JSON.stringify({
          type: "StageASubmitted",
          reviewWindowId: input.nextWindow.id,
          snapshotId: input.result.snapshotRef,
        }),
      ],
    );
    await this.client.query(
      `INSERT INTO outbox_messages (
         message_id, message_type, message_version, event_id, idempotency_key,
         correlation_id, payload, available_at
       ) VALUES ($1, 'StageASubmitted', 1, $2, $3, $4, $5::jsonb, $6)`,
      [
        input.outboxId,
        input.eventId,
        `StageASubmitted:${input.nextWindow.id}:${input.nextWindow.version}`,
        input.message.correlationId,
        JSON.stringify({ reviewWindowId: input.nextWindow.id }),
        this.databaseNow,
      ],
    );
    const employerProjection = EmployerReviewWindowProjectionSchema.parse({
      schema_version: "employer-review-window-projection@1",
      view: "EMPLOYER",
      review_window_id: input.nextWindow.id,
      aggregate_version: input.nextWindow.version,
      state: "CHECKPOINT_PENDING",
      runtime_mode: "GOLDEN_REPLAY",
      synthetic: true,
      disclosure: "Synthetic — Pre-recorded external inputs",
      reviewer: { id: input.nextWindow.reviewerId, display_name: "Sarah Chen" },
      candidate: { opaque_id: "Candidate 42" },
      recommendation: {
        status: "RUNNING",
        output_ref: null,
        prompt_version: "1.1.0",
        input_hash: null,
        options: [],
        reason_code: null,
      },
      authorization: null,
    });
    const candidateProjection = CandidateReviewWindowProjectionSchema.parse({
      schema_version: "candidate-review-window-projection@1",
      view: "CANDIDATE",
      review_window_id: input.nextWindow.id,
      aggregate_version: input.nextWindow.version,
      candidate_ref: "candidate-42",
      reviewer: { id: input.nextWindow.reviewerId, display_name: "Sarah Chen" },
      runtime_mode: "GOLDEN_REPLAY",
      synthetic: true,
      state: "CHECKPOINT_PENDING",
      selected_challenge: null,
      message: "Sarah is reviewing your Stage A evidence.",
    });
    await this.client.query(
      `INSERT INTO employer_review_window_projections (
         review_window_id, projection_version, projection_json, updated_at
       ) VALUES ($1, $2, $3::jsonb, $4)`,
      [
        input.nextWindow.id,
        input.nextWindow.version,
        JSON.stringify(employerProjection),
        this.databaseNow,
      ],
    );
    await this.client.query(
      `INSERT INTO candidate_review_window_projections (
         review_window_id, candidate_id, projection_version, projection_json, updated_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        input.nextWindow.id,
        input.nextWindow.candidateId,
        input.nextWindow.version,
        JSON.stringify(candidateProjection),
        this.databaseNow,
      ],
    );
    const opportunityResult = await this.client.query<{ projection_json: unknown }>(
      `SELECT projection_json FROM candidate_opportunity_projections
        WHERE opportunity_ref = $1 AND candidate_ref = $2 FOR UPDATE`,
      [input.nextWindow.opportunityId, input.nextWindow.candidateId],
    );
    const opportunityRow = opportunityResult.rows[0];
    if (opportunityRow === undefined) throw new Error("Candidate Opportunity projection missing.");
    const opportunityProjection = CandidateOpportunityProjectionSchema.parse({
      ...CandidateOpportunityProjectionSchema.parse(opportunityRow.projection_json),
      state: "CHECKPOINT_PENDING",
      review_window_version: input.nextWindow.version,
      message: "Stage A is recorded. Sarah now owes a candidate-specific Challenge.",
    });
    await this.client.query(
      `UPDATE candidate_opportunity_projections
          SET projection_version = projection_version + 1,
              projection_json = $1::jsonb, updated_at = $2
        WHERE opportunity_ref = $3 AND candidate_ref = $4`,
      [
        JSON.stringify(opportunityProjection),
        this.databaseNow,
        input.nextWindow.opportunityId,
        input.nextWindow.candidateId,
      ],
    );
    await completeMessage(this.client, input.message, this.databaseNow, "stage_a_submitted");
  }

  public async persistPlatformAbort(
    input: Parameters<MatchingStageATransaction["persistPlatformAbort"]>[0],
  ): Promise<void> {
    await assertLease(this.client, input.message);
    const updated = await this.client.query(
      `UPDATE review_windows SET state = 'PLATFORM_ABORT', version = $1,
              aggregate_json = $2::jsonb, updated_at = $3
        WHERE id = $4 AND version = $5`,
      [
        input.nextWindow.version,
        JSON.stringify(input.nextWindow),
        this.databaseNow,
        input.nextWindow.id,
        input.previousWindow.version,
      ],
    );
    if (updated.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError("Review Window changed before Platform Abort.");
    }
    const released = await this.client.query<{ amount: number; account_ref: string }>(
      `UPDATE credit_holds SET status = 'RETURNED', settled_at = $1
        WHERE credit_hold_ref = $2 AND status = 'HELD'
      RETURNING amount, account_ref`,
      [this.databaseNow, input.nextWindow.creditHoldId],
    );
    const credit = released.rows[0];
    if (credit !== undefined) {
      await this.client.query(
        `UPDATE credit_accounts SET available_credits = available_credits + $1,
                held_credits = held_credits - $1, version = version + 1
          WHERE account_ref = $2`,
        [credit.amount, credit.account_ref],
      );
      await this.client.query(
        `UPDATE attention_slots SET status = 'AVAILABLE', version = version + 1
          WHERE slot_ref = $1`,
        [input.nextWindow.attentionSlotId],
      );
      await this.client.query(
        `UPDATE candidate_activity_leases
            SET status = 'RELEASED', released_at = $1, version = version + 1
          WHERE subject_type = 'DEEP_PROOF_REVIEW_WINDOW' AND subject_ref = $2
            AND status = 'ACTIVE'`,
        [this.databaseNow, input.nextWindow.id],
      );
      await this.client.query(
        `INSERT INTO credit_ledger_entries (
           ledger_entry_ref, account_ref, credit_hold_ref, entry_type, amount, occurred_at
         ) VALUES ($1, $2, $3, 'RETURN', $4, $5)`,
        [
          `ledger-return:${input.nextWindow.creditHoldId}`,
          credit.account_ref,
          input.nextWindow.creditHoldId,
          credit.amount,
          this.databaseNow,
        ],
      );
    }
    await this.client.query(
      `INSERT INTO domain_events (
         event_id, event_type, event_version, aggregate_type, aggregate_id,
         aggregate_version, correlation_id, occurred_at, payload
       ) VALUES ($1, 'PlatformAborted', 1, 'ReviewWindow', $2, $3, $4, $5, $6::jsonb)`,
      [
        input.eventId,
        input.nextWindow.id,
        input.nextWindow.version,
        input.message.correlationId,
        this.databaseNow,
        JSON.stringify({
          type: "PlatformAborted",
          reviewWindowId: input.nextWindow.id,
          component: "StageASandbox",
          reasonRef: input.reasonRef,
        }),
      ],
    );
    await this.client.query(
      `INSERT INTO outbox_messages (
         message_id, message_type, message_version, event_id, idempotency_key,
         correlation_id, payload, available_at
       ) VALUES ($1, 'PlatformAborted', 1, $2, $3, $4, $5::jsonb, $6)`,
      [
        input.outboxId,
        input.eventId,
        `PlatformAborted:${input.nextWindow.id}:${input.nextWindow.version}`,
        input.message.correlationId,
        JSON.stringify({ reviewWindowId: input.nextWindow.id }),
        this.databaseNow,
      ],
    );
    const projectionResult = await this.client.query<{ projection_json: unknown }>(
      `SELECT projection_json FROM candidate_opportunity_projections
        WHERE opportunity_ref = $1 AND candidate_ref = $2 FOR UPDATE`,
      [input.nextWindow.opportunityId, input.nextWindow.candidateId],
    );
    const projectionRow = projectionResult.rows[0];
    if (projectionRow !== undefined) {
      const projection = CandidateOpportunityProjectionSchema.parse({
        ...CandidateOpportunityProjectionSchema.parse(projectionRow.projection_json),
        state: "PLATFORM_ABORT",
        review_window_version: input.nextWindow.version,
        message: "The platform stopped the proof and restored resources without participant blame.",
      });
      await this.client.query(
        `UPDATE candidate_opportunity_projections SET projection_version = projection_version + 1,
                projection_json = $1::jsonb, updated_at = $2
          WHERE opportunity_ref = $3 AND candidate_ref = $4`,
        [
          JSON.stringify(projection),
          this.databaseNow,
          input.nextWindow.opportunityId,
          input.nextWindow.candidateId,
        ],
      );
    }
    await completeMessage(this.client, input.message, this.databaseNow, "platform_abort");
  }
}

export class PostgresMatchingStageAStore
  implements StageAReplayMessageStore, MatchingStageAUnitOfWork
{
  public constructor(private readonly pool: Pool) {}

  public async claimNext(
    workerId: string,
    leaseDurationSeconds: number,
  ): Promise<ClaimedStageAReplayMessage | null> {
    const result = await this.pool.query<{
      message_id: string;
      event_id: string;
      correlation_id: string;
      payload: unknown;
      lease_owner: string;
      attempt_count: number;
    }>(
      `WITH next_message AS (
         SELECT message_id FROM outbox_messages
          WHERE processed_at IS NULL AND available_at <= clock_timestamp()
            AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
            AND message_type = 'ProofWindowAccepted'
          ORDER BY available_at, created_at, message_id
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE outbox_messages AS message
          SET lease_owner = $1,
              lease_expires_at = clock_timestamp() + ($2 * interval '1 second'),
              attempt_count = attempt_count + 1
         FROM next_message WHERE message.message_id = next_message.message_id
       RETURNING message.message_id, message.event_id, message.correlation_id,
                 message.payload, message.lease_owner, message.attempt_count`,
      [workerId, leaseDurationSeconds],
    );
    const row = result.rows[0];
    return row === undefined ? null : parseClaimed(row);
  }

  public async loadContext(reviewWindowRef: string): Promise<StageAReplayContext | null> {
    const result = await this.pool.query<{
      review_window_ref: string;
      candidate_id: string;
      state: string;
      proof_ref: string;
      replay_session_key: string;
      base_snapshot_version: string;
      stage_a_patch_ref: string;
      stage_a_artifact_ref: string;
      stage_a_snapshot_ref: string;
      remaining_time_seconds: number;
    }>(
      `SELECT review_window.id AS review_window_ref, review_window.candidate_id,
              review_window.state, proof.id AS proof_ref, proof.replay_session_key,
              proof.base_snapshot_version, proof.stage_a_patch_ref,
              proof.stage_a_artifact_ref, proof.stage_a_snapshot_ref,
              proof.remaining_time_seconds
         FROM review_windows AS review_window
         JOIN proof_sessions AS proof ON proof.review_window_id = review_window.id
        WHERE review_window.id = $1`,
      [reviewWindowRef],
    );
    const row = result.rows[0];
    if (
      row === undefined ||
      row.state !== "STAGE_A_ACTIVE" ||
      row.candidate_id !== "candidate-42"
    ) {
      return null;
    }
    return {
      reviewWindowRef: row.review_window_ref,
      candidateRef: row.candidate_id,
      proofSessionRef: row.proof_ref,
      replaySessionKey: row.replay_session_key,
      baseSnapshotVersion: row.base_snapshot_version,
      patchRef: row.stage_a_patch_ref,
      expectedArtifactRef: row.stage_a_artifact_ref,
      expectedSnapshotRef: row.stage_a_snapshot_ref,
      remainingTimeSeconds: row.remaining_time_seconds,
    };
  }

  public async scheduleRetry(
    message: ClaimedStageAReplayMessage,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE outbox_messages
          SET available_at = clock_timestamp() + ($1 * interval '1 second'),
              lease_owner = NULL, lease_expires_at = NULL, last_error_code = $2
        WHERE message_id = $3 AND lease_owner = $4 AND attempt_count = $5`,
      [retryAfterSeconds, errorCode, message.messageId, message.leaseOwner, message.attempt],
    );
    if (result.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError("Stage A retry lost its lease.");
    }
  }

  public async runInTransaction<TResult>(
    work: (transaction: MatchingStageATransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const nowResult = await client.query<{ database_now: Date }>(
        "SELECT clock_timestamp() AS database_now",
      );
      const now = nowResult.rows[0]?.database_now;
      if (now === undefined) throw new Error("PostgreSQL did not return database time.");
      const result = await work(new PostgresMatchingStageATransaction(client, now));
      await client.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
