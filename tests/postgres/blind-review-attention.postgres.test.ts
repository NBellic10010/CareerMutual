import { createHash } from "node:crypto";

import {
  ActivateBlindReviewCommitmentHandler,
  InterestQueueWorker,
  OfferNextQueuedInterestHandler,
  type BlindReviewApplicationIdFactory,
} from "../../packages/application/src/index";
import {
  PostgresInterestQueueStore,
  createPostgresPool,
  runPostgresMigrations,
} from "../../packages/db/src/index";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("BLOCKED: Blind Review Attention tests require TEST_DATABASE_URL.");
}
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)).toLowerCase();
if (!/(?:^|[_-])test(?:$|[_-])/u.test(databaseName)) {
  throw new Error("REFUSED: Blind Review Attention tests require a dedicated test database.");
}

const sha256 = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const pool = createPostgresPool(databaseUrl);
const store = new PostgresInterestQueueStore(pool);
let idSequence = 0;
const ids: BlindReviewApplicationIdFactory = {
  nextId: (kind) => `${kind}-blind-postgres-${++idSequence}`,
};
const activation = new ActivateBlindReviewCommitmentHandler(store, ids);
const offerHandler = new OfferNextQueuedInterestHandler(store, ids, sha256);
const worker = new InterestQueueWorker(store, offerHandler);

interface OpportunityFixture {
  readonly opportunityRef: string;
  readonly contractRef: string;
  readonly attentionRef: string;
  readonly accountRef: string;
  readonly publicSeed: string;
}

