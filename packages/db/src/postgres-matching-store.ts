import type {
  MatchingAllocationSnapshot,
  MatchingAllocationTransaction,
  MatchingAllocationUnitOfWork,
  PersistedAttentionAllocation,
  StoredMatchingCommandReceipt,
} from "@onlyboth/application";
import {
  AttentionAllocationReceiptSchema,
  CandidateOpportunityProjectionSchema,
  EmployerMatchingProjectionSchema,
  type CandidateOpportunityProjection,
  type EmployerMatchingProjection,
} from "@onlyboth/contracts";
import type { Pool, PoolClient } from "pg";

import { PostgresOptimisticConcurrencyError } from "./postgres-challenge-store";

const ACTIVE_REVIEW_WINDOW_STATES = [
  "RESERVED",
  "STAGE_A_ACTIVE",
  "CHECKPOINT_PENDING",
  "STAGE_B_ACTIVE",
  "EVIDENCE_READY",
  "OUTCOME_RECORDED",
  "ASK_BACK_PENDING",
  "REVEALED",
  "BREACHED",
  "REMEDIATING",
  "WITHDRAWN",
  "SETTLING",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

class PostgresMatchingAllocationTransaction implements MatchingAllocationTransaction {
  public constructor(
    private readonly client: PoolClient,
    public readonly databaseNow: Date,
  ) {}

  public async findReceipt(
    actorRef: string,
    idempotencyKey: string,
  ): Promise<StoredMatchingCommandReceipt | null> {
    await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `matching-command:${actorRef}:${idempotencyKey}`,
    ]);
    const result = await this.client.query<{
      command_fingerprint: string;
      receipt_json: unknown;
    }>(
      `SELECT command_fingerprint, receipt_json
         FROM matching_command_receipts
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
          receipt: AttentionAllocationReceiptSchema.parse(row.receipt_json),
        };
  }

  public async loadForUpdate(opportunityRef: string): Promise<MatchingAllocationSnapshot | null> {
    const result = await this.client.query<{
      matching_cycle_ref: string;
      opportunity_ref: string;
      contract_version_ref: string;
      contract_hash: string;
      state: "EVALUATING" | "NEEDS_HUMAN" | "READY_FOR_DIRECT" | "ALLOCATED";
      cycle_version: number;
      public_seed: string;
      allocator_version: "onlyboth.direct-explore@1";
      contract_json: unknown;
      label_policy_version_ref: string;
      commitment_ref: string;
      reviewer_ref: string;
      active_wip: number;
      direct_slots: number;
      explore_slots: number;
      credit_per_window: number;
      accept_sla_hours: number;
      checkpoint_sla_seconds: number;
      final_review_sla_hours: number;
      commitment_version: number;
      account_ref: string;
      available_credits: number;
      projection_json: unknown;
    }>(
      `SELECT cycle.matching_cycle_ref, cycle.opportunity_ref,
              cycle.contract_version_ref, cycle.contract_hash, cycle.state,
              cycle.version AS cycle_version, cycle.public_seed, cycle.allocator_version,
              contract.contract_json,
              opportunity.current_label_policy_version_ref AS label_policy_version_ref,
              commitment.commitment_ref, commitment.reviewer_ref, commitment.active_wip,
              commitment.direct_slots, commitment.explore_slots, commitment.credit_per_window,
              commitment.accept_sla_hours, commitment.checkpoint_sla_seconds,
              commitment.final_review_sla_hours, commitment.version AS commitment_version,
              account.account_ref, account.available_credits, projection.projection_json
         FROM matching_cycles AS cycle
         JOIN opportunities AS opportunity ON opportunity.id = cycle.opportunity_ref
         JOIN sealed_capability_contracts AS contract
           ON contract.contract_version_ref = cycle.contract_version_ref
         JOIN attention_commitments AS commitment
           ON commitment.opportunity_ref = cycle.opportunity_ref
         JOIN credit_accounts AS account ON account.opportunity_ref = cycle.opportunity_ref
         JOIN employer_matching_projections AS projection
           ON projection.opportunity_ref = cycle.opportunity_ref
        WHERE cycle.opportunity_ref = $1
        FOR UPDATE OF cycle, commitment, account`,
      [opportunityRef],
    );
    const row = result.rows[0];
    if (row === undefined || !isRecord(row.contract_json)) return null;
    const contract = row.contract_json;
    const proofTemplateVersionId = contract.proof_template_version_id;
    const challengeCatalogVersionId = contract.challenge_catalog_version_id;
    if (
      typeof proofTemplateVersionId !== "string" ||
      typeof challengeCatalogVersionId !== "string"
    ) {
      throw new Error("Sealed Contract does not pin Proof and Challenge versions.");
    }
    const slotsResult = await this.client.query<{
      slot_ref: string;
      slot_kind: "DIRECT" | "EXPLORE";
      status: "AVAILABLE" | "HELD" | "RETIRED";
    }>(
      `SELECT slot_ref, slot_kind, status FROM attention_slots
        WHERE commitment_ref = $1 ORDER BY slot_kind FOR UPDATE`,
      [row.commitment_ref],
    );
    const candidatesResult = await this.client.query<{
      candidate_ref: string;
      match_edge_ref: string;
    }>(
      `SELECT candidate_ref, match_edge_ref FROM match_edges
        WHERE matching_cycle_ref = $1 ORDER BY candidate_ref`,
      [row.matching_cycle_ref],
    );
    const activeResult = await this.client.query<{ candidate_id: string; count: number }>(
      `SELECT candidate_id, count(*)::int AS count
         FROM (
           SELECT candidate_id FROM review_windows WHERE state = ANY($1::text[])
           UNION
           SELECT candidate_ref AS candidate_id
             FROM candidate_activity_leases WHERE status = 'ACTIVE'
         ) AS active_candidate
        GROUP BY candidate_id`,
      [[...ACTIVE_REVIEW_WINDOW_STATES]],
    );
    const candidateActiveWindowCounts = Object.fromEntries(
      activeResult.rows.map((candidate) => [candidate.candidate_id, candidate.count]),
    );
    return {
      matchingCycle: {
        matchingCycleRef: row.matching_cycle_ref,
        opportunityRef: row.opportunity_ref,
        contractVersionRef: row.contract_version_ref,
        contractHash: row.contract_hash,
        state: row.state,
        version: row.cycle_version,
        publicSeed: row.public_seed,
        allocatorVersion: row.allocator_version,
      },
      commitment: {
        commitmentRef: row.commitment_ref,
        version: row.commitment_version,
        reviewerRef: row.reviewer_ref,
        activeWip: row.active_wip,
        directSlots: row.direct_slots,
        exploreSlots: row.explore_slots,
        creditPerWindow: row.credit_per_window,
        acceptSlaHours: row.accept_sla_hours,
        checkpointSlaSeconds: row.checkpoint_sla_seconds,
        finalReviewSlaHours: row.final_review_sla_hours,
      },
      slots: slotsResult.rows.map((slot) => ({
        slotRef: slot.slot_ref,
        slotKind: slot.slot_kind,
        available: slot.status === "AVAILABLE",
      })),
      creditAccount: {
        accountRef: row.account_ref,
        availableCredits: row.available_credits,
      },
      activeWindowCount: activeResult.rows.reduce((sum, candidate) => sum + candidate.count, 0),
      activeCandidateRefs: new Set(activeResult.rows.map((candidate) => candidate.candidate_id)),
      candidateActiveWindowCounts,
      candidates: candidatesResult.rows.map((candidate) => ({
        candidateRef: candidate.candidate_ref,
        matchEdgeRef: candidate.match_edge_ref,
      })),
      versionPins: {
        contractVersionId: row.contract_version_ref,
        labelPolicyVersionId: row.label_policy_version_ref,
        proofTemplateVersionId,
        challengeCatalogVersionId,
      },
      employerProjection: EmployerMatchingProjectionSchema.parse(row.projection_json),
    };
  }

  public async persist(allocation: PersistedAttentionAllocation): Promise<void> {
    const candidateRefs = allocation.allocations
      .map(({ candidateRef }) => candidateRef)
      .sort((left, right) => left.localeCompare(right));
    for (const candidateRef of candidateRefs) {
      await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `candidate-activity:${candidateRef}`,
      ]);
    }
    const activeCandidates = await this.client.query<{ candidate_ref: string }>(
      `SELECT candidate_ref FROM candidate_activity_leases
        WHERE candidate_ref = ANY($1::text[]) AND status = 'ACTIVE'
       UNION
       SELECT candidate_id AS candidate_ref FROM review_windows
        WHERE candidate_id = ANY($1::text[]) AND state = ANY($2::text[])`,
      [candidateRefs, [...ACTIVE_REVIEW_WINDOW_STATES]],
    );
    if (activeCandidates.rowCount !== 0) {
      throw new PostgresOptimisticConcurrencyError(
        "A selected Candidate acquired another Active proof obligation.",
      );
    }
    const cycleUpdated = await this.client.query(
      `UPDATE matching_cycles SET state = 'ALLOCATED', version = version + 1, updated_at = $1
        WHERE matching_cycle_ref = $2 AND version = $3 AND state = 'READY_FOR_DIRECT'`,
      [
        this.databaseNow,
        allocation.receipt.matching_cycle_ref,
        allocation.expectedMatchingCycleVersion,
      ],
    );
    const commitmentUpdated = await this.client.query(
      `UPDATE attention_commitments SET version = version + 1
        WHERE commitment_ref = $1 AND version = $2`,
      [allocation.commitmentRef, allocation.expectedCommitmentVersion],
    );
    if (cycleUpdated.rowCount !== 1 || commitmentUpdated.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError(
        "Matching Cycle or Attention Commitment changed before allocation.",
      );
    }
    for (const decision of allocation.allocations) {
      const updated = await this.client.query(
        `UPDATE attention_slots SET status = 'HELD', version = version + 1
          WHERE slot_ref = $1 AND status = 'AVAILABLE'`,
        [decision.attentionSlotRef],
      );
      if (updated.rowCount !== 1) {
        throw new PostgresOptimisticConcurrencyError("An Attention Slot is no longer available.");
      }
    }
    const credits = allocation.receipt.direct.credits + allocation.receipt.explore.credits;
    const accountUpdated = await this.client.query(
      `UPDATE credit_accounts
          SET available_credits = available_credits - $1,
              held_credits = held_credits + $1,
              version = version + 1
        WHERE account_ref = $2 AND available_credits >= $1`,
      [credits, allocation.creditAccountRef],
    );
    if (accountUpdated.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError("Credit capacity changed before allocation.");
    }

    for (const [index, decision] of allocation.allocations.entries()) {
      const window = allocation.windows[index];
      if (window === undefined) throw new Error("Allocation is missing its Review Window.");
      await this.client.query(
        `INSERT INTO credit_holds (
           credit_hold_ref, account_ref, amount, status, created_at
         ) VALUES ($1, $2, $3, 'HELD', $4)`,
        [
          decision.creditHoldRef,
          allocation.creditAccountRef,
          allocation.receipt.direct.credits,
          this.databaseNow,
        ],
      );
      await this.client.query(
        `INSERT INTO review_windows (
           id, candidate_id, opportunity_id, reviewer_id, state, version,
           contract_version_id, label_policy_version_id, proof_template_version_id,
           challenge_catalog_version_id, aggregate_json, created_at, updated_at,
           matching_cycle_ref, match_edge_ref, attention_slot_ref, credit_hold_ref,
           allocation_kind, accept_by
         ) VALUES ($1, $2, $3, $4, 'RESERVED', 1, $5, $6, $7, $8, $9::jsonb,
                   $10, $10, $11, $12, $13, $14, $15, $16)`,
        [
          window.id,
          window.candidateId,
          window.opportunityId,
          window.reviewerId,
          window.versionPins.contractVersionId,
          window.versionPins.labelPolicyVersionId,
          window.versionPins.proofTemplateVersionId,
          window.versionPins.challengeCatalogVersionId,
          JSON.stringify(window),
          this.databaseNow,
          allocation.receipt.matching_cycle_ref,
          decision.matchEdgeRef,
          decision.attentionSlotRef,
          decision.creditHoldRef,
          decision.allocationKind,
          window.acceptBy,
        ],
      );
      await this.client.query(
        `UPDATE credit_holds SET review_window_ref = $1 WHERE credit_hold_ref = $2`,
        [window.id, decision.creditHoldRef],
      );
      await this.client.query(
        `INSERT INTO candidate_activity_leases (
           lease_ref, candidate_ref, opportunity_ref, subject_type, subject_ref,
           status, acquired_at, released_at, version
         ) VALUES ($1, $2, $3, 'DEEP_PROOF_REVIEW_WINDOW', $4,
                   'ACTIVE', $5, NULL, 1)`,
        [
          `activity-lease:deep-proof:${window.id}`,
          window.candidateId,
          window.opportunityId,
          window.id,
          this.databaseNow,
        ],
      );
      await this.client.query(
        `INSERT INTO credit_ledger_entries (
           ledger_entry_ref, account_ref, credit_hold_ref, entry_type, amount, occurred_at
         ) VALUES ($1, $2, $3, 'HOLD', $4, $5)`,
        [
          `ledger-hold:${decision.creditHoldRef}`,
          allocation.creditAccountRef,
          decision.creditHoldRef,
          allocation.receipt.direct.credits,
          this.databaseNow,
        ],
      );
    }

    await this.client.query(
      `INSERT INTO allocation_runs (
         allocation_run_ref, matching_cycle_ref, matching_cycle_version,
         commitment_ref, commitment_version, algorithm_version, public_seed,
         direct_match_edge_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        allocation.allocationRunRef,
        allocation.receipt.matching_cycle_ref,
        allocation.expectedMatchingCycleVersion,
        allocation.commitmentRef,
        allocation.expectedCommitmentVersion,
        allocation.receipt.allocator_version,
        allocation.receipt.public_seed,
        allocation.receipt.direct.match_edge_ref,
        this.databaseNow,
      ],
    );
    for (const [index, decision] of allocation.allocations.entries()) {
      const window = allocation.windows[index];
      if (window === undefined) throw new Error("Allocation is missing its Review Window.");
      await this.client.query(
        `INSERT INTO allocation_decisions (
           allocation_run_ref, allocation_kind, candidate_ref, match_edge_ref,
           public_hash, review_window_ref
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          allocation.allocationRunRef,
          decision.allocationKind,
          decision.candidateRef,
          decision.matchEdgeRef,
          decision.publicHash,
          window.id,
        ],
      );
    }
    await this.client.query(
      `INSERT INTO domain_events (
         event_id, event_type, event_version, aggregate_type, aggregate_id,
         aggregate_version, correlation_id, occurred_at, payload
       ) VALUES ($1, 'AttentionAllocated', 1, 'MatchingCycle', $2, $3, $4, $5, $6::jsonb)`,
      [
        allocation.eventId,
        allocation.receipt.matching_cycle_ref,
        allocation.receipt.new_matching_cycle_version,
        allocation.correlationId,
        this.databaseNow,
        JSON.stringify({
          schema_version: "attention-allocated@1",
          allocation_run_ref: allocation.allocationRunRef,
          direct: allocation.receipt.direct,
          explore: allocation.receipt.explore,
        }),
      ],
    );
    for (const [index, decision] of allocation.allocations.entries()) {
      const window = allocation.windows[index];
      if (window === undefined) throw new Error("Allocation is missing its Review Window.");
      const eventId = `${allocation.eventId}:${decision.allocationKind.toLowerCase()}`;
      await this.client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'AttentionReserved', 1, 'ReviewWindow', $2, 1, $3, $4, $5::jsonb)`,
        [
          eventId,
          window.id,
          allocation.correlationId,
          this.databaseNow,
          JSON.stringify({
            type: "AttentionReserved",
            reviewWindowId: window.id,
            reviewerId: window.reviewerId,
            attentionSlotId: window.attentionSlotId,
          }),
        ],
      );
      await this.client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'AttentionReserved', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          allocation.outboxIds[index],
          eventId,
          `AttentionReserved:${window.id}:1`,
          allocation.correlationId,
          JSON.stringify({ reviewWindowId: window.id, candidateRef: window.candidateId }),
          this.databaseNow,
        ],
      );
    }

    const previousProjectionResult = await this.client.query<{ projection_json: unknown }>(
      `SELECT projection_json FROM employer_matching_projections
        WHERE opportunity_ref = $1 FOR UPDATE`,
      [allocation.windows[0].opportunityId],
    );
    const previous = previousProjectionResult.rows[0];
    if (previous === undefined) throw new Error("Employer Matching Projection is missing.");
    const employerProjection = EmployerMatchingProjectionSchema.parse({
      ...EmployerMatchingProjectionSchema.parse(previous.projection_json),
      state: "ALLOCATED",
      matching_cycle_version: allocation.receipt.new_matching_cycle_version,
      commitment_version: allocation.receipt.new_commitment_version,
      allocation_run_ref: allocation.allocationRunRef,
      allocations: [allocation.receipt.direct, allocation.receipt.explore],
    });
    await this.client.query(
      `UPDATE employer_matching_projections
          SET projection_version = projection_version + 1,
              projection_json = $1::jsonb, updated_at = $2
        WHERE opportunity_ref = $3`,
      [JSON.stringify(employerProjection), this.databaseNow, employerProjection.opportunity_ref],
    );
    for (const window of allocation.windows) {
      const candidateProjection = CandidateOpportunityProjectionSchema.parse({
        schema_version: "candidate-opportunity-projection@1",
        view: "CANDIDATE",
        opportunity_ref: window.opportunityId,
        candidate_ref: window.candidateId,
        state: "HUMAN_REVIEW_RESERVED",
        runtime_mode: employerProjection.runtime_mode,
        synthetic: employerProjection.synthetic,
        reviewer: { id: window.reviewerId, display_name: "Sarah Chen" },
        review_window_ref: window.id,
        review_window_version: window.version,
        accept_by: window.acceptBy,
        checkpoint_sla_seconds: 90,
        final_review_sla_hours: 24,
        candidate_effort_limit_minutes: 6,
        candidate_ai_policy: "PROHIBITED",
        message: "Sarah reserved a six-minute, reviewer-backed proof window for you.",
      });
      await this.client.query(
        `UPDATE candidate_opportunity_projections
            SET projection_version = projection_version + 1,
                projection_json = $1::jsonb, updated_at = $2
          WHERE opportunity_ref = $3 AND candidate_ref = $4`,
        [
          JSON.stringify(candidateProjection),
          this.databaseNow,
          window.opportunityId,
          window.candidateId,
        ],
      );
    }
    await this.client.query(
      `INSERT INTO matching_command_receipts (
         actor_ref, idempotency_key, command_fingerprint, command_type,
         receipt_json, created_at
       ) VALUES ($1, $2, $3, 'ReserveMatchedAttention', $4::jsonb, $5)`,
      [
        allocation.actorRef,
        allocation.idempotencyKey,
        allocation.commandFingerprint,
        JSON.stringify(allocation.receipt),
        this.databaseNow,
      ],
    );
  }
}

