import type {
  AnswerInvitationDecisionSnapshot,
  AnswerInvitationDecisionTransaction,
  AnswerInvitationDecisionUnitOfWork,
  PersistAnswerInvitationDecision,
  StoredAnswerInvitationDecisionReceipt,
} from "@onlyboth/application";
import {
  AnswerInvitationDecisionReceiptSchema,
  CandidateOpportunityProjectionV3Schema,
  EmployerBlindReviewProjectionSchema,
} from "@onlyboth/contracts";
import type { RollingBlindReview } from "@onlyboth/domain";
import type { Pool, PoolClient } from "pg";

import { PostgresOptimisticConcurrencyError } from "./postgres-challenge-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseReview(value: unknown): RollingBlindReview {
  if (
    !isRecord(value) ||
    !isRecord(value.commitment) ||
    !Array.isArray(value.interests) ||
    !Array.isArray(value.slots) ||
    !Array.isArray(value.obligations) ||
    !Array.isArray(value.invitations) ||
    !Array.isArray(value.cohorts)
  ) {
    throw new Error("Persisted Rolling Blind Review does not satisfy its storage contract.");
  }
  return structuredClone(value) as unknown as RollingBlindReview;
}

function requireOne(updated: { readonly rowCount: number | null }, message: string): void {
  if (updated.rowCount !== 1) throw new PostgresOptimisticConcurrencyError(message);
}

class PostgresAnswerInvitationDecisionTransaction implements AnswerInvitationDecisionTransaction {
  public constructor(
    private readonly client: PoolClient,
    public readonly databaseNow: Date,
  ) {}