async function clearFixture(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      blind_review_command_receipts,
      inbox_messages,
      review_windows,
      opportunities,
      domain_events
    CASCADE
  `);
  idSequence = 0;
}

async function insertInterest(
  fixture: OpportunityFixture,
  candidateRef: string,
  ordinal: number,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const interestRef = `interest-${fixture.opportunityRef}-${candidateRef}`;
    const eligibilityRef = `eligibility-${fixture.opportunityRef}-${candidateRef}`;
    const createdAt = new Date(Date.UTC(2026, 6, 19, 12, 0, ordinal));
    await client.query(
      `INSERT INTO candidate_interests (
         interest_ref, opportunity_ref, candidate_ref, status, submitted_at,
         interest_schema_version, consent_version, hard_facts_json,
         eligibility_edge_ref, eligible_at, interest_created_at,
         queue_policy_version, queue_tie_break, contract_version_ref
       ) VALUES ($1, $2, $3, 'WAITING_FOR_BACKED_SLOT', $4,
                 'candidate-interest@1', 'synthetic-consent@1', '[]'::jsonb,
                 $5, $4, $4, 'onlyboth.interest-queue@1', $6, $7)`,
      [
        interestRef,
        fixture.opportunityRef,
        candidateRef,
        createdAt,
        eligibilityRef,
        sha256(`${fixture.publicSeed}|${fixture.opportunityRef}|${candidateRef}`),
        fixture.contractRef,
      ],
    );
    await client.query(
      `INSERT INTO eligibility_edges (
         eligibility_edge_ref, candidate_ref, contract_version_ref, eligible,
         predicate_results_json, opportunity_ref, interest_ref, created_at
       ) VALUES ($1, $2, $3, true, '[]'::jsonb, $4, $5, $6)`,
      [
        eligibilityRef,
        candidateRef,
        fixture.contractRef,
        fixture.opportunityRef,
        interestRef,
        createdAt,
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

async function seedOpportunity(
  suffix: string,
  candidateRefs: readonly string[],
  availableCredits = 28,
): Promise<OpportunityFixture> {
  const fixture = {
    opportunityRef: `opp-blind-${suffix}`,
    contractRef: `contract-blind-${suffix}@1`,
    attentionRef: `attention-blind-${suffix}`,
    accountRef: `credit-account-blind-${suffix}`,
    publicSeed: `onlyboth-interest-queue-${suffix}@1`,
  } satisfies OpportunityFixture;
  await pool.query(
    `INSERT INTO opportunities (
       id, title, status, reviewer_id, current_contract_version_ref,
       current_label_policy_version_ref, runtime_mode, synthetic
     ) VALUES ($1, 'Senior Backend Engineer', 'OPEN', 'reviewer-sarah-chen',
               $2, $3, 'GOLDEN_REPLAY', true)`,
    [fixture.opportunityRef, fixture.contractRef, `label-policy-${suffix}@1`],
  );
  await pool.query(
    `INSERT INTO sealed_capability_contracts (
       contract_version_ref, opportunity_ref, contract_hash, contract_json, sealed_at
     ) VALUES ($1, $2, $3, $4::jsonb, clock_timestamp())`,
    [
      fixture.contractRef,
      fixture.opportunityRef,
      sha256(`contract:${suffix}`),
      JSON.stringify({ candidate_effort_limit_minutes: 6 }),
    ],
  );
  await pool.query(
    `INSERT INTO attention_commitments (
       commitment_ref, opportunity_ref, reviewer_ref, active_wip, direct_slots,
       explore_slots, credit_per_window, accept_sla_hours, checkpoint_sla_seconds,
       final_review_sla_hours, version, reviewer_display_name, question_version_ref,
       question_hash, queue_public_seed, blind_review_status
     ) VALUES ($1, $2, 'reviewer-sarah-chen', 2, 1, 1, 10, 24, 90, 24, 1,
               'Sarah Chen', $3, $4, $5, 'DRAFT')`,
    [
      fixture.attentionRef,
      fixture.opportunityRef,
      `question-payment-retry-${suffix}@1`,
      sha256(`question:${suffix}`),
      fixture.publicSeed,
    ],
  );
  await pool.query(
    `INSERT INTO credit_accounts (
       account_ref, opportunity_ref, available_credits, held_credits,
       reserved_credits, version
     ) VALUES ($1, $2, $3, 0, 0, 1)`,
    [fixture.accountRef, fixture.opportunityRef, availableCredits],
  );
  for (const [index, candidateRef] of candidateRefs.entries()) {
    await insertInterest(fixture, candidateRef, index);
  }
  return fixture;
}

function activationRequest(
  fixture: OpportunityFixture,
  idempotencyKey: string,
  answerReviewWip = 2,
) {
  return {
    opportunityRef: fixture.opportunityRef,
    actor: { role: "EMPLOYER" as const, actorId: "reviewer-sarah-chen" },
    idempotencyKey,
    correlationId: `correlation-${idempotencyKey}`,
    command: {
      schema_version: "activate-blind-review-commitment-command@1" as const,
      answer_review_wip: answerReviewWip,
      answer_review_sla_hours: 24,
      advancement_cohort_size: 2,
      queue_policy_version: "onlyboth.interest-queue@1" as const,
      credit_per_answer_review: 1,
      expected_opportunity_version: 1,
      expected_commitment_version: 0,
    },
  };
}

async function activateFixture(
  fixture: OpportunityFixture,
  answerReviewWip = 2,
  key = `activate-${fixture.opportunityRef}`,
) {
  return activation.execute(activationRequest(fixture, key, answerReviewWip));
}

describe.sequential("Rolling Blind Review PostgreSQL Attention", () => {
  beforeAll(async () => {
    await runPostgresMigrations(pool);
  });

  beforeEach(async () => {
    await clearFixture();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("atomically activates reusable Slots and deduplicates same-key concurrency", async () => {
    const fixture = await seedOpportunity("atomic", ["candidate-01", "candidate-02"]);
    const request = activationRequest(fixture, "activation-same-key");
    const [first, duplicate] = await Promise.all([
      activation.execute(request),
      activation.execute(request),
    ]);
    expect(duplicate).toEqual(first);
    expect(first).toMatchObject({ state: "ACTIVE", new_commitment_version: 1 });
    const persisted = await pool.query<{
      commitments: string;
      slots: string;
      reservations: string;
      events: string;
      outbox: string;
      receipts: string;
      available: number;
      reserved: number;
    }>(
      `SELECT
        (SELECT count(*)::text FROM blind_review_commitments) AS commitments,
        (SELECT count(*)::text FROM answer_review_slots) AS slots,
        (SELECT count(*)::text FROM answer_review_slot_credit_reservations) AS reservations,
        (SELECT count(*)::text FROM domain_events
          WHERE event_type = 'BlindReviewCommitmentActivated') AS events,
        (SELECT count(*)::text FROM outbox_messages
          WHERE message_type = 'OfferNextQueuedInterestRequested') AS outbox,
        (SELECT count(*)::text FROM blind_review_command_receipts) AS receipts,
        available_credits AS available, reserved_credits AS reserved
       FROM credit_accounts WHERE account_ref = $1`,
      [fixture.accountRef],
    );
    expect(persisted.rows[0]).toEqual({
      commitments: "1",
      slots: "2",
      reservations: "2",
      events: "1",
      outbox: "2",
      receipts: "1",
      available: 26,
      reserved: 2,
    });
  });

  it("rolls back the entire activation and lets only one separate-key race win", async () => {
    const fixture = await seedOpportunity("rollback", ["candidate-01", "candidate-02"]);
    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_second_blind_offer_dispatch()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.message_type = 'OfferNextQueuedInterestRequested'
           AND (SELECT count(*) FROM outbox_messages
                 WHERE message_type = 'OfferNextQueuedInterestRequested') >= 1 THEN
          RAISE EXCEPTION 'injected second blind dispatch failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER reject_second_blind_offer_dispatch
      BEFORE INSERT ON outbox_messages
      FOR EACH ROW EXECUTE FUNCTION reject_second_blind_offer_dispatch();
    `);
    try {
      await expect(activateFixture(fixture)).rejects.toThrow(
        "injected second blind dispatch failure",
      );
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS reject_second_blind_offer_dispatch ON outbox_messages;
        DROP FUNCTION IF EXISTS reject_second_blind_offer_dispatch();
      `);
    }
    const rollback = await pool.query<{
      commitments: string;
      slots: string;
      reservations: string;
      events: string;
      receipts: string;
      available: number;
      reserved: number;
    }>(
      `SELECT
        (SELECT count(*)::text FROM blind_review_commitments) AS commitments,
        (SELECT count(*)::text FROM answer_review_slots) AS slots,
        (SELECT count(*)::text FROM answer_review_slot_credit_reservations) AS reservations,
        (SELECT count(*)::text FROM domain_events
          WHERE event_type = 'BlindReviewCommitmentActivated') AS events,
        (SELECT count(*)::text FROM blind_review_command_receipts) AS receipts,
        available_credits AS available, reserved_credits AS reserved
       FROM credit_accounts WHERE account_ref = $1`,
      [fixture.accountRef],
    );
    expect(rollback.rows[0]).toEqual({
      commitments: "0",
      slots: "0",
      reservations: "0",
      events: "0",
      receipts: "0",
      available: 28,
      reserved: 0,
    });

    const outcomes = await Promise.allSettled([
      activation.execute(activationRequest(fixture, "activation-race-a")),
      activation.execute(activationRequest(fixture, "activation-race-b")),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
  });

  it("offers two Slots concurrently, binds reservations, and deduplicates redelivery", async () => {
    const fixture = await seedOpportunity("offers", ["candidate-01", "candidate-02"]);
    await activateFixture(fixture);
    const firstMessage = await store.claimNext("offer-worker-a", 30);
    const secondMessage = await store.claimNext("offer-worker-b", 30);
    if (firstMessage === null || secondMessage === null) throw new Error("Dispatches missing.");
    const [first, second] = await Promise.all([
      offerHandler.execute(firstMessage),
      offerHandler.execute(secondMessage),
    ]);
    expect([first.outcome, second.outcome]).toEqual(["OFFERED", "OFFERED"]);
    const persisted = await pool.query<{
      obligations: string;
      invitations: string;
      leases: string;
      holds: string;
      bound: string;
      reserved: number;
      held: number;
      noncanonical_hashes: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM answer_review_obligations) AS obligations,
        (SELECT count(*)::text FROM answer_invitations) AS invitations,
        (SELECT count(*)::text FROM candidate_activity_leases WHERE status = 'ACTIVE') AS leases,
        (SELECT count(*)::text FROM credit_holds
          WHERE purpose = 'ANSWER_REVIEW' AND status = 'HELD') AS holds,
        (SELECT count(*)::text FROM answer_review_slot_credit_reservations
          WHERE state = 'BOUND') AS bound,
        account.reserved_credits AS reserved, account.held_credits AS held,
        (SELECT count(*)::text FROM answer_invitations
          WHERE public_tie_break !~ '^sha256:[a-f0-9]{64}$'
             OR queue_snapshot_hash !~ '^sha256:[a-f0-9]{64}$') AS noncanonical_hashes
       FROM credit_accounts AS account WHERE account.account_ref = $1`,
      [fixture.accountRef],
    );
    expect(persisted.rows[0]).toEqual({
      obligations: "2",
      invitations: "2",
      leases: "2",
      holds: "2",
      bound: "2",
      reserved: 0,
      held: 2,
      noncanonical_hashes: "0",
    });

    await pool.query(
      `UPDATE outbox_messages
          SET processed_at = NULL, lease_owner = 'redelivery-worker',
              lease_expires_at = clock_timestamp() + interval '30 seconds',
              attempt_count = attempt_count + 1
        WHERE message_id = $1`,
      [firstMessage.messageId],
    );
    const redelivery = {
      ...firstMessage,
      leaseOwner: "redelivery-worker",
      attempt: firstMessage.attempt + 1,
    };
    await expect(offerHandler.execute(redelivery)).resolves.toEqual(first);
    const after = await pool.query<{ obligations: string }>(
      "SELECT count(*)::text AS obligations FROM answer_review_obligations",
    );
    expect(after.rows[0]?.obligations).toBe("2");
  });

  it("keeps an empty Slot reserved, then reconciles and offers a late Interest", async () => {
    const fixture = await seedOpportunity("late", []);
    await activateFixture(fixture, 1);
    const emptyMessage = await store.claimNext("empty-worker", 30);
    if (emptyMessage === null) throw new Error("Empty Queue dispatch missing.");
    await expect(offerHandler.execute(emptyMessage)).resolves.toMatchObject({
      outcome: "NO_WAITING_INTEREST",
    });
    await insertInterest(fixture, "candidate-late", 1);
    await expect(worker.runOnce("late-worker")).resolves.toBe("PROCESSED");
    const offered = await pool.query<{ candidate_ref: string }>(
      "SELECT candidate_ref FROM answer_review_obligations",
    );
    expect(offered.rows).toEqual([{ candidate_ref: "candidate-late" }]);
    await expect(store.scheduleNextAvailableSlot()).resolves.toBe(false);
  });

  it("rejects a tampered public seed and a same-key different payload", async () => {
    const fixture = await seedOpportunity("tamper", ["candidate-01"]);
    await activateFixture(fixture, 1);
    await pool.query(
      `UPDATE outbox_messages
          SET payload = jsonb_set(payload, '{public_seed}', '"tampered-seed"'::jsonb)
        WHERE message_type = 'OfferNextQueuedInterestRequested'`,
    );
    const tampered = await store.claimNext("tamper-worker", 30);
    if (tampered === null) throw new Error("Tampered dispatch missing.");
    await expect(offerHandler.execute(tampered)).resolves.toMatchObject({
      outcome: "SUPERSEDED",
      reason_code: "PUBLIC_SEED_CHANGED",
    });
    await pool.query(
      `UPDATE outbox_messages
          SET processed_at = NULL, lease_owner = 'different-payload-worker',
              lease_expires_at = clock_timestamp() + interval '30 seconds',
              attempt_count = attempt_count + 1
        WHERE message_id = $1`,
      [tampered.messageId],
    );
    await expect(
      offerHandler.execute({
        ...tampered,
        leaseOwner: "different-payload-worker",
        attempt: tampered.attempt + 1,
        payload: { ...tampered.payload, expected_slot_version: 999 },
      }),
    ).rejects.toThrow(/idempotency key was reused for a different payload/iu);
  });

  it.each(["TARGET_LEASE", "LEGACY_WINDOW"] as const)(
    "keeps Q_i=1 across Opportunities for $s",
    async (existingActivity) => {
      const fixture = await seedOpportunity(`qi-${existingActivity}`, [
        "candidate-01",
        "candidate-02",
      ]);
      const other = await seedOpportunity(`qi-other-${existingActivity}`, []);
      if (existingActivity === "TARGET_LEASE") {
        await pool.query(
          `INSERT INTO candidate_activity_leases (
             lease_ref, candidate_ref, opportunity_ref, subject_type, subject_ref,
             status, acquired_at, version
           ) VALUES ('lease-existing-target', 'candidate-01', $1,
                     'ANSWER_REVIEW_OBLIGATION', 'obligation-existing-target',
                     'ACTIVE', clock_timestamp(), 1)`,
          [other.opportunityRef],
        );
      } else {
        await pool.query(
          `INSERT INTO review_windows (
             id, candidate_id, opportunity_id, reviewer_id, state, version,
             contract_version_id, label_policy_version_id, proof_template_version_id,
             challenge_catalog_version_id, aggregate_json
           ) VALUES (
             'legacy-active-window', 'candidate-01', $1, 'reviewer-sarah-chen',
             'RESERVED', 1, $2, 'label-policy@1', 'proof-template@1',
             'challenge-catalog@1', '{}'::jsonb
           )`,
          [other.opportunityRef, other.contractRef],
        );
      }
      await activateFixture(fixture, 1);
      const message = await store.claimNext(`qi-worker-${existingActivity}`, 30);
      if (message === null) throw new Error("Q_i dispatch missing.");
      await expect(offerHandler.execute(message)).resolves.toMatchObject({
        outcome: "OFFERED",
        offer: { candidate_ref: "candidate-02" },
      });
    },
  );

  it.each(["TARGET_LEASE", "LEGACY_WINDOW"] as const)(
    "does not reschedule a free Slot when every waiting candidate has $s",
    async (existingActivity) => {
      const fixture = await seedOpportunity(`scheduler-${existingActivity}`, ["candidate-01"]);
      const other = await seedOpportunity(`scheduler-other-${existingActivity}`, []);
      if (existingActivity === "TARGET_LEASE") {
        await pool.query(
          `INSERT INTO candidate_activity_leases (
             lease_ref, candidate_ref, opportunity_ref, subject_type, subject_ref,
             status, acquired_at, version
           ) VALUES ('lease-scheduler-target', 'candidate-01', $1,
                     'ANSWER_REVIEW_OBLIGATION', 'obligation-scheduler-target',
                     'ACTIVE', clock_timestamp(), 1)`,
          [other.opportunityRef],
        );
      } else {
        await pool.query(
          `INSERT INTO review_windows (
             id, candidate_id, opportunity_id, reviewer_id, state, version,
             contract_version_id, label_policy_version_id, proof_template_version_id,
             challenge_catalog_version_id, aggregate_json
           ) VALUES (
             'legacy-scheduler-window', 'candidate-01', $1, 'reviewer-sarah-chen',
             'RESERVED', 1, $2, 'label-policy@1', 'proof-template@1',
             'challenge-catalog@1', '{}'::jsonb
           )`,
          [other.opportunityRef, other.contractRef],
        );
      }
      await activateFixture(fixture, 1);
      const initialMessage = await store.claimNext(`scheduler-initial-${existingActivity}`, 30);
      if (initialMessage === null) throw new Error("Initial dispatch missing.");
      await expect(offerHandler.execute(initialMessage)).resolves.toMatchObject({
        outcome: "NO_WAITING_INTEREST",
      });
      await expect(store.scheduleNextAvailableSlot()).resolves.toBe(false);
      await expect(worker.runOnce(`scheduler-worker-${existingActivity}`)).resolves.toBe("IDLE");
    },
  );

  it("records terminal queue failure visibly and suppresses automatic redrive", async () => {
    const fixture = await seedOpportunity("failure", ["candidate-01"]);
    await activateFixture(fixture, 1);
    const message = await store.claimNext("failure-worker", 30);
    if (message === null) throw new Error("Failure dispatch missing.");
    await store.markFailed(message, "INJECTED_QUEUE_FAILURE");
    await expect(store.scheduleNextAvailableSlot()).resolves.toBe(false);
    const failure = await pool.query<{ events: string; dead_letters: string }>(
      `SELECT
        (SELECT count(*)::text FROM domain_events
          WHERE event_type = 'InterestQueueOfferFailed') AS events,
        (SELECT count(*)::text FROM inbox_messages
          WHERE consumer = 'interest-queue-dead-letter') AS dead_letters`,
    );
    expect(failure.rows[0]).toEqual({ events: "1", dead_letters: "1" });
  });
});