export class PostgresMatchingStore implements MatchingAllocationUnitOfWork {
  public constructor(private readonly pool: Pool) {}

  public async runInTransaction<TResult>(
    work: (transaction: MatchingAllocationTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const nowResult = await client.query<{ database_now: Date }>(
        "SELECT clock_timestamp() AS database_now",
      );
      const databaseNow = nowResult.rows[0]?.database_now;
      if (databaseNow === undefined) throw new Error("PostgreSQL did not return database time.");
      const result = await work(new PostgresMatchingAllocationTransaction(client, databaseNow));
      await client.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async getEmployerMatchingProjection(
    opportunityRef: string,
  ): Promise<EmployerMatchingProjection | null> {
    const result = await this.pool.query<{ projection_json: unknown }>(
      "SELECT projection_json FROM employer_matching_projections WHERE opportunity_ref = $1",
      [opportunityRef],
    );
    const row = result.rows[0];
    return row === undefined ? null : EmployerMatchingProjectionSchema.parse(row.projection_json);
  }

  public async getCandidateOpportunityProjection(
    opportunityRef: string,
    candidateRef: string,
  ): Promise<CandidateOpportunityProjection | null> {
    const result = await this.pool.query<{ projection_json: unknown }>(
      `SELECT projection_json FROM candidate_opportunity_projections
        WHERE opportunity_ref = $1 AND candidate_ref = $2`,
      [opportunityRef, candidateRef],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : CandidateOpportunityProjectionSchema.parse(row.projection_json);
  }
}
