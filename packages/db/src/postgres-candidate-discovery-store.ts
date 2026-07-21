import { createHash } from "node:crypto";

import {
  FunctionalProductApplicationError,
  type CandidateDiscoveryWorkerStore,
  type CandidateEvidencePassportStore,
  type ClaimedCandidateDiscoveryMessage,
} from "@onlyboth/application";
import {
  CandidateEvidenceItemSchema,
  CandidateEducationRecordSchema,
  CandidateEvidencePassportProjectionSchema,
  CandidateEvidencePassportReceiptSchema,
  CandidateEligibilityProjectionSchema,
  CandidateJobDiscoveryInputSchema,
  CandidateJobDiscoveryProjectionSchema,
  CandidateJobDiscoverySignalSchema,
  CandidateJobCardV2Schema,
  CandidateOpportunityFeedV2Schema,
  PublicOpportunityProjectionSchema,
  type CandidateEvidenceItem,
  type CandidateEducationRecord,
  type CandidateEvidencePassportProjection,
  type CandidateEvidencePassportReceipt,
  type CandidateJobDiscoveryInput,
} from "@onlyboth/contracts";
import type { Pool, PoolClient } from "pg";

import type { PostgresFunctionalProductStore } from "./postgres-functional-product-store";

interface ReceiptRow {
  readonly command_fingerprint: string;
  readonly command_type: string;
  readonly receipt_json: unknown;
}

interface ClaimedRow {
  readonly message_id: string;
  readonly event_id: string;
  readonly correlation_id: string;
  readonly payload: unknown;
  readonly attempt_count: number;
  readonly lease_owner: string;
}

interface OpenOpportunity {
  readonly opportunity_ref: string;
  readonly opportunity_version: number;
  readonly contract_hash: string;
  readonly public_role_summary: string;
  readonly capabilities: readonly {
    readonly capability_ref: string;
    readonly statement: string;
  }[];
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

async function findReceipt(
  client: PoolClient,
  candidateRef: string,
  idempotencyKey: string,
  commandType: string,
  fingerprint: string,
): Promise<unknown | null> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `candidate-discovery-command:${candidateRef}:${idempotencyKey}`,
  ]);
  const result = await client.query<ReceiptRow>(
    `SELECT command_fingerprint, command_type, receipt_json
       FROM blind_review_command_receipts
      WHERE actor_ref = $1 AND idempotency_key = $2`,
    [candidateRef, idempotencyKey],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  if (row.command_type !== commandType || row.command_fingerprint !== fingerprint) {
    throw new FunctionalProductApplicationError(
      "IDEMPOTENCY_CONFLICT",
      "The Idempotency-Key was already used for another command.",
    );
  }
  return row.receipt_json;
}

async function insertReceipt(
  client: PoolClient,
  input: {
    readonly actorRef: string;
    readonly idempotencyKey: string;
    readonly commandId: string;
    readonly commandType: string;
    readonly fingerprint: string;
    readonly receipt: unknown;
    readonly occurredAt: Date;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO blind_review_command_receipts (
       actor_ref, idempotency_key, command_id, command_fingerprint,
       command_type, receipt_json, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      input.actorRef,
      input.idempotencyKey,
      input.commandId,
      input.fingerprint,
      input.commandType,
      JSON.stringify(input.receipt),
      input.occurredAt,
    ],
  );
}

async function loadOpenOpportunities(client: PoolClient): Promise<readonly OpenOpportunity[]> {
  const result = await client.query<{
    opportunity_ref: string;
    opportunity_version: number;
    contract_hash: string;
    contract_json: unknown;
    projection_json: unknown;
  }>(
    `SELECT opportunity.id AS opportunity_ref, opportunity.version AS opportunity_version,
            contract.contract_hash, contract.contract_json, public.projection_json
       FROM opportunities AS opportunity
       JOIN sealed_capability_contracts AS contract
         ON contract.contract_version_ref = opportunity.current_contract_version_ref
       JOIN public_opportunity_projections AS public
         ON public.opportunity_ref = opportunity.id
       JOIN blind_review_commitments AS commitment
         ON commitment.opportunity_ref = opportunity.id AND commitment.state = 'ACTIVE'
      WHERE opportunity.status = 'OPEN'
      ORDER BY opportunity.created_at DESC, opportunity.id`,
  );
  return result.rows.map((row) => {
    const projection = PublicOpportunityProjectionSchema.parse(row.projection_json);
    const contract = isRecord(row.contract_json) ? row.contract_json : {};
    const rawCapabilities = Array.isArray(contract.capability_areas)
      ? contract.capability_areas
      : projection.capability_area_preview;
    const statements = rawCapabilities.filter(
      (value): value is string => typeof value === "string" && value.trim().length >= 2,
    );
    return {
      opportunity_ref: row.opportunity_ref,
      opportunity_version: row.opportunity_version,
      contract_hash: row.contract_hash,
      public_role_summary: projection.public_role_summary,
      capabilities: statements.map((statement, index) => ({
        capability_ref: `capability:${row.opportunity_ref}:${index + 1}`,
        statement,
      })),
    };
  });
}

function jobSetHash(opportunities: readonly OpenOpportunity[]): string {
  return sha256(
    opportunities.map((item) => ({
      opportunity_ref: item.opportunity_ref,
      opportunity_version: item.opportunity_version,
      contract_hash: item.contract_hash,
    })),
  );
}

function emptyProjection(candidateRef: string, now: Date): CandidateEvidencePassportProjection {
  const iso = now.toISOString();
  return CandidateEvidencePassportProjectionSchema.parse({
    schema_version: "candidate-evidence-passport-projection@2",
    candidate_ref: candidateRef,
    projection_version: 1,
    current_draft: {
      schema_version: "candidate-evidence-passport-draft@2",
      candidate_ref: candidateRef,
      draft_version: 0,
      education: null,
      evidence_items: [],
      has_unpublished_changes: false,
      updated_at: iso,
    },
    last_published_snapshot: null,
    discovery: {
      status: "STALE",
      current_signal_set_ref: null,
      last_ready_signal_set_ref: null,
      job_set_hash: null,
      synthetic_preloaded: false,
      reason_code: "PASSPORT_NOT_PUBLISHED",
      updated_at: iso,
    },
    disclosure:
      "Synthetic Evidence Passport — Candidate-only discovery input; not employer-visible.",
  });
}