  public async findReceipt(
    actorRef: string,
    idempotencyKey: string,
  ): Promise<StoredAnswerInvitationDecisionReceipt | null> {
    await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `blind-review-command:${actorRef}:${idempotencyKey}`,
    ]);
    const result = await this.client.query<{
      command_fingerprint: string;
      command_type: string;
      receipt_json: unknown;
    }>(
      `SELECT command_fingerprint, command_type, receipt_json
         FROM blind_review_command_receipts
        WHERE actor_ref = $1 AND idempotency_key = $2`,
      [actorRef, idempotencyKey],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    if (row.command_type !== "DecideAnswerInvitation") {
      throw new PostgresOptimisticConcurrencyError(
        "The Answer Invitation Idempotency-Key belongs to another command type.",
      );
    }
    return {
      actorRef,
      idempotencyKey,
      commandFingerprint: row.command_fingerprint,
      receipt: AnswerInvitationDecisionReceiptSchema.parse(row.receipt_json),
    };
  }

  public async loadInvitationForUpdate(
    invitationRef: string,
  ): Promise<AnswerInvitationDecisionSnapshot | null> {
    return this.loadLockedInvitation(invitationRef, false);
  }

  public async findExpiredInvitationForUpdate(): Promise<AnswerInvitationDecisionSnapshot | null> {
    const due = await this.client.query<{ invitation_ref: string }>(
      `SELECT invitation_ref
         FROM answer_invitations
        WHERE status = 'OFFERED' AND offer_expires_at <= $1
        ORDER BY offer_expires_at, invitation_ref
        LIMIT 1`,
      [this.databaseNow],
    );
    const invitationRef = due.rows[0]?.invitation_ref;
    if (invitationRef === undefined) return null;
    return this.loadLockedInvitation(invitationRef, true);
  }

  private async loadLockedInvitation(
    invitationRef: string,
    requireOffered: boolean,
  ): Promise<AnswerInvitationDecisionSnapshot | null> {
    await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `answer-invitation-decision:${invitationRef}`,
    ]);
    const contextResult = await this.client.query<{
      aggregate_json: unknown;
      queue_public_seed: string;
      reviewer_display_name: string | null;
      effort_limit_minutes: number;
      runtime_mode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
      synthetic: boolean;
      account_ref: string;
      account_version: number;
      available_credits: number;
      reserved_credits: number;
      held_credits: number;
      invitation_ref: string;
      obligation_ref: string;
      slot_ref: string;
      interest_ref: string;
      cohort_ref: string;
      cohort_seat_ref: string;
      credit_hold_ref: string;
    }>(
      `SELECT commitment.aggregate_json, commitment.queue_public_seed,
              attention.reviewer_display_name,
              COALESCE((contract.contract_json->>'candidate_effort_limit_minutes')::integer, 6)
                AS effort_limit_minutes,
              opportunity.runtime_mode, opportunity.synthetic,
              account.account_ref, account.version AS account_version,
              account.available_credits, account.reserved_credits, account.held_credits,
              invitation.invitation_ref, obligation.obligation_ref, obligation.slot_ref,
              obligation.interest_ref, obligation.cohort_ref, obligation.cohort_seat_ref,
              obligation.credit_hold_ref
         FROM answer_invitations AS invitation
         JOIN answer_review_obligations AS obligation
           ON obligation.obligation_ref = invitation.obligation_ref
         JOIN blind_review_commitments AS commitment
           ON commitment.commitment_ref = obligation.commitment_ref
         JOIN opportunities AS opportunity ON opportunity.id = commitment.opportunity_ref
         JOIN attention_commitments AS attention
           ON attention.commitment_ref = commitment.source_attention_commitment_ref
         JOIN sealed_capability_contracts AS contract
           ON contract.contract_version_ref = commitment.contract_version_ref
         JOIN credit_accounts AS account ON account.account_ref = commitment.credit_account_ref
        WHERE invitation.invitation_ref = $1
          AND ($2::boolean = false OR invitation.status = 'OFFERED')
        FOR UPDATE OF commitment, account`,
      [invitationRef, requireOffered],
    );
    const context = contextResult.rows[0];
    if (context === undefined) return null;

    requireOne(
      await this.client.query("SELECT 1 FROM answer_review_slots WHERE slot_ref = $1 FOR UPDATE", [
        context.slot_ref,
      ]),
      "The Answer Review Slot disappeared during Invitation locking.",
    );
    const reservationResult = await this.client.query<{
      reservation_ref: string;
      slot_ref: string;
      account_ref: string;
      amount: number;
      state: "RESERVED" | "BOUND" | "RELEASED";
      version: number;
    }>(
      `SELECT reservation_ref, slot_ref, account_ref, amount, state, version
         FROM answer_review_slot_credit_reservations
        WHERE slot_ref = $1 FOR UPDATE`,
      [context.slot_ref],
    );
    requireOne(
      await this.client.query(
        "SELECT 1 FROM candidate_interests WHERE interest_ref = $1 FOR UPDATE",
        [context.interest_ref],
      ),
      "The Candidate Interest disappeared during Invitation locking.",
    );
    requireOne(
      await this.client.query(
        "SELECT 1 FROM advancement_cohorts WHERE cohort_ref = $1 FOR UPDATE",
        [context.cohort_ref],
      ),
      "The Advancement Cohort disappeared during Invitation locking.",
    );
    requireOne(
      await this.client.query(
        "SELECT 1 FROM advancement_cohort_seats WHERE cohort_seat_ref = $1 FOR UPDATE",
        [context.cohort_seat_ref],
      ),
      "The Advancement Cohort Seat disappeared during Invitation locking.",
    );
    requireOne(
      await this.client.query(
        "SELECT 1 FROM answer_review_obligations WHERE obligation_ref = $1 FOR UPDATE",
        [context.obligation_ref],
      ),
      "The Answer Review Obligation disappeared during Invitation locking.",
    );
    requireOne(
      await this.client.query(
        "SELECT 1 FROM answer_invitations WHERE invitation_ref = $1 FOR UPDATE",
        [context.invitation_ref],
      ),
      "The Answer Invitation disappeared during Invitation locking.",
    );
    const holdResult = await this.client.query<{
      credit_hold_ref: string;
      account_ref: string;
      reservation_ref: string;
      subject_ref: string;
      amount: number;
      status: "HELD" | "RETURNED" | "FORFEITED";
      created_at: Date;
      settled_at: Date | null;
    }>(
      `SELECT credit_hold_ref, account_ref, reservation_ref, subject_ref, amount,
              status, created_at, settled_at
         FROM credit_holds
        WHERE credit_hold_ref = $1 AND purpose = 'ANSWER_REVIEW'
        FOR UPDATE`,
      [context.credit_hold_ref],
    );
    const leaseResult = await this.client.query<{
      lease_ref: string;
      candidate_ref: string;
      opportunity_ref: string;
      subject_ref: string;
      status: "ACTIVE" | "RELEASED";
      acquired_at: Date;
      released_at: Date | null;
      version: number;
    }>(
      `SELECT lease_ref, candidate_ref, opportunity_ref, subject_ref, status,
              acquired_at, released_at, version
         FROM candidate_activity_leases
        WHERE subject_type = 'ANSWER_REVIEW_OBLIGATION' AND subject_ref = $1
        FOR UPDATE`,
      [context.obligation_ref],
    );
    const reservation = reservationResult.rows[0];
    const hold = holdResult.rows[0];
    const lease = leaseResult.rows[0];
    if (reservation === undefined || hold === undefined || lease === undefined) return null;

    return {
      review: parseReview(context.aggregate_json),
      targetInvitationRef: context.invitation_ref,
      publicSeed: context.queue_public_seed,
      reviewerDisplayName: context.reviewer_display_name ?? "Named reviewer",
      effortLimitMinutes: context.effort_limit_minutes,
      runtimeMode: context.runtime_mode,
      synthetic: context.synthetic,
      creditAccount: {
        accountRef: context.account_ref,
        version: context.account_version,
        availableCredits: context.available_credits,
        committedCredits: context.reserved_credits,
        heldCredits: context.held_credits,
      },
      slotCreditReservation: {
        reservationRef: reservation.reservation_ref,
        slotRef: reservation.slot_ref,
        accountRef: reservation.account_ref,
        amount: reservation.amount,
        state: reservation.state,
        version: reservation.version,
      },
      creditHold: {
        creditHoldRef: hold.credit_hold_ref,
        accountRef: hold.account_ref,
        reservationRef: hold.reservation_ref,
        obligationRef: hold.subject_ref,
        amount: hold.amount,
        purpose: "ANSWER_REVIEW",
        status: hold.status,
        createdAt: hold.created_at.toISOString(),
        settledAt: hold.settled_at?.toISOString() ?? null,
      },
      activityLease: {
        leaseRef: lease.lease_ref,
        candidateRef: lease.candidate_ref,
        opportunityRef: lease.opportunity_ref,
        bindingKind: "ANSWER_REVIEW",
        bindingRef: lease.subject_ref,
        state: lease.status,
        version: lease.version,
        acquiredAt: lease.acquired_at.toISOString(),
        releasedAt: lease.released_at?.toISOString() ?? null,
      },
    };
  }

  public async persistDecision(input: PersistAnswerInvitationDecision): Promise<void> {
    const previousInvitation = input.previousReview.invitations.find(
      ({ invitationRef }) => invitationRef === input.invitationRef,
    );
    const nextInvitation = input.nextReview.invitations.find(
      ({ invitationRef }) => invitationRef === input.invitationRef,
    );
    const previousObligation = input.previousReview.obligations.find(
      ({ obligationRef }) => obligationRef === previousInvitation?.obligationRef,
    );
    const nextObligation = input.nextReview.obligations.find(
      ({ obligationRef }) => obligationRef === previousObligation?.obligationRef,
    );
    const previousSlot = input.previousReview.slots.find(
      ({ slotRef }) => slotRef === previousObligation?.slotRef,
    );
    const nextSlot = input.nextReview.slots.find(
      ({ slotRef }) => slotRef === previousSlot?.slotRef,
    );
    const previousInterest = input.previousReview.interests.find(
      ({ interestRef }) => interestRef === previousObligation?.interestRef,
    );
    const nextInterest = input.nextReview.interests.find(
      ({ interestRef }) => interestRef === previousInterest?.interestRef,
    );
    const previousCohort = input.previousReview.cohorts.find(
      ({ cohortRef }) => cohortRef === previousObligation?.cohortRef,
    );
    const nextCohort = input.nextReview.cohorts.find(
      ({ cohortRef }) => cohortRef === previousCohort?.cohortRef,
    );
    const previousSeat = previousCohort?.seats.find(
      ({ cohortSeatRef }) => cohortSeatRef === previousObligation?.cohortSeatRef,
    );
    const nextSeat = nextCohort?.seats.find(
      ({ cohortSeatRef }) => cohortSeatRef === previousSeat?.cohortSeatRef,
    );
    if (
      previousInvitation === undefined ||
      nextInvitation === undefined ||
      previousObligation === undefined ||
      nextObligation === undefined ||
      previousSlot === undefined ||
      nextSlot === undefined ||
      previousInterest === undefined ||
      nextInterest === undefined ||
      previousCohort === undefined ||
      nextCohort === undefined ||
      previousSeat === undefined ||
      nextSeat === undefined
    ) {
      throw new Error("Answer Invitation decision persistence input is incomplete.");
    }

    requireOne(
      await this.client.query(
        `UPDATE blind_review_commitments
            SET aggregate_json = $1::jsonb, updated_at = $2
          WHERE commitment_ref = $3 AND aggregate_json = $4::jsonb`,
        [
          JSON.stringify(input.nextReview),
          this.databaseNow,
          input.nextReview.commitment.commitmentRef,
          JSON.stringify(input.previousReview),
        ],
      ),
      "The Blind Review aggregate changed before the Invitation decision.",
    );
    requireOne(
      await this.client.query(
        `UPDATE answer_invitations
            SET status = $1, decided_at = $2, version = $3, updated_at = $2
          WHERE invitation_ref = $4 AND status = 'OFFERED' AND version = $5`,
        [
          nextInvitation.state,
          input.decidedAt,
          nextInvitation.version,
          input.invitationRef,
          previousInvitation.version,
        ],
      ),
      "The Answer Invitation changed before its decision.",
    );
    requireOne(
      await this.client.query(
        `UPDATE answer_review_obligations
            SET status = $1, closed_at = $2, version = $3, updated_at = $4
          WHERE obligation_ref = $5 AND status = 'INVITED' AND version = $6`,
        [
          input.terminalStatus ?? "ANSWER_ACTIVE",
          input.terminalStatus === null ? null : input.decidedAt,
          nextObligation.version,
          this.databaseNow,
          previousObligation.obligationRef,
          previousObligation.version,
        ],
      ),
      "The Answer Review Obligation changed before the Invitation decision.",
    );
    requireOne(
      await this.client.query(
        `UPDATE answer_review_slots
            SET status = $1, current_obligation_ref = $2, version = $3, updated_at = $4
          WHERE slot_ref = $5 AND status = 'OFFERED'
            AND current_obligation_ref = $6 AND version = $7`,
        [
          nextSlot.state,
          nextSlot.currentObligationRef,
          nextSlot.version,
          this.databaseNow,
          previousSlot.slotRef,
          previousObligation.obligationRef,
          previousSlot.version,
        ],
      ),
      "The Answer Review Slot changed before the Invitation decision.",
    );
    requireOne(
      await this.client.query(
        `UPDATE candidate_interests
            SET status = $1, version = $2, updated_at = $3
          WHERE interest_ref = $4 AND status = 'BACKED_OFFERED' AND version = $5`,
        [
          nextInterest.state,
          nextInterest.version,
          this.databaseNow,
          previousInterest.interestRef,
          previousInterest.version,
        ],
      ),
      "The Candidate Interest changed before the Invitation decision.",
    );

    if (input.terminalStatus !== null) {
      requireOne(
        await this.client.query(
          `UPDATE advancement_cohorts
              SET submitted_count = $1, reviewed_count = $2, state = $3,
                  version = $4, updated_at = $5
            WHERE cohort_ref = $6 AND version = $7`,
          [
            nextCohort.submittedCount,
            nextCohort.reviewedCount,
            nextCohort.state,
            nextCohort.version,
            this.databaseNow,
            previousCohort.cohortRef,
            previousCohort.version,
          ],
        ),
        "The Advancement Cohort changed before the Invitation release.",
      );
      requireOne(
        await this.client.query(
          `UPDATE advancement_cohort_seats
              SET status = 'OPEN', obligation_ref = NULL,
                  answer_submission_ref = NULL, human_review_ref = NULL,
                  version = version + 1, updated_at = $1
            WHERE cohort_seat_ref = $2 AND status = 'RESERVED'
              AND obligation_ref = $3`,
          [this.databaseNow, previousSeat.cohortSeatRef, previousObligation.obligationRef],
        ),
        "The Advancement Cohort Seat changed before the Invitation release.",
      );
      requireOne(
        await this.client.query(
          `UPDATE credit_accounts
              SET available_credits = $1, reserved_credits = $2, held_credits = $3,
                  version = $4
            WHERE account_ref = $5 AND version = $6
              AND held_credits >= $7`,
          [
            input.nextCreditAccount.availableCredits,
            input.nextCreditAccount.committedCredits,
            input.nextCreditAccount.heldCredits,
            input.nextCreditAccount.version,
            input.nextCreditAccount.accountRef,
            input.expectedCreditAccountVersion,
            input.previousCreditHold.amount,
          ],
        ),
        "The Credit Account changed before the Invitation release.",
      );
      requireOne(
        await this.client.query(
          `UPDATE answer_review_slot_credit_reservations
              SET state = $1, version = $2, updated_at = $3
            WHERE reservation_ref = $4 AND state = $5 AND version = $6`,
          [
            input.nextCreditReservation.state,
            input.nextCreditReservation.version,
            this.databaseNow,
            input.previousCreditReservation.reservationRef,
            input.previousCreditReservation.state,
            input.previousCreditReservation.version,
          ],
        ),
        "The Slot Credit reservation changed before the Invitation release.",
      );
      requireOne(
        await this.client.query(
          `UPDATE credit_holds
              SET status = $1, settled_at = $2
            WHERE credit_hold_ref = $3 AND status = $4
              AND reservation_ref = $5 AND subject_ref = $6`,
          [
            input.nextCreditHold.status,
            input.nextCreditHold.settledAt,
            input.previousCreditHold.creditHoldRef,
            input.previousCreditHold.status,
            input.previousCreditHold.reservationRef,
            input.previousCreditHold.obligationRef,
          ],
        ),
        "The Answer Review Credit Hold changed before the Invitation release.",
      );
      requireOne(
        await this.client.query(
          `UPDATE candidate_activity_leases
              SET status = $1, released_at = $2, version = $3
            WHERE lease_ref = $4 AND status = $5 AND version = $6
              AND subject_type = 'ANSWER_REVIEW_OBLIGATION' AND subject_ref = $7`,
          [
            input.nextActivityLease.state,
            input.nextActivityLease.releasedAt,
            input.nextActivityLease.version,
            input.previousActivityLease.leaseRef,
            input.previousActivityLease.state,
            input.previousActivityLease.version,
            input.previousActivityLease.bindingRef,
          ],
        ),
        "The Candidate Activity Lease changed before the Invitation release.",
      );
      await this.client.query(
        `INSERT INTO credit_ledger_entries (
           ledger_entry_ref, account_ref, credit_hold_ref, entry_type, amount, occurred_at
         ) VALUES ($1, $2, $3, 'RETURN', $4, $5)`,
        [
          `ledger-return:${input.previousCreditHold.creditHoldRef}`,
          input.previousCreditHold.accountRef,
          input.previousCreditHold.creditHoldRef,
          input.previousCreditHold.amount,
          input.decidedAt,
        ],
      );
    } else {
      if (input.answerSession === null) {
        throw new Error("Accepting an Answer Invitation requires an Answer Session.");
      }
      await this.client.query(
        `INSERT INTO answer_sessions (
           answer_session_ref, invitation_ref, obligation_ref, candidate_ref, status,
           started_at, answer_due_at, closed_at, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, NULL, $7, $5, $5)`,
        [
          input.answerSession.answerSessionRef,
          input.answerSession.invitationRef,
          input.answerSession.obligationRef,
          input.nextActivityLease.candidateRef,
          input.answerSession.startedAt,
          input.answerSession.answerDueAt,
          input.answerSession.version,
        ],
      );
    }

    await this.client.query(
      `INSERT INTO domain_events (
         event_id, event_type, event_version, aggregate_type, aggregate_id,
         aggregate_version, correlation_id, occurred_at, payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        input.event.eventId,
        input.event.eventType,
        input.event.eventVersion,
        input.event.aggregateType,
        input.event.aggregateId,
        input.event.aggregateVersion,
        input.event.correlationId,
        input.event.occurredAt,
        JSON.stringify(input.event.payload),
      ],
    );
    for (const message of input.outbox) {
      await this.client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          message.messageId,
          message.messageType,
          message.messageVersion,
          message.eventId,
          message.idempotencyKey,
          message.correlationId,
          JSON.stringify(message.payload),
          message.availableAt,
        ],
      );
    }
    await this.client.query(
      `INSERT INTO employer_blind_review_projections (
         opportunity_ref, projection_version, projection_json, updated_at
       ) VALUES ($1, 1, $2::jsonb, $3)
       ON CONFLICT (opportunity_ref) DO UPDATE
         SET projection_version = employer_blind_review_projections.projection_version + 1,
             projection_json = EXCLUDED.projection_json,
             updated_at = EXCLUDED.updated_at`,
      [
        input.nextReview.commitment.opportunityRef,
        JSON.stringify(EmployerBlindReviewProjectionSchema.parse(input.employerProjection)),
        this.databaseNow,
      ],
    );
    await this.client.query(
      `INSERT INTO candidate_answer_projections (
         opportunity_ref, candidate_ref, projection_version, projection_json, updated_at
       ) VALUES ($1, $2, 1, $3::jsonb, $4)
       ON CONFLICT (opportunity_ref, candidate_ref) DO UPDATE
         SET projection_version = candidate_answer_projections.projection_version + 1,
             projection_json = EXCLUDED.projection_json,
             updated_at = EXCLUDED.updated_at`,
      [
        input.nextReview.commitment.opportunityRef,
        input.nextActivityLease.candidateRef,
        JSON.stringify(CandidateOpportunityProjectionV3Schema.parse(input.candidateProjection)),
        this.databaseNow,
      ],
    );
    if (
      input.actorRef !== null &&
      input.idempotencyKey !== null &&
      input.commandFingerprint !== null &&
      input.receipt !== null
    ) {
      await this.client.query(
        `INSERT INTO blind_review_command_receipts (
           actor_ref, idempotency_key, command_id, command_fingerprint,
           command_type, receipt_json, created_at
         ) VALUES ($1, $2, $3, $4, 'DecideAnswerInvitation', $5::jsonb, $6)`,
        [
          input.actorRef,
          input.idempotencyKey,
          input.receipt.command_id,
          input.commandFingerprint,
          JSON.stringify(AnswerInvitationDecisionReceiptSchema.parse(input.receipt)),
          this.databaseNow,
        ],
      );
    } else if (
      input.actorRef !== null ||
      input.idempotencyKey !== null ||
      input.commandFingerprint !== null ||
      input.receipt !== null
    ) {
      throw new Error(
        "Answer Invitation command receipt fields must be present or absent together.",
      );
    }
  }
}

export class PostgresAnswerInvitationDecisionStore implements AnswerInvitationDecisionUnitOfWork {
  public constructor(private readonly pool: Pool) {}

  public async runInTransaction<TResult>(
    work: (transaction: AnswerInvitationDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const nowResult = await client.query<{ database_now: Date }>(
        "SELECT clock_timestamp() AS database_now",
      );
      const databaseNow = nowResult.rows[0]?.database_now;
      if (databaseNow === undefined) throw new Error("PostgreSQL did not return database time.");
      const result = await work(
        new PostgresAnswerInvitationDecisionTransaction(client, databaseNow),
      );
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
