import type {
  ClaimedMatchingMessage,
  MatchEdgeWorkerStore,
  MatchingInterestContext,
  MatchingWorkerCompletion,
  MatchRequestStart,
} from "@onlyboth/application";
import {
  BuildMatchEdgeInputV2Schema,
  EmployerMatchingProjectionSchema,
  MatchEdgeDraftV2Schema,
  type EmployerMatchingProjection,
} from "@onlyboth/contracts";
import type { EligibilityPredicate } from "@onlyboth/domain";
import type { Pool, PoolClient } from "pg";

import { PostgresOptimisticConcurrencyError } from "./postgres-challenge-store";

interface ClaimedRow {
  readonly message_id: string;
  readonly event_id: string;
  readonly correlation_id: string;
  readonly payload: unknown;
  readonly attempt_count: number;
  readonly lease_owner: string;
}

interface InterestContextRow {
  readonly interest_ref: string;
  readonly opportunity_ref: string;
  readonly candidate_ref: string;
  readonly matching_cycle_ref: string;
  readonly matching_cycle_version: number;
  readonly contract_version_ref: string;
  readonly contract_hash: string;
  readonly contract_json: unknown;
  readonly claim_snapshot_ref: string;
  readonly snapshot_version: number;
  readonly hard_facts_json: unknown;
  readonly claims_json: unknown;
  readonly source_refs_json: unknown;
  readonly runtime_mode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly replay_id: string | null;
  readonly already_evaluated: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function claimedMessage(row: ClaimedRow): ClaimedMatchingMessage {
  if (
    !isRecord(row.payload) ||
    typeof row.payload.interestRef !== "string" ||
    typeof row.payload.matchingCycleRef !== "string" ||
    typeof row.payload.candidateRef !== "string"
  ) {
    throw new Error("CandidateInterestSubmitted payload is invalid.");
  }
  return {
    messageId: row.message_id,
    eventId: row.event_id,
    correlationId: row.correlation_id,
    interestRef: row.payload.interestRef,
    matchingCycleRef: row.payload.matchingCycleRef,
    candidateRef: row.payload.candidateRef,
    leaseOwner: row.lease_owner,
    attempt: row.attempt_count,
  };
}

function eligibilityPredicates(contract: Record<string, unknown>): readonly EligibilityPredicate[] {
  const raw = contract.hard_predicates;
  if (!Array.isArray(raw)) throw new Error("Sealed Contract hard predicates are missing.");
  return raw.map((value): EligibilityPredicate => {
    if (
      !isRecord(value) ||
      typeof value.predicate_ref !== "string" ||
      typeof value.fact_type !== "string" ||
      typeof value.operator !== "string"
    ) {
      throw new Error("Sealed Contract contains an invalid hard predicate.");
    }
    if (
      value.operator === "EQUALS" &&
      (typeof value.expected === "boolean" ||
        typeof value.expected === "number" ||
        typeof value.expected === "string")
    ) {
      return {
        predicateRef: value.predicate_ref,
        factRef: value.fact_type,
        operator: "EQUALS",
        expected: value.expected,
      };
    }
    if (value.operator === "GTE" && typeof value.minimum === "number") {
      return {
        predicateRef: value.predicate_ref,
        factRef: value.fact_type,
        operator: "GTE",
        minimum: value.minimum,
      };
    }
    if (value.operator === "CONTAINS" && typeof value.member === "string") {
      return {
        predicateRef: value.predicate_ref,
        factRef: value.fact_type,
        operator: "CONTAINS",
        member: value.member,
      };
    }
    throw new Error("Sealed Contract contains an unsupported hard predicate.");
  });
}

async function databaseNow(client: PoolClient): Promise<Date> {
  const result = await client.query<{ database_now: Date }>(
    "SELECT clock_timestamp() AS database_now",
  );
  const now = result.rows[0]?.database_now;
  if (now === undefined) throw new Error("PostgreSQL did not return database time.");
  return now;
}

async function assertLease(client: PoolClient, message: ClaimedMatchingMessage): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM outbox_messages
      WHERE message_id = $1 AND lease_owner = $2 AND attempt_count = $3
        AND processed_at IS NULL AND lease_expires_at >= clock_timestamp()
      FOR UPDATE`,
    [message.messageId, message.leaseOwner, message.attempt],
  );
  if (result.rowCount !== 1) {
    throw new PostgresOptimisticConcurrencyError(
      `Matching message '${message.messageId}' no longer owns its lease.`,
    );
  }
}

async function markProcessed(
  client: PoolClient,
  message: ClaimedMatchingMessage,
  now: Date,
  outcome: string,
): Promise<void> {
  await client.query(
    `INSERT INTO inbox_messages (
       consumer, message_id, idempotency_key, payload_hash, result_json, processed_at
     ) VALUES ('match-edge-worker', $1, $1, $1, $2::jsonb, $3)
     ON CONFLICT (consumer, message_id) DO NOTHING`,
    [message.messageId, JSON.stringify({ outcome }), now],
  );
  const updated = await client.query(
    `UPDATE outbox_messages
        SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
      WHERE message_id = $2 AND lease_owner = $3 AND attempt_count = $4
        AND processed_at IS NULL`,
    [now, message.messageId, message.leaseOwner, message.attempt],
  );
  if (updated.rowCount !== 1) {
    throw new PostgresOptimisticConcurrencyError("Matching message changed before completion.");
  }
}

async function refreshMatchingProjection(
  client: PoolClient,
  matchingCycleRef: string,
  now: Date,
): Promise<void> {
  const cycleResult = await client.query<{
    opportunity_ref: string;
    version: number;
    expected_interest_count: number;
    public_seed: string;
    allocator_version: "onlyboth.direct-explore@1";
    runtime_mode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
    reviewer_ref: string;
    commitment_ref: string;
    commitment_version: number;
    active_wip: number;
  }>(
    `SELECT cycle.opportunity_ref, cycle.version, cycle.expected_interest_count,
            cycle.public_seed, cycle.allocator_version, cycle.runtime_mode,
            commitment.reviewer_ref, commitment.commitment_ref,
            commitment.version AS commitment_version, commitment.active_wip
       FROM matching_cycles AS cycle
       JOIN attention_commitments AS commitment
         ON commitment.opportunity_ref = cycle.opportunity_ref
      WHERE cycle.matching_cycle_ref = $1
      FOR UPDATE OF cycle`,
    [matchingCycleRef],
  );
  const cycle = cycleResult.rows[0];
  if (cycle === undefined) throw new Error("Matching Cycle disappeared during completion.");
  const rows = await client.query<{
    candidate_ref: string;
    eligible: boolean | null;
    decision: "PROPOSE" | "ABSTAIN" | "NEEDS_HUMAN" | null;
    reason_code: string | null;
    validated_json: unknown;
    edge_json: unknown;
  }>(
    `SELECT interest.candidate_ref, eligibility.eligible, evaluation.decision,
            evaluation.reason_code, output.validated_json, edge.edge_json
       FROM candidate_interests AS interest
       LEFT JOIN eligibility_edges AS eligibility
         ON eligibility.matching_cycle_ref = $1
        AND eligibility.candidate_ref = interest.candidate_ref
       LEFT JOIN match_edge_evaluations AS evaluation
         ON evaluation.matching_cycle_ref = $1
        AND evaluation.candidate_ref = interest.candidate_ref
       LEFT JOIN ai_outputs AS output ON output.id = evaluation.ai_output_ref
       LEFT JOIN match_edges AS edge
         ON edge.matching_cycle_ref = $1 AND edge.candidate_ref = interest.candidate_ref
      WHERE interest.opportunity_ref = $2
      ORDER BY interest.candidate_ref`,
    [matchingCycleRef, cycle.opportunity_ref],
  );
  const eligibleCount = rows.rows.filter((row) => row.eligible).length;
  const proposeCount = rows.rows.filter((row) => row.decision === "PROPOSE").length;
  const abstainCount = rows.rows.filter((row) => row.decision === "ABSTAIN").length;
  const needsHumanCount = rows.rows.filter((row) => row.decision === "NEEDS_HUMAN").length;
  const terminalCount = proposeCount + abstainCount + needsHumanCount;
  const state =
    needsHumanCount > 0
      ? "NEEDS_HUMAN"
      : terminalCount === cycle.expected_interest_count
        ? "READY_FOR_DIRECT"
        : "EVALUATING";
  await client.query(
    `UPDATE matching_cycles
        SET eligible_count = $1, propose_count = $2, abstain_count = $3,
            needs_human_count = $4, state = $5, updated_at = $6
      WHERE matching_cycle_ref = $7`,
    [eligibleCount, proposeCount, abstainCount, needsHumanCount, state, now, matchingCycleRef],
  );

  const cards: EmployerMatchingProjection["cards"] = rows.rows.map((row) => {
    if (row.decision === "PROPOSE") {
      const edge = MatchEdgeDraftV2Schema.parse(row.edge_json);
      return {
        candidate_ref: row.candidate_ref,
        opaque_id: `Candidate ${row.candidate_ref.slice("candidate-".length)}`,
        status: "PROOFABLE",
        match_edge_ref: `match-edge-${row.candidate_ref.slice("candidate-".length)}`,
        uncertainty_ref: edge.uncertainty_ref,
        claim_refs: edge.claim_refs,
        proof_template_ref: edge.proof_template_ref,
        source_refs: edge.source_refs,
        why: edge.verifiable_reason,
        still_unknown: edge.still_unknown,
        abstain_reason_code: null,
      };
    }
    if (row.decision === "ABSTAIN") {
      const output = MatchEdgeDraftV2Schema.parse(row.validated_json);
      return {
        candidate_ref: row.candidate_ref,
        opaque_id: `Candidate ${row.candidate_ref.slice("candidate-".length)}`,
        status: "NO_BOUNDED_PROOF",
        match_edge_ref: null,
        uncertainty_ref: null,
        claim_refs: [],
        proof_template_ref: null,
        source_refs: [],
        why: output.explanation,
        still_unknown: [],
        abstain_reason_code: output.reason_code,
      };
    }
    return {
      candidate_ref: row.candidate_ref,
      opaque_id: `Candidate ${row.candidate_ref.slice("candidate-".length)}`,
      status: row.decision === "NEEDS_HUMAN" ? "NEEDS_HUMAN" : "PROCESSING",
      match_edge_ref: null,
      uncertainty_ref: null,
      claim_refs: [],
      proof_template_ref: null,
      source_refs: [],
      why: null,
      still_unknown: [],
      abstain_reason_code: row.reason_code,
    };
  });
  const projection = EmployerMatchingProjectionSchema.parse({
    schema_version: "employer-matching-projection@1",
    view: "EMPLOYER",
    opportunity_ref: cycle.opportunity_ref,
    matching_cycle_ref: matchingCycleRef,
    matching_cycle_version: cycle.version,
    commitment_ref: cycle.commitment_ref,
    commitment_version: cycle.commitment_version,
    reviewer: { id: cycle.reviewer_ref, display_name: "Sarah Chen" },
    state,
    eligible_count: eligibleCount,
    proofable_count: proposeCount,
    abstain_count: abstainCount,
    needs_human_count: needsHumanCount,
    attention_slots: cycle.active_wip,
    public_seed: cycle.public_seed,
    allocator_version: cycle.allocator_version,
    runtime_mode: cycle.runtime_mode,
    synthetic: cycle.runtime_mode === "GOLDEN_REPLAY",
    disclosure: "Synthetic — Pre-recorded external inputs",
    cards,
    allocation_run_ref: null,
    allocations: [],
  });
  await client.query(
    `INSERT INTO employer_matching_projections (
       opportunity_ref, reviewer_ref, projection_version, projection_json, updated_at
     ) VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (opportunity_ref) DO UPDATE
       SET reviewer_ref = EXCLUDED.reviewer_ref,
           projection_version = EXCLUDED.projection_version,
           projection_json = EXCLUDED.projection_json,
           updated_at = EXCLUDED.updated_at`,
    [cycle.opportunity_ref, cycle.reviewer_ref, terminalCount + 1, JSON.stringify(projection), now],
  );
}

export class PostgresMatchEdgeWorkerStore implements MatchEdgeWorkerStore {
  public constructor(private readonly pool: Pool) {}

  public async claimNext(
    workerId: string,
    leaseDurationSeconds: number,
  ): Promise<ClaimedMatchingMessage | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ClaimedRow>(
        `WITH next_message AS (
           SELECT message_id FROM outbox_messages
            WHERE processed_at IS NULL AND available_at <= clock_timestamp()
              AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
              AND message_type = 'CandidateInterestSubmitted'
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
      await client.query("COMMIT");
      const row = result.rows[0];
      return row === undefined ? null : claimedMessage(row);
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async loadInterestContext(interestRef: string): Promise<MatchingInterestContext | null> {
    const result = await this.pool.query<InterestContextRow>(
      `SELECT interest.interest_ref, interest.opportunity_ref, interest.candidate_ref,
              cycle.matching_cycle_ref, cycle.version AS matching_cycle_version,
              cycle.contract_version_ref, cycle.contract_hash, contract.contract_json,
              snapshot.claim_snapshot_ref, snapshot.snapshot_version,
              snapshot.hard_facts_json, snapshot.claims_json, snapshot.source_refs_json,
              cycle.runtime_mode, cycle.replay_id,
              EXISTS (
                SELECT 1 FROM match_edge_evaluations AS evaluation
                 WHERE evaluation.matching_cycle_ref = cycle.matching_cycle_ref
                   AND evaluation.candidate_ref = interest.candidate_ref
              ) AS already_evaluated
         FROM candidate_interests AS interest
         JOIN matching_cycles AS cycle ON cycle.opportunity_ref = interest.opportunity_ref
         JOIN sealed_capability_contracts AS contract
           ON contract.contract_version_ref = cycle.contract_version_ref
         JOIN candidate_claim_snapshots AS snapshot
           ON snapshot.claim_snapshot_ref = interest.claim_snapshot_ref
        WHERE interest.interest_ref = $1`,
      [interestRef],
    );
    const row = result.rows[0];
    if (row === undefined || !isRecord(row.contract_json)) return null;
    const contract = row.contract_json;
    const parsedInput = BuildMatchEdgeInputV2Schema.parse({
      schema_version: "build-match-edge-input@2",
      request_ref: `match-request:${row.candidate_ref.slice("candidate-".length)}`,
      matching_cycle: {
        matching_cycle_ref: row.matching_cycle_ref,
        version: row.matching_cycle_version,
        opportunity_ref: row.opportunity_ref,
      },
      sealed_contract: {
        contract_version_ref: row.contract_version_ref,
        contract_hash: row.contract_hash,
        uncertainties: contract.uncertainties,
      },
      claim_snapshot: {
        claim_snapshot_ref: row.claim_snapshot_ref,
        version: row.snapshot_version,
        candidate_ref: row.candidate_ref,
        claims: row.claims_json,
        hard_facts: row.hard_facts_json,
      },
      source_refs: row.source_refs_json,
      allowed_proof_templates: contract.allowed_proof_templates,
    });
    return {
      interestRef: row.interest_ref,
      opportunityRef: row.opportunity_ref,
      candidateRef: row.candidate_ref,
      matchingCycleRef: row.matching_cycle_ref,
      matchingCycleVersion: row.matching_cycle_version,
      contractVersionRef: row.contract_version_ref,
      contractHash: row.contract_hash,
      sealedContract: parsedInput.sealed_contract,
      claimSnapshot: parsedInput.claim_snapshot,
      sourceRefs: parsedInput.source_refs,
      allowedProofTemplates: parsedInput.allowed_proof_templates,
      eligibilityPredicates: eligibilityPredicates(contract),
      runtimeMode: row.runtime_mode,
      replayId: row.replay_id,
      alreadyEvaluated: row.already_evaluated,
    };
  }

  public async startRequest(
    message: ClaimedMatchingMessage,
    request: MatchRequestStart,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = await databaseNow(client);
      await assertLease(client, message);
      await client.query(
        `INSERT INTO eligibility_edges (
           eligibility_edge_ref, matching_cycle_ref, candidate_ref, claim_snapshot_ref,
           contract_version_ref, eligible, predicate_results_json, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         ON CONFLICT (matching_cycle_ref, candidate_ref) DO NOTHING`,
        [
          request.eligibility.eligibilityEdgeRef,
          message.matchingCycleRef,
          message.candidateRef,
          request.input.claim_snapshot.claim_snapshot_ref,
          request.input.sealed_contract.contract_version_ref,
          request.eligibility.eligible,
          JSON.stringify(request.eligibility.predicateResults),
          now,
        ],
      );
      await client.query(`UPDATE candidate_interests SET status = $1 WHERE interest_ref = $2`, [
        request.eligibility.eligible ? "ELIGIBLE" : "INELIGIBLE",
        message.interestRef,
      ]);
      await client.query(
        `INSERT INTO hiring_intelligence_requests (
           id, operation, aggregate_version, runtime_mode, replay_id, prompt_id,
           prompt_version, prompt_hash, input_schema_version, output_schema_version,
           input_hash, input_json, idempotency_key, status, attempt_count,
           next_attempt_at, created_at, matching_cycle_ref, candidate_ref, claim_snapshot_ref
         ) SELECT $1, 'buildMatchEdge', cycle.version, cycle.runtime_mode, cycle.replay_id,
                  $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'RUNNING', $10, $11, $11,
                  cycle.matching_cycle_ref, $12, $13
             FROM matching_cycles AS cycle WHERE cycle.matching_cycle_ref = $14
         ON CONFLICT (idempotency_key) DO UPDATE
           SET status = 'RUNNING', attempt_count = EXCLUDED.attempt_count,
               next_attempt_at = EXCLUDED.next_attempt_at`,
        [
          request.requestId,
          request.promptId,
          request.promptVersion,
          request.promptHash,
          request.inputSchemaVersion,
          request.outputSchemaVersion,
          request.inputHash,
          JSON.stringify(request.input),
          `buildMatchEdge:${message.matchingCycleRef}:${message.candidateRef}:${request.inputHash}:${request.promptVersion}`,
          message.attempt,
          now,
          message.candidateRef,
          request.input.claim_snapshot.claim_snapshot_ref,
          message.matchingCycleRef,
        ],
      );
      for (const source of request.input.source_refs) {
        await client.query(
          `INSERT INTO ai_source_refs (request_id, source_ref, source_kind, sha256)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [request.requestId, source.id, source.kind, source.sha256],
        );
      }
      await client.query(
        `INSERT INTO ai_model_runs (
           id, request_id, attempt, adapter_id, requested_model, prompt_id,
           prompt_version, prompt_hash, input_schema_version, output_schema_version,
           status, input_bytes, started_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   'RUNNING', $11, $12)
         ON CONFLICT (request_id, attempt) DO NOTHING`,
        [
          `ai-run:${request.requestId}:${message.attempt}`,
          request.requestId,
          message.attempt,
          request.adapterId,
          request.adapterId.startsWith("openai-") ? "gpt-5.6-sol" : null,
          request.promptId,
          request.promptVersion,
          request.promptHash,
          request.inputSchemaVersion,
          request.outputSchemaVersion,
          Buffer.byteLength(JSON.stringify(request.input), "utf8"),
          now,
        ],
      );
      await client.query("COMMIT");
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async complete(
    message: ClaimedMatchingMessage,
    completion: MatchingWorkerCompletion,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = await databaseNow(client);
      await assertLease(client, message);
      if (completion.kind === "DUPLICATE") {
        await markProcessed(client, message, now, "duplicate");
        await client.query("COMMIT");
        return;
      }
      if (completion.kind === "RETRYABLE") {
        await client.query(
          `UPDATE hiring_intelligence_requests
              SET status = 'RETRYABLE', next_attempt_at = $1
            WHERE id = $2`,
          [new Date(now.getTime() + completion.retryAfterSeconds * 1_000), completion.requestId],
        );
        await client.query(
          `UPDATE ai_model_runs
              SET status = 'FAILED_RETRYABLE', error_code = $1, completed_at = $2
            WHERE request_id = $3 AND attempt = $4`,
          [completion.errorCode, now, completion.requestId, message.attempt],
        );
        await client.query(
          `UPDATE outbox_messages
              SET available_at = $1, lease_owner = NULL, lease_expires_at = NULL,
                  last_error_code = $2
            WHERE message_id = $3 AND lease_owner = $4 AND attempt_count = $5`,
          [
            new Date(now.getTime() + completion.retryAfterSeconds * 1_000),
            completion.errorCode,
            message.messageId,
            message.leaseOwner,
            message.attempt,
          ],
        );
        await client.query("COMMIT");
        return;
      }

      let decision: "PROPOSE" | "ABSTAIN" | "NEEDS_HUMAN";
      let reasonCode: string | null = null;
      let aiOutputRef: string | null = null;
      if (completion.kind === "TERMINAL") {
        const current = await client.query<{
          cycle_version: number;
          contract_version_ref: string;
          contract_hash: string;
          claim_snapshot_ref: string;
          snapshot_version: number;
        }>(
          `SELECT cycle.version AS cycle_version, cycle.contract_version_ref,
                  cycle.contract_hash, interest.claim_snapshot_ref,
                  snapshot.snapshot_version
             FROM matching_cycles AS cycle
             JOIN candidate_interests AS interest
               ON interest.opportunity_ref = cycle.opportunity_ref
              AND interest.candidate_ref = $1
             JOIN candidate_claim_snapshots AS snapshot
               ON snapshot.claim_snapshot_ref = interest.claim_snapshot_ref
            WHERE cycle.matching_cycle_ref = $2 FOR UPDATE OF cycle`,
          [message.candidateRef, message.matchingCycleRef],
        );
        const pins = current.rows[0];
        const stale =
          pins === undefined ||
          pins.cycle_version !== completion.input.matching_cycle.version ||
          pins.contract_version_ref !== completion.input.sealed_contract.contract_version_ref ||
          pins.contract_hash !== completion.input.sealed_contract.contract_hash ||
          pins.claim_snapshot_ref !== completion.input.claim_snapshot.claim_snapshot_ref ||
          pins.snapshot_version !== completion.input.claim_snapshot.version;
        if (stale) {
          decision = "NEEDS_HUMAN";
          reasonCode = "AI_OUTPUT_SUPERSEDED";
          await client.query(
            `UPDATE hiring_intelligence_requests
                SET status = 'SUPERSEDED', completed_at = $1 WHERE id = $2`,
            [now, completion.requestId],
          );
        } else {
          aiOutputRef = completion.aiOutputRef;
          await client.query(
            `INSERT INTO ai_outputs (
               id, request_id, output_schema_version, validated_json, output_hash,
               validation_policy_version, created_at
             ) VALUES ($1, $2, 'match-edge-draft@2', $3::jsonb, $4, $5, $6)`,
            [
              completion.aiOutputRef,
              completion.requestId,
              JSON.stringify(completion.output),
              completion.outputHash,
              completion.validationPolicyVersion,
              now,
            ],
          );
          decision = completion.output.decision === "propose" ? "PROPOSE" : "ABSTAIN";
          reasonCode = completion.output.reason_code;
          if (decision === "PROPOSE" && completion.matchEdgeRef !== null) {
            await client.query(
              `INSERT INTO match_edges (
                 match_edge_ref, matching_cycle_ref, matching_cycle_version,
                 opportunity_ref, candidate_ref, contract_version_ref, contract_hash,
                 claim_snapshot_ref, claim_snapshot_version, ai_output_ref,
                 uncertainty_ref, claim_refs, proof_template_ref, source_refs,
                 edge_json, created_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                         $12::jsonb, $13, $14::jsonb, $15::jsonb, $16)`,
              [
                completion.matchEdgeRef,
                message.matchingCycleRef,
                completion.input.matching_cycle.version,
                completion.input.matching_cycle.opportunity_ref,
                message.candidateRef,
                completion.input.sealed_contract.contract_version_ref,
                completion.input.sealed_contract.contract_hash,
                completion.input.claim_snapshot.claim_snapshot_ref,
                completion.input.claim_snapshot.version,
                completion.aiOutputRef,
                completion.output.uncertainty_ref,
                JSON.stringify(completion.output.claim_refs),
                completion.output.proof_template_ref,
                JSON.stringify(completion.output.source_refs),
                JSON.stringify(completion.output),
                now,
              ],
            );
          }
          await client.query(
            `UPDATE hiring_intelligence_requests
                SET status = 'SUCCEEDED', completed_at = $1 WHERE id = $2`,
            [now, completion.requestId],
          );
        }
      } else {
        decision = "NEEDS_HUMAN";
        reasonCode = completion.errorCode;
        await client.query(
          `UPDATE hiring_intelligence_requests
              SET status = 'NEEDS_HUMAN', completed_at = $1 WHERE id = $2`,
          [now, completion.requestId],
        );
      }

      await client.query(
        `INSERT INTO match_edge_evaluations (
           matching_cycle_ref, candidate_ref, request_id, ai_output_ref,
           decision, reason_code, completed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (matching_cycle_ref, candidate_ref) DO NOTHING`,
        [
          message.matchingCycleRef,
          message.candidateRef,
          completion.requestId,
          aiOutputRef,
          decision,
          reasonCode,
          now,
        ],
      );
      await client.query(
        `UPDATE ai_model_runs
            SET status = $1, error_code = $2, output_bytes = $3, completed_at = $4
          WHERE request_id = $5 AND attempt = $6`,
        [
          decision === "NEEDS_HUMAN" ? "NEEDS_HUMAN" : "SUCCEEDED",
          reasonCode,
          completion.kind === "TERMINAL"
            ? Buffer.byteLength(JSON.stringify(completion.output), "utf8")
            : null,
          now,
          completion.requestId,
          message.attempt,
        ],
      );
      const eventId = `event-match-evaluated-${message.candidateRef.slice("candidate-".length)}`;
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, $2, 1, 'MatchEvaluation', $3, 1, $4, $5, $6::jsonb)`,
        [
          eventId,
          decision === "PROPOSE"
            ? "MatchEdgeBuilt"
            : decision === "ABSTAIN"
              ? "MatchEdgeAbstained"
              : "MatchEdgeNeedsHuman",
          `${message.matchingCycleRef}:${message.candidateRef}`,
          message.correlationId,
          now,
          JSON.stringify({
            schema_version: "match-edge-evaluated@1",
            matching_cycle_ref: message.matchingCycleRef,
            candidate_ref: message.candidateRef,
            decision,
            match_edge_ref: completion.kind === "TERMINAL" ? completion.matchEdgeRef : null,
            reason_code: reasonCode,
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'MatchEdgeEvaluationCompleted', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          `outbox-match-evaluated-${message.candidateRef.slice("candidate-".length)}`,
          eventId,
          `MatchEdgeEvaluationCompleted:${message.matchingCycleRef}:${message.candidateRef}:1`,
          message.correlationId,
          JSON.stringify({
            matchingCycleRef: message.matchingCycleRef,
            candidateRef: message.candidateRef,
            decision,
          }),
          now,
        ],
      );
      await refreshMatchingProjection(client, message.matchingCycleRef, now);
      await markProcessed(client, message, now, decision.toLowerCase());
      await client.query("COMMIT");
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