function evidenceItems(value: unknown): readonly CandidateEvidenceItem[] {
  return CandidateEvidenceItemSchema.array().max(20).parse(value);
}

function educationRecord(value: unknown): CandidateEducationRecord {
  return CandidateEducationRecordSchema.parse(value);
}

export function buildCandidateDiscoveryEvidencePriority(
  education: CandidateEducationRecord,
  publishedAt: Date,
) {
  const asOfDate = publishedAt.toISOString().slice(0, 10);
  if (education.level === "NO_FORMAL_DEGREE" || education.graduation_date === null) {
    return {
      policy_version: "candidate-discovery-evidence-priority@1" as const,
      as_of_date: asOfDate,
      graduation_recency: "NO_FORMAL_DEGREE" as const,
      ordered_evidence_groups: ["WORK_AND_CREDENTIALS", "OTHER", "EDUCATION"] as const,
    };
  }
  const threshold = new Date(publishedAt);
  threshold.setUTCFullYear(threshold.getUTCFullYear() - 2);
  const withinTwoYears = education.graduation_date >= threshold.toISOString().slice(0, 10);
  return {
    policy_version: "candidate-discovery-evidence-priority@1" as const,
    as_of_date: asOfDate,
    graduation_recency: withinTwoYears
      ? ("WITHIN_TWO_YEARS" as const)
      : ("OVER_TWO_YEARS" as const),
    ordered_evidence_groups: withinTwoYears
      ? (["EDUCATION", "WORK_AND_CREDENTIALS", "OTHER"] as const)
      : (["WORK_AND_CREDENTIALS", "OTHER", "EDUCATION"] as const),
  };
}

async function loadProjection(
  client: PoolClient,
  candidateRef: string,
  now: Date,
  lock = false,
): Promise<CandidateEvidencePassportProjection> {
  const result = await client.query<{ projection_json: unknown }>(
    `SELECT projection_json FROM candidate_discovery_projections
      WHERE candidate_ref = $1${lock ? " FOR UPDATE" : ""}`,
    [candidateRef],
  );
  return result.rows[0] === undefined
    ? emptyProjection(candidateRef, now)
    : CandidateEvidencePassportProjectionSchema.parse(result.rows[0].projection_json);
}

async function writeProjection(
  client: PoolClient,
  projection: CandidateEvidencePassportProjection,
  now: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO candidate_discovery_projections (
       candidate_ref, projection_version, projection_json, updated_at
     ) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (candidate_ref) DO UPDATE
       SET projection_version = EXCLUDED.projection_version,
           projection_json = EXCLUDED.projection_json,
           updated_at = EXCLUDED.updated_at`,
    [projection.candidate_ref, projection.projection_version, JSON.stringify(projection), now],
  );
}

async function appendEvent(
  client: PoolClient,
  input: {
    readonly eventId: string;
    readonly type: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly version: number;
    readonly correlationId: string;
    readonly now: Date;
    readonly payload: unknown;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO domain_events (
       event_id, event_type, event_version, aggregate_type, aggregate_id,
       aggregate_version, correlation_id, occurred_at, payload
     ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      input.eventId,
      input.type,
      input.aggregateType,
      input.aggregateId,
      input.version,
      input.correlationId,
      input.now,
      JSON.stringify(input.payload),
    ],
  );
}

async function enqueueDiscovery(
  client: PoolClient,
  input: {
    readonly messageId: string;
    readonly eventId: string;
    readonly correlationId: string;
    readonly signalSetRef: string;
    readonly candidateRef: string;
    readonly snapshotRef: string;
    readonly now: Date;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_messages (
       message_id, message_type, message_version, event_id, idempotency_key,
       correlation_id, payload, available_at
     ) VALUES ($1, 'CandidateDiscoveryRequested', 1, $2, $3, $4, $5::jsonb, $6)`,
    [
      input.messageId,
      input.eventId,
      `CandidateDiscoveryRequested:${input.signalSetRef}`,
      input.correlationId,
      JSON.stringify({
        signalSetRef: input.signalSetRef,
        candidateRef: input.candidateRef,
        snapshotRef: input.snapshotRef,
      }),
      input.now,
    ],
  );
}

function parseClaimed(row: ClaimedRow): ClaimedCandidateDiscoveryMessage {
  if (!isRecord(row.payload)) throw new Error("Candidate discovery outbox payload is invalid.");
  const { signalSetRef, candidateRef, snapshotRef } = row.payload;
  if (
    typeof signalSetRef !== "string" ||
    typeof candidateRef !== "string" ||
    typeof snapshotRef !== "string"
  ) {
    throw new Error("Candidate discovery outbox payload is incomplete.");
  }
  return {
    messageId: row.message_id,
    eventId: row.event_id,
    correlationId: row.correlation_id,
    signalSetRef,
    candidateRef,
    snapshotRef,
    attempt: row.attempt_count,
    leaseOwner: row.lease_owner,
  };
}

