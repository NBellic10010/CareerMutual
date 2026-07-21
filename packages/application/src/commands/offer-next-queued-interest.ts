import {
  BackedAnswerOfferSchema,
  CandidateOpportunityProjectionV3Schema,
  EmployerBlindReviewProjectionSchema,
} from "@onlyboth/contracts";
import {
  BlindAnswerInvariantError,
  offerNextQueuedInterest,
  type RollingBlindReview,
} from "@onlyboth/domain";

import type {
  BlindReviewApplicationIdFactory,
  BlindReviewUnitOfWork,
  ClaimedOfferNextQueuedInterestMessage,
  OfferNextQueuedInterestReceipt,
  OfferNextQueuedInterestSnapshot,
} from "../ports/blind-review";

export type InterestQueueApplicationErrorCode =
  "CREDIT_RESERVATION_BROKEN" | "INTEREST_QUEUE_STATE_INVALID";

export class InterestQueueApplicationError extends Error {
  public override readonly name = "InterestQueueApplicationError";

  public constructor(
    public readonly code: InterestQueueApplicationErrorCode,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

function supersededReceipt(
  message: ClaimedOfferNextQueuedInterestMessage,
  processedAt: string,
  reasonCode: string,
): OfferNextQueuedInterestReceipt {
  return {
    schema_version: "offer-next-queued-interest-receipt@1",
    message_id: message.messageId,
    idempotency_key: message.idempotencyKey,
    slot_ref: message.payload.slot_ref,
    processed_at: processedAt,
    outcome: "SUPERSEDED",
    reason_code: reasonCode,
  };
}

function noWaitingInterestReceipt(
  message: ClaimedOfferNextQueuedInterestMessage,
  processedAt: string,
  slotVersion: number,
): OfferNextQueuedInterestReceipt {
  return {
    schema_version: "offer-next-queued-interest-receipt@1",
    message_id: message.messageId,
    idempotency_key: message.idempotencyKey,
    slot_ref: message.payload.slot_ref,
    processed_at: processedAt,
    outcome: "NO_WAITING_INTEREST",
    slot_version: slotVersion,
  };
}

function waitingInterestCount(review: RollingBlindReview): number {
  return review.interests.filter(({ state }) => state === "WAITING_FOR_BACKED_SLOT").length;
}

function availableSlotCount(review: RollingBlindReview): number {
  return review.slots.filter(({ state }) => state === "AVAILABLE").length;
}

function outstandingObligationCount(review: RollingBlindReview): number {
  return review.obligations.filter(({ state }) => state !== "SETTLED").length;
}

function hasOpenCohortSeat(review: RollingBlindReview): boolean {
  return review.cohorts.some(({ seats }) => seats.some(({ state }) => state === "OPEN"));
}

function validatePinnedRequest(
  message: ClaimedOfferNextQueuedInterestMessage,
  snapshot: OfferNextQueuedInterestSnapshot,
): string | null {
  const payload = message.payload;
  if (
    snapshot.review.commitment.opportunityRef !== payload.opportunity_ref ||
    snapshot.review.commitment.commitmentRef !== payload.commitment_ref
  ) {
    return "OFFER_CONTEXT_CHANGED";
  }
  if (snapshot.review.commitment.version !== payload.expected_commitment_version) {
    return "COMMITMENT_VERSION_CHANGED";
  }
  if (snapshot.review.commitment.state !== "ACTIVE") {
    return "COMMITMENT_NOT_ACTIVE";
  }
  if (snapshot.review.commitment.queuePolicyVersion !== payload.queue_policy_version) {
    return "QUEUE_POLICY_CHANGED";
  }
  if (snapshot.publicSeed !== payload.public_seed) {
    return "PUBLIC_SEED_CHANGED";
  }
  const slot = snapshot.review.slots.find(({ slotRef }) => slotRef === payload.slot_ref);
  if (
    slot === undefined ||
    slot.version !== payload.expected_slot_version ||
    slot.state !== "AVAILABLE" ||
    slot.currentObligationRef !== null
  ) {
    return "SLOT_NOT_AVAILABLE";
  }
  return null;
}

export class OfferNextQueuedInterestHandler {
  public constructor(
    private readonly unitOfWork: BlindReviewUnitOfWork,
    private readonly ids: BlindReviewApplicationIdFactory,
    private readonly hash: (value: string) => string,
  ) {}

  public async execute(
    message: ClaimedOfferNextQueuedInterestMessage,
  ): Promise<OfferNextQueuedInterestReceipt> {
    return this.unitOfWork.runInTransaction(async (transaction) => {
      const existing = await transaction.findWorkerReceipt("interest-queue-worker", message);
      if (existing !== null) {
        await transaction.completeOfferWithoutMutation({ message, receipt: existing });
        return existing;
      }

      const snapshot = await transaction.loadOfferForUpdate(message);
      const processedAt = transaction.databaseNow.toISOString();
      if (snapshot === null) {
        const receipt = supersededReceipt(message, processedAt, "OFFER_CONTEXT_MISSING");
        await transaction.completeOfferWithoutMutation({ message, receipt });
        return receipt;
      }
      const staleReason = validatePinnedRequest(message, snapshot);
      if (staleReason !== null) {
        const receipt = supersededReceipt(message, processedAt, staleReason);
        await transaction.completeOfferWithoutMutation({ message, receipt });
        return receipt;
      }
      const reservation = snapshot.slotCreditReservation;
      if (
        reservation === null ||
        reservation.slotRef !== message.payload.slot_ref ||
        reservation.state !== "RESERVED" ||
        reservation.amount !== snapshot.review.commitment.creditPerAnswerReview ||
        snapshot.creditAccount.committedCredits < reservation.amount
      ) {
        throw new InterestQueueApplicationError(
          "CREDIT_RESERVATION_BROKEN",
          false,
          "The available Slot no longer has its committed Answer Review Credit.",
        );
      }

      const newCohort = hasOpenCohortSeat(snapshot.review)
        ? undefined
        : {
            cohortRef: this.ids.nextId("advancement-cohort"),
            seatRefs: Array.from({ length: snapshot.review.commitment.advancementCohortSize }, () =>
              this.ids.nextId("advancement-cohort-seat"),
            ),
          };
      const obligationRef = this.ids.nextId("answer-review-obligation");
      const invitationRef = this.ids.nextId("answer-invitation");
      const creditHoldRef = this.ids.nextId("credit-hold");
      const offerExpiresAt = new Date(
        transaction.databaseNow.getTime() + snapshot.offerSlaHours * 3_600_000,
      ).toISOString();

      let transition;
      try {
        transition = offerNextQueuedInterest(snapshot.review, {
          slotRef: message.payload.slot_ref,
          obligationRef,
          invitationRef,
          creditHoldRef,
          offeredAt: processedAt,
          offerExpiresAt,
          publicSeed: snapshot.publicSeed,
          hash: this.hash,
          activeCandidateRefs: snapshot.activeCandidateRefs,
          newCohort,
        });
      } catch (error: unknown) {
        if (error instanceof BlindAnswerInvariantError) {
          throw new InterestQueueApplicationError(
            "INTEREST_QUEUE_STATE_INVALID",
            false,
            error.message,
          );
        }
        throw error;
      }
      if (transition === null) {
        const slot = snapshot.review.slots.find(
          ({ slotRef }) => slotRef === message.payload.slot_ref,
        );
        if (slot === undefined) {
          throw new InterestQueueApplicationError(
            "INTEREST_QUEUE_STATE_INVALID",
            false,
            "The requested Slot disappeared while completing an empty Queue request.",
          );
        }
        const receipt = noWaitingInterestReceipt(message, processedAt, slot.version);
        await transaction.completeOfferWithoutMutation({ message, receipt });
        return receipt;
      }

      const offer = BackedAnswerOfferSchema.parse({
        schema_version: "backed-answer-offer@1",
        invitation_ref: transition.offer.invitationRef,
        obligation_ref: transition.offer.obligationRef,
        slot_ref: transition.offer.slotRef,
        cohort_ref: transition.offer.cohortRef,
        cohort_seat_ref: transition.offer.cohortSeatRef,
        candidate_ref: transition.offer.candidateRef,
        reviewer: {
          reviewer_ref: snapshot.review.commitment.reviewerRef,
          display_name: snapshot.reviewerDisplayName,
        },
        credit_hold_ref: transition.offer.creditHoldRef,
        question_version_ref: snapshot.questionVersionRef,
        queue_policy_version: transition.offer.queuePolicyVersion,
        public_tie_break: transition.offer.publicTieBreak,
        offered_at: transition.offer.offeredAt,
        offer_expires_at: transition.offer.offerExpiresAt,
        answer_review_sla_hours: snapshot.review.commitment.answerReviewSlaHours,
        effort_limit_minutes: snapshot.effortLimitMinutes,
        candidate_ai_policy: "PROHIBITED",
      });
      const receipt = {
        schema_version: "offer-next-queued-interest-receipt@1" as const,
        message_id: message.messageId,
        idempotency_key: message.idempotencyKey,
        slot_ref: transition.offer.slotRef,
        processed_at: processedAt,
        outcome: "OFFERED" as const,
        offer,
      };
      const offerEventId = this.ids.nextId("event");
      const cohortEventId = this.ids.nextId("event");
      const queueInputSnapshot = snapshot.review.interests
        .filter(({ state }) => state === "WAITING_FOR_BACKED_SLOT")
        .map(({ interestRef, candidateRef, eligibleAt, interestCreatedAt, version }) => ({
          interestRef,
          candidateRef,
          eligibleAt,
          interestCreatedAt,
          version,
        }));
      const events = [
        {
          eventId: offerEventId,
          eventType: "BackedAnswerOfferCreated",
          eventVersion: 1 as const,
          aggregateType: "AnswerReviewObligation",
          aggregateId: transition.offer.obligationRef,
          aggregateVersion: 1,
          correlationId: message.correlationId,
          occurredAt: transaction.databaseNow,
          payload: {
            ...offer,
            schema_version: "backed-answer-offer-created@1",
            queue_input_snapshot_hash: this.hash(JSON.stringify(queueInputSnapshot)),
          },
        },
        {
          eventId: cohortEventId,
          eventType: "AdvancementCohortSeatReserved",
          eventVersion: 1 as const,
          aggregateType: "AdvancementCohort",
          aggregateId: transition.offer.cohortRef,
          aggregateVersion:
            transition.state.cohorts.find(
              ({ cohortRef }) => cohortRef === transition.offer.cohortRef,
            )?.version ?? 1,
          correlationId: message.correlationId,
          occurredAt: transaction.databaseNow,
          payload: {
            schema_version: "advancement-cohort-seat-reserved@1",
            cohort_ref: transition.offer.cohortRef,
            cohort_seat_ref: transition.offer.cohortSeatRef,
            obligation_ref: transition.offer.obligationRef,
          },
        },
      ] as const;
      const employerProjection = EmployerBlindReviewProjectionSchema.parse({
        schema_version: "employer-blind-review-projection@2",
        view: "EMPLOYER",
        opportunity_ref: snapshot.review.commitment.opportunityRef,
        commitment_ref: snapshot.review.commitment.commitmentRef,
        commitment_version: snapshot.review.commitment.version,
        queue_policy_version: snapshot.review.commitment.queuePolicyVersion,
        eligible_interest_count: transition.state.interests.length,
        waiting_interest_count: waitingInterestCount(transition.state),
        answer_review_wip: transition.state.commitment.answerReviewWip,
        available_slot_count: availableSlotCount(transition.state),
        outstanding_obligation_count: outstandingObligationCount(transition.state),
        disclosure: "Candidate profiles and claims are sealed before recorded answers exist.",
        runtime_mode: snapshot.runtimeMode,
        synthetic: snapshot.synthetic,
        phase: "PRE_ANSWER",
      });
      const candidateProjection = CandidateOpportunityProjectionV3Schema.parse({
        schema_version: "candidate-opportunity-projection@3",
        view: "CANDIDATE",
        state: "BACKED_OFFERED",
        opportunity_ref: snapshot.review.commitment.opportunityRef,
        candidate_ref: transition.offer.candidateRef,
        queue_policy_version: snapshot.review.commitment.queuePolicyVersion,
        eligible_interests_ahead: null,
        commitment_status: snapshot.review.commitment.state,
        invitation_ref: transition.offer.invitationRef,
        obligation_ref: transition.offer.obligationRef,
        credit_hold_ref: transition.offer.creditHoldRef,
        reviewer: {
          reviewer_ref: snapshot.review.commitment.reviewerRef,
          display_name: snapshot.reviewerDisplayName,
        },
        message: "A named Reviewer has funded a time-limited blind Answer opportunity.",
        runtime_mode: snapshot.runtimeMode,
        synthetic: snapshot.synthetic,
      });
      const activityLease = {
        leaseRef: this.ids.nextId("candidate-activity-lease"),
        candidateRef: transition.offer.candidateRef,
        opportunityRef: snapshot.review.commitment.opportunityRef,
        bindingKind: "ANSWER_REVIEW" as const,
        bindingRef: transition.offer.obligationRef,
        state: "ACTIVE" as const,
        version: 1,
        acquiredAt: processedAt,
        releasedAt: null,
      };
      const creditHold = {
        creditHoldRef: transition.offer.creditHoldRef,
        accountRef: snapshot.creditAccount.accountRef,
        reservationRef: reservation.reservationRef,
        obligationRef: transition.offer.obligationRef,
        amount: reservation.amount,
        purpose: "ANSWER_REVIEW" as const,
        status: "HELD" as const,
        createdAt: processedAt,
        settledAt: null,
      };

      await transaction.persistOffer({
        message,
        previousReview: snapshot.review,
        nextReview: transition.state,
        expectedCreditAccountVersion: snapshot.creditAccount.version,
        expectedCreditReservationVersion: reservation.version,
        nextCreditReservation: {
          ...reservation,
          state: "BOUND",
          version: reservation.version + 1,
        },
        activityLease,
        creditHold,
        events,
        outbox: {
          messageId: this.ids.nextId("outbox"),
          messageType: "BackedAnswerOfferCreated",
          messageVersion: 1,
          eventId: offerEventId,
          idempotencyKey: `BackedAnswerOfferCreated:${transition.offer.obligationRef}:1`,
          correlationId: message.correlationId,
          availableAt: transaction.databaseNow,
          payload: {
            schema_version: "backed-answer-offer-created@1",
            opportunity_ref: snapshot.review.commitment.opportunityRef,
            candidate_ref: transition.offer.candidateRef,
            invitation_ref: transition.offer.invitationRef,
            obligation_ref: transition.offer.obligationRef,
          },
        },
        employerProjection,
        candidateProjection,
        receipt,
      });
      return receipt;
    });
  }
}
