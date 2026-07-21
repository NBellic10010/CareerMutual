import { createHash } from "node:crypto";

import {
  ActivateBlindReviewCommitmentHandler,
  DecideAnswerInvitationHandler,
  ExpireAnswerInvitationHandler,
  InterestQueueWorker,
  OfferNextQueuedInterestHandler,
  SubmitCandidateInterestHandler,
} from "../../packages/application/src/index";
import {
  PostgresAnswerInvitationDecisionStore,
  PostgresCandidateInterestStore,
  PostgresInterestQueueStore,
  PostgresMatchEdgeWorkerStore,
  createPostgresPool,
  runPostgresMigrations,
} from "../../packages/db/src/index";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("BLOCKED: Candidate Interest decision tests require TEST_DATABASE_URL.");
}
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)).toLowerCase();
if (!/(?:^|[_-])test(?:$|[_-])/u.test(databaseName)) {
  throw new Error("REFUSED: Candidate Interest decision tests require a dedicated test database.");
}

const pool = createPostgresPool(databaseUrl);
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
let sequence = 0;
const ids = {
  nextId: (kind: string) => `${kind}-candidate-decisions-${++sequence}`,
};
const queueStore = new PostgresInterestQueueStore(pool);
const candidateStore = new PostgresCandidateInterestStore(pool);
const decisionStore = new PostgresAnswerInvitationDecisionStore(pool);
const activation = new ActivateBlindReviewCommitmentHandler(queueStore, ids);
const submitInterest = new SubmitCandidateInterestHandler(candidateStore, ids, hash);
const offer = new OfferNextQueuedInterestHandler(queueStore, ids, hash);
const queueWorker = new InterestQueueWorker(queueStore, offer);
const decideInvitation = new DecideAnswerInvitationHandler(decisionStore, ids);
const expireInvitation = new ExpireAnswerInvitationHandler(decisionStore, ids);

interface Fixture {
  readonly opportunityRef: string;
  readonly contractRef: string;
  readonly attentionRef: string;
  readonly accountRef: string;
  readonly publicSeed: string;
}

