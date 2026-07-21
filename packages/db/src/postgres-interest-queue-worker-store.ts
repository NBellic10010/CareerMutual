import { createHash } from "node:crypto";

import type {
  BlindReviewActivationSnapshot,
  BlindReviewTransaction,
  BlindReviewUnitOfWork,
  ClaimedOfferNextQueuedInterestMessage,
  CompleteOfferWithoutMutation,
  InterestQueueWorkerStore,
  OfferNextQueuedInterestPayload,
  OfferNextQueuedInterestReceipt,
  OfferNextQueuedInterestSnapshot,
  PersistBackedAnswerOffer,
  PersistBlindReviewActivation,
  StoredBlindReviewCommandReceipt,
} from "@onlyboth/application";
import {
  BlindReviewCommitmentReceiptSchema,
  CandidateOpportunityProjectionV3Schema,
  EmployerBlindReviewProjectionSchema,
} from "@onlyboth/contracts";
import type { RollingBlindReview } from "@onlyboth/domain";
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

function parseRollingBlindReview(value: unknown): RollingBlindReview {
  if (
    !isRecord(value) ||
    !isRecord(value.commitment) ||
    typeof value.commitment.commitmentRef !== "string" ||
    typeof value.commitment.version !== "number" ||
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

function parseOfferPayload(value: unknown): OfferNextQueuedInterestPayload {
  if (
    !isRecord(value) ||
    value.schema_version !== "offer-next-queued-interest-requested@1" ||
    typeof value.opportunity_ref !== "string" ||
    typeof value.commitment_ref !== "string" ||
    typeof value.expected_commitment_version !== "number" ||
    typeof value.slot_ref !== "string" ||
    typeof value.expected_slot_version !== "number" ||
    value.queue_policy_version !== "onlyboth.interest-queue@1" ||
    typeof value.public_seed !== "string"
  ) {
    throw new Error("OfferNextQueuedInterestRequested payload is invalid.");
  }
  return {
    schema_version: value.schema_version,
    opportunity_ref: value.opportunity_ref,
    commitment_ref: value.commitment_ref,
    expected_commitment_version: value.expected_commitment_version,
    slot_ref: value.slot_ref,
    expected_slot_version: value.expected_slot_version,
    queue_policy_version: value.queue_policy_version,
    public_seed: value.public_seed,
  };
}

function parseOfferReceipt(value: unknown): OfferNextQueuedInterestReceipt {
  if (
    !isRecord(value) ||
    value.schema_version !== "offer-next-queued-interest-receipt@1" ||
    typeof value.message_id !== "string" ||
    typeof value.idempotency_key !== "string" ||
    typeof value.slot_ref !== "string" ||
    typeof value.processed_at !== "string" ||
    !["OFFERED", "NO_WAITING_INTEREST", "SUPERSEDED"].includes(String(value.outcome))
  ) {
    throw new Error("Persisted Interest Queue receipt is invalid.");
  }
  return structuredClone(value) as unknown as OfferNextQueuedInterestReceipt;
}

function parseClaimedMessage(row: {
  readonly message_id: string;
  readonly message_type: string;
  readonly event_id: string;
  readonly idempotency_key: string;
  readonly correlation_id: string;
  readonly payload: unknown;
  readonly lease_owner: string;
  readonly attempt_count: number;
}): ClaimedOfferNextQueuedInterestMessage {
  if (row.message_type !== "OfferNextQueuedInterestRequested") {
    throw new Error("Claimed an unexpected Interest Queue message type.");
  }
  return {
    messageId: row.message_id,
    messageType: row.message_type,
    eventId: row.event_id,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    payload: parseOfferPayload(row.payload),
    leaseOwner: row.lease_owner,
    attempt: row.attempt_count,
  };
}

function workerPayloadHash(message: ClaimedOfferNextQueuedInterestMessage): string {
  const canonical = JSON.stringify({
    message_type: message.messageType,
    message_version: 1,
    payload: message.payload,
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

async function assertMessageLease(
  client: PoolClient,
  message: ClaimedOfferNextQueuedInterestMessage,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM outbox_messages
      WHERE message_id = $1 AND lease_owner = $2 AND attempt_count = $3
        AND processed_at IS NULL AND lease_expires_at >= clock_timestamp()
      FOR UPDATE`,
    [message.messageId, message.leaseOwner, message.attempt],
  );
  if (result.rowCount !== 1) {
    throw new PostgresOptimisticConcurrencyError(
      `Interest Queue message '${message.messageId}' lost its lease.`,
    );
  }
}

async function completeMessage(
  client: PoolClient,
  message: ClaimedOfferNextQueuedInterestMessage,
  now: Date,
): Promise<void> {
  const updated = await client.query(
    `UPDATE outbox_messages
        SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
      WHERE message_id = $2 AND lease_owner = $3 AND attempt_count = $4
        AND processed_at IS NULL`,
    [now, message.messageId, message.leaseOwner, message.attempt],
  );
  if (updated.rowCount !== 1) {
    throw new PostgresOptimisticConcurrencyError(
      `Interest Queue message '${message.messageId}' changed before completion.`,
    );
  }
}

async function appendEvent(
  client: PoolClient,
  event: PersistBlindReviewActivation["event"],
): Promise<void> {
  await client.query(
    `INSERT INTO domain_events (
       event_id, event_type, event_version, aggregate_type, aggregate_id,
       aggregate_version, correlation_id, occurred_at, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      event.eventId,
      event.eventType,
      event.eventVersion,
      event.aggregateType,
      event.aggregateId,
      event.aggregateVersion,
      event.correlationId,
      event.occurredAt,
      JSON.stringify(event.payload),
    ],
  );
}

async function enqueueOutbox(
  client: PoolClient,
  message: PersistBlindReviewActivation["outbox"][number],
): Promise<void> {
  await client.query(
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

class PostgresBlindReviewTransaction implements BlindReviewTransaction {
  public constructor(
    private readonly client: PoolClient,
    public readonly databaseNow: Date,
  ) {}

  public async findCommandReceipt(
    actorRef: string,
    idempotencyKey: string,
  ): Promise<StoredBlindReviewCommandReceipt | null> {
    await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `blind-review-command:${actorRef}:${idempotencyKey}`,
    ]);
    const result = await this.client.query<{
      command_fingerprint: string;
      receipt_json: unknown;
    }>(
      `SELECT command_fingerprint, receipt_json
         FROM blind_review_command_receipts
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
          receipt: BlindReviewCommitmentReceiptSchema.parse(row.receipt_json),
        };
  }

  public async loadActivationForUpdate(
    opportunityRef: string,
  ): Promise<BlindReviewActivationSnapshot | null> {
    const sourceResult = await this.client.query<{
      opportunity_ref: string;
      opportunity_version: number;
      opportunity_state: "OPEN" | "CLOSED";
      runtime_mode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
      synthetic: boolean;
      reviewer_ref: string;
      reviewer_display_name: string | null;
      question_version_ref: string | null;
      question_hash: string | null;
      queue_public_seed: string | null;
      offer_sla_hours: number;
      effort_limit_minutes: number;
      account_ref: string;
      account_version: number;
      available_credits: number;
      committed_credits: number;
      held_credits: number;
    }>(
      `SELECT opportunity.id AS opportunity_ref,
              opportunity.version AS opportunity_version,
              opportunity.status AS opportunity_state,
              opportunity.runtime_mode,
              opportunity.synthetic,
              attention.reviewer_ref,
              attention.reviewer_display_name,
              attention.question_version_ref,
              attention.question_hash,
              attention.queue_public_seed,
              attention.accept_sla_hours AS offer_sla_hours,
              COALESCE((contract.contract_json->>'candidate_effort_limit_minutes')::integer, 6)
                AS effort_limit_minutes,
              account.account_ref,
              account.version AS account_version,
              account.available_credits,
              account.reserved_credits AS committed_credits,
              account.held_credits
         FROM opportunities AS opportunity
         JOIN attention_commitments AS attention
           ON attention.opportunity_ref = opportunity.id
         JOIN sealed_capability_contracts AS contract
           ON contract.contract_version_ref = opportunity.current_contract_version_ref
         JOIN credit_accounts AS account ON account.opportunity_ref = opportunity.id
        WHERE opportunity.id = $1
        FOR UPDATE OF opportunity, attention, account`,
      [opportunityRef],
    );
    const source = sourceResult.rows[0];
    if (source === undefined) return null;
    if (
      source.question_version_ref === null ||
      source.question_hash === null ||
      source.queue_public_seed === null
    ) {
      throw new Error("Blind Review source Attention policy is missing sealed Question pins.");
    }
    const reviewResult = await this.client.query<{ aggregate_json: unknown }>(
      `SELECT aggregate_json FROM blind_review_commitments
        WHERE opportunity_ref = $1 FOR UPDATE`,
      [opportunityRef],
    );
    const reviewRow = reviewResult.rows[0];
    const queuedResult = await this.client.query<{
      interest_ref: string;
      candidate_ref: string;
      eligibility_edge_ref: string;
      eligible_at: Date;
      interest_created_at: Date;
    }>(
      `SELECT interest_ref, candidate_ref, eligibility_edge_ref,
              eligible_at, interest_created_at
         FROM candidate_interests
        WHERE opportunity_ref = $1 AND status = 'WAITING_FOR_BACKED_SLOT'
        ORDER BY eligible_at, interest_created_at, queue_tie_break, candidate_ref
        FOR UPDATE`,
      [opportunityRef],
    );
    return {
      opportunityRef: source.opportunity_ref,
      opportunityVersion: source.opportunity_version,
      opportunityState: source.opportunity_state,
      reviewerRef: source.reviewer_ref,
      reviewerDisplayName: source.reviewer_display_name ?? source.reviewer_ref,
      questionVersionRef: source.question_version_ref,
      publicSeed: source.queue_public_seed,
      offerSlaHours: source.offer_sla_hours,
      effortLimitMinutes: source.effort_limit_minutes,
      runtimeMode: source.runtime_mode,
      synthetic: source.synthetic,
      review: reviewRow === undefined ? null : parseRollingBlindReview(reviewRow.aggregate_json),
      queuedInterests: queuedResult.rows.map((interest) => ({
        interestRef: interest.interest_ref,
        candidateRef: interest.candidate_ref,
        eligibilityEdgeRef: interest.eligibility_edge_ref,
        eligibleAt: interest.eligible_at.toISOString(),
        interestCreatedAt: interest.interest_created_at.toISOString(),
      })),
      creditAccount: {
        accountRef: source.account_ref,
        version: source.account_version,
        availableCredits: source.available_credits,
        committedCredits: source.committed_credits,
        heldCredits: source.held_credits,
      },
    };
  }

  public async persistActivation(input: PersistBlindReviewActivation): Promise<void> {
    const commitment = input.nextReview.commitment;
    const totalCredit = input.creditReservations.reduce(
      (sum, reservation) => sum + reservation.amount,
      0,
    );
    const opportunityUpdated = await this.client.query(
      `UPDATE opportunities SET version = version + 1, updated_at = $1
        WHERE id = $2 AND version = $3 AND status = 'OPEN'`,
      [this.databaseNow, commitment.opportunityRef, input.expectedOpportunityVersion],
    );
    if (opportunityUpdated.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError(
        "Opportunity changed before Blind Review activation.",
      );
    }
    const accountUpdated = await this.client.query(
      `UPDATE credit_accounts
          SET available_credits = available_credits - $1,
              reserved_credits = reserved_credits + $1,
              version = version + 1
        WHERE account_ref = $2 AND version = $3 AND available_credits >= $1`,
      [totalCredit, input.creditReservations[0]?.accountRef, input.expectedCreditAccountVersion],
    );
    if (accountUpdated.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError(
        "Credit Account changed before Blind Review activation.",
      );
    }

    if (input.previousReview === null) {
      if (input.expectedCommitmentVersion !== 0 || commitment.version !== 1) {
        throw new PostgresOptimisticConcurrencyError(
          "Absent Blind Review Commitment requires expected version 0 and Active version 1.",
        );
      }
      const inserted = await this.client.query(
        `INSERT INTO blind_review_commitments (
           commitment_ref, opportunity_ref, source_attention_commitment_ref,
           credit_account_ref, contract_version_ref, contract_hash,
           question_version_ref, question_hash, reviewer_ref, answer_review_wip,
           answer_review_sla_hours, advancement_cohort_size, queue_policy_version,
           queue_public_seed, credit_per_answer_review, reserved_credit_amount,
           state, version, aggregate_json, activated_at, created_at, updated_at
         )
         SELECT $1, opportunity.id, attention.commitment_ref, account.account_ref,
                contract.contract_version_ref, contract.contract_hash,
                attention.question_version_ref, attention.question_hash,
                attention.reviewer_ref, $2, $3, $4, $5, attention.queue_public_seed,
                $6, $7, 'ACTIVE', $8, $9::jsonb, $10, $10, $10
           FROM opportunities AS opportunity
           JOIN attention_commitments AS attention
             ON attention.opportunity_ref = opportunity.id
           JOIN credit_accounts AS account ON account.opportunity_ref = opportunity.id
           JOIN sealed_capability_contracts AS contract
             ON contract.contract_version_ref = opportunity.current_contract_version_ref
          WHERE opportunity.id = $11
            AND attention.question_version_ref IS NOT NULL
            AND attention.question_hash IS NOT NULL
            AND attention.queue_public_seed IS NOT NULL`,
        [
          commitment.commitmentRef,
          commitment.answerReviewWip,
          commitment.answerReviewSlaHours,
          commitment.advancementCohortSize,
          commitment.queuePolicyVersion,
          commitment.creditPerAnswerReview,
          totalCredit,
          commitment.version,
          JSON.stringify(input.nextReview),
          this.databaseNow,
          commitment.opportunityRef,
        ],
      );
      if (inserted.rowCount !== 1) {
        throw new PostgresOptimisticConcurrencyError(
          "Blind Review source pins changed before activation.",
        );
      }
    } else {
      const updated = await this.client.query(
        `UPDATE blind_review_commitments
            SET state = 'ACTIVE', version = $1, aggregate_json = $2::jsonb,
                activated_at = $3, updated_at = $3
          WHERE commitment_ref = $4 AND version = $5 AND state = 'DRAFT'`,
        [
          commitment.version,
          JSON.stringify(input.nextReview),
          this.databaseNow,
          commitment.commitmentRef,
          input.expectedCommitmentVersion,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new PostgresOptimisticConcurrencyError(
          "Blind Review Commitment changed before activation.",
        );
      }
    }

    await this.client.query(
      `UPDATE attention_commitments
          SET answer_review_wip = $1, answer_review_sla_hours = $2,
              advancement_cohort_size = $3, queue_policy_version = $4,
              credit_per_answer_review = $5, blind_review_status = 'ACTIVE'
        WHERE opportunity_ref = $6`,
      [
        commitment.answerReviewWip,
        commitment.answerReviewSlaHours,
        commitment.advancementCohortSize,
        commitment.queuePolicyVersion,
        commitment.creditPerAnswerReview,
        commitment.opportunityRef,
      ],
    );
    for (const [index, slot] of input.nextReview.slots.entries()) {
      const reservation = input.creditReservations[index];
      if (reservation === undefined || reservation.slotRef !== slot.slotRef) {
        throw new Error("Each activated Answer Review Slot requires its own Credit reservation.");
      }
      await this.client.query(
        `INSERT INTO answer_review_slots (
           slot_ref, commitment_ref, ordinal, status, current_obligation_ref,
           reserved_credit_amount, version, created_at, updated_at
         ) VALUES ($1, $2, $3, 'AVAILABLE', NULL, $4, $5, $6, $6)`,
        [
          slot.slotRef,
          commitment.commitmentRef,
          slot.ordinal,
          reservation.amount,
          slot.version,
          this.databaseNow,
        ],
      );
      await this.client.query(
        `INSERT INTO answer_review_slot_credit_reservations (
           reservation_ref, slot_ref, account_ref, amount, state, version,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [
          reservation.reservationRef,
          reservation.slotRef,
          reservation.accountRef,
          reservation.amount,
          reservation.state,
          reservation.version,
          this.databaseNow,
        ],
      );
    }
    await appendEvent(this.client, input.event);
    for (const message of input.outbox) await enqueueOutbox(this.client, message);
    await this.client.query(
      `INSERT INTO employer_blind_review_projections (
         opportunity_ref, projection_version, projection_json, updated_at
       ) VALUES ($1, 1, $2::jsonb, $3)
       ON CONFLICT (opportunity_ref) DO UPDATE
         SET projection_version = employer_blind_review_projections.projection_version + 1,
             projection_json = EXCLUDED.projection_json,
             updated_at = EXCLUDED.updated_at`,
      [commitment.opportunityRef, JSON.stringify(input.employerProjection), this.databaseNow],
    );
    await this.client.query(
      `INSERT INTO blind_review_command_receipts (
         actor_ref, idempotency_key, command_id, command_fingerprint,
         command_type, receipt_json, created_at
       ) VALUES ($1, $2, $3, $4, 'ActivateBlindReviewCommitment', $5::jsonb, $6)`,
      [
        input.actorRef,
        input.idempotencyKey,
        input.receipt.command_id,
        input.commandFingerprint,
        JSON.stringify(input.receipt),
        this.databaseNow,
      ],
    );
  }

  public async findWorkerReceipt(
    consumer: "interest-queue-worker",
    message: ClaimedOfferNextQueuedInterestMessage,
  ): Promise<OfferNextQueuedInterestReceipt | null> {
    await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${consumer}:${message.idempotencyKey}`,
    ]);
    const result = await this.client.query<{ payload_hash: string; result_json: unknown }>(
      `SELECT payload_hash, result_json FROM inbox_messages
        WHERE consumer = $1 AND idempotency_key = $2`,
      [consumer, message.idempotencyKey],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    if (row.payload_hash !== workerPayloadHash(message)) {
      throw new PostgresOptimisticConcurrencyError(
        "Interest Queue idempotency key was reused for a different payload.",
      );
    }
    return parseOfferReceipt(row.result_json);
  }

  public async loadOfferForUpdate(
    message: ClaimedOfferNextQueuedInterestMessage,
  ): Promise<OfferNextQueuedInterestSnapshot | null> {
    await assertMessageLease(this.client, message);
    const contextResult = await this.client.query<{
      aggregate_json: unknown;
      queue_public_seed: string;
      reviewer_display_name: string | null;
      question_version_ref: string;
      offer_sla_hours: number;
      effort_limit_minutes: number;
      runtime_mode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
      synthetic: boolean;
      account_ref: string;
      account_version: number;
      available_credits: number;
      committed_credits: number;
      held_credits: number;
    }>(
      `SELECT commitment.aggregate_json,
              commitment.queue_public_seed,
              attention.reviewer_display_name,
              commitment.question_version_ref,
              attention.accept_sla_hours AS offer_sla_hours,
              COALESCE((contract.contract_json->>'candidate_effort_limit_minutes')::integer, 6)
                AS effort_limit_minutes,
              opportunity.runtime_mode,
              opportunity.synthetic,
              account.account_ref,
              account.version AS account_version,
              account.available_credits,
              account.reserved_credits AS committed_credits,
              account.held_credits
         FROM blind_review_commitments AS commitment
         JOIN opportunities AS opportunity ON opportunity.id = commitment.opportunity_ref
         JOIN attention_commitments AS attention
           ON attention.commitment_ref = commitment.source_attention_commitment_ref
         JOIN sealed_capability_contracts AS contract
           ON contract.contract_version_ref = commitment.contract_version_ref
         JOIN credit_accounts AS account ON account.account_ref = commitment.credit_account_ref
        WHERE commitment.commitment_ref = $1
        FOR UPDATE OF commitment, account`,
      [message.payload.commitment_ref],
    );
    const context = contextResult.rows[0];
    if (context === undefined) return null;
    const slotResult = await this.client.query(
      "SELECT 1 FROM answer_review_slots WHERE slot_ref = $1 FOR UPDATE",
      [message.payload.slot_ref],
    );
    if (slotResult.rowCount !== 1) return null;
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
      [message.payload.slot_ref],
    );
    const reservation = reservationResult.rows[0];
    const activeResult = await this.client.query<{ candidate_ref: string }>(
      `SELECT candidate_ref FROM candidate_activity_leases WHERE status = 'ACTIVE'
       UNION
       SELECT candidate_id AS candidate_ref FROM review_windows WHERE state = ANY($1::text[])`,
      [[...ACTIVE_REVIEW_WINDOW_STATES]],
    );
    const persistedReview = parseRollingBlindReview(context.aggregate_json);
    const interestResult = await this.client.query<{
      interest_ref: string;
      candidate_ref: string;
      eligibility_edge_ref: string;
      eligible_at: Date;
      interest_created_at: Date;
      status:
        | "WAITING_FOR_BACKED_SLOT"
        | "BACKED_OFFERED"
        | "APPLICATION_ACTIVE"
        | "APPLICATION_SUBMITTED"
        | "REVIEWED"
        | "OFFER_DECLINED"
        | "OFFER_EXPIRED"
        | "OPPORTUNITY_CLOSED";
      version: number;
    }>(
      `SELECT interest_ref, candidate_ref, eligibility_edge_ref,
              eligible_at, interest_created_at, status, version
         FROM candidate_interests
        WHERE opportunity_ref = $1
          AND interest_schema_version IN ('candidate-interest@1', 'candidate-interest@2')
          AND eligibility_edge_ref IS NOT NULL
          AND eligible_at IS NOT NULL
          AND status IN (
            'WAITING_FOR_BACKED_SLOT', 'BACKED_OFFERED', 'APPLICATION_ACTIVE',
            'APPLICATION_SUBMITTED', 'REVIEWED', 'OFFER_DECLINED',
            'OFFER_EXPIRED', 'OPPORTUNITY_CLOSED'
          )
        ORDER BY eligible_at, interest_created_at, queue_tie_break, candidate_ref
        FOR UPDATE`,
      [message.payload.opportunity_ref],
    );
    const currentInterestByRef = new Map(
      interestResult.rows.map((interest) => [interest.interest_ref, interest]),
    );
    const mergedInterests = persistedReview.interests
      .map((interest) => {
        const current = currentInterestByRef.get(interest.interestRef);
        if (current === undefined) return interest;
        currentInterestByRef.delete(interest.interestRef);
        return {
          ...interest,
          state: current.status,
          version: current.version,
          eligibleAt: current.eligible_at.toISOString(),
          interestCreatedAt: current.interest_created_at.toISOString(),
          eligibilityEdgeRef: current.eligibility_edge_ref,
        };
      })
      .concat(
        [...currentInterestByRef.values()].map((interest) => ({
          interestRef: interest.interest_ref,
          opportunityRef: message.payload.opportunity_ref,
          candidateRef: interest.candidate_ref,
          eligibilityEdgeRef: interest.eligibility_edge_ref,
          eligibleAt: interest.eligible_at.toISOString(),
          interestCreatedAt: interest.interest_created_at.toISOString(),
          state: interest.status,
          version: interest.version,
        })),
      );
    const review: RollingBlindReview = {
      ...persistedReview,
      interests: mergedInterests,
    };
    return {
      review,
      activeCandidateRefs: new Set(activeResult.rows.map(({ candidate_ref }) => candidate_ref)),
      slotCreditReservation:
        reservation === undefined
          ? null
          : {
              reservationRef: reservation.reservation_ref,
              slotRef: reservation.slot_ref,
              accountRef: reservation.account_ref,
              amount: reservation.amount,
              state: reservation.state,
              version: reservation.version,
            },
      creditAccount: {
        accountRef: context.account_ref,
        version: context.account_version,
        availableCredits: context.available_credits,
        committedCredits: context.committed_credits,
        heldCredits: context.held_credits,
      },
      reviewerDisplayName: context.reviewer_display_name ?? "Named reviewer",
      questionVersionRef: context.question_version_ref,
      offerSlaHours: context.offer_sla_hours,
      effortLimitMinutes: context.effort_limit_minutes,
      runtimeMode: context.runtime_mode,
      synthetic: context.synthetic,
      publicSeed: context.queue_public_seed,
    };
  }

  public async persistOffer(input: PersistBackedAnswerOffer): Promise<void> {
    await assertMessageLease(this.client, input.message);
    const offer = input.receipt.offer;
    await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `candidate-activity:${offer.candidate_ref}`,
    ]);
    const active = await this.client.query(
      `SELECT 1 FROM candidate_activity_leases
        WHERE candidate_ref = $1 AND status = 'ACTIVE'
       UNION ALL
       SELECT 1 FROM review_windows
        WHERE candidate_id = $1 AND state = ANY($2::text[])
       LIMIT 1`,
      [offer.candidate_ref, [...ACTIVE_REVIEW_WINDOW_STATES]],
    );
    if (active.rowCount !== 0) {
      throw new PostgresOptimisticConcurrencyError(
        `Candidate '${offer.candidate_ref}' acquired another Active Window.`,
      );
    }

    const previousSlot = input.previousReview.slots.find(
      ({ slotRef }) => slotRef === offer.slot_ref,
    );
    const nextSlot = input.nextReview.slots.find(({ slotRef }) => slotRef === offer.slot_ref);
    const previousInterest = input.previousReview.interests.find(
      ({ candidateRef }) => candidateRef === offer.candidate_ref,
    );
    const nextInterest = input.nextReview.interests.find(
      ({ candidateRef }) => candidateRef === offer.candidate_ref,
    );
    const obligation = input.nextReview.obligations.find(
      ({ obligationRef }) => obligationRef === offer.obligation_ref,
    );
    const invitation = input.nextReview.invitations.find(
      ({ invitationRef }) => invitationRef === offer.invitation_ref,
    );
    const nextCohort = input.nextReview.cohorts.find(
      ({ cohortRef }) => cohortRef === offer.cohort_ref,
    );
    const previousCohort = input.previousReview.cohorts.find(
      ({ cohortRef }) => cohortRef === offer.cohort_ref,
    );
    if (
      previousSlot === undefined ||
      nextSlot === undefined ||
      previousInterest === undefined ||
      nextInterest === undefined ||
      obligation === undefined ||
      invitation === undefined ||
      nextCohort === undefined
    ) {
      throw new Error("Backed Offer persistence input is incomplete.");
    }

    const aggregateUpdated = await this.client.query(
      `UPDATE blind_review_commitments SET aggregate_json = $1::jsonb, updated_at = $2
        WHERE commitment_ref = $3 AND version = $4 AND state = 'ACTIVE'`,
      [
        JSON.stringify(input.nextReview),
        this.databaseNow,
        input.nextReview.commitment.commitmentRef,
        input.previousReview.commitment.version,
      ],
    );
    const slotUpdated = await this.client.query(
      `UPDATE answer_review_slots
          SET status = $1, current_obligation_ref = $2, version = $3, updated_at = $4
        WHERE slot_ref = $5 AND version = $6 AND status = 'AVAILABLE'
          AND current_obligation_ref IS NULL`,
      [
        nextSlot.state,
        nextSlot.currentObligationRef,
        nextSlot.version,
        this.databaseNow,
        nextSlot.slotRef,
        previousSlot.version,
      ],
    );
    const interestUpdated = await this.client.query(
      `UPDATE candidate_interests SET status = $1, version = $2, updated_at = $3
        WHERE interest_ref = $4 AND version = $5 AND status = 'WAITING_FOR_BACKED_SLOT'`,
      [
        nextInterest.state,
        nextInterest.version,
        this.databaseNow,
        nextInterest.interestRef,
        previousInterest.version,
      ],
    );
    if (
      aggregateUpdated.rowCount !== 1 ||
      slotUpdated.rowCount !== 1 ||
      interestUpdated.rowCount !== 1
    ) {
      throw new PostgresOptimisticConcurrencyError(
        "Blind Review, Slot, or Interest changed before the Offer was persisted.",
      );
    }

    if (previousCohort === undefined) {
      await this.client.query(
        `INSERT INTO advancement_cohorts (
           cohort_ref, commitment_ref, sequence, target_size, submitted_count,
           reviewed_count, state, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
        [
          nextCohort.cohortRef,
          nextCohort.commitmentRef,
          nextCohort.sequence,
          nextCohort.targetSize,
          nextCohort.submittedCount,
          nextCohort.reviewedCount,
          nextCohort.state,
          nextCohort.version,
          this.databaseNow,
        ],
      );
      for (const seat of nextCohort.seats) {
        await this.client.query(
          `INSERT INTO advancement_cohort_seats (
             cohort_seat_ref, cohort_ref, ordinal, status, obligation_ref,
             answer_submission_ref, human_review_ref, version, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $8)`,
          [
            seat.cohortSeatRef,
            nextCohort.cohortRef,
            seat.ordinal,
            seat.state,
            seat.obligationRef,
            seat.answerSubmissionRef,
            seat.humanReviewRef,
            this.databaseNow,
          ],
        );
      }
    } else {
      const cohortUpdated = await this.client.query(
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
          nextCohort.cohortRef,
          previousCohort.version,
        ],
      );
      const previousSeat = previousCohort.seats.find(
        ({ cohortSeatRef }) => cohortSeatRef === offer.cohort_seat_ref,
      );
      const nextSeat = nextCohort.seats.find(
        ({ cohortSeatRef }) => cohortSeatRef === offer.cohort_seat_ref,
      );
      if (previousSeat === undefined || nextSeat === undefined || cohortUpdated.rowCount !== 1) {
        throw new PostgresOptimisticConcurrencyError(
          "Advancement Cohort changed before Seat reservation.",
        );
      }
      const seatUpdated = await this.client.query(
        `UPDATE advancement_cohort_seats
            SET status = $1, obligation_ref = $2, version = version + 1, updated_at = $3
          WHERE cohort_seat_ref = $4 AND status = 'OPEN' AND obligation_ref IS NULL`,
        [nextSeat.state, nextSeat.obligationRef, this.databaseNow, nextSeat.cohortSeatRef],
      );
      if (seatUpdated.rowCount !== 1) {
        throw new PostgresOptimisticConcurrencyError(
          "Advancement Cohort Seat changed before reservation.",
        );
      }
    }

    const reservationUpdated = await this.client.query(
      `UPDATE answer_review_slot_credit_reservations
          SET state = $1, version = $2, updated_at = $3
        WHERE reservation_ref = $4 AND version = $5 AND state = 'RESERVED'`,
      [
        input.nextCreditReservation.state,
        input.nextCreditReservation.version,
        this.databaseNow,
        input.nextCreditReservation.reservationRef,
        input.expectedCreditReservationVersion,
      ],
    );
    const creditUpdated = await this.client.query(
      `UPDATE credit_accounts
          SET reserved_credits = reserved_credits - $1,
              held_credits = held_credits + $1,
              version = version + 1
        WHERE account_ref = $2 AND version = $3 AND reserved_credits >= $1`,
      [input.creditHold.amount, input.creditHold.accountRef, input.expectedCreditAccountVersion],
    );
    if (reservationUpdated.rowCount !== 1 || creditUpdated.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError(
        "Slot Credit reservation changed before the Offer was funded.",
      );
    }
    await this.client.query(
      `INSERT INTO credit_holds (
         credit_hold_ref, account_ref, amount, status, created_at, settled_at,
         purpose, subject_ref, reservation_ref
       ) VALUES ($1, $2, $3, 'HELD', $4, NULL, 'ANSWER_REVIEW', $5, $6)`,
      [
        input.creditHold.creditHoldRef,
        input.creditHold.accountRef,
        input.creditHold.amount,
        this.databaseNow,
        input.creditHold.obligationRef,
        input.creditHold.reservationRef,
      ],
    );
    await this.client.query(
      `INSERT INTO credit_ledger_entries (
         ledger_entry_ref, account_ref, credit_hold_ref, entry_type, amount, occurred_at
       ) VALUES ($1, $2, $3, 'HOLD', $4, $5)`,
      [
        `ledger-hold:${input.creditHold.creditHoldRef}`,
        input.creditHold.accountRef,
        input.creditHold.creditHoldRef,
        input.creditHold.amount,
        this.databaseNow,
      ],
    );
    await this.client.query(
      `INSERT INTO answer_review_obligations (
         obligation_ref, commitment_ref, slot_ref, interest_ref, candidate_ref,
         cohort_ref, cohort_seat_ref, credit_hold_ref, status, offer_expires_at,
         version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'INVITED', $9, $10, $11, $11)`,
      [
        obligation.obligationRef,
        obligation.commitmentRef,
        obligation.slotRef,
        obligation.interestRef,
        obligation.candidateRef,
        obligation.cohortRef,
        obligation.cohortSeatRef,
        obligation.creditHoldRef,
        invitation.offerExpiresAt,
        obligation.version,
        this.databaseNow,
      ],
    );
    const questionResult = await this.client.query<{ question_hash: string }>(
      `SELECT question_hash FROM blind_review_commitments WHERE commitment_ref = $1`,
      [obligation.commitmentRef],
    );
    const questionHash = questionResult.rows[0]?.question_hash;
    const queueSnapshotHash = input.events[0].payload.queue_input_snapshot_hash;
    if (questionHash === undefined || typeof queueSnapshotHash !== "string") {
      throw new Error("Backed Offer is missing its sealed Question or Queue snapshot hash.");
    }
    await this.client.query(
      `INSERT INTO answer_invitations (
         invitation_ref, obligation_ref, interest_ref, candidate_ref, cohort_ref,
         cohort_seat_ref, question_version_ref, question_hash, queue_policy_version,
         queue_snapshot_hash, public_tie_break, status, offered_at, offer_expires_at,
         version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 'OFFERED', $12, $13, $14, $15, $15)`,
      [
        invitation.invitationRef,
        invitation.obligationRef,
        obligation.interestRef,
        invitation.candidateRef,
        invitation.cohortRef,
        invitation.cohortSeatRef,
        offer.question_version_ref,
        questionHash,
        invitation.queuePolicyVersion,
        queueSnapshotHash,
        invitation.publicTieBreak,
        invitation.offeredAt,
        invitation.offerExpiresAt,
        invitation.version,
        this.databaseNow,
      ],
    );
    await this.client.query(
      `INSERT INTO candidate_activity_leases (
         lease_ref, candidate_ref, opportunity_ref, subject_type, subject_ref,
         status, acquired_at, released_at, version
       ) VALUES ($1, $2, $3, 'ANSWER_REVIEW_OBLIGATION', $4, 'ACTIVE', $5, NULL, $6)`,
      [
        input.activityLease.leaseRef,
        input.activityLease.candidateRef,
        input.activityLease.opportunityRef,
        input.activityLease.bindingRef,
        input.activityLease.acquiredAt,
        input.activityLease.version,
      ],
    );
    for (const event of input.events) await appendEvent(this.client, event);
    await enqueueOutbox(this.client, input.outbox);
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
        input.activityLease.opportunityRef,
        input.activityLease.candidateRef,
        JSON.stringify(CandidateOpportunityProjectionV3Schema.parse(input.candidateProjection)),
        this.databaseNow,
      ],
    );
    await this.client.query(
      `INSERT INTO inbox_messages (
         consumer, message_id, idempotency_key, payload_hash, result_json, processed_at
       ) VALUES ('interest-queue-worker', $1, $2, $3, $4::jsonb, $5)`,
      [
        input.message.messageId,
        input.message.idempotencyKey,
        workerPayloadHash(input.message),
        JSON.stringify(input.receipt),
        this.databaseNow,
      ],
    );
    await completeMessage(this.client, input.message, this.databaseNow);
  }

  public async completeOfferWithoutMutation(input: CompleteOfferWithoutMutation): Promise<void> {
    await assertMessageLease(this.client, input.message);
    const payloadHash = workerPayloadHash(input.message);
    const existing = await this.client.query<{ payload_hash: string }>(
      `SELECT payload_hash FROM inbox_messages
        WHERE consumer = 'interest-queue-worker' AND idempotency_key = $1`,
      [input.message.idempotencyKey],
    );
    const existingHash = existing.rows[0]?.payload_hash;
    if (existingHash !== undefined && existingHash !== payloadHash) {
      throw new PostgresOptimisticConcurrencyError(
        "Interest Queue idempotency key was reused for a different payload.",
      );
    }
    await this.client.query(
      `INSERT INTO inbox_messages (
         consumer, message_id, idempotency_key, payload_hash, result_json, processed_at
       ) VALUES ('interest-queue-worker', $1, $2, $3, $4::jsonb, $5)
       ON CONFLICT DO NOTHING`,
      [
        input.message.messageId,
        input.message.idempotencyKey,
        payloadHash,
        JSON.stringify(input.receipt),
        this.databaseNow,
      ],
    );
    await completeMessage(this.client, input.message, this.databaseNow);
  }
}