async function assertLease(
  client: PoolClient,
  message: ClaimedCandidateDiscoveryMessage,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM outbox_messages
      WHERE message_id = $1 AND lease_owner = $2 AND attempt_count = $3
        AND processed_at IS NULL AND lease_expires_at >= clock_timestamp()
      FOR UPDATE`,
    [message.messageId, message.leaseOwner, message.attempt],
  );
  if (result.rowCount !== 1) {
    throw new FunctionalProductApplicationError("STALE_VERSION", "Discovery lease was lost.");
  }
}

async function markProcessed(
  client: PoolClient,
  message: ClaimedCandidateDiscoveryMessage,
  now: Date,
  outcome: string,
): Promise<void> {
  await client.query(
    `INSERT INTO inbox_messages (
       consumer, message_id, idempotency_key, payload_hash, result_json, processed_at
     ) VALUES ('candidate-discovery-worker', $1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (consumer, message_id) DO NOTHING`,
    [message.messageId, message.messageId, sha256(message), JSON.stringify({ outcome }), now],
  );
  const result = await client.query(
    `UPDATE outbox_messages
        SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
      WHERE message_id = $2 AND lease_owner = $3 AND attempt_count = $4
        AND processed_at IS NULL`,
    [now, message.messageId, message.leaseOwner, message.attempt],
  );
  if (result.rowCount !== 1) {
    throw new FunctionalProductApplicationError("STALE_VERSION", "Discovery message changed.");
  }
}

export class PostgresCandidateDiscoveryStore
  implements CandidateEvidencePassportStore, CandidateDiscoveryWorkerStore
{
  public constructor(
    private readonly pool: Pool,
    private readonly functionalStore: PostgresFunctionalProductStore,
  ) {}

  public async getPassportProjection(candidateRef: string) {
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
      this.getPassportProjection(candidateRef),
    ]);
    const readyRef = projection.discovery.last_ready_signal_set_ref;
    const signalResult =
      readyRef === null
        ? { rows: [] as { opportunity_ref: string; signal_json: unknown }[] }
        : await this.pool.query<{ opportunity_ref: string; signal_json: unknown }>(
            `SELECT opportunity_ref, signal_json
               FROM candidate_job_discovery_signals WHERE signal_set_ref = $1`,
            [readyRef],
          );
    const signals = new Map(signalResult.rows.map((row) => [row.opportunity_ref, row.signal_json]));
    const stale = projection.discovery.status !== "READY";
    const originalOrder = new Map(
      base.opportunities.map((opportunity, index) => [opportunity.opportunity_ref, index]),
    );
    const opportunities = base.opportunities
      .map((job) => {
        const parsed = signals.has(job.opportunity_ref)
          ? CandidateJobDiscoverySignalSchema.parse(signals.get(job.opportunity_ref))
          : null;
        const connections = parsed?.connections ?? [];
        return CandidateJobCardV2Schema.parse({
          ...job,
          schema_version: "candidate-job-card@2",
          discovery: CandidateJobDiscoveryProjectionSchema.parse({
            status: parsed === null ? "NOT_EVALUATED" : stale ? "STALE" : parsed.discovery_band,
            signal_set_ref: parsed === null ? null : readyRef,
            synthetic_preloaded: projection.discovery.synthetic_preloaded,
            why:
              connections.length === 0
                ? null
                : connections.map((connection) => connection.bounded_reason).join(" "),
            evidence_refs: [...new Set(connections.flatMap((item) => item.evidence_refs))],
            capability_refs: [...new Set(connections.map((item) => item.capability_ref))],
            still_unknown: [...new Set(connections.flatMap((item) => item.still_unknown))],
          }),
        });
      })
      .sort((left, right) => {
        const active = (state: string) =>
          ["BACKED_OFFERED", "APPLICATION_ACTIVE", "APPLICATION_SUBMITTED", "REVIEWED"].includes(
            state,
          )
            ? 0
            : 1;
        const band = (status: string) =>
          ({
            EVIDENCE_CONNECTED: 0,
            ADJACENT: 1,
            INSUFFICIENT_SOURCE: 2,
            STALE: 3,
            NOT_EVALUATED: 4,
          })[status] ?? 5;
        return (
          active(left.interest_state) - active(right.interest_state) ||
          band(left.discovery.status) - band(right.discovery.status) ||
          (originalOrder.get(left.opportunity_ref) ?? 0) -
            (originalOrder.get(right.opportunity_ref) ?? 0) ||
          left.opportunity_ref.localeCompare(right.opportunity_ref)
        );
      });
    return CandidateOpportunityFeedV2Schema.parse({
      schema_version: "candidate-opportunity-feed@2",
      candidate_ref: candidateRef,
      credit: base.credit,
      discovery_status: projection.discovery.status,
      discovery_snapshot_ref: projection.last_published_snapshot?.snapshot_ref ?? null,
      opportunities,
    });
  }

  public async saveDraft(
    input: Parameters<CandidateEvidencePassportStore["saveDraft"]>[0],
  ): Promise<CandidateEvidencePassportReceipt> {
    return transaction(this.pool, async (client, now) => {
      const fingerprint = canonicalJson({
        expectedDraftVersion: input.expectedDraftVersion,
        education: input.education,
        evidenceItems: input.evidenceItems,
      });
      const existing = await findReceipt(
        client,
        input.context.actor.actorId,
        input.context.idempotencyKey,
        "SaveCandidateEvidencePassportDraft",
        fingerprint,
      );
      if (existing !== null) return CandidateEvidencePassportReceiptSchema.parse(existing);
      const candidateRef = input.context.actor.actorId;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `candidate-evidence-passport:${candidateRef}`,
      ]);
      const row = await client.query<{ draft_version: number }>(
        `SELECT draft_version FROM candidate_evidence_passport_drafts
          WHERE candidate_ref = $1 FOR UPDATE`,
        [candidateRef],
      );
      const currentVersion = row.rows[0]?.draft_version ?? 0;
      if (currentVersion !== input.expectedDraftVersion) {
        throw new FunctionalProductApplicationError("STALE_VERSION", "Passport Draft changed.");
      }
      const nextVersion = currentVersion + 1;
      const parsedEducation = educationRecord(input.education);
      const parsedItems = evidenceItems(input.evidenceItems);
      await client.query(
        `INSERT INTO candidate_evidence_passport_drafts (
           candidate_ref, draft_version, education_json, evidence_json, updated_at
         ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
         ON CONFLICT (candidate_ref) DO UPDATE
           SET draft_version = EXCLUDED.draft_version,
               education_json = EXCLUDED.education_json,
               evidence_json = EXCLUDED.evidence_json,
               updated_at = EXCLUDED.updated_at`,
        [
          candidateRef,
          nextVersion,
          JSON.stringify(parsedEducation),
          JSON.stringify(parsedItems),
          now,
        ],
      );
      const prior = await loadProjection(client, candidateRef, now, true);
      const projection = CandidateEvidencePassportProjectionSchema.parse({
        ...prior,
        projection_version: prior.projection_version + 1,
        current_draft: {
          schema_version: "candidate-evidence-passport-draft@2",
          candidate_ref: candidateRef,
          draft_version: nextVersion,
          education: parsedEducation,
          evidence_items: parsedItems,
          has_unpublished_changes: prior.last_published_snapshot?.draft_version !== nextVersion,
          updated_at: now.toISOString(),
        },
      });
      await writeProjection(client, projection, now);
      const commandId = input.ids.nextId("command");
      const eventId = input.ids.nextId("event");
      await appendEvent(client, {
        eventId,
        type: "CandidateEvidencePassportDraftSaved",
        aggregateType: "CandidateEvidencePassportDraft",
        aggregateId: candidateRef,
        version: nextVersion,
        correlationId: input.context.correlationId,
        now,
        payload: { candidate_ref: candidateRef, draft_version: nextVersion },
      });
      const receipt = CandidateEvidencePassportReceiptSchema.parse({
        schema_version: "candidate-evidence-passport-receipt@2",
        command_id: commandId,
        event_id: eventId,
        candidate_ref: candidateRef,
        draft_version: nextVersion,
        snapshot_ref: null,
        snapshot_version: null,
        signal_set_ref: projection.discovery.current_signal_set_ref,
        discovery_status: projection.discovery.status,
        projection_version: projection.projection_version,
        occurred_at: now.toISOString(),
      });
      await insertReceipt(client, {
        actorRef: candidateRef,
        idempotencyKey: input.context.idempotencyKey,
        commandId,
        commandType: "SaveCandidateEvidencePassportDraft",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return receipt;
    });
  }

  public async publishPassport(
    input: Parameters<CandidateEvidencePassportStore["publishPassport"]>[0],
  ): Promise<CandidateEvidencePassportReceipt> {
    return transaction(this.pool, async (client, now) => {
      const candidateRef = input.context.actor.actorId;
      const fingerprint = canonicalJson({
        expectedDraftVersion: input.expectedDraftVersion,
        discoveryConsentVersion: input.discoveryConsentVersion,
      });
      const existing = await findReceipt(
        client,
        candidateRef,
        input.context.idempotencyKey,
        "PublishCandidateEvidencePassport",
        fingerprint,
      );
      if (existing !== null) return CandidateEvidencePassportReceiptSchema.parse(existing);
      const draftResult = await client.query<{
        draft_version: number;
        education_json: unknown;
        evidence_json: unknown;
      }>(
        `SELECT draft_version, education_json, evidence_json FROM candidate_evidence_passport_drafts
          WHERE candidate_ref = $1 FOR UPDATE`,
        [candidateRef],
      );
      const draft = draftResult.rows[0];
      if (draft === undefined || draft.draft_version !== input.expectedDraftVersion) {
        throw new FunctionalProductApplicationError("STALE_VERSION", "Passport Draft changed.");
      }
      const items = evidenceItems(draft.evidence_json);
      const education = educationRecord(draft.education_json);
      if (items.length === 0) {
        throw new FunctionalProductApplicationError("INVALID_STATE", "Passport cannot be empty.");
      }
      const snapshotHash = sha256({
        schema_version: "candidate-evidence-passport-snapshot@1",
        candidate_ref: candidateRef,
        discovery_consent_version: input.discoveryConsentVersion,
        education,
        evidence_items: items,
      });
      const duplicate = await client.query(
        `SELECT 1 FROM candidate_evidence_passport_snapshots
          WHERE candidate_ref = $1 AND snapshot_hash = $2`,
        [candidateRef, snapshotHash],
      );
      if (duplicate.rowCount !== 0) {
        throw new FunctionalProductApplicationError(
          "IDEMPOTENCY_CONFLICT",
          "This Passport Snapshot was already published; use Refresh discovery.",
        );
      }
      const versionResult = await client.query<{ next_version: number }>(
        `SELECT COALESCE(MAX(snapshot_version), 0) + 1 AS next_version
           FROM candidate_evidence_passport_snapshots WHERE candidate_ref = $1`,
        [candidateRef],
      );
      const snapshotVersion = versionResult.rows[0]?.next_version ?? 1;
      const snapshotRef = input.ids.nextId("passport-snapshot");
      const signalSetRef = input.ids.nextId("signal-set");
      const opportunities = await loadOpenOpportunities(client);
      const currentJobSetHash = jobSetHash(opportunities);
      const gatedJobs = await client.query<{
        opportunity_ref: string;
        contract_hash: string;
      }>(
        `SELECT policy.opportunity_ref, contract.contract_hash
           FROM job_eligibility_match_policies AS policy
           JOIN opportunities AS opportunity ON opportunity.id = policy.opportunity_ref
           JOIN sealed_capability_contracts AS contract
             ON contract.contract_version_ref = opportunity.current_contract_version_ref
          WHERE policy.access_mode = 'EVIDENCE_MATCH_REQUIRED'
            AND opportunity.status = 'OPEN'
          ORDER BY opportunity.created_at DESC, opportunity.id`,
      );
      await client.query(
        `INSERT INTO candidate_evidence_passport_snapshots (
           snapshot_ref, candidate_ref, snapshot_version, draft_version,
           discovery_consent_version, snapshot_hash, education_json, evidence_json, published_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
        [
          snapshotRef,
          candidateRef,
          snapshotVersion,
          draft.draft_version,
          input.discoveryConsentVersion,
          snapshotHash,
          JSON.stringify(education),
          JSON.stringify(items),
          now,
        ],
      );
      await client.query(
        `UPDATE candidate_discovery_signal_sets
            SET status = 'STALE', completed_at = COALESCE(completed_at, $1),
                reason_code = 'PASSPORT_SUPERSEDED'
          WHERE candidate_ref = $2 AND status IN ('READY', 'GENERATING')`,
        [now, candidateRef],
      );
      await client.query(
        `UPDATE candidate_eligibility_match_sets
            SET status = 'STALE', reason_code = 'PASSPORT_SUPERSEDED',
                completed_at = COALESCE(completed_at, $1)
          WHERE candidate_ref = $2 AND status IN ('MATCHING', 'READY', 'PARTIAL')`,
        [now, candidateRef],
      );
      await client.query(
        `INSERT INTO candidate_discovery_signal_sets (
           signal_set_ref, candidate_ref, passport_snapshot_ref, job_set_hash,
           status, synthetic_preloaded, created_at
         ) VALUES ($1, $2, $3, $4, 'GENERATING', false, $5)`,
        [signalSetRef, candidateRef, snapshotRef, currentJobSetHash, now],
      );
      const prior = await loadProjection(client, candidateRef, now, true);
      const projection = CandidateEvidencePassportProjectionSchema.parse({
        ...prior,
        projection_version: prior.projection_version + 1,
        current_draft: {
          ...prior.current_draft,
          draft_version: draft.draft_version,
          education,
          evidence_items: items,
          has_unpublished_changes: false,
          updated_at: now.toISOString(),
        },
        last_published_snapshot: {
          snapshot_ref: snapshotRef,
          snapshot_version: snapshotVersion,
          draft_version: draft.draft_version,
          snapshot_hash: snapshotHash,
          education_ref: education.education_ref,
          evidence_count: items.length,
          discovery_consent_version: input.discoveryConsentVersion,
          published_at: now.toISOString(),
        },
        discovery: {
          status: "GENERATING",
          current_signal_set_ref: signalSetRef,
          last_ready_signal_set_ref: prior.discovery.last_ready_signal_set_ref,
          job_set_hash: currentJobSetHash,
          synthetic_preloaded: false,
          reason_code: null,
          updated_at: now.toISOString(),
        },
      });
      await writeProjection(client, projection, now);
      const commandId = input.ids.nextId("command");
      const eventId = input.ids.nextId("event");
      const outboxId = input.ids.nextId("outbox");
      await appendEvent(client, {
        eventId,
        type: "CandidateEvidencePassportPublished",
        aggregateType: "CandidateEvidencePassportSnapshot",
        aggregateId: snapshotRef,
        version: 1,
        correlationId: input.context.correlationId,
        now,
        payload: {
          candidate_ref: candidateRef,
          snapshot_ref: snapshotRef,
          snapshot_version: snapshotVersion,
          signal_set_ref: signalSetRef,
        },
      });
      const priorEligibility = await client.query<{ projection_version: number }>(
        `SELECT projection_version FROM candidate_eligibility_projections
          WHERE candidate_ref = $1 FOR UPDATE`,
        [candidateRef],
      );
      const eligibilityProjection = CandidateEligibilityProjectionSchema.parse({
        schema_version: "candidate-eligibility-projection@1",
        candidate_ref: candidateRef,
        status: gatedJobs.rows.length === 0 ? "READY" : "MATCHING",
        passport_snapshot_ref: snapshotRef,
        projection_version: (priorEligibility.rows[0]?.projection_version ?? 0) + 1,
        reason_code: null,
        updated_at: now.toISOString(),
      });
      await client.query(
        `INSERT INTO candidate_eligibility_projections (
           candidate_ref, projection_version, passport_snapshot_ref, status,
           reason_code, projection_json, updated_at
         ) VALUES ($1, $2, $3, $4, NULL, $5::jsonb, $6)
         ON CONFLICT (candidate_ref) DO UPDATE
           SET projection_version = EXCLUDED.projection_version,
               passport_snapshot_ref = EXCLUDED.passport_snapshot_ref,
               status = EXCLUDED.status,
               reason_code = EXCLUDED.reason_code,
               projection_json = EXCLUDED.projection_json,
               updated_at = EXCLUDED.updated_at`,
        [
          candidateRef,
          eligibilityProjection.projection_version,
          snapshotRef,
          eligibilityProjection.status,
          JSON.stringify(eligibilityProjection),
          now,
        ],
      );
      if (gatedJobs.rows.length > 0) {
        const matchSetRef = `eligibility-match-set:${snapshotRef}`;
        const eligibilityJobSetHash = sha256(gatedJobs.rows);
        await client.query(
          `INSERT INTO candidate_eligibility_match_sets (
             match_set_ref, candidate_ref, passport_snapshot_ref, job_set_hash,
             status, created_at
           ) VALUES ($1, $2, $3, $4, 'MATCHING', $5)`,
          [matchSetRef, candidateRef, snapshotRef, eligibilityJobSetHash, now],
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
              opportunityRefs: gatedJobs.rows.map((job) => job.opportunity_ref),
            }),
            now,
          ],
        );
      }
      await enqueueDiscovery(client, {
        messageId: outboxId,
        eventId,
        correlationId: input.context.correlationId,
        signalSetRef,
        candidateRef,
        snapshotRef,
        now,
      });
      const receipt = CandidateEvidencePassportReceiptSchema.parse({
        schema_version: "candidate-evidence-passport-receipt@2",
        command_id: commandId,
        event_id: eventId,
        candidate_ref: candidateRef,
        draft_version: draft.draft_version,
        snapshot_ref: snapshotRef,
        snapshot_version: snapshotVersion,
        signal_set_ref: signalSetRef,
        discovery_status: "GENERATING",
        projection_version: projection.projection_version,
        occurred_at: now.toISOString(),
      });
      await insertReceipt(client, {
        actorRef: candidateRef,
        idempotencyKey: input.context.idempotencyKey,
        commandId,
        commandType: "PublishCandidateEvidencePassport",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return receipt;
    });
  }

  public async refreshDiscovery(
    input: Parameters<CandidateEvidencePassportStore["refreshDiscovery"]>[0],
  ): Promise<CandidateEvidencePassportReceipt> {
    return transaction(this.pool, async (client, now) => {
      const candidateRef = input.context.actor.actorId;
      const fingerprint = canonicalJson({
        expectedProjectionVersion: input.expectedProjectionVersion,
      });
      const existing = await findReceipt(
        client,
        candidateRef,
        input.context.idempotencyKey,
        "RequestCandidateDiscoveryRefresh",
        fingerprint,
      );
      if (existing !== null) return CandidateEvidencePassportReceiptSchema.parse(existing);
      const prior = await loadProjection(client, candidateRef, now, true);
      if (prior.projection_version !== input.expectedProjectionVersion) {
        throw new FunctionalProductApplicationError("STALE_VERSION", "Discovery view changed.");
      }
      const snapshot = prior.last_published_snapshot;
      if (snapshot === null) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "Publish a Passport Snapshot before refreshing discovery.",
        );
      }
      if (prior.discovery.status === "GENERATING") {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "Candidate discovery is already running.",
        );
      }
      const opportunities = await loadOpenOpportunities(client);
      const currentJobSetHash = jobSetHash(opportunities);
      const signalSetRef = input.ids.nextId("signal-set");
      await client.query(
        `UPDATE candidate_discovery_signal_sets
            SET status = 'STALE', completed_at = COALESCE(completed_at, $1),
                reason_code = 'REFRESH_REQUESTED'
          WHERE signal_set_ref = $2 AND status = 'READY'`,
        [now, prior.discovery.current_signal_set_ref],
      );
      await client.query(
        `INSERT INTO candidate_discovery_signal_sets (
           signal_set_ref, candidate_ref, passport_snapshot_ref, job_set_hash,
           status, synthetic_preloaded, created_at
         ) VALUES ($1, $2, $3, $4, 'GENERATING', false, $5)`,
        [signalSetRef, candidateRef, snapshot.snapshot_ref, currentJobSetHash, now],
      );
      const projection = CandidateEvidencePassportProjectionSchema.parse({
        ...prior,
        projection_version: prior.projection_version + 1,
        discovery: {
          status: "GENERATING",
          current_signal_set_ref: signalSetRef,
          last_ready_signal_set_ref: prior.discovery.last_ready_signal_set_ref,
          job_set_hash: currentJobSetHash,
          synthetic_preloaded: false,
          reason_code: null,
          updated_at: now.toISOString(),
        },
      });
      await writeProjection(client, projection, now);
      const commandId = input.ids.nextId("command");
      const eventId = input.ids.nextId("event");
      await appendEvent(client, {
        eventId,
        type: "CandidateDiscoveryRefreshRequested",
        aggregateType: "CandidateDiscoverySignalSet",
        aggregateId: signalSetRef,
        version: 1,
        correlationId: input.context.correlationId,
        now,
        payload: {
          candidate_ref: candidateRef,
          snapshot_ref: snapshot.snapshot_ref,
          signal_set_ref: signalSetRef,
        },
      });
      await enqueueDiscovery(client, {
        messageId: input.ids.nextId("outbox"),
        eventId,
        correlationId: input.context.correlationId,
        signalSetRef,
        candidateRef,
        snapshotRef: snapshot.snapshot_ref,
        now,
      });
      const receipt = CandidateEvidencePassportReceiptSchema.parse({
        schema_version: "candidate-evidence-passport-receipt@2",
        command_id: commandId,
        event_id: eventId,
        candidate_ref: candidateRef,
        draft_version: prior.current_draft.draft_version,
        snapshot_ref: snapshot.snapshot_ref,
        snapshot_version: snapshot.snapshot_version,
        signal_set_ref: signalSetRef,
        discovery_status: "GENERATING",
        projection_version: projection.projection_version,
        occurred_at: now.toISOString(),
      });
      await insertReceipt(client, {
        actorRef: candidateRef,
        idempotencyKey: input.context.idempotencyKey,
        commandId,
        commandType: "RequestCandidateDiscoveryRefresh",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return receipt;
    });
  }

  public async claimNext(workerId: string, leaseDurationSeconds: number) {
    return transaction(this.pool, async (client) => {
      const result = await client.query<ClaimedRow>(
        `WITH next_message AS (
           SELECT message_id FROM outbox_messages
            WHERE processed_at IS NULL AND available_at <= clock_timestamp()
              AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
              AND message_type = 'CandidateDiscoveryRequested'
            ORDER BY available_at, created_at, message_id
            FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE outbox_messages AS message
            SET lease_owner = $1,
                lease_expires_at = clock_timestamp() + ($2 * interval '1 second'),
                attempt_count = attempt_count + 1
           FROM next_message
          WHERE message.message_id = next_message.message_id
         RETURNING message.message_id, message.event_id, message.correlation_id,
                   message.payload, message.attempt_count, message.lease_owner`,
        [workerId, leaseDurationSeconds],
      );
      return result.rows[0] === undefined ? null : parseClaimed(result.rows[0]);
    });
  }

  public async loadInput(
    message: ClaimedCandidateDiscoveryMessage,
    requestRef: string,
  ): Promise<CandidateJobDiscoveryInput | null> {
    const setResult = await this.pool.query<{
      status: string;
      snapshot_hash: string;
      education_json: unknown;
      evidence_json: unknown;
      published_at: Date;
    }>(
      `SELECT signal.status, snapshot.snapshot_hash, snapshot.education_json,
              snapshot.evidence_json, snapshot.published_at
         FROM candidate_discovery_signal_sets AS signal
         JOIN candidate_evidence_passport_snapshots AS snapshot
           ON snapshot.snapshot_ref = signal.passport_snapshot_ref
        WHERE signal.signal_set_ref = $1 AND signal.candidate_ref = $2
          AND signal.passport_snapshot_ref = $3`,
      [message.signalSetRef, message.candidateRef, message.snapshotRef],
    );
    const set = setResult.rows[0];
    if (set === undefined || set.status !== "GENERATING") return null;
    const client = await this.pool.connect();
    try {
      const opportunities = await loadOpenOpportunities(client);
      const education = educationRecord(set.education_json);
      return CandidateJobDiscoveryInputSchema.parse({
        schema_version: "candidate-job-discovery-input@2",
        request_ref: requestRef,
        candidate_ref: message.candidateRef,
        passport_snapshot_ref: message.snapshotRef,
        passport_snapshot_hash: set.snapshot_hash,
        job_set_hash: jobSetHash(opportunities),
        education: {
          education_ref: education.education_ref,
          level: education.level,
          status: education.status,
          field_of_study: education.field_of_study,
          graduation_date: education.graduation_date,
          source_sha256: education.source_sha256,
          verification_state: education.verification_state,
        },
        evidence_priority: buildCandidateDiscoveryEvidencePriority(education, set.published_at),
        evidence: evidenceItems(set.evidence_json).map((item) => ({
          evidence_ref: item.evidence_ref,
          kind: item.kind,
          verification_state: item.verification_state,
          sanitized_summary: item.bounded_summary,
          sanitized_contribution: item.contribution_summary,
          occurred_from: item.occurred_from,
          occurred_to: item.occurred_to,
          source_sha256: item.source_sha256,
        })),
        opportunities,
      });
    } finally {
      client.release();
    }
  }

  public async startRequest(
    input: Parameters<CandidateDiscoveryWorkerStore["startRequest"]>[0],
  ): Promise<void> {
    await transaction(this.pool, async (client, now) => {
      await assertLease(client, input.message);
      const updated = await client.query(
        `UPDATE candidate_discovery_signal_sets
            SET ai_request_ref = $1
          WHERE signal_set_ref = $2 AND status = 'GENERATING'`,
        [input.requestRef, input.message.signalSetRef],
      );
      if (updated.rowCount !== 1) {
        throw new FunctionalProductApplicationError("STALE_VERSION", "Signal set changed.");
      }
      await client.query(
        `INSERT INTO hiring_intelligence_requests (
           id, operation, aggregate_version, runtime_mode, prompt_id, prompt_version,
           prompt_hash, input_schema_version, output_schema_version, input_hash,
           input_json, idempotency_key, status, attempt_count, next_attempt_at,
           created_at, candidate_ref, candidate_passport_snapshot_ref
         ) VALUES ($1, 'deriveCandidateJobSignals', 1, 'LIVE', $2, $3, $4, $5,
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
          `deriveCandidateJobSignals:${input.message.signalSetRef}:${input.message.attempt}`,
          input.message.attempt,
          now,
          input.message.candidateRef,
          input.message.snapshotRef,
        ],
      );
      await client.query(
        `INSERT INTO ai_model_runs (
           id, request_id, attempt, adapter_id, requested_model, prompt_id,
           prompt_version, prompt_hash, input_schema_version, output_schema_version,
           client_request_id, status, input_bytes, started_at
         ) VALUES ($1, $2, $3, 'openai-responses-candidate-discovery@1', 'gpt-5.6-luna',
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
      for (const evidence of input.input.evidence) {
        await client.query(
          `INSERT INTO ai_source_refs (request_id, source_ref, source_kind, sha256)
           VALUES ($1, $2, $3, $4)`,
          [input.requestRef, evidence.evidence_ref, evidence.kind, evidence.source_sha256],
        );
      }
      await client.query(
        `INSERT INTO ai_source_refs (request_id, source_ref, source_kind, sha256)
         VALUES ($1, $2, 'EDUCATION', $3)`,
        [
          input.requestRef,
          input.input.education.education_ref,
          input.input.education.source_sha256,
        ],
      );
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
    input: Parameters<CandidateDiscoveryWorkerStore["completeRequest"]>[0],
  ): Promise<"SUCCEEDED" | "SUPERSEDED"> {
    return transaction(this.pool, async (client, now) => {
      await assertLease(client, input.message);
      const setResult = await client.query<{
        status: string;
        job_set_hash: string;
        passport_snapshot_ref: string;
      }>(
        `SELECT status, job_set_hash, passport_snapshot_ref
           FROM candidate_discovery_signal_sets WHERE signal_set_ref = $1 FOR UPDATE`,
        [input.message.signalSetRef],
      );
      const set = setResult.rows[0];
      if (set === undefined || set.status !== "GENERATING") {
        throw new FunctionalProductApplicationError("STALE_VERSION", "Signal set changed.");
      }
      await client.query(
        `INSERT INTO ai_outputs (
           id, request_id, output_schema_version, validated_json, output_hash,
           validation_policy_version, created_at
         ) VALUES ($1, $2, 'candidate-job-discovery-output@1', $3::jsonb, $4,
                   'candidate-discovery-policy@1', $5)`,
        [input.outputRef, input.requestRef, JSON.stringify(input.output), input.outputHash, now],
      );
      await client.query(
        `UPDATE ai_model_runs
            SET resolved_model = $1, provider_response_id = $2, status = 'SUCCEEDED',
                output_bytes = $3, completed_at = $4
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
      const currentOpportunities = await loadOpenOpportunities(client);
      const latestSnapshot = await client.query<{ snapshot_ref: string }>(
        `SELECT snapshot_ref FROM candidate_evidence_passport_snapshots
          WHERE candidate_ref = $1 ORDER BY snapshot_version DESC LIMIT 1`,
        [input.message.candidateRef],
      );
      const superseded =
        set.passport_snapshot_ref !== latestSnapshot.rows[0]?.snapshot_ref ||
        set.job_set_hash !== input.input.job_set_hash ||
        input.input.job_set_hash !== jobSetHash(currentOpportunities);
      if (superseded) {
        await client.query(
          `UPDATE hiring_intelligence_requests
              SET status = 'SUPERSEDED', completed_at = $1 WHERE id = $2`,
          [now, input.requestRef],
        );
        await client.query(
          `UPDATE candidate_discovery_signal_sets
              SET ai_output_ref = $1, status = 'SUPERSEDED', reason_code = 'INPUT_SUPERSEDED',
                  completed_at = $2 WHERE signal_set_ref = $3`,
          [input.outputRef, now, input.message.signalSetRef],
        );
        const prior = await loadProjection(client, input.message.candidateRef, now, true);
        await writeProjection(
          client,
          CandidateEvidencePassportProjectionSchema.parse({
            ...prior,
            projection_version: prior.projection_version + 1,
            discovery: {
              ...prior.discovery,
              status: "STALE",
              reason_code: "INPUT_SUPERSEDED",
              updated_at: now.toISOString(),
            },
          }),
          now,
        );
        await markProcessed(client, input.message, now, "superseded");
        return "SUPERSEDED";
      }

      const outputStatus = input.output.status === "ready" ? "READY" : "NEEDS_HUMAN";
      if (input.output.status === "ready") {
        const opportunitiesByRef = new Map(
          input.input.opportunities.map((item) => [item.opportunity_ref, item]),
        );
        for (const signal of input.output.opportunity_signals) {
          const opportunity = opportunitiesByRef.get(signal.opportunity_ref);
          if (opportunity === undefined) throw new Error("Validated signal lost its opportunity.");
          await client.query(
            `INSERT INTO candidate_job_discovery_signals (
               signal_ref, signal_set_ref, opportunity_ref, opportunity_version,
               contract_hash, discovery_band, signal_json, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
            [
              input.ids.nextId("job-signal"),
              input.message.signalSetRef,
              signal.opportunity_ref,
              opportunity.opportunity_version,
              opportunity.contract_hash,
              signal.discovery_band,
              JSON.stringify(signal),
              now,
            ],
          );
        }
      }
      await client.query(
        `UPDATE hiring_intelligence_requests
            SET status = $1, completed_at = $2 WHERE id = $3`,
        [outputStatus === "READY" ? "SUCCEEDED" : "NEEDS_HUMAN", now, input.requestRef],
      );
      await client.query(
        `UPDATE candidate_discovery_signal_sets
            SET ai_output_ref = $1, status = $2, reason_code = $3, completed_at = $4
          WHERE signal_set_ref = $5`,
        [
          input.outputRef,
          outputStatus,
          input.output.status === "abstain" ? input.output.reason_code : null,
          now,
          input.message.signalSetRef,
        ],
      );
      const prior = await loadProjection(client, input.message.candidateRef, now, true);
      const projection = CandidateEvidencePassportProjectionSchema.parse({
        ...prior,
        projection_version: prior.projection_version + 1,
        discovery: {
          status: outputStatus,
          current_signal_set_ref: input.message.signalSetRef,
          last_ready_signal_set_ref:
            outputStatus === "READY"
              ? input.message.signalSetRef
              : prior.discovery.last_ready_signal_set_ref,
          job_set_hash: input.input.job_set_hash,
          synthetic_preloaded: false,
          reason_code: input.output.status === "abstain" ? input.output.reason_code : null,
          updated_at: now.toISOString(),
        },
      });
      await writeProjection(client, projection, now);
      await appendEvent(client, {
        eventId: input.ids.nextId("event"),
        type:
          outputStatus === "READY"
            ? "CandidateDiscoverySignalsCompleted"
            : "CandidateDiscoverySignalsNeedHuman",
        aggregateType: "CandidateDiscoverySignalSet",
        aggregateId: input.message.signalSetRef,
        version: 2,
        correlationId: input.message.correlationId,
        now,
        payload: {
          candidate_ref: input.message.candidateRef,
          signal_set_ref: input.message.signalSetRef,
          ai_output_ref: input.outputRef,
          status: outputStatus,
        },
      });
      await markProcessed(client, input.message, now, outputStatus.toLowerCase());
      return "SUCCEEDED";
    });
  }

  public async failRequest(
    input: Parameters<CandidateDiscoveryWorkerStore["failRequest"]>[0],
  ): Promise<void> {
    await transaction(this.pool, async (client, now) => {
      await assertLease(client, input.message);
      if (input.requestRef !== null) {
        await client.query(
          `UPDATE hiring_intelligence_requests SET status = $1, completed_at = $2
            WHERE id = $3`,
          [input.status, now, input.requestRef],
        );
      }
      if (input.runRef !== null) {
        await client.query(
          `UPDATE ai_model_runs SET status = $1, error_code = $2, completed_at = $3
            WHERE id = $4`,
          [
            input.status === "NEEDS_HUMAN" ? "NEEDS_HUMAN" : "FAILED_PERMANENT",
            input.errorCode,
            now,
            input.runRef,
          ],
        );
      }
      const signalStatus = input.status === "NEEDS_HUMAN" ? "NEEDS_HUMAN" : "FAILED";
      await client.query(
        `UPDATE candidate_discovery_signal_sets
            SET status = $1, reason_code = $2, completed_at = $3
          WHERE signal_set_ref = $4 AND status = 'GENERATING'`,
        [signalStatus, input.errorCode, now, input.message.signalSetRef],
      );
      const prior = await loadProjection(client, input.message.candidateRef, now, true);
      await writeProjection(
        client,
        CandidateEvidencePassportProjectionSchema.parse({
          ...prior,
          projection_version: prior.projection_version + 1,
          discovery: {
            ...prior.discovery,
            status: signalStatus,
            current_signal_set_ref: input.message.signalSetRef,
            synthetic_preloaded: false,
            reason_code: input.errorCode,
            updated_at: now.toISOString(),
          },
        }),
        now,
      );
      await markProcessed(client, input.message, now, signalStatus.toLowerCase());
    });
  }

  public async retryRequest(
    input: Parameters<CandidateDiscoveryWorkerStore["retryRequest"]>[0],
  ): Promise<void> {
    await transaction(this.pool, async (client, now) => {
      await assertLease(client, input.message);
      await client.query(
        `UPDATE hiring_intelligence_requests SET status = 'RETRYABLE', completed_at = $1
          WHERE id = $2`,
        [now, input.requestRef],
      );
      await client.query(
        `UPDATE ai_model_runs
            SET status = 'FAILED_RETRYABLE', error_code = $1, completed_at = $2
          WHERE id = $3`,
        [input.errorCode, now, input.runRef],
      );
      const result = await client.query(
        `UPDATE outbox_messages
            SET available_at = $1, lease_owner = NULL, lease_expires_at = NULL,
                last_error_code = $2
          WHERE message_id = $3 AND lease_owner = $4 AND attempt_count = $5
            AND processed_at IS NULL`,
        [
          input.retryAt,
          input.errorCode,
          input.message.messageId,
          input.message.leaseOwner,
          input.message.attempt,
        ],
      );
      if (result.rowCount !== 1) {
        throw new FunctionalProductApplicationError("STALE_VERSION", "Retry lease was lost.");
      }
    });
  }

  public async markProcessed(message: ClaimedCandidateDiscoveryMessage): Promise<void> {
    await transaction(this.pool, async (client, now) => {
      await assertLease(client, message);
      await client.query(
        `UPDATE candidate_discovery_signal_sets
            SET status = 'SUPERSEDED', reason_code = 'MESSAGE_SUPERSEDED', completed_at = $1
          WHERE signal_set_ref = $2 AND status = 'GENERATING'`,
        [now, message.signalSetRef],
      );
      await markProcessed(client, message, now, "ignored_or_superseded");
    });
  }
}
