import type {
  PersistProofWindowDecision,
  ProofWindowDecisionTransaction,
  ProofWindowDecisionUnitOfWork,
  StoredProofWindowDecisionReceipt,
} from "@onlyboth/application";
import {
  CandidateOpportunityProjectionSchema,
  ProofWindowDecisionReceiptSchema,
} from "@onlyboth/contracts";
import type { ReviewWindow } from "@onlyboth/domain";
import type { Pool, PoolClient } from "pg";

import { PostgresOptimisticConcurrencyError } from "./postgres-challenge-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseReviewWindow(value: unknown): ReviewWindow {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.version !== "number") {
    throw new Error("Persisted ReviewWindow does not satisfy its storage contract.");
  }
  return structuredClone(value) as unknown as ReviewWindow;
}

class PostgresProofWindowDecisionTransaction implements ProofWindowDecisionTransaction {
  public constructor(
    private readonly client: PoolClient,
    public readonly databaseNow: Date,
  ) {}

  public async findReceipt(
    actorRef: string,
    idempotencyKey: string,
  ): Promise<StoredProofWindowDecisionReceipt | null> {
    await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `proof-window-decision:${actorRef}:${idempotencyKey}`,
    ]);
    const result = await this.client.query<{
      command_fingerprint: string;
      receipt_json: unknown;
    }>(
      `SELECT command_fingerprint, receipt_json FROM matching_command_receipts
        WHERE actor_ref = $1 AND idempotency_key = $2`,
      [actorRef, idempotencyKey],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          actorRef,
          idempotencyKey,
          commandFingerprint: row.command_fingerprint,
          receipt: ProofWindowDecisionReceiptSchema.parse(row.receipt_json),
        };
  }

  public async loadWindowForUpdate(reviewWindowRef: string): Promise<ReviewWindow | null> {
    const result = await this.client.query<{ aggregate_json: unknown }>(
      "SELECT aggregate_json FROM review_windows WHERE id = $1 FOR UPDATE",
      [reviewWindowRef],
    );
    const row = result.rows[0];
    return row === undefined ? null : parseReviewWindow(row.aggregate_json);
  }

  public async findExpiredWindowForUpdate(): Promise<ReviewWindow | null> {
    const result = await this.client.query<{ aggregate_json: unknown }>(
      `SELECT aggregate_json FROM review_windows
        WHERE state = 'RESERVED' AND accept_by <= clock_timestamp()
        ORDER BY accept_by, id FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    const row = result.rows[0];
    return row === undefined ? null : parseReviewWindow(row.aggregate_json);
  }

  public async persistDecision(input: PersistProofWindowDecision): Promise<void> {
    const updated = await this.client.query(
      `UPDATE review_windows
          SET state = $1, version = $2, aggregate_json = $3::jsonb,
              release_reason = $4, updated_at = $5
        WHERE id = $6 AND version = $7`,
      [
        input.nextWindow.state,
        input.nextWindow.version,
        JSON.stringify(input.nextWindow),
        input.nextWindow.releaseReason ?? null,
        this.databaseNow,
        input.nextWindow.id,
        input.previousWindow.version,
      ],
    );
    if (updated.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError("Review Window changed before decision.");
    }

    if (input.proofSession !== null) {
      const proof = input.proofSession;
      await this.client.query(
        `INSERT INTO proof_sessions (
           id, review_window_id, runtime_mode, replay_id, sandbox_session_ref,
           replay_session_key, recommendation_request_ref, capability_refs,
           base_snapshot_version, stage_a_patch_ref, stage_a_artifact_ref,
           stage_a_snapshot_ref, remaining_time_seconds, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12,
                   $13, $14, $14)`,
        [
          proof.proofSessionRef,
          input.nextWindow.id,
          proof.runtimeMode,
          proof.replayId,
          proof.sandboxSessionRef,
          proof.replaySessionKey,
          proof.recommendationRequestRef,
          JSON.stringify(proof.capabilityRefs),
          proof.baseSnapshotVersion,
          proof.stageAPatchRef,
          proof.stageAArtifactRef,
          proof.stageASnapshotRef,
          proof.remainingTimeSeconds,
          this.databaseNow,
        ],
      );
    } else {
      const released = await this.client.query<{
        amount: number;
        account_ref: string;
        attention_slot_ref: string;
      }>(
        `UPDATE credit_holds AS hold
            SET status = 'RETURNED', settled_at = $1
           FROM review_windows AS review_window
          WHERE hold.credit_hold_ref = review_window.credit_hold_ref
            AND review_window.id = $2 AND hold.status = 'HELD'
        RETURNING hold.amount, hold.account_ref, review_window.attention_slot_ref`,
        [this.databaseNow, input.nextWindow.id],
      );
      const resource = released.rows[0];
      if (resource === undefined) {
        throw new PostgresOptimisticConcurrencyError("Credit Hold was not available to return.");
      }
      await this.client.query(
        `UPDATE credit_accounts
            SET available_credits = available_credits + $1,
                held_credits = held_credits - $1,
                version = version + 1
          WHERE account_ref = $2 AND held_credits >= $1`,
        [resource.amount, resource.account_ref],
      );
      await this.client.query(
        `UPDATE attention_slots SET status = 'AVAILABLE', version = version + 1
          WHERE slot_ref = $1 AND status = 'HELD'`,
        [resource.attention_slot_ref],
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
          resource.account_ref,
          input.nextWindow.creditHoldId,
          resource.amount,
          this.databaseNow,
        ],
      );
    }

    const accepted = input.nextWindow.state === "STAGE_A_ACTIVE";
    await this.client.query(
      `INSERT INTO domain_events (
         event_id, event_type, event_version, aggregate_type, aggregate_id,
         aggregate_version, correlation_id, occurred_at, payload
       ) VALUES ($1, $2, 1, 'ReviewWindow', $3, $4, $5, $6, $7::jsonb)`,
      [
        input.eventId,
        accepted ? "ProofWindowAccepted" : "ProofWindowReleased",
        input.nextWindow.id,
        input.nextWindow.version,
        input.correlationId,
        this.databaseNow,
        JSON.stringify(
          accepted
            ? { type: "ProofWindowAccepted", reviewWindowId: input.nextWindow.id }
            : {
                type: "ProofWindowReleased",
                reviewWindowId: input.nextWindow.id,
                reason: input.nextWindow.releaseReason,
              },
        ),
      ],
    );
    await this.client.query(
      `INSERT INTO outbox_messages (
         message_id, message_type, message_version, event_id, idempotency_key,
         correlation_id, payload, available_at
       ) VALUES ($1, $2, 1, $3, $4, $5, $6::jsonb, $7)`,
      [
        input.outboxId,
        accepted ? "ProofWindowAccepted" : "ProofWindowReleased",
        input.eventId,
        `${accepted ? "ProofWindowAccepted" : "ProofWindowReleased"}:${input.nextWindow.id}:${input.nextWindow.version}`,
        input.correlationId,
        JSON.stringify({ reviewWindowId: input.nextWindow.id }),
        this.databaseNow,
      ],
    );

    const projectionResult = await this.client.query<{ projection_json: unknown }>(
      `SELECT projection_json FROM candidate_opportunity_projections
        WHERE opportunity_ref = $1 AND candidate_ref = $2 FOR UPDATE`,
      [input.nextWindow.opportunityId, input.nextWindow.candidateId],
    );
    const existingProjection = projectionResult.rows[0];
    if (existingProjection === undefined) throw new Error("Candidate projection is missing.");
    const current = CandidateOpportunityProjectionSchema.parse(existingProjection.projection_json);
    const projection = CandidateOpportunityProjectionSchema.parse({
      ...current,
      state: accepted ? "STAGE_A_ACTIVE" : "RELEASED",
      review_window_version: input.nextWindow.version,
      message: accepted
        ? "Your six-minute Stage A proof is active."
        : "The reserved window was released without a negative capability inference.",
    });
    await this.client.query(
      `UPDATE candidate_opportunity_projections
          SET projection_version = projection_version + 1,
              projection_json = $1::jsonb, updated_at = $2
        WHERE opportunity_ref = $3 AND candidate_ref = $4`,
      [
        JSON.stringify(projection),
        this.databaseNow,
        input.nextWindow.opportunityId,
        input.nextWindow.candidateId,
      ],
    );
    await this.client.query(
      `INSERT INTO matching_command_receipts (
         actor_ref, idempotency_key, command_fingerprint, command_type,
         receipt_json, created_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        input.actorRef,
        input.idempotencyKey,
        input.commandFingerprint,
        accepted ? "AcceptProofWindow" : "ReleaseProofWindow",
        JSON.stringify(input.receipt),
        this.databaseNow,
      ],
    );
  }
}

export class PostgresProofWindowDecisionStore implements ProofWindowDecisionUnitOfWork {
  public constructor(private readonly pool: Pool) {}

  public async runInTransaction<TResult>(
    work: (transaction: ProofWindowDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const nowResult = await client.query<{ database_now: Date }>(
        "SELECT clock_timestamp() AS database_now",
      );
      const now = nowResult.rows[0]?.database_now;
      if (now === undefined) throw new Error("PostgreSQL did not return database time.");
      const result = await work(new PostgresProofWindowDecisionTransaction(client, now));
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