export class PostgresInterestQueueStore implements BlindReviewUnitOfWork, InterestQueueWorkerStore {
  public constructor(private readonly pool: Pool) {}

  public async runInTransaction<TResult>(
    work: (transaction: BlindReviewTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const nowResult = await client.query<{ database_now: Date }>(
        "SELECT clock_timestamp() AS database_now",
      );
      const databaseNow = nowResult.rows[0]?.database_now;
      if (databaseNow === undefined) throw new Error("PostgreSQL did not return database time.");
      const result = await work(new PostgresBlindReviewTransaction(client, databaseNow));
      await client.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async reconcileEligibilityNotification(): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{
        message_id: string;
        message_type: string;
        message_version: number;
        idempotency_key: string;
        payload: unknown;
      }>(
        `SELECT message_id, message_type, message_version, idempotency_key, payload
           FROM outbox_messages
          WHERE message_type = 'CandidateInterestEligibilityDetermined'
            AND processed_at IS NULL AND available_at <= clock_timestamp()
            AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
          ORDER BY available_at, created_at, message_id
          FOR UPDATE SKIP LOCKED
          LIMIT 1`,
      );
      const message = result.rows[0];
      if (message === undefined) {
        await client.query("COMMIT");
        return false;
      }
      const payloadHash = `sha256:${createHash("sha256")
        .update(
          JSON.stringify({
            message_type: message.message_type,
            message_version: message.message_version,
            payload: message.payload,
          }),
        )
        .digest("hex")}`;
      const existing = await client.query<{ payload_hash: string }>(
        `SELECT payload_hash FROM inbox_messages
          WHERE consumer = 'interest-queue-eligibility-reconciler'
            AND idempotency_key = $1`,
        [message.idempotency_key],
      );
      const existingHash = existing.rows[0]?.payload_hash;
      if (existingHash !== undefined && existingHash !== payloadHash) {
        throw new PostgresOptimisticConcurrencyError(
          "Eligibility notification idempotency key was reused for another payload.",
        );
      }
      await client.query(
        `INSERT INTO inbox_messages (
           consumer, message_id, idempotency_key, payload_hash, result_json, processed_at
         ) VALUES ('interest-queue-eligibility-reconciler', $1, $2, $3,
                   '{"outcome":"RECONCILED"}'::jsonb, clock_timestamp())
         ON CONFLICT DO NOTHING`,
        [message.message_id, message.idempotency_key, payloadHash],
      );
      const completed = await client.query(
        `UPDATE outbox_messages
            SET processed_at = clock_timestamp(), lease_owner = NULL, lease_expires_at = NULL
          WHERE message_id = $1 AND processed_at IS NULL`,
        [message.message_id],
      );
      if (completed.rowCount !== 1) {
        throw new PostgresOptimisticConcurrencyError(
          "Eligibility notification changed before reconciliation.",
        );
      }
      await client.query("COMMIT");
      return true;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async claimNext(
    workerId: string,
    leaseDurationSeconds: number,
  ): Promise<ClaimedOfferNextQueuedInterestMessage | null> {
    const result = await this.pool.query<{
      message_id: string;
      message_type: string;
      event_id: string;
      idempotency_key: string;
      correlation_id: string;
      payload: unknown;
      lease_owner: string;
      attempt_count: number;
    }>(
      `WITH next_message AS (
         SELECT message_id FROM outbox_messages
          WHERE processed_at IS NULL AND available_at <= clock_timestamp()
            AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
            AND message_type = 'OfferNextQueuedInterestRequested'
          ORDER BY available_at, created_at, message_id
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE outbox_messages AS message
          SET lease_owner = $1,
              lease_expires_at = clock_timestamp() + ($2 * interval '1 second'),
              attempt_count = attempt_count + 1
         FROM next_message WHERE message.message_id = next_message.message_id
       RETURNING message.message_id, message.message_type, message.event_id,
                 message.idempotency_key, message.correlation_id, message.payload,
                 message.lease_owner, message.attempt_count`,
      [workerId, leaseDurationSeconds],
    );
    const row = result.rows[0];
    return row === undefined ? null : parseClaimedMessage(row);
  }

  public async scheduleNextAvailableSlot(): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const candidateResult = await client.query<{
        commitment_ref: string;
        opportunity_ref: string;
        commitment_version: number;
        queue_policy_version: "onlyboth.interest-queue@1";
        queue_public_seed: string;
        slot_ref: string;
        slot_version: number;
      }>(
        `SELECT commitment.commitment_ref, commitment.opportunity_ref,
                commitment.version AS commitment_version,
                commitment.queue_policy_version, commitment.queue_public_seed,
                slot.slot_ref, slot.version AS slot_version
           FROM blind_review_commitments AS commitment
           JOIN answer_review_slots AS slot ON slot.commitment_ref = commitment.commitment_ref
           JOIN answer_review_slot_credit_reservations AS reservation
             ON reservation.slot_ref = slot.slot_ref
          WHERE commitment.state = 'ACTIVE'
            AND slot.status = 'AVAILABLE'
            AND slot.current_obligation_ref IS NULL
            AND reservation.state = 'RESERVED'
            AND EXISTS (
              SELECT 1 FROM candidate_interests AS interest
               WHERE interest.opportunity_ref = commitment.opportunity_ref
                 AND interest.status = 'WAITING_FOR_BACKED_SLOT'
                 AND interest.interest_schema_version IN (
                   'candidate-interest@1', 'candidate-interest@2'
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM candidate_activity_leases AS activity
                    WHERE activity.candidate_ref = interest.candidate_ref
                      AND activity.status = 'ACTIVE'
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM review_windows AS legacy_window
                    WHERE legacy_window.candidate_id = interest.candidate_ref
                      AND legacy_window.state = ANY($1::text[])
                 )
            )
            AND NOT EXISTS (
              SELECT 1 FROM outbox_messages AS pending
               WHERE pending.message_type = 'OfferNextQueuedInterestRequested'
                 AND pending.processed_at IS NULL
                 AND pending.payload->>'slot_ref' = slot.slot_ref
            )
            AND NOT EXISTS (
              SELECT 1 FROM domain_events AS failure
               WHERE failure.event_type = 'InterestQueueOfferFailed'
                 AND failure.payload->>'slot_ref' = slot.slot_ref
            )
          ORDER BY commitment.created_at, commitment.commitment_ref, slot.ordinal
          FOR UPDATE OF commitment, slot SKIP LOCKED
          LIMIT 1`,
        [ACTIVE_REVIEW_WINDOW_STATES],
      );
      const candidate = candidateResult.rows[0];
      if (candidate === undefined) {
        await client.query("COMMIT");
        return false;
      }
      const generationResult = await client.query<{ generation: number }>(
        `SELECT count(*)::integer + 1 AS generation
           FROM outbox_messages
          WHERE message_type = 'OfferNextQueuedInterestRequested'
            AND payload->>'slot_ref' = $1`,
        [candidate.slot_ref],
      );
      const generation = generationResult.rows[0]?.generation;
      if (generation === undefined)
        throw new Error("PostgreSQL did not return dispatch generation.");
      const eventId = [
        "event-interest-queue-dispatch",
        candidate.commitment_ref,
        candidate.slot_ref,
        generation,
      ].join(":");
      const messageId = [
        "outbox-interest-queue-dispatch",
        candidate.commitment_ref,
        candidate.slot_ref,
        generation,
      ].join(":");
      const correlationId = [
        "correlation-interest-queue-dispatch",
        candidate.commitment_ref,
        candidate.slot_ref,
        generation,
      ].join(":");
      const payload = {
        schema_version: "offer-next-queued-interest-requested@1",
        opportunity_ref: candidate.opportunity_ref,
        commitment_ref: candidate.commitment_ref,
        expected_commitment_version: candidate.commitment_version,
        slot_ref: candidate.slot_ref,
        expected_slot_version: candidate.slot_version,
        queue_policy_version: candidate.queue_policy_version,
        public_seed: candidate.queue_public_seed,
      };
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'InterestQueueOfferRequested', 1, 'InterestQueueDispatch',
                   $2, $3, $4, clock_timestamp(), $5::jsonb)`,
        [
          eventId,
          `${candidate.commitment_ref}:${candidate.slot_ref}`,
          generation,
          correlationId,
          JSON.stringify({
            schema_version: "interest-queue-offer-requested@1",
            opportunity_ref: candidate.opportunity_ref,
            commitment_ref: candidate.commitment_ref,
            slot_ref: candidate.slot_ref,
            dispatch_generation: generation,
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'OfferNextQueuedInterestRequested', 1, $2, $3, $4,
                   $5::jsonb, clock_timestamp())`,
        [
          messageId,
          eventId,
          `OfferNextQueuedInterestRequested:${candidate.commitment_ref}:${candidate.slot_ref}:${generation}`,
          correlationId,
          JSON.stringify(payload),
        ],
      );
      await client.query("COMMIT");
      return true;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async scheduleRetry(
    message: ClaimedOfferNextQueuedInterestMessage,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE outbox_messages
          SET available_at = clock_timestamp() + ($1 * interval '1 second'),
              lease_owner = NULL, lease_expires_at = NULL, last_error_code = $2
        WHERE message_id = $3 AND lease_owner = $4 AND attempt_count = $5
          AND processed_at IS NULL`,
      [retryAfterSeconds, errorCode, message.messageId, message.leaseOwner, message.attempt],
    );
    if (result.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError("Interest Queue retry lost its lease.");
    }
  }

  public async markFailed(
    message: ClaimedOfferNextQueuedInterestMessage,
    errorCode: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertMessageLease(client, message);
      const nowResult = await client.query<{ database_now: Date }>(
        "SELECT clock_timestamp() AS database_now",
      );
      const now = nowResult.rows[0]?.database_now;
      if (now === undefined) throw new Error("PostgreSQL did not return database time.");
      const failureEventId = `event:interest-queue-offer-failed:${message.messageId}:${message.attempt}`;
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'InterestQueueOfferFailed', 1, 'InterestQueueDispatch',
                   $2, $3, $4, $5, $6::jsonb)`,
        [
          failureEventId,
          message.messageId,
          message.attempt,
          message.correlationId,
          now,
          JSON.stringify({
            schema_version: "interest-queue-offer-failed@1",
            opportunity_ref: message.payload.opportunity_ref,
            commitment_ref: message.payload.commitment_ref,
            slot_ref: message.payload.slot_ref,
            error_code: errorCode,
          }),
        ],
      );
      await client.query(
        `INSERT INTO inbox_messages (
           consumer, message_id, idempotency_key, payload_hash, result_json, processed_at
         ) VALUES ('interest-queue-dead-letter', $1, $2, $3, $4::jsonb, $5)`,
        [
          message.messageId,
          message.idempotencyKey,
          workerPayloadHash(message),
          JSON.stringify({
            outcome: "FAILED",
            error_code: errorCode,
            event_id: failureEventId,
          }),
          now,
        ],
      );
      const result = await client.query(
        `UPDATE outbox_messages
            SET processed_at = $1, lease_owner = NULL,
                lease_expires_at = NULL, last_error_code = $2
          WHERE message_id = $3 AND lease_owner = $4 AND attempt_count = $5
            AND processed_at IS NULL`,
        [now, errorCode, message.messageId, message.leaseOwner, message.attempt],
      );
      if (result.rowCount !== 1) {
        throw new PostgresOptimisticConcurrencyError("Interest Queue failure lost its lease.");
      }
      await client.query("COMMIT");
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
