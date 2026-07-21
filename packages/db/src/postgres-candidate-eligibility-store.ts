import { createHash } from "node:crypto";

import {
  FunctionalProductApplicationError,
  type CandidateEligibilityStore,
  type CandidateEligibilityWorkerStore,
  type ClaimedCandidateEligibilityMessage,
} from "@onlyboth/application";
import {
  CandidateEducationRecordSchema,
  CandidateEligibilityJobMatchSchema,
  CandidateEligibilityMatchInputSchema,
  CandidateEligibilityProjectionSchema,
  CandidateJobCardV3Schema,
  CandidateJobDetailV2Schema,
  CandidateOpportunityFeedV3Schema,
  EvidenceRequiredEligibilityMatchPolicySchema,
  type CandidateEligibilityProjection,
  type CandidateEvidenceItem,
  CandidateEvidenceItemSchema,
  type EligibilityMatchPolicy,
} from "@onlyboth/contracts";
import type { Pool, PoolClient } from "pg";

import type { PostgresFunctionalProductStore } from "./postgres-functional-product-store";

interface ClaimedRow {
  readonly message_id: string;
  readonly event_id: string;
  readonly correlation_id: string;
  readonly payload: unknown;
  readonly attempt_count: number;
  readonly lease_owner: string;
}

interface ReceiptRow {
  readonly command_fingerprint: string;
  readonly command_type: string;
  readonly receipt_json: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

async function databaseNow(client: PoolClient): Promise<Date> {
  const result = await client.query<{ database_now: Date }>(
    "SELECT clock_timestamp() AS database_now",
  );
  const now = result.rows[0]?.database_now;
  if (now === undefined) throw new Error("PostgreSQL did not return database time.");
  return now;
}

async function transaction<TResult>(
  pool: Pool,
  work: (client: PoolClient, now: Date) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client, await databaseNow(client));
    await client.query("COMMIT");
    return result;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function defaultProjection(candidateRef: string, now: Date): CandidateEligibilityProjection {
  return CandidateEligibilityProjectionSchema.parse({
    schema_version: "candidate-eligibility-projection@1",
    candidate_ref: candidateRef,
    status: "STALE",
    passport_snapshot_ref: null,
    projection_version: 1,
    reason_code: "PASSPORT_NOT_PUBLISHED",
    updated_at: now.toISOString(),
  });
}

async function loadProjection(
  client: PoolClient,
  candidateRef: string,
  now: Date,
  lock = false,
): Promise<CandidateEligibilityProjection> {
  const result = await client.query<{ projection_json: unknown }>(
    `SELECT projection_json FROM candidate_eligibility_projections
      WHERE candidate_ref = $1${lock ? " FOR UPDATE" : ""}`,
    [candidateRef],
  );
  return result.rows[0] === undefined
    ? defaultProjection(candidateRef, now)
    : CandidateEligibilityProjectionSchema.parse(result.rows[0].projection_json);
}

async function writeProjection(
  client: PoolClient,
  projection: CandidateEligibilityProjection,
  now: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO candidate_eligibility_projections (
       candidate_ref, projection_version, passport_snapshot_ref, status,
       reason_code, projection_json, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (candidate_ref) DO UPDATE
       SET projection_version = EXCLUDED.projection_version,
           passport_snapshot_ref = EXCLUDED.passport_snapshot_ref,
           status = EXCLUDED.status,
           reason_code = EXCLUDED.reason_code,
           projection_json = EXCLUDED.projection_json,
           updated_at = EXCLUDED.updated_at`,
    [
      projection.candidate_ref,
      projection.projection_version,
      projection.passport_snapshot_ref,
      projection.status,
      projection.reason_code,
      JSON.stringify(projection),
      now,
    ],
  );
}

async function loadGatedOpportunities(client: PoolClient, opportunityRefs?: readonly string[]) {
  const result = await client.query<{
    opportunity_ref: string;
    opportunity_version: number;
    contract_version_ref: string;
    contract_hash: string;
    contract_json: unknown;
    policy_ref: string;
    accepted_tags_json: unknown;
  }>(
    `SELECT opportunity.id AS opportunity_ref, opportunity.version AS opportunity_version,
            contract.contract_version_ref, contract.contract_hash, contract.contract_json,
            policy.policy_ref, policy.accepted_tags_json
       FROM opportunities AS opportunity
       JOIN sealed_capability_contracts AS contract
         ON contract.contract_version_ref = opportunity.current_contract_version_ref
       JOIN job_eligibility_match_policies AS policy
         ON policy.opportunity_ref = opportunity.id
      WHERE opportunity.status = 'OPEN'
        AND policy.access_mode = 'EVIDENCE_MATCH_REQUIRED'
        AND ($1::text[] IS NULL OR opportunity.id = ANY($1::text[]))
      ORDER BY opportunity.created_at DESC, opportunity.id`,
    [opportunityRefs === undefined ? null : [...opportunityRefs]],
  );
  return result.rows.map((row) => {
    const contract = isRecord(row.contract_json) ? row.contract_json : {};
    const statements = Array.isArray(contract.capability_areas)
      ? contract.capability_areas.filter((value): value is string => typeof value === "string")
      : [];
    return {
      opportunity_ref: row.opportunity_ref,
      opportunity_version: row.opportunity_version,
      contract_version_ref: row.contract_version_ref,
      contract_hash: row.contract_hash,
      policy_ref: row.policy_ref,
      capabilities: statements.map((statement, index) => ({
        capability_ref: `capability:${row.opportunity_ref}:${index + 1}`,
        statement,
      })),
      accepted_tags: EvidenceRequiredEligibilityMatchPolicySchema.parse({
        schema_version: "eligibility-match-policy@1",
        access_mode: "EVIDENCE_MATCH_REQUIRED",
        taxonomy_version: "eligibility-background-tags@1",
        accepted_tags: row.accepted_tags_json,
      }).accepted_tags,
    };
  });
}

function parseMessage(row: ClaimedRow): ClaimedCandidateEligibilityMessage {
  if (!isRecord(row.payload)) throw new Error("Candidate eligibility outbox payload is invalid.");
  const { matchSetRef, candidateRef, snapshotRef } = row.payload;
  if (
    typeof matchSetRef !== "string" ||
    typeof candidateRef !== "string" ||
    typeof snapshotRef !== "string"
  ) {
    throw new Error("Candidate eligibility outbox payload is incomplete.");
  }
  return {
    messageId: row.message_id,
    eventId: row.event_id,
    correlationId: row.correlation_id,
    matchSetRef,
    candidateRef,
    snapshotRef,
    attempt: row.attempt_count,
    leaseOwner: row.lease_owner,
  };
}

async function assertLease(client: PoolClient, message: ClaimedCandidateEligibilityMessage) {
  const result = await client.query(
    `SELECT 1 FROM outbox_messages
      WHERE message_id = $1 AND lease_owner = $2 AND attempt_count = $3
        AND processed_at IS NULL AND lease_expires_at >= clock_timestamp()
      FOR UPDATE`,
    [message.messageId, message.leaseOwner, message.attempt],
  );
  if (result.rowCount !== 1)
    throw new FunctionalProductApplicationError("STALE_VERSION", "Eligibility lease was lost.");
}

async function markProcessed(
  client: PoolClient,
  message: ClaimedCandidateEligibilityMessage,
  now: Date,
  outcome: string,
) {
  await client.query(
    `INSERT INTO inbox_messages (consumer, message_id, idempotency_key, payload_hash, result_json, processed_at)
     VALUES ('candidate-eligibility-worker', $1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (consumer, message_id) DO NOTHING`,
    [message.messageId, message.messageId, sha256(message), JSON.stringify({ outcome }), now],
  );
  const result = await client.query(
    `UPDATE outbox_messages SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
      WHERE message_id = $2 AND lease_owner = $3 AND attempt_count = $4 AND processed_at IS NULL`,
    [now, message.messageId, message.leaseOwner, message.attempt],
  );
  if (result.rowCount !== 1)
    throw new FunctionalProductApplicationError("STALE_VERSION", "Eligibility message changed.");
}

export class PostgresCandidateEligibilityStore
  implements CandidateEligibilityStore, CandidateEligibilityWorkerStore
{
  public constructor(
    private readonly pool: Pool,
    private readonly functionalStore: PostgresFunctionalProductStore,
  ) {}

  public async getProjection(candidateRef: string): Promise<CandidateEligibilityProjection> {
    const client = await this.pool.connect();
    try {
      return loadProjection(client, candidateRef, await databaseNow(client));
    } finally {
      client.release();
    }
  }

  public async getCandidateOpportunityFeed(candidateRef: string) {
    const [base, projection] = await Promise.all([
      this.functionalStore.getCandidateOpportunityFeed(candidateRef),
      this.getProjection(candidateRef),
    ]);
    const snapshotRef = projection.passport_snapshot_ref;
    const accessRows = await this.pool.query<{
      opportunity_ref: string;
      access_mode: EligibilityMatchPolicy["access_mode"];
      match_ref: string | null;
      match_version: number | null;
      state: string | null;
      match_json: unknown;
      recorded_live: boolean | null;
    }>(
      `SELECT policy.opportunity_ref, policy.access_mode,
              match.match_ref, match.match_version, match.state, match.match_json,
              match.recorded_live
         FROM job_eligibility_match_policies AS policy
         LEFT JOIN LATERAL (
           SELECT candidate_match.match_ref, candidate_match.match_version,
                  candidate_match.state, candidate_match.match_json,
                  candidate_match.recorded_live
             FROM candidate_job_eligibility_matches AS candidate_match
             JOIN opportunities AS current_opportunity
               ON current_opportunity.id = candidate_match.opportunity_ref
            WHERE candidate_match.candidate_ref = $1
              AND candidate_match.passport_snapshot_ref = $2
              AND candidate_match.opportunity_ref = policy.opportunity_ref
              AND candidate_match.opportunity_version = current_opportunity.version
              AND candidate_match.contract_version_ref = current_opportunity.current_contract_version_ref
            ORDER BY candidate_match.created_at DESC, candidate_match.match_ref DESC
            LIMIT 1
         ) AS match ON true`,
      [candidateRef, snapshotRef],
    );
    const accessByOpportunity = new Map(accessRows.rows.map((row) => [row.opportunity_ref, row]));
    const active = (state: string) =>
      new Set([
        "WAITING_FOR_BACKED_SLOT",
        "BACKED_OFFERED",
        "APPLICATION_ACTIVE",
        "APPLICATION_SUBMITTED",
        "REVIEWED",
        "EMPLOYER_BREACH",
      ]).has(state);
    const opportunities = base.opportunities.flatMap((job) => {
      const row = accessByOpportunity.get(job.opportunity_ref);
      const activeJourney = active(job.interest_state) || job.active_answer_session_ref !== null;
      const open = row?.access_mode === "OPEN_TO_ALL";
      const positive = row?.state === "POSITIVE_EVIDENCE";
      if (!open && !positive && !activeJourney) return [];
      const match = positive ? CandidateEligibilityJobMatchSchema.parse(row?.match_json) : null;
      const connections = match?.connections ?? [];
      return [
        CandidateJobCardV3Schema.parse({
          ...job,
          schema_version: "candidate-job-card@3",
          eligibility_access: {
            access_basis:
              activeJourney && !open && !positive
                ? "ACTIVE_JOURNEY_PIN"
                : open
                  ? "OPEN_TO_ALL"
                  : "AI_POSITIVE_EVIDENCE",
            match_ref: positive ? row?.match_ref : null,
            match_version: positive ? row?.match_version : null,
            why: open
              ? "This Recruiter sealed the role as open without a background-evidence gate."
              : activeJourney && !positive
                ? "Your existing Interest or Application keeps its original access pin."
                : connections.map((connection) => connection.bounded_reason).join(" "),
            evidence_refs: [
              ...new Set(connections.flatMap((connection) => connection.evidence_refs)),
            ],
            tag_refs: [...new Set(connections.map((connection) => connection.tag_ref))],
            still_unknown: [
              ...new Set(connections.flatMap((connection) => connection.still_unknown)),
            ],
            recorded_live: row?.recorded_live === true,
          },
        }),
      ];
    });
    return CandidateOpportunityFeedV3Schema.parse({
      schema_version: "candidate-opportunity-feed@3",
      candidate_ref: candidateRef,
      credit: base.credit,
      eligibility_status: projection.status,
      eligibility_snapshot_ref: snapshotRef,
      opportunities,
    });
  }

  public async getCandidateJobDetail(candidateRef: string, opportunityRef: string) {
    const feed = await this.getCandidateOpportunityFeed(candidateRef);
    const card = feed.opportunities.find((job) => job.opportunity_ref === opportunityRef);
    if (card === undefined) return null;
    const detail = await this.functionalStore.getCandidateJobDetail(candidateRef, opportunityRef);
    if (detail === null) return null;
    return CandidateJobDetailV2Schema.parse({
      ...detail,
      schema_version: "candidate-job-detail@2",
      eligibility_access: card.eligibility_access,
    });
  }

  public async refresh(input: Parameters<CandidateEligibilityStore["refresh"]>[0]) {
    return transaction(this.pool, async (client, now) => {
      const candidateRef = input.context.actor.actorId;
      const commandType = "RefreshCandidateEligibility";
      const fingerprint = sha256({
        command_type: commandType,
        candidate_ref: candidateRef,
        command: input.command,
      });
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `candidate-eligibility-command:${candidateRef}:${input.context.idempotencyKey}`,
      ]);
      const existingReceipt = await client.query<ReceiptRow>(
        `SELECT command_fingerprint, command_type, receipt_json
           FROM blind_review_command_receipts
          WHERE actor_ref = $1 AND idempotency_key = $2`,
        [candidateRef, input.context.idempotencyKey],
      );
      const priorReceipt = existingReceipt.rows[0];
      if (priorReceipt !== undefined) {
        if (
          priorReceipt.command_type !== commandType ||
          priorReceipt.command_fingerprint !== fingerprint
        ) {
          throw new FunctionalProductApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "The Idempotency-Key was already used for another command.",
          );
        }
        return CandidateEligibilityProjectionSchema.parse(priorReceipt.receipt_json);
      }
      const commandId = input.ids.nextId("command");
      const recordReceipt = async (receipt: CandidateEligibilityProjection): Promise<void> => {
        await client.query(
          `INSERT INTO blind_review_command_receipts (
             actor_ref, idempotency_key, command_id, command_fingerprint,
             command_type, receipt_json, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          [
            candidateRef,
            input.context.idempotencyKey,
            commandId,
            fingerprint,
            commandType,
            JSON.stringify(receipt),
            now,
          ],
        );
      };
      const prior = await loadProjection(client, candidateRef, now, true);
      if (prior.projection_version !== input.command.expected_projection_version) {
        throw new FunctionalProductApplicationError(
          "STALE_VERSION",
          "Eligibility projection changed.",
        );
      }
      const snapshotResult = await client.query<{ snapshot_ref: string }>(
        `SELECT snapshot_ref FROM candidate_evidence_passport_snapshots
          WHERE candidate_ref = $1 ORDER BY snapshot_version DESC LIMIT 1`,
        [candidateRef],
      );
      const snapshotRef = snapshotResult.rows[0]?.snapshot_ref;
      if (snapshotRef === undefined)
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "Publish an Evidence Passport before matching.",
        );
      const jobs = await loadGatedOpportunities(client);
      const existing = await client.query<{ opportunity_ref: string }>(
        `SELECT match.opportunity_ref
           FROM candidate_job_eligibility_matches AS match
           JOIN opportunities AS opportunity ON opportunity.id = match.opportunity_ref
          WHERE match.candidate_ref = $1 AND match.passport_snapshot_ref = $2
            AND match.opportunity_version = opportunity.version
            AND match.contract_version_ref = opportunity.current_contract_version_ref`,
        [candidateRef, snapshotRef],
      );
      const covered = new Set(existing.rows.map((row) => row.opportunity_ref));
      const missing = jobs.filter((job) => !covered.has(job.opportunity_ref));
      if (missing.length === 0) {
        const ready = CandidateEligibilityProjectionSchema.parse({
          ...prior,
          status: "READY",
          passport_snapshot_ref: snapshotRef,
          projection_version: prior.projection_version + 1,
          reason_code: null,
          updated_at: now.toISOString(),
        });
        await writeProjection(client, ready, now);
        await recordReceipt(ready);
        return ready;
      }
      const matchSetRef = input.ids.nextId("eligibility-match-set");
      const eventId = input.ids.nextId("event");
      const jobHash = sha256(
        missing.map((job) => ({
          opportunity_ref: job.opportunity_ref,
          contract_hash: job.contract_hash,
        })),
      );
      await client.query(
        `INSERT INTO candidate_eligibility_match_sets (
           match_set_ref, candidate_ref, passport_snapshot_ref, job_set_hash, status, created_at
         ) VALUES ($1, $2, $3, $4, 'MATCHING', $5)`,
        [matchSetRef, candidateRef, snapshotRef, jobHash, now],
      );
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'CandidateEligibilityRefreshRequested', 1,
                   'CandidateEligibilityMatchSet', $2, 1, $3, $4, $5::jsonb)`,
        [
          eventId,
          matchSetRef,
          input.context.correlationId,
          now,
          JSON.stringify({
            candidate_ref: candidateRef,
            snapshot_ref: snapshotRef,
            opportunity_refs: missing.map((job) => job.opportunity_ref),
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'CandidateEligibilityRequested', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          input.ids.nextId("outbox"),
          eventId,
          `CandidateEligibilityRequested:${matchSetRef}`,
          input.context.correlationId,
          JSON.stringify({
            matchSetRef,
            candidateRef,
            snapshotRef,
            opportunityRefs: missing.map((job) => job.opportunity_ref),
          }),
          now,
        ],
      );
      const projection = CandidateEligibilityProjectionSchema.parse({
        ...prior,
        status: "MATCHING",
        passport_snapshot_ref: snapshotRef,
        projection_version: prior.projection_version + 1,
        reason_code: null,
        updated_at: now.toISOString(),
      });
      await writeProjection(client, projection, now);
      await recordReceipt(projection);
      return projection;
    });
  }

  public async claimNext(workerId: string, leaseDurationSeconds: number) {
    return transaction(this.pool, async (client) => {
      const result = await client.query<ClaimedRow>(
        `WITH next_message AS (
           SELECT message_id FROM outbox_messages
            WHERE processed_at IS NULL AND available_at <= clock_timestamp()
              AND message_type = 'CandidateEligibilityRequested'
              AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
            ORDER BY available_at, created_at, message_id
            FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE outbox_messages AS message
            SET lease_owner = $1,
                lease_expires_at = clock_timestamp() + ($2 * interval '1 second'),
                attempt_count = message.attempt_count + 1
           FROM next_message WHERE message.message_id = next_message.message_id
         RETURNING message.message_id, message.event_id, message.correlation_id,
                   message.payload, message.attempt_count, message.lease_owner`,
        [workerId, leaseDurationSeconds],
      );
      return result.rows[0] === undefined ? null : parseMessage(result.rows[0]);
    });
  }

  public async loadInput(message: ClaimedCandidateEligibilityMessage, requestRef: string) {
    const result = await this.pool.query<{
      status: string;
      snapshot_hash: string;
      education_json: unknown;
      evidence_json: unknown;
      payload: unknown;
    }>(
      `SELECT match_set.status, snapshot.snapshot_hash, snapshot.education_json,
              snapshot.evidence_json, outbox.payload
         FROM candidate_eligibility_match_sets AS match_set
         JOIN candidate_evidence_passport_snapshots AS snapshot
           ON snapshot.snapshot_ref = match_set.passport_snapshot_ref
         JOIN outbox_messages AS outbox ON outbox.message_id = $4
        WHERE match_set.match_set_ref = $1 AND match_set.candidate_ref = $2
          AND match_set.passport_snapshot_ref = $3`,
      [message.matchSetRef, message.candidateRef, message.snapshotRef, message.messageId],
    );
    const source = result.rows[0];
    if (source === undefined || source.status !== "MATCHING" || !isRecord(source.payload))
      return null;
    const refs = Array.isArray(source.payload.opportunityRefs)
      ? source.payload.opportunityRefs.filter((value): value is string => typeof value === "string")
      : undefined;
    const client = await this.pool.connect();
    try {
      const opportunities = await loadGatedOpportunities(client, refs);
      if (opportunities.length === 0) return null;
      const education = CandidateEducationRecordSchema.parse(source.education_json);
      const evidence = CandidateEvidenceItemSchema.array().parse(
        source.evidence_json,
      ) as CandidateEvidenceItem[];
      return CandidateEligibilityMatchInputSchema.parse({
        schema_version: "candidate-eligibility-match-input@1",
        request_ref: requestRef,
        candidate_ref: message.candidateRef,
        passport_snapshot_ref: message.snapshotRef,
        passport_snapshot_hash: source.snapshot_hash,
        education: {
          education_ref: education.education_ref,
          level: education.level,
          status: education.status,
          field_of_study: education.field_of_study,
          graduation_date: education.graduation_date,
          source_sha256: education.source_sha256,
          verification_state: education.verification_state,
        },
        evidence: evidence.map((item) => ({
          evidence_ref: item.evidence_ref,
          kind: item.kind,
          verification_state: item.verification_state,
          sanitized_summary: item.bounded_summary,
          sanitized_contribution: item.contribution_summary,
          occurred_from: item.occurred_from,
          occurred_to: item.occurred_to,
          source_sha256: item.source_sha256,
        })),
        opportunities: opportunities.map((opportunity) => ({
          opportunity_ref: opportunity.opportunity_ref,
          opportunity_version: opportunity.opportunity_version,
          contract_hash: opportunity.contract_hash,
          capabilities: opportunity.capabilities,
          accepted_tags: opportunity.accepted_tags,
        })),
      });
    } finally {
      client.release();
    }
  }

  public async startRequest(input: Parameters<CandidateEligibilityWorkerStore["startRequest"]>[0]) {
    await transaction(this.pool, async (client, now) => {
      await assertLease(client, input.message);
      await client.query(
        `INSERT INTO hiring_intelligence_requests (
           id, operation, aggregate_version, runtime_mode, prompt_id, prompt_version,
           prompt_hash, input_schema_version, output_schema_version, input_hash,
           input_json, idempotency_key, status, attempt_count, next_attempt_at,
           created_at, candidate_ref, candidate_passport_snapshot_ref
         ) VALUES ($1, 'deriveCandidateEligibilityMatches', 1, 'LIVE', $2, $3, $4, $5,
                   $6, $7, $8::jsonb, $9, 'RUNNING', $10, $11, $11, $12, $13)`,
        [
          input.requestRef,
          input.prompt.promptId,
          input.prompt.promptVersion,
          input.prompt.promptHash,
          input.prompt.inputSchemaVersion,
          input.prompt.outputSchemaVersion,
          input.inputHash,
          JSON.stringify(input.input),
          `deriveCandidateEligibilityMatches:${input.message.matchSetRef}:${input.message.attempt}`,
          input.message.attempt,
          now,
          input.message.candidateRef,
          input.message.snapshotRef,
        ],
      );
      const updated = await client.query(
        `UPDATE candidate_eligibility_match_sets SET ai_request_ref = $1
          WHERE match_set_ref = $2 AND status = 'MATCHING'`,
        [input.requestRef, input.message.matchSetRef],
      );
      if (updated.rowCount !== 1)
        throw new FunctionalProductApplicationError("STALE_VERSION", "Eligibility set changed.");
      await client.query(
        `INSERT INTO ai_model_runs (
           id, request_id, attempt, adapter_id, requested_model, prompt_id,
           prompt_version, prompt_hash, input_schema_version, output_schema_version,
           client_request_id, status, input_bytes, started_at
         ) VALUES ($1, $2, $3, 'openai-responses-candidate-eligibility@1', 'gpt-5.6-sol',
                   $4, $5, $6, $7, $8, $9, 'RUNNING', $10, $11)`,
        [
          input.runRef,
          input.requestRef,
          input.message.attempt,
          input.prompt.promptId,
          input.prompt.promptVersion,
          input.prompt.promptHash,
          input.prompt.inputSchemaVersion,
          input.prompt.outputSchemaVersion,
          input.clientRequestId,
          Buffer.byteLength(canonicalJson(input.input), "utf8"),
          now,
        ],
      );
      await client.query(
        `INSERT INTO ai_source_refs (request_id, source_ref, source_kind, sha256)
         VALUES ($1, $2, 'EDUCATION', $3)`,
        [
          input.requestRef,
          input.input.education.education_ref,
          input.input.education.source_sha256,
        ],
      );
      for (const evidence of input.input.evidence) {
        await client.query(
          `INSERT INTO ai_source_refs (request_id, source_ref, source_kind, sha256)
           VALUES ($1, $2, $3, $4)`,
          [input.requestRef, evidence.evidence_ref, evidence.kind, evidence.source_sha256],
        );
      }
      for (const opportunity of input.input.opportunities) {
        await client.query(
          `INSERT INTO ai_source_refs (request_id, source_ref, source_kind, sha256)
           VALUES ($1, $2, 'job_contract', $3)`,
          [input.requestRef, opportunity.opportunity_ref, opportunity.contract_hash],
        );
      }
    });
  }

  public async completeRequest(
    input: Parameters<CandidateEligibilityWorkerStore["completeRequest"]>[0],
  ) {
    return transaction(this.pool, async (client, now) => {
      await assertLease(client, input.message);
      const latest = await client.query<{ snapshot_ref: string }>(
        `SELECT snapshot_ref FROM candidate_evidence_passport_snapshots
          WHERE candidate_ref = $1 ORDER BY snapshot_version DESC LIMIT 1`,
        [input.message.candidateRef],
      );
      const currentJobs = await loadGatedOpportunities(
        client,
        input.input.opportunities.map((job) => job.opportunity_ref),
      );
      const currentByRef = new Map(currentJobs.map((job) => [job.opportunity_ref, job]));
      const superseded =
        latest.rows[0]?.snapshot_ref !== input.message.snapshotRef ||
        input.input.opportunities.some(
          (job) => currentByRef.get(job.opportunity_ref)?.contract_hash !== job.contract_hash,
        );
      await client.query(
        `INSERT INTO ai_outputs (id, request_id, output_schema_version, validated_json,
          output_hash, validation_policy_version, created_at)
         VALUES ($1, $2, 'candidate-eligibility-match-output@1', $3::jsonb, $4,
                 'candidate-eligibility-output-policy@1', $5)`,
        [input.outputRef, input.requestRef, JSON.stringify(input.output), input.outputHash, now],
      );
      await client.query(
        `UPDATE ai_model_runs SET resolved_model = $1, provider_response_id = $2,
           status = 'SUCCEEDED', output_bytes = $3, completed_at = $4
          WHERE id = $5 AND request_id = $6`,
        [
          input.resolvedModel,
          input.providerResponseId,
          Buffer.byteLength(canonicalJson(input.output), "utf8"),
          now,
          input.runRef,
          input.requestRef,
        ],
      );
      if (superseded) {
        await client.query(
          `UPDATE hiring_intelligence_requests SET status = 'SUPERSEDED', completed_at = $1 WHERE id = $2`,
          [now, input.requestRef],
        );
        await client.query(
          `UPDATE candidate_eligibility_match_sets SET ai_output_ref = $1, status = 'SUPERSEDED', reason_code = 'INPUT_SUPERSEDED', completed_at = $2 WHERE match_set_ref = $3`,
          [input.outputRef, now, input.message.matchSetRef],
        );
        const prior = await loadProjection(client, input.message.candidateRef, now, true);
        await writeProjection(
          client,
          CandidateEligibilityProjectionSchema.parse({
            ...prior,
            status: "STALE",
            projection_version: prior.projection_version + 1,
            reason_code: "INPUT_SUPERSEDED",
            updated_at: now.toISOString(),
          }),
          now,
        );
        await markProcessed(client, input.message, now, "superseded");
        return "SUPERSEDED" as const;
      }
      const jobs = new Map(input.input.opportunities.map((job) => [job.opportunity_ref, job]));
      for (const match of input.output.matches) {
        const job = jobs.get(match.opportunity_ref);
        const current = currentByRef.get(match.opportunity_ref);
        if (job === undefined || current === undefined)
          throw new Error("Validated eligibility match lost its Job pin.");
        await client.query(
          `INSERT INTO candidate_job_eligibility_matches (
             match_ref, match_set_ref, candidate_ref, passport_snapshot_ref,
             opportunity_ref, opportunity_version, contract_version_ref, contract_hash,
             policy_ref, state, match_json, output_hash, recorded_live, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, false, $13)`,
          [
            input.ids.nextId("eligibility-match"),
            input.message.matchSetRef,
            input.message.candidateRef,
            input.message.snapshotRef,
            match.opportunity_ref,
            job.opportunity_version,
            current.contract_version_ref,
            job.contract_hash,
            current.policy_ref,
            match.state,
            JSON.stringify(match),
            sha256(match),
            now,
          ],
        );
      }
      await client.query(
        `UPDATE hiring_intelligence_requests SET status = 'SUCCEEDED', completed_at = $1 WHERE id = $2`,
        [now, input.requestRef],
      );
      await client.query(
        `UPDATE candidate_eligibility_match_sets SET ai_output_ref = $1, status = 'READY', completed_at = $2 WHERE match_set_ref = $3`,
        [input.outputRef, now, input.message.matchSetRef],
      );
      const coverage = await client.query<{ gated_count: string; match_count: string }>(
        `SELECT
           (SELECT COUNT(*) FROM job_eligibility_match_policies policy
             JOIN opportunities opportunity ON opportunity.id = policy.opportunity_ref
            WHERE policy.access_mode = 'EVIDENCE_MATCH_REQUIRED' AND opportunity.status = 'OPEN')::text AS gated_count,
           (SELECT COUNT(DISTINCT match.opportunity_ref)
              FROM candidate_job_eligibility_matches match
              JOIN opportunities opportunity ON opportunity.id = match.opportunity_ref
             WHERE match.candidate_ref = $1 AND match.passport_snapshot_ref = $2
               AND match.opportunity_version = opportunity.version
               AND match.contract_version_ref = opportunity.current_contract_version_ref)::text AS match_count`,
        [input.message.candidateRef, input.message.snapshotRef],
      );
      const ready =
        Number(coverage.rows[0]?.gated_count ?? 0) === Number(coverage.rows[0]?.match_count ?? -1);
      const prior = await loadProjection(client, input.message.candidateRef, now, true);
      await writeProjection(
        client,
        CandidateEligibilityProjectionSchema.parse({
          ...prior,
          status: ready ? "READY" : "PARTIAL",
          passport_snapshot_ref: input.message.snapshotRef,
          projection_version: prior.projection_version + 1,
          reason_code: null,
          updated_at: now.toISOString(),
        }),
        now,
      );
      await markProcessed(client, input.message, now, "ready");
      return "SUCCEEDED" as const;
    });
  }

  public async failRequest(input: Parameters<CandidateEligibilityWorkerStore["failRequest"]>[0]) {
    await transaction(this.pool, async (client, now) => {
      await assertLease(client, input.message);
      if (input.runRef !== null) {
        await client.query(
          `UPDATE ai_model_runs SET status = $1, error_code = $2, completed_at = $3 WHERE id = $4`,
          [
            input.status === "NEEDS_HUMAN" ? "NEEDS_HUMAN" : "FAILED_PERMANENT",
            input.errorCode,
            now,
            input.runRef,
          ],
        );
      }
      if (input.requestRef !== null) {
        await client.query(
          `UPDATE hiring_intelligence_requests SET status = $1, completed_at = $2 WHERE id = $3`,
          [input.status, now, input.requestRef],
        );
      }
      await client.query(
        `UPDATE candidate_eligibility_match_sets SET status = $1, reason_code = $2, completed_at = $3 WHERE match_set_ref = $4`,
        [
          input.status === "NEEDS_HUMAN" ? "NEEDS_HUMAN" : "FAILED",
          input.errorCode,
          now,
          input.message.matchSetRef,
        ],
      );
      const prior = await loadProjection(client, input.message.candidateRef, now, true);
      await writeProjection(
        client,
        CandidateEligibilityProjectionSchema.parse({
          ...prior,
          status: "FAILED",
          projection_version: prior.projection_version + 1,
          reason_code: input.errorCode,
          updated_at: now.toISOString(),
        }),
        now,
      );
      await markProcessed(client, input.message, now, "failed");
    });
  }

  public async retryRequest(input: Parameters<CandidateEligibilityWorkerStore["retryRequest"]>[0]) {
    await transaction(this.pool, async (client) => {
      await assertLease(client, input.message);
      await client.query(
        `UPDATE ai_model_runs SET status = 'FAILED_RETRYABLE', error_code = $1, completed_at = clock_timestamp() WHERE id = $2`,
        [input.errorCode, input.runRef],
      );
      await client.query(
        `UPDATE hiring_intelligence_requests SET status = 'RETRYABLE', next_attempt_at = $1 WHERE id = $2`,
        [input.retryAt, input.requestRef],
      );
      await client.query(
        `UPDATE outbox_messages SET available_at = $1, lease_owner = NULL, lease_expires_at = NULL WHERE message_id = $2`,
        [input.retryAt, input.message.messageId],
      );
    });
  }

  public async markProcessed(message: ClaimedCandidateEligibilityMessage) {
    await transaction(this.pool, async (client, now) =>
      markProcessed(client, message, now, "stale"),
    );
  }
}
