import {
  createPostgresPool,
  rollbackLatestPostgresMigration,
  runPostgresMigrations,
} from "../../packages/db/src/index";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("BLOCKED: Blind-answer migration tests require TEST_DATABASE_URL.");
}
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)).toLowerCase();
if (!/(?:^|[_-])test(?:$|[_-])/u.test(databaseName)) {
  throw new Error("REFUSED: Blind-answer migration tests require a dedicated test database.");
}

const pool = createPostgresPool(databaseUrl);

describe.sequential("Blind-answer-first PostgreSQL migration", () => {
  beforeAll(async () => {
    await runPostgresMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates the target tables and registers 0003", async () => {
    const migrations = await pool.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(migrations.rows.map(({ version }) => version)).toEqual([
      "0001_challenge_recommendation_vertical",
      "0002_matching_vertical",
      "0003_blind_answer_first",
      "0004_blind_review_runtime_pins",
      "0005_candidate_interest_and_answer_invitation_decisions",
      "0006_functional_product_vertical",
      "0007_review_sla_breach_settlement",
      "0008_candidate_evidence_passport",
      "0009_candidate_answer_focus_policy",
      "0010_employer_ai_review_analyst",
      "0011_answer_behavior_profile",
      "0012_candidate_education_and_review_reveal",
    ]);
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
        ORDER BY table_name`,
      [
        [
          "blind_review_commitments",
          "answer_review_slots",
          "answer_review_slot_credit_reservations",
          "answer_review_obligations",
          "answer_invitations",
          "advancement_cohorts",
          "advancement_cohort_seats",
          "candidate_activity_leases",
          "blind_review_command_receipts",
        ],
      ],
    );
    expect(tables.rows).toHaveLength(9);
  });

  it("upgrades a database with the immutable 0003 already recorded", async () => {
    await pool.query(`
      TRUNCATE TABLE
        blind_review_command_receipts,
        inbox_messages,
        review_windows,
        opportunities,
        domain_events
      CASCADE
    `);
    await expect(rollbackLatestPostgresMigration(pool)).resolves.toBe(
      "0012_candidate_education_and_review_reveal",
    );
    await expect(rollbackLatestPostgresMigration(pool)).resolves.toBe(
      "0011_answer_behavior_profile",
    );
    await expect(rollbackLatestPostgresMigration(pool)).resolves.toBe(
      "0010_employer_ai_review_analyst",
    );
    await expect(rollbackLatestPostgresMigration(pool)).resolves.toBe(
      "0009_candidate_answer_focus_policy",
    );
    await expect(rollbackLatestPostgresMigration(pool)).resolves.toBe(
      "0008_candidate_evidence_passport",
    );
    await expect(rollbackLatestPostgresMigration(pool)).resolves.toBe(
      "0007_review_sla_breach_settlement",
    );
    await expect(rollbackLatestPostgresMigration(pool)).resolves.toBe(
      "0006_functional_product_vertical",
    );
    await expect(rollbackLatestPostgresMigration(pool)).resolves.toBe(
      "0005_candidate_interest_and_answer_invitation_decisions",
    );
    await expect(rollbackLatestPostgresMigration(pool)).resolves.toBe(
      "0004_blind_review_runtime_pins",
    );
    const before = await pool.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(before.rows.at(-1)?.version).toBe("0003_blind_answer_first");
    await expect(runPostgresMigrations(pool)).resolves.toEqual([
      "0004_blind_review_runtime_pins",
      "0005_candidate_interest_and_answer_invitation_decisions",
      "0006_functional_product_vertical",
      "0007_review_sla_breach_settlement",
      "0008_candidate_evidence_passport",
      "0009_candidate_answer_focus_policy",
      "0010_employer_ai_review_analyst",
      "0011_answer_behavior_profile",
      "0012_candidate_education_and_review_reveal",
    ]);
  });

  it("enforces durable Slot, Hold, Cohort, Lease, and immutability constraints", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO opportunities (
           id, title, status, reviewer_id, current_contract_version_ref,
           current_label_policy_version_ref
         ) VALUES
           ('opp-blind-probe-1', 'Probe 1', 'OPEN', 'reviewer-probe',
            'contract-blind-probe-1', 'label-blind-probe-1'),
           ('opp-blind-probe-2', 'Probe 2', 'OPEN', 'reviewer-probe',
            'contract-blind-probe-2', 'label-blind-probe-2')`,
      );
      await client.query(
        `INSERT INTO sealed_capability_contracts (
           contract_version_ref, opportunity_ref, contract_hash, contract_json, sealed_at
         ) VALUES
           ('contract-blind-probe-1', 'opp-blind-probe-1', $1, '{}'::jsonb, clock_timestamp()),
           ('contract-blind-probe-2', 'opp-blind-probe-2', $2, '{}'::jsonb, clock_timestamp())`,
        [`sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`],
      );
      await client.query(
        `INSERT INTO attention_commitments (
           commitment_ref, opportunity_ref, reviewer_ref, active_wip, direct_slots,
           explore_slots, credit_per_window, accept_sla_hours, checkpoint_sla_seconds,
           final_review_sla_hours, version, answer_review_wip, answer_review_sla_hours,
           advancement_cohort_size, queue_policy_version, queue_public_seed,
           credit_per_answer_review, blind_review_status
         ) VALUES (
           'attention-blind-probe', 'opp-blind-probe-1', 'reviewer-probe', 1, 1, 0,
           10, 24, 90, 24, 1, 1, 24, 2, 'onlyboth.interest-queue@1',
           'queue-seed-probe', 1, 'ACTIVE'
         )`,
      );
      await client.query(
        `INSERT INTO credit_accounts (
           account_ref, opportunity_ref, available_credits, held_credits, reserved_credits, version
         ) VALUES ('credit-account-blind-probe', 'opp-blind-probe-1', 27, 0, 1, 1)`,
      );
      await client.query(
        `INSERT INTO blind_review_commitments (
           commitment_ref, opportunity_ref, source_attention_commitment_ref,
           credit_account_ref, contract_version_ref, contract_hash, question_version_ref,
           question_hash, reviewer_ref, answer_review_wip, answer_review_sla_hours,
           advancement_cohort_size, queue_policy_version, queue_public_seed,
           credit_per_answer_review, reserved_credit_amount, state, version,
           aggregate_json, activated_at
         ) VALUES (
           'blind-commitment-probe', 'opp-blind-probe-1', 'attention-blind-probe',
           'credit-account-blind-probe', 'contract-blind-probe-1', $1,
           'question-blind-probe@1', $2, 'reviewer-probe', 1, 24, 2,
           'onlyboth.interest-queue@1', 'queue-seed-probe', 1, 1, 'ACTIVE', 1,
           '{"state":"ACTIVE","version":1}'::jsonb, clock_timestamp()
         )`,
        [`sha256:${"a".repeat(64)}`, `sha256:${"c".repeat(64)}`],
      );
      await client.query(
        `INSERT INTO answer_review_slots (
           slot_ref, commitment_ref, ordinal, status, reserved_credit_amount, version
         ) VALUES ('answer-slot-probe', 'blind-commitment-probe', 1, 'AVAILABLE', 1, 1)`,
      );
      await client.query(
        `INSERT INTO advancement_cohorts (
           cohort_ref, commitment_ref, sequence, target_size, state, version
         ) VALUES ('cohort-blind-probe', 'blind-commitment-probe', 1, 2, 'COLLECTING', 1)`,
      );
      await client.query(
        `INSERT INTO advancement_cohort_seats (
           cohort_seat_ref, cohort_ref, ordinal, status, version
         ) VALUES
           ('cohort-seat-blind-probe-1', 'cohort-blind-probe', 1, 'OPEN', 1),
           ('cohort-seat-blind-probe-2', 'cohort-blind-probe', 2, 'OPEN', 1)`,
      );
      await client.query(
        `INSERT INTO answer_review_slot_credit_reservations (
           reservation_ref, slot_ref, account_ref, amount, state, version
         ) VALUES (
           'slot-credit-reservation-blind-probe', 'answer-slot-probe',
           'credit-account-blind-probe', 1, 'BOUND', 2
         )`,
      );
      await client.query(
        `INSERT INTO candidate_interests (
           interest_ref, opportunity_ref, candidate_ref, status, submitted_at,
           interest_schema_version, consent_version, hard_facts_json,
           eligibility_edge_ref, eligible_at, interest_created_at,
           queue_policy_version, queue_tie_break, contract_version_ref
         ) VALUES (
           'interest-blind-probe', 'opp-blind-probe-1', 'candidate-blind-probe',
           'WAITING_FOR_BACKED_SLOT', clock_timestamp(), 'candidate-interest@1',
           'consent@1', '[]'::jsonb, 'eligibility-blind-probe', clock_timestamp(),
           clock_timestamp(), 'onlyboth.interest-queue@1', $1, 'contract-blind-probe-1'
         )`,
        [`sha256:${"d".repeat(64)}`],
      );
      await client.query(
        `INSERT INTO eligibility_edges (
           eligibility_edge_ref, candidate_ref, contract_version_ref, eligible,
           predicate_results_json, opportunity_ref, interest_ref, created_at
         ) VALUES (
           'eligibility-blind-probe', 'candidate-blind-probe', 'contract-blind-probe-1',
           true, '[]'::jsonb, 'opp-blind-probe-1', 'interest-blind-probe', clock_timestamp()
         )`,
      );
      await client.query(
        `INSERT INTO credit_holds (
           credit_hold_ref, account_ref, amount, status, created_at, purpose,
           subject_ref, reservation_ref
         ) VALUES (
           'credit-hold-blind-probe', 'credit-account-blind-probe', 1, 'HELD',
           clock_timestamp(), 'ANSWER_REVIEW', 'obligation-blind-probe',
           'slot-credit-reservation-blind-probe'
         )`,
      );
      await client.query(
        `INSERT INTO answer_review_obligations (
           obligation_ref, commitment_ref, slot_ref, interest_ref, candidate_ref,
           cohort_ref, cohort_seat_ref, credit_hold_ref, status, offer_expires_at, version
         ) VALUES (
           'obligation-blind-probe', 'blind-commitment-probe', 'answer-slot-probe',
           'interest-blind-probe', 'candidate-blind-probe', 'cohort-blind-probe',
           'cohort-seat-blind-probe-1', 'credit-hold-blind-probe', 'INVITED',
           clock_timestamp() + interval '1 hour', 1
         )`,
      );
      await client.query(
        `UPDATE answer_review_slots
            SET status = 'OFFERED', current_obligation_ref = 'obligation-blind-probe', version = 2
          WHERE slot_ref = 'answer-slot-probe'`,
      );
      await client.query(
        `UPDATE advancement_cohort_seats
            SET status = 'RESERVED', obligation_ref = 'obligation-blind-probe', version = 2
          WHERE cohort_seat_ref = 'cohort-seat-blind-probe-1'`,
      );
      await client.query(
        `INSERT INTO candidate_activity_leases (
           lease_ref, candidate_ref, opportunity_ref, subject_type, subject_ref,
           status, acquired_at, version
         ) VALUES (
           'activity-lease-blind-probe', 'candidate-blind-probe', 'opp-blind-probe-1',
           'ANSWER_REVIEW_OBLIGATION', 'obligation-blind-probe', 'ACTIVE',
           clock_timestamp(), 1
         )`,
      );

      const reservations = await client.query<{ account_reserved: number; slot_reserved: number }>(
        `SELECT account.reserved_credits AS account_reserved,
                slot.reserved_credit_amount AS slot_reserved
           FROM credit_accounts AS account
           JOIN blind_review_commitments AS commitment
             ON commitment.credit_account_ref = account.account_ref
           JOIN answer_review_slots AS slot
             ON slot.commitment_ref = commitment.commitment_ref
          WHERE commitment.commitment_ref = 'blind-commitment-probe'`,
      );
      expect(reservations.rows[0]).toEqual({ account_reserved: 1, slot_reserved: 1 });

      await client.query("SAVEPOINT duplicate_activity");
      await expect(
        client.query(
          `INSERT INTO candidate_activity_leases (
             lease_ref, candidate_ref, opportunity_ref, subject_type, subject_ref,
             status, acquired_at, version
           ) VALUES (
             'activity-lease-blind-probe-duplicate', 'candidate-blind-probe',
             'opp-blind-probe-2', 'DEEP_PROOF_REVIEW_WINDOW', 'review-window-probe',
             'ACTIVE', clock_timestamp(), 1
           )`,
        ),
      ).rejects.toThrow(/one_active_candidate_activity/iu);
      await client.query("ROLLBACK TO SAVEPOINT duplicate_activity");

      await client.query("SAVEPOINT invalid_ready_cohort");
      await expect(
        client.query(
          `INSERT INTO advancement_cohorts (
             cohort_ref, commitment_ref, sequence, target_size,
             submitted_count, reviewed_count, state, version
           ) VALUES (
             'cohort-blind-probe-invalid', 'blind-commitment-probe', 2, 2,
             1, 1, 'READY_FOR_ADVANCEMENT', 1
           )`,
        ),
      ).rejects.toThrow(/advancement_cohorts_check/iu);
      await client.query("ROLLBACK TO SAVEPOINT invalid_ready_cohort");

      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES (
           'event-blind-migration-probe', 'BlindReviewCommitmentActivated', 1,
           'BlindReviewCommitment', 'blind-commitment-probe', 1,
           'correlation-blind-migration-probe', clock_timestamp(), '{}'::jsonb
         )`,
      );
      await client.query("SAVEPOINT immutable_event");
      await expect(
        client.query(
          "UPDATE domain_events SET payload = payload WHERE event_id = 'event-blind-migration-probe'",
        ),
      ).rejects.toThrow(/immutable/iu);
      await client.query("ROLLBACK TO SAVEPOINT immutable_event");

      await client.query(
        `UPDATE credit_holds
            SET status = 'RETURNED', settled_at = clock_timestamp()
          WHERE credit_hold_ref = 'credit-hold-blind-probe'`,
      );
      await client.query(
        `UPDATE answer_review_slot_credit_reservations
            SET state = 'RESERVED', version = version + 1
          WHERE reservation_ref = 'slot-credit-reservation-blind-probe'`,
      );
      await expect(
        client.query(
          `INSERT INTO credit_holds (
             credit_hold_ref, account_ref, amount, status, created_at, purpose,
             subject_ref, reservation_ref
           ) VALUES (
             'credit-hold-blind-probe-rebound', 'credit-account-blind-probe', 1,
             'HELD', clock_timestamp(), 'ANSWER_REVIEW',
             'obligation-blind-probe-rebound', 'slot-credit-reservation-blind-probe'
           )`,
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await client.query("SAVEPOINT concurrent_rebound_hold");
      await expect(
        client.query(
          `INSERT INTO credit_holds (
             credit_hold_ref, account_ref, amount, status, created_at, purpose,
             subject_ref, reservation_ref
           ) VALUES (
             'credit-hold-blind-probe-concurrent', 'credit-account-blind-probe', 1,
             'HELD', clock_timestamp(), 'ANSWER_REVIEW',
             'obligation-blind-probe-concurrent', 'slot-credit-reservation-blind-probe'
           )`,
        ),
      ).rejects.toThrow(/one_answer_review_hold_per_reservation/iu);
      await client.query("ROLLBACK TO SAVEPOINT concurrent_rebound_hold");

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
