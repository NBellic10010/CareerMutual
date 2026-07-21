import { createHash } from "node:crypto";

import {
  DecideProofWindowHandler,
  ExpireProofWindowHandler,
  ReserveMatchedAttentionHandler,
  StageAReplayWorker,
  SubmitMatchingStageAHandler,
  type MatchingIdFactory,
  type MatchingStageAIdFactory,
  type ProofWindowDecisionIdFactory,
} from "../../packages/application/src/index";
import {
  PostgresMatchingStageAStore,
  PostgresMatchingStore,
  PostgresProofWindowDecisionStore,
  createPostgresPool,
  resetMatchingGoldenDemo,
  runPostgresMigrations,
} from "../../packages/db/src/index";
import { createChallengeWorkerComposition } from "../../apps/worker/src/challenge-composition";
import { createMatchingWorkerComposition } from "../../apps/worker/src/matching-composition";
import { createStageAWorkerComposition } from "../../apps/worker/src/stage-a-composition";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("BLOCKED: Matching PostgreSQL tests require TEST_DATABASE_URL.");
}
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)).toLowerCase();
if (!/(?:^|[_-])test(?:$|[_-])/u.test(databaseName)) {
  throw new Error("REFUSED: Matching PostgreSQL tests require a dedicated test database.");
}

const MATCHING_ENVIRONMENT = {
  DEMO_MODE: "true",
  RUNTIME_MODE: "GOLDEN_REPLAY",
  REPLAY_ID: "matching-v1",
} as const;
const CONFIG = {
  runtimeMode: "GOLDEN_REPLAY" as const,
  databaseUrl,
  sandboxAdapter: "replay" as const,
  replayId: "matching-v1",
};

let sequence = 0;
const matchingIds: MatchingIdFactory = {
  nextId: (kind) => `${kind}-postgres-matching-${++sequence}`,
  boundId: (kind, candidateRef) => `${kind}-${candidateRef.slice("candidate-".length)}`,
};
const proofIds: ProofWindowDecisionIdFactory = {
  nextId: (kind) => `${kind}-postgres-proof-${++sequence}`,
};
const stageIds: MatchingStageAIdFactory = {
  nextId: (kind) => `${kind}-postgres-stage-${++sequence}`,
};

const pool = createPostgresPool(databaseUrl);
const matchingComposition = createMatchingWorkerComposition(CONFIG);
const stageComposition = createStageAWorkerComposition(CONFIG);
const challengeComposition = createChallengeWorkerComposition(CONFIG);

async function drain(
  worker: { runOnce(workerId: string): Promise<string> },
  id: string,
  limit = 30,
) {
  for (let index = 0; index < limit; index += 1) {
    if ((await worker.runOnce(id)) === "IDLE") return;
  }
  throw new Error(`${id} did not become idle.`);
}

async function prepareReadyCycle(): Promise<PostgresMatchingStore> {
  await resetMatchingGoldenDemo(pool, MATCHING_ENVIRONMENT);
  await drain(matchingComposition.worker, "postgres-matching-worker");
  const store = new PostgresMatchingStore(pool);
  expect(await store.getEmployerMatchingProjection("opp-senior-backend-1")).toMatchObject({
    state: "READY_FOR_DIRECT",
    eligible_count: 20,
    proofable_count: 8,
    abstain_count: 12,
    needs_human_count: 0,
  });
  return store;
}

function allocationHandler(store: PostgresMatchingStore) {
  return new ReserveMatchedAttentionHandler(store, matchingIds, (value) =>
    createHash("sha256").update(value).digest("hex"),
  );
}

async function reserveAttention(store: PostgresMatchingStore, key = `reserve-${++sequence}`) {
  return allocationHandler(store).execute({
    opportunityRef: "opp-senior-backend-1",
    actor: { role: "EMPLOYER", actorId: "reviewer-sarah-chen" },
    idempotencyKey: key,
    correlationId: `correlation-${key}`,
    command: {
      schema_version: "reserve-matched-attention-command@1",
      direct_match_edge_ref: "match-edge-17",
      expected_matching_cycle_version: 1,
      expected_commitment_version: 1,
    },
  });
}

function proofHandler() {
  return new DecideProofWindowHandler(new PostgresProofWindowDecisionStore(pool), proofIds);
}