async function clearDatabase(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      blind_review_command_receipts,
      inbox_messages,
      review_windows,
      opportunities,
      domain_events
    CASCADE
  `);
  sequence = 0;
}

async function seedFixture(suffix: string): Promise<Fixture> {
  const fixture = {
    opportunityRef: `opp-decisions-${suffix}`,
    contractRef: `contract-decisions-${suffix}@1`,
    attentionRef: `attention-decisions-${suffix}`,
    accountRef: `account-decisions-${suffix}`,
    publicSeed: `public-seed-decisions-${suffix}@1`,
  } satisfies Fixture;
  await pool.query(
    `INSERT INTO opportunities (
       id, title, status, reviewer_id, current_contract_version_ref,
       current_label_policy_version_ref, runtime_mode, synthetic,
       required_interest_consent_version
     ) VALUES ($1, 'Blind Backend Role', 'OPEN', 'reviewer-sarah', $2,
               $3, 'GOLDEN_REPLAY', true, 'candidate-interest-consent@1')`,
    [fixture.opportunityRef, fixture.contractRef, `label-decisions-${suffix}@1`],
  );
  await pool.query(
    `INSERT INTO sealed_capability_contracts (
       contract_version_ref, opportunity_ref, contract_hash, contract_json, sealed_at
     ) VALUES ($1, $2, $3, $4::jsonb, clock_timestamp())`,
    [
      fixture.contractRef,
      fixture.opportunityRef,
      hash(`contract:${suffix}`),
      JSON.stringify({
        candidate_effort_limit_minutes: 6,
        hard_predicates: [
          {
            predicate_ref: "predicate:work-authorization",
            fact_type: "work_authorization",
            operator: "EQUALS",
            expected: "US",
          },
        ],
      }),
    ],
  );
  await pool.query(
    `INSERT INTO job_eligibility_match_policies (
       policy_ref, opportunity_ref, contract_version_ref,
       policy_version, policy_hash, access_mode, taxonomy_version,
       accepted_tags_json, sealed_at
     ) VALUES ($1, $2, $3, 'eligibility-match-policy@1', $4,
               'OPEN_TO_ALL', NULL, '[]'::jsonb, clock_timestamp())`,
    [
      `eligibility-policy:${fixture.opportunityRef}`,
      fixture.opportunityRef,
      fixture.contractRef,
      hash(`eligibility-policy:${fixture.opportunityRef}`),
    ],
  );
  await pool.query(
    `INSERT INTO attention_commitments (
       commitment_ref, opportunity_ref, reviewer_ref, active_wip, direct_slots,
       explore_slots, credit_per_window, accept_sla_hours, checkpoint_sla_seconds,
       final_review_sla_hours, version, reviewer_display_name, question_version_ref,
       question_hash, queue_public_seed, blind_review_status
     ) VALUES ($1, $2, 'reviewer-sarah', 1, 1, 0, 1, 24, 90, 24, 1,
               'Sarah Chen', $3, $4, $5, 'DRAFT')`,
    [
      fixture.attentionRef,
      fixture.opportunityRef,
      `question-decisions-${suffix}@1`,
      hash(`question:${suffix}`),
      fixture.publicSeed,
    ],
  );
  await pool.query(
    `INSERT INTO credit_accounts (
       account_ref, opportunity_ref, available_credits, held_credits,
       reserved_credits, version
     ) VALUES ($1, $2, 1, 0, 0, 1)`,
    [fixture.accountRef, fixture.opportunityRef],
  );
  await activation.execute({
    opportunityRef: fixture.opportunityRef,
    actor: { role: "EMPLOYER", actorId: "reviewer-sarah" },
    idempotencyKey: `activate-${suffix}`,
    correlationId: `activate-${suffix}`,
    command: {
      schema_version: "activate-blind-review-commitment-command@1",
      answer_review_wip: 1,
      answer_review_sla_hours: 24,
      advancement_cohort_size: 2,
      queue_policy_version: "onlyboth.interest-queue@1",
      credit_per_answer_review: 1,
      expected_opportunity_version: 1,
      expected_commitment_version: 0,
    },
  });
  return fixture;
}

async function submit(
  fixture: Fixture,
  candidateRef: string,
  key = `interest-${candidateRef}`,
  authorization = "US",
) {
  return submitInterest.execute({
    opportunityRef: fixture.opportunityRef,
    actor: { role: "CANDIDATE", actorId: candidateRef },
    idempotencyKey: key,
    correlationId: key,
    command: {
      schema_version: "candidate-interest-command@2",
      background_access_basis: "OPEN_TO_ALL",
      eligibility_match_ref: null,
      eligibility_match_version: null,
      hard_facts: [
        {
          fact_ref: `fact:${candidateRef}:work-authorization`,
          fact_type: "work_authorization",
          value: authorization,
        },
      ],
      consent_version: "candidate-interest-consent@1",
      expected_opportunity_version: 2,
    },
  });
}

async function setupOffer(suffix: string, candidates: readonly string[]) {
  const fixture = await seedFixture(suffix);
  for (const candidate of candidates) await submit(fixture, candidate);
  await expect(queueWorker.runOnce(`queue-${suffix}`)).resolves.toBe("PROCESSED");
  const invitation = await pool.query<{
    invitation_ref: string;
    obligation_ref: string;
    slot_ref: string;
    candidate_ref: string;
  }>(
    `SELECT invitation.invitation_ref, invitation.obligation_ref,
            obligation.slot_ref, invitation.candidate_ref
       FROM answer_invitations AS invitation
       JOIN answer_review_obligations AS obligation
         ON obligation.obligation_ref = invitation.obligation_ref
      WHERE invitation.status = 'OFFERED'`,
  );
  const row = invitation.rows[0];
  if (row === undefined) throw new Error("The backed Answer Invitation was not created.");
  return { fixture, ...row };
}

function decisionRequest(
  invitationRef: string,
  candidateRef: string,
  decision: "ACCEPT" | "DECLINE",
  key: string,
) {
  return {
    invitationRef,
    actor: { role: "CANDIDATE" as const, actorId: candidateRef },
    idempotencyKey: key,
    correlationId: key,
    command: {
      schema_version: "answer-invitation-decision-command@1" as const,
      decision,
      expected_obligation_version: 1,
      expected_slot_version: 2,
    },
  };
}

async function makeCurrentOfferExpired(): Promise<void> {
  const offeredAt = new Date(Date.now() - 7_200_000).toISOString();
  const expiresAt = new Date(Date.now() - 3_600_000).toISOString();
  await pool.query(
    `UPDATE answer_invitations
        SET offered_at = $1, offer_expires_at = $2
      WHERE status = 'OFFERED'`,
    [offeredAt, expiresAt],
  );
  await pool.query(
    `UPDATE answer_review_obligations
        SET offer_expires_at = $1
      WHERE status = 'INVITED'`,
    [expiresAt],
  );
  await pool.query(
    `UPDATE blind_review_commitments
        SET aggregate_json = jsonb_set(
          jsonb_set(aggregate_json, '{invitations,0,offeredAt}', to_jsonb($1::text)),
          '{invitations,0,offerExpiresAt}', to_jsonb($2::text)
        )`,
    [offeredAt, expiresAt],
  );
}

describe.sequential("Candidate Interest and Answer Invitation PostgreSQL decisions", () => {
  beforeAll(async () => {
    await runPostgresMigrations(pool);
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("accepts concurrent Interests at one immutable Opportunity version without legacy jobs", async () => {
    const fixture = await seedFixture("concurrent-interests");
    const [first, second] = await Promise.all([
      submit(fixture, "candidate-01"),
      submit(fixture, "candidate-02"),
    ]);
    expect(first.new_opportunity_version).toBe(2);
    expect(second.new_opportunity_version).toBe(2);
    const rows = await pool.query<{
      interests: string;
      edges: string;
      events: string;
      notifications: string;
      projections: string;
      receipts: string;
      opportunity_version: number;
      pinned: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM candidate_interests
          WHERE interest_schema_version = 'candidate-interest@2') AS interests,
        (SELECT count(*)::text FROM eligibility_edges WHERE interest_ref IS NOT NULL) AS edges,
        (SELECT count(*)::text FROM domain_events
          WHERE aggregate_type = 'CandidateInterest') AS events,
        (SELECT count(*)::text FROM outbox_messages
          WHERE message_type = 'CandidateInterestEligibilityDetermined') AS notifications,
        (SELECT count(*)::text FROM candidate_answer_projections) AS projections,
        (SELECT count(*)::text FROM blind_review_command_receipts
          WHERE command_type = 'SubmitCandidateInterest') AS receipts,
        opportunity.version AS opportunity_version,
        (SELECT count(*)::text FROM candidate_interests
          WHERE contract_version_ref = $2) AS pinned
       FROM opportunities AS opportunity WHERE opportunity.id = $1`,
      [fixture.opportunityRef, fixture.contractRef],
    );
    expect(rows.rows[0]).toEqual({
      interests: "2",
      edges: "2",
      events: "4",
      notifications: "2",
      projections: "2",
      receipts: "2",
      opportunity_version: 2,
      pinned: "2",
    });
    await expect(
      new PostgresMatchEdgeWorkerStore(pool).claimNext("legacy-worker", 30),
    ).resolves.toBeNull();
    await expect(queueStore.reconcileEligibilityNotification()).resolves.toBe(true);
    await expect(queueStore.reconcileEligibilityNotification()).resolves.toBe(true);
    await expect(queueStore.reconcileEligibilityNotification()).resolves.toBe(false);
    const reconciled = await pool.query<{ processed: string; inbox: string }>(
      `SELECT
        (SELECT count(*)::text FROM outbox_messages
          WHERE message_type = 'CandidateInterestEligibilityDetermined'
            AND processed_at IS NOT NULL) AS processed,
        (SELECT count(*)::text FROM inbox_messages
          WHERE consumer = 'interest-queue-eligibility-reconciler') AS inbox`,
    );
    expect(reconciled.rows[0]).toEqual({ processed: "2", inbox: "2" });
  });

  it("accepts exactly once and keeps Hold, reservation, Credit, Seat, and Q_i backing active", async () => {
    const context = await setupOffer("accept", ["candidate-01"]);
    const request = decisionRequest(
      context.invitation_ref,
      context.candidate_ref,
      "ACCEPT",
      "accept-once",
    );
    const [first, replay] = await Promise.all([
      decideInvitation.execute(request),
      decideInvitation.execute(request),
    ]);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      decision: "ACCEPT",
      obligation_state: "ANSWER_ACTIVE",
      answer_session_ref: expect.any(String),
      answer_due_at: expect.any(String),
    });
    await expect(
      decideInvitation.execute({
        ...request,
        command: { ...request.command, expected_slot_version: 999 },
      }),
    ).rejects.toThrow(/Idempotency-Key/iu);
    const state = await pool.query<{
      invitation: string;
      obligation: string;
      slot: string;
      interest: string;
      session: string;
      due_seconds: number;
      hold: string;
      reservation: string;
      lease: string;
      reserved: number;
      held: number;
      receipts: string;
    }>(
      `SELECT invitation.status AS invitation, obligation.status AS obligation,
              slot.status AS slot, interest.status AS interest,
              session.status AS session,
              extract(epoch FROM session.answer_due_at - session.started_at)::integer AS due_seconds,
              hold.status AS hold, reservation.state AS reservation,
              lease.status AS lease, account.reserved_credits AS reserved,
              account.held_credits AS held,
              (SELECT count(*)::text FROM blind_review_command_receipts
                WHERE command_type = 'DecideAnswerInvitation') AS receipts
         FROM answer_invitations AS invitation
         JOIN answer_review_obligations AS obligation
           ON obligation.obligation_ref = invitation.obligation_ref
         JOIN answer_review_slots AS slot ON slot.slot_ref = obligation.slot_ref
         JOIN candidate_interests AS interest ON interest.interest_ref = obligation.interest_ref
         JOIN answer_sessions AS session ON session.invitation_ref = invitation.invitation_ref
         JOIN credit_holds AS hold ON hold.credit_hold_ref = obligation.credit_hold_ref
         JOIN answer_review_slot_credit_reservations AS reservation
           ON reservation.reservation_ref = hold.reservation_ref
         JOIN candidate_activity_leases AS lease ON lease.subject_ref = obligation.obligation_ref
         JOIN credit_accounts AS account ON account.account_ref = hold.account_ref`,
    );
    expect(state.rows[0]).toEqual({
      invitation: "ACCEPTED",
      obligation: "ANSWER_ACTIVE",
      slot: "ANSWER_ACTIVE",
      interest: "APPLICATION_ACTIVE",
      session: "ACTIVE",
      due_seconds: 360,
      hold: "HELD",
      reservation: "BOUND",
      lease: "ACTIVE",
      reserved: 0,
      held: 1,
      receipts: "1",
    });
  });

  it("declines without inference and reuses the same Slot, reservation, and Cohort Seat", async () => {
    const context = await setupOffer("decline-reuse", ["candidate-01", "candidate-02"]);
    await decideInvitation.execute(
      decisionRequest(context.invitation_ref, context.candidate_ref, "DECLINE", "decline-first"),
    );
    await expect(queueWorker.runOnce("queue-reuse")).resolves.toBe("PROCESSED");
    const state = await pool.query<{
      invitations: string;
      returned_holds: string;
      held_holds: string;
      active_candidate: string;
      seat_obligation: string;
      reservation: string;
      reserved: number;
      held: number;
      released_leases: string;
      returns: string;
      adverse: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM answer_invitations) AS invitations,
        (SELECT count(*)::text FROM credit_holds WHERE status = 'RETURNED') AS returned_holds,
        (SELECT count(*)::text FROM credit_holds WHERE status = 'HELD') AS held_holds,
        (SELECT candidate_ref FROM answer_invitations WHERE status = 'OFFERED') AS active_candidate,
        seat.obligation_ref AS seat_obligation,
        reservation.state AS reservation,
        account.reserved_credits AS reserved, account.held_credits AS held,
        (SELECT count(*)::text FROM candidate_activity_leases
          WHERE status = 'RELEASED') AS released_leases,
        (SELECT count(*)::text FROM credit_ledger_entries
          WHERE entry_type = 'RETURN') AS returns,
        (SELECT count(*)::text FROM domain_events
          WHERE event_type IN ('CandidateFailureRecorded', 'EmployerBreachRecorded')) AS adverse
       FROM advancement_cohort_seats AS seat
       JOIN answer_review_slots AS slot ON slot.current_obligation_ref = seat.obligation_ref
       JOIN answer_review_slot_credit_reservations AS reservation
         ON reservation.slot_ref = slot.slot_ref
       JOIN blind_review_commitments AS commitment
         ON commitment.commitment_ref = slot.commitment_ref
       JOIN credit_accounts AS account ON account.account_ref = commitment.credit_account_ref
       WHERE seat.status = 'RESERVED'`,
    );
    expect(state.rows[0]).toMatchObject({
      invitations: "2",
      returned_holds: "1",
      held_holds: "1",
      active_candidate: "candidate-02",
      reservation: "BOUND",
      reserved: 0,
      held: 1,
      released_leases: "1",
      returns: "1",
      adverse: "0",
    });
    expect(state.rows[0]?.seat_obligation).toBeTruthy();
  });

  it("expires by database time and atomically returns backing without a command Receipt", async () => {
    await setupOffer("expiry", ["candidate-01"]);
    await makeCurrentOfferExpired();
    await expect(expireInvitation.executeNext()).resolves.toBe(true);
    await expect(expireInvitation.executeNext()).resolves.toBe(false);
    const state = await pool.query<{
      invitation: string;
      obligation: string;
      slot: string;
      interest: string;
      seat: string;
      hold: string;
      reservation: string;
      lease: string;
      reserved: number;
      held: number;
      returns: string;
      events: string;
      receipts: string;
    }>(
      `SELECT invitation.status AS invitation, obligation.status AS obligation,
              slot.status AS slot, interest.status AS interest, seat.status AS seat,
              hold.status AS hold, reservation.state AS reservation,
              lease.status AS lease, account.reserved_credits AS reserved,
              account.held_credits AS held,
              (SELECT count(*)::text FROM credit_ledger_entries
                WHERE entry_type = 'RETURN') AS returns,
              (SELECT count(*)::text FROM domain_events
                WHERE event_type = 'AnswerInvitationExpired') AS events,
              (SELECT count(*)::text FROM blind_review_command_receipts
                WHERE command_type = 'DecideAnswerInvitation') AS receipts
         FROM answer_invitations AS invitation
         JOIN answer_review_obligations AS obligation
           ON obligation.obligation_ref = invitation.obligation_ref
         JOIN answer_review_slots AS slot ON slot.slot_ref = obligation.slot_ref
         JOIN candidate_interests AS interest ON interest.interest_ref = obligation.interest_ref
         JOIN advancement_cohort_seats AS seat
           ON seat.cohort_seat_ref = obligation.cohort_seat_ref
         JOIN credit_holds AS hold ON hold.credit_hold_ref = obligation.credit_hold_ref
         JOIN answer_review_slot_credit_reservations AS reservation
           ON reservation.reservation_ref = hold.reservation_ref
         JOIN candidate_activity_leases AS lease ON lease.subject_ref = obligation.obligation_ref
         JOIN credit_accounts AS account ON account.account_ref = hold.account_ref`,
    );
    expect(state.rows[0]).toEqual({
      invitation: "EXPIRED",
      obligation: "EXPIRED",
      slot: "AVAILABLE",
      interest: "OFFER_EXPIRED",
      seat: "OPEN",
      hold: "RETURNED",
      reservation: "RESERVED",
      lease: "RELEASED",
      reserved: 1,
      held: 0,
      returns: "1",
      events: "1",
      receipts: "0",
    });
  });

  it("rolls back every release mutation when the next-Slot Outbox insert fails", async () => {
    const context = await setupOffer("release-rollback", ["candidate-01"]);
    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_answer_invitation_release_outbox()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.message_type = 'OfferNextQueuedInterestRequested' THEN
          RAISE EXCEPTION 'injected invitation release outbox failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER reject_answer_invitation_release_outbox
      BEFORE INSERT ON outbox_messages
      FOR EACH ROW EXECUTE FUNCTION reject_answer_invitation_release_outbox();
    `);
    try {
      await expect(
        decideInvitation.execute(
          decisionRequest(
            context.invitation_ref,
            context.candidate_ref,
            "DECLINE",
            "decline-rollback",
          ),
        ),
      ).rejects.toThrow("injected invitation release outbox failure");
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS reject_answer_invitation_release_outbox ON outbox_messages;
        DROP FUNCTION IF EXISTS reject_answer_invitation_release_outbox();
      `);
    }
    const state = await pool.query<{
      invitation: string;
      obligation: string;
      slot: string;
      interest: string;
      seat: string;
      hold: string;
      reservation: string;
      lease: string;
      reserved: number;
      held: number;
      returns: string;
      terminal_events: string;
      receipts: string;
    }>(
      `SELECT invitation.status AS invitation, obligation.status AS obligation,
              slot.status AS slot, interest.status AS interest, seat.status AS seat,
              hold.status AS hold, reservation.state AS reservation,
              lease.status AS lease, account.reserved_credits AS reserved,
              account.held_credits AS held,
              (SELECT count(*)::text FROM credit_ledger_entries
                WHERE entry_type = 'RETURN') AS returns,
              (SELECT count(*)::text FROM domain_events
                WHERE event_type IN ('AnswerInvitationDeclined', 'AnswerInvitationExpired'))
                AS terminal_events,
              (SELECT count(*)::text FROM blind_review_command_receipts
                WHERE command_type = 'DecideAnswerInvitation') AS receipts
         FROM answer_invitations AS invitation
         JOIN answer_review_obligations AS obligation
           ON obligation.obligation_ref = invitation.obligation_ref
         JOIN answer_review_slots AS slot ON slot.slot_ref = obligation.slot_ref
         JOIN candidate_interests AS interest ON interest.interest_ref = obligation.interest_ref
         JOIN advancement_cohort_seats AS seat
           ON seat.cohort_seat_ref = obligation.cohort_seat_ref
         JOIN credit_holds AS hold ON hold.credit_hold_ref = obligation.credit_hold_ref
         JOIN answer_review_slot_credit_reservations AS reservation
           ON reservation.reservation_ref = hold.reservation_ref
         JOIN candidate_activity_leases AS lease ON lease.subject_ref = obligation.obligation_ref
         JOIN credit_accounts AS account ON account.account_ref = hold.account_ref`,
    );
    expect(state.rows[0]).toEqual({
      invitation: "OFFERED",
      obligation: "INVITED",
      slot: "OFFERED",
      interest: "BACKED_OFFERED",
      seat: "RESERVED",
      hold: "HELD",
      reservation: "BOUND",
      lease: "ACTIVE",
      reserved: 0,
      held: 1,
      returns: "0",
      terminal_events: "0",
      receipts: "0",
    });
  });

  it.each(["ACCEPT", "DECLINE"] as const)(
    "lets Expiry and %s race with exactly one terminal mutation",
    async (decision) => {
      const context = await setupOffer(`race-${decision}`, ["candidate-01"]);
      await makeCurrentOfferExpired();
      const outcomes = await Promise.allSettled([
        decideInvitation.execute(
          decisionRequest(
            context.invitation_ref,
            context.candidate_ref,
            decision,
            `race-${decision}`,
          ),
        ),
        expireInvitation.executeNext(),
      ]);
      expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
      const once = await pool.query<{
        invitation: string;
        returns: string;
        terminal_events: string;
      }>(
        `SELECT status AS invitation,
          (SELECT count(*)::text FROM credit_ledger_entries
            WHERE entry_type = 'RETURN') AS returns,
          (SELECT count(*)::text FROM domain_events
            WHERE event_type IN (
              'AnswerInvitationAccepted', 'AnswerInvitationDeclined', 'AnswerInvitationExpired'
            )) AS terminal_events
         FROM answer_invitations`,
      );
      expect(once.rows[0]).toEqual({
        invitation: "EXPIRED",
        returns: "1",
        terminal_events: "1",
      });
    },
  );
});