describe.sequential("Matching PostgreSQL vertical", () => {
  beforeAll(async () => {
    await runPostgresMigrations(pool);
  });

  afterAll(async () => {
    await Promise.all([
      matchingComposition.pool.end(),
      stageComposition.pool.end(),
      challengeComposition.pool.end(),
      pool.end(),
    ]);
  });

  it("seeds only start facts, then derives 20 Eligibility results and 8 immutable MatchEdges", async () => {
    await resetMatchingGoldenDemo(pool, MATCHING_ENVIRONMENT);
    const before = await pool.query<{
      eligibility: string;
      evaluations: string;
      edges: string;
      windows: string;
      jobs: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM eligibility_edges) AS eligibility,
        (SELECT count(*)::text FROM match_edge_evaluations) AS evaluations,
        (SELECT count(*)::text FROM match_edges) AS edges,
        (SELECT count(*)::text FROM review_windows) AS windows,
        (SELECT count(*)::text FROM outbox_messages
          WHERE message_type = 'CandidateInterestSubmitted') AS jobs`,
    );
    expect(before.rows[0]).toEqual({
      eligibility: "0",
      evaluations: "0",
      edges: "0",
      windows: "0",
      jobs: "20",
    });

    await drain(matchingComposition.worker, "postgres-seed-worker");
    const derived = await pool.query<{
      eligibility: string;
      propose: string;
      abstain: string;
      edges: string;
      model_claims: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM eligibility_edges WHERE eligible) AS eligibility,
        (SELECT count(*)::text FROM match_edge_evaluations WHERE decision = 'PROPOSE') AS propose,
        (SELECT count(*)::text FROM match_edge_evaluations WHERE decision = 'ABSTAIN') AS abstain,
        (SELECT count(*)::text FROM match_edges) AS edges,
        (SELECT count(*)::text FROM ai_model_runs WHERE requested_model IS NOT NULL) AS model_claims`,
    );
    expect(derived.rows[0]).toEqual({
      eligibility: "20",
      propose: "8",
      abstain: "12",
      edges: "8",
      model_claims: "0",
    });

    await pool.query(
      `INSERT INTO outbox_messages (
         message_id, message_type, message_version, event_id, idempotency_key,
         correlation_id, payload, available_at
       ) VALUES (
         'duplicate-interest-42', 'CandidateInterestSubmitted', 1,
         'event-interest-submitted-42', 'duplicate-interest-42', 'duplicate-42',
         '{"interestRef":"interest-42","matchingCycleRef":"matching-cycle-senior-backend-1","candidateRef":"candidate-42"}'::jsonb,
         clock_timestamp()
       )`,
    );
    await expect(matchingComposition.worker.runOnce("postgres-duplicate-worker")).resolves.toBe(
      "PROCESSED",
    );
    const duplicate = await pool.query<{ outputs: string; edges: string; inbox: string }>(
      `SELECT
        (SELECT count(*)::text FROM ai_outputs WHERE output_schema_version = 'match-edge-draft@2') AS outputs,
        (SELECT count(*)::text FROM match_edges) AS edges,
        (SELECT count(*)::text FROM inbox_messages
          WHERE consumer = 'match-edge-worker' AND message_id = 'duplicate-interest-42') AS inbox`,
    );
    expect(duplicate.rows[0]).toEqual({ outputs: "20", edges: "8", inbox: "1" });
  });

  it("allocates Direct 17 and Explore 42 once under concurrent duplicate commands", async () => {
    const store = await prepareReadyCycle();
    const handler = allocationHandler(store);
    const request = {
      opportunityRef: "opp-senior-backend-1",
      actor: { role: "EMPLOYER" as const, actorId: "reviewer-sarah-chen" },
      idempotencyKey: "concurrent-reserve",
      correlationId: "concurrent-reserve",
      command: {
        schema_version: "reserve-matched-attention-command@1" as const,
        direct_match_edge_ref: "match-edge-17",
        expected_matching_cycle_version: 1,
        expected_commitment_version: 1,
      },
    };
    const [first, duplicate] = await Promise.all([
      handler.execute(request),
      handler.execute(request),
    ]);
    expect(duplicate).toEqual(first);
    expect(first).toMatchObject({
      public_seed: "onlyboth-explore-v1-00024",
      direct: { candidate_ref: "candidate-17", review_window_ref: "review-window-17" },
      explore: { candidate_ref: "candidate-42", review_window_ref: "review-window-42" },
    });
    await expect(
      handler.execute({ ...request, idempotencyKey: "stale-reserve" }),
    ).rejects.toMatchObject({ code: "STALE_MATCHING_CYCLE_VERSION", httpStatus: 409 });

    const atomic = await pool.query<{
      windows: string;
      holds: string;
      decisions: string;
      receipts: string;
      active_leases: string;
      available: number;
      held: number;
    }>(
      `SELECT
        (SELECT count(*)::text FROM review_windows) AS windows,
        (SELECT count(*)::text FROM credit_holds WHERE status = 'HELD') AS holds,
        (SELECT count(*)::text FROM allocation_decisions) AS decisions,
        (SELECT count(*)::text FROM matching_command_receipts
          WHERE command_type = 'ReserveMatchedAttention') AS receipts,
        (SELECT count(*)::text FROM candidate_activity_leases
          WHERE status = 'ACTIVE') AS active_leases,
        account.available_credits AS available,
        account.held_credits AS held
       FROM credit_accounts AS account WHERE account.account_ref = 'credit-account-1'`,
    );
    expect(atomic.rows[0]).toEqual({
      windows: "2",
      holds: "2",
      decisions: "2",
      receipts: "1",
      active_leases: "2",
      available: 0,
      held: 20,
    });
  });

  it("rolls back both Windows, Holds, Event, Outbox, and Receipt on a second-Window fault", async () => {
    const store = await prepareReadyCycle();
    await pool.query(`
      CREATE OR REPLACE FUNCTION matching_test_reject_explore_outbox()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.message_type = 'AttentionReserved'
           AND NEW.payload->>'candidateRef' = 'candidate-42' THEN
          RAISE EXCEPTION 'injected second-window outbox failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER matching_test_reject_explore_outbox
      BEFORE INSERT ON outbox_messages
      FOR EACH ROW EXECUTE FUNCTION matching_test_reject_explore_outbox();
    `);
    try {
      await expect(reserveAttention(store, "rollback-reserve")).rejects.toThrow(
        "injected second-window outbox failure",
      );
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS matching_test_reject_explore_outbox ON outbox_messages;
        DROP FUNCTION IF EXISTS matching_test_reject_explore_outbox();
      `);
    }
    const rows = await pool.query<{
      windows: string;
      holds: string;
      runs: string;
      events: string;
      outbox: string;
      receipts: string;
      leases: string;
      cycle_state: string;
      available: number;
    }>(
      `SELECT
        (SELECT count(*)::text FROM review_windows) AS windows,
        (SELECT count(*)::text FROM credit_holds) AS holds,
        (SELECT count(*)::text FROM allocation_runs) AS runs,
        (SELECT count(*)::text FROM domain_events WHERE event_type = 'AttentionAllocated') AS events,
        (SELECT count(*)::text FROM outbox_messages WHERE message_type = 'AttentionReserved') AS outbox,
        (SELECT count(*)::text FROM matching_command_receipts) AS receipts,
        (SELECT count(*)::text FROM candidate_activity_leases) AS leases,
        (SELECT state FROM matching_cycles) AS cycle_state,
        (SELECT available_credits FROM credit_accounts) AS available`,
    );
    expect(rows.rows[0]).toEqual({
      windows: "0",
      holds: "0",
      runs: "0",
      events: "0",
      outbox: "0",
      receipts: "0",
      leases: "0",
      cycle_state: "READY_FOR_DIRECT",
      available: 20,
    });
  });

  it("keeps labels physically separate and frozen matching artifacts immutable", async () => {
    await prepareReadyCycle();
    for (const statement of [
      "UPDATE sealed_capability_contracts SET contract_hash = contract_hash",
      "UPDATE candidate_claim_snapshots SET snapshot_hash = snapshot_hash",
      "UPDATE match_edges SET edge_json = edge_json",
      "UPDATE ai_outputs SET output_hash = output_hash WHERE output_schema_version = 'match-edge-draft@2'",
    ]) {
      await expect(pool.query(statement)).rejects.toThrow(/immutable/iu);
    }
    const boundary = await pool.query<{ visible: string; columns: string[] }>(
      `SELECT
        concat_ws(' ',
          (SELECT string_agg(input_json::text, ' ') FROM hiring_intelligence_requests),
          (SELECT string_agg(projection_json::text, ' ') FROM employer_matching_projections)
        ) AS visible,
        ARRAY(
          SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'candidate_claim_snapshots'
           ORDER BY column_name
        ) AS columns`,
    );
    expect(boundary.rows[0]?.visible).not.toMatch(
      /school_name|previous_employer_name|referral_source|candidate_photo|sealed-synthetic/iu,
    );
    expect(boundary.rows[0]?.columns).not.toContain("encrypted_payload");
    const vaultCount = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM candidate_private_labels",
    );
    expect(vaultCount.rows[0]?.count).toBe("20");
  });

  it("accepts 42, releases 17 without inference, and replays Stage A into Challenge READY", async () => {
    const store = await prepareReadyCycle();
    await reserveAttention(store);
    const handler = proofHandler();
    const acceptedRequest = {
      action: "ACCEPT" as const,
      reviewWindowRef: "review-window-42",
      actor: { role: "CANDIDATE" as const, actorId: "candidate-42" },
      idempotencyKey: "accept-42",
      correlationId: "accept-42",
      command: { schema_version: "proof-window-decision-command@1" as const, expected_version: 1 },
    };
    const [accepted, acceptedDuplicate] = await Promise.all([
      handler.execute(acceptedRequest),
      handler.execute(acceptedRequest),
    ]);
    expect(acceptedDuplicate).toEqual(accepted);
    expect(accepted).toMatchObject({ state: "STAGE_A_ACTIVE", proof_session_ref: "proof-42" });
    await expect(
      handler.execute({
        action: "DECLINE",
        reviewWindowRef: "review-window-17",
        actor: { role: "CANDIDATE", actorId: "candidate-17" },
        idempotencyKey: "decline-17",
        correlationId: "decline-17",
        command: { schema_version: "proof-window-decision-command@1", expected_version: 1 },
      }),
    ).resolves.toMatchObject({ state: "RELEASED" });

    await expect(stageComposition.worker.runOnce("postgres-stage-a-worker")).resolves.toBe(
      "PROCESSED",
    );
    await drain(challengeComposition.worker, "postgres-challenge-worker", 12);
    const employer = await pool.query<{ projection_json: unknown }>(
      "SELECT projection_json FROM employer_review_window_projections WHERE review_window_id = 'review-window-42'",
    );
    const employerProjection = employer.rows[0]?.projection_json as {
      state?: string;
      recommendation?: { status?: string; options?: unknown[] };
    };
    expect(employerProjection).toMatchObject({
      state: "CHECKPOINT_PENDING",
      recommendation: { status: "READY" },
    });
    expect(employerProjection.recommendation?.options).toHaveLength(3);
    const resources = await pool.query<{
      available: number;
      held: number;
      direct_slot: string;
      explore_slot: string;
      active_leases: string;
      released_leases: string;
      adverse: string;
    }>(
      `SELECT account.available_credits AS available, account.held_credits AS held,
        (SELECT status FROM attention_slots WHERE slot_kind = 'DIRECT') AS direct_slot,
        (SELECT status FROM attention_slots WHERE slot_kind = 'EXPLORE') AS explore_slot,
        (SELECT count(*)::text FROM candidate_activity_leases
          WHERE status = 'ACTIVE') AS active_leases,
        (SELECT count(*)::text FROM candidate_activity_leases
          WHERE status = 'RELEASED') AS released_leases,
        (SELECT count(*)::text FROM domain_events
          WHERE event_type IN ('CandidateFailureRecorded', 'EmployerBreachRecorded')) AS adverse
       FROM credit_accounts AS account`,
    );
    expect(resources.rows[0]).toEqual({
      available: 10,
      held: 10,
      direct_slot: "AVAILABLE",
      explore_slot: "HELD",
      active_leases: "1",
      released_leases: "1",
      adverse: "0",
    });
  });

  it("uses database time for Expiry and returns the pre-start Slot and Credit", async () => {
    const store = await prepareReadyCycle();
    await reserveAttention(store);
    await pool.query(
      `UPDATE review_windows
          SET accept_by = clock_timestamp() - interval '1 second',
              aggregate_json = jsonb_set(
                aggregate_json,
                '{acceptBy}',
                to_jsonb((clock_timestamp() - interval '1 second')::text)
              )
        WHERE id = 'review-window-17'`,
    );
    const expiry = new ExpireProofWindowHandler(
      new PostgresProofWindowDecisionStore(pool),
      proofIds,
    );
    await expect(expiry.expireOne()).resolves.toBe(true);
    const expired = await pool.query<{
      state: string;
      release_reason: string;
      hold: string;
      lease: string;
    }>(
      `SELECT review_window.state, review_window.release_reason, hold.status AS hold,
              lease.status AS lease
         FROM review_windows AS review_window
         JOIN credit_holds AS hold ON hold.credit_hold_ref = review_window.credit_hold_ref
         JOIN candidate_activity_leases AS lease
           ON lease.subject_type = 'DEEP_PROOF_REVIEW_WINDOW'
          AND lease.subject_ref = review_window.id
        WHERE review_window.id = 'review-window-17'`,
    );
    expect(expired.rows[0]).toEqual({
      state: "RELEASED",
      release_reason: "PRESTART_EXPIRED",
      hold: "RETURNED",
      lease: "RELEASED",
    });
  });

  it("turns exhausted Stage A Sandbox retries into Platform Abort without participant blame", async () => {
    const store = await prepareReadyCycle();
    await reserveAttention(store);
    await proofHandler().execute({
      action: "ACCEPT",
      reviewWindowRef: "review-window-42",
      actor: { role: "CANDIDATE", actorId: "candidate-42" },
      idempotencyKey: "accept-platform-abort",
      correlationId: "accept-platform-abort",
      command: { schema_version: "proof-window-decision-command@1", expected_version: 1 },
    });
    const stageStore = new PostgresMatchingStageAStore(pool);
    const failure = Object.assign(new Error("sandbox unavailable"), {
      code: "SANDBOX_UNAVAILABLE",
    });
    const worker = new StageAReplayWorker(
      stageStore,
      { execute: async () => Promise.reject(failure) },
      new SubmitMatchingStageAHandler(stageStore, stageIds),
      3,
    );
    await expect(worker.runOnce("failing-stage-worker")).resolves.toBe("RETRY_SCHEDULED");
    await pool.query(
      "UPDATE outbox_messages SET available_at = clock_timestamp() WHERE message_type = 'ProofWindowAccepted'",
    );
    await expect(worker.runOnce("failing-stage-worker")).resolves.toBe("RETRY_SCHEDULED");
    await pool.query(
      "UPDATE outbox_messages SET available_at = clock_timestamp() WHERE message_type = 'ProofWindowAccepted'",
    );
    await expect(worker.runOnce("failing-stage-worker")).resolves.toBe("PROCESSED");
    const result = await pool.query<{
      state: string;
      hold: string;
      slot: string;
      lease: string;
      adverse: string;
      aborts: string;
    }>(
      `SELECT review_window.state, hold.status AS hold, slot.status AS slot,
              lease.status AS lease,
        (SELECT count(*)::text FROM domain_events
          WHERE event_type IN ('CandidateFailureRecorded', 'EmployerBreachRecorded')) AS adverse,
        (SELECT count(*)::text FROM domain_events WHERE event_type = 'PlatformAborted') AS aborts
       FROM review_windows AS review_window
       JOIN credit_holds AS hold ON hold.credit_hold_ref = review_window.credit_hold_ref
       JOIN attention_slots AS slot ON slot.slot_ref = review_window.attention_slot_ref
       JOIN candidate_activity_leases AS lease
         ON lease.subject_type = 'DEEP_PROOF_REVIEW_WINDOW'
        AND lease.subject_ref = review_window.id
       WHERE review_window.id = 'review-window-42'`,
    );
    expect(result.rows[0]).toEqual({
      state: "PLATFORM_ABORT",
      hold: "RETURNED",
      slot: "AVAILABLE",
      lease: "RELEASED",
      adverse: "0",
      aborts: "1",
    });
  });
});
