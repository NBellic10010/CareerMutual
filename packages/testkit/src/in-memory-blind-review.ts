import type {
  AnswerReviewCreditHoldRecord,
  BlindReviewActivationSnapshot,
  BlindReviewDomainEventRecord,
  BlindReviewOutboxRecord,
  BlindReviewTransaction,
  BlindReviewUnitOfWork,
  CandidateActivityLeaseRecord,
  ClaimedOfferNextQueuedInterestMessage,
  CompleteOfferWithoutMutation,
  InterestQueueWorkerStore,
  OfferNextQueuedInterestPayload,
  OfferNextQueuedInterestReceipt,
  OfferNextQueuedInterestSnapshot,
  PersistBackedAnswerOffer,
  PersistBlindReviewActivation,
  QueuedInterestRecord,
  SlotCreditReservationRecord,
  StoredBlindReviewCommandReceipt,
} from "@onlyboth/application";
import type {
  CandidateOpportunityProjectionV3,
  EmployerBlindReviewProjection,
} from "@onlyboth/contracts";
import { queueCandidateInterest, type RollingBlindReview } from "@onlyboth/domain";

export type InMemoryBlindReviewFailurePoint = "ACTIVATION_OUTBOX" | "OFFER_OUTBOX" | null;

interface StoredWorkerMessage {
  readonly messageId: string;
  readonly messageType: "OfferNextQueuedInterestRequested";
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly payload: OfferNextQueuedInterestPayload;
  attempt: number;
  leaseOwner: string | null;
  processed: boolean;
  lastErrorCode: string | null;
}

interface InMemoryBlindReviewState {
  readonly opportunityRef: string;
  readonly opportunityVersion: number;
  readonly opportunityState: "OPEN" | "PAUSED" | "CLOSED";
  readonly reviewerRef: string;
  readonly reviewerDisplayName: string;
  readonly questionVersionRef: string;
  readonly publicSeed: string;
  readonly offerSlaHours: number;
  readonly effortLimitMinutes: number;
  readonly runtimeMode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly synthetic: boolean;
  readonly queuedInterests: readonly QueuedInterestRecord[];
  readonly preexistingActiveCandidateRefs: ReadonlySet<string>;
  review: RollingBlindReview | null;
  accountRef: string;
  creditAccountVersion: number;
  availableCredits: number;
  committedCredits: number;
  heldCredits: number;
  slotCreditReservations: SlotCreditReservationRecord[];
  commandReceipts: Map<string, StoredBlindReviewCommandReceipt>;
  workerReceipts: Map<string, OfferNextQueuedInterestReceipt>;
  workerReceiptPayloads: Map<string, string>;
  events: BlindReviewDomainEventRecord[];
  outbox: BlindReviewOutboxRecord[];
  workerMessages: StoredWorkerMessage[];
  activityLeases: CandidateActivityLeaseRecord[];
  creditHolds: AnswerReviewCreditHoldRecord[];
  employerProjection: EmployerBlindReviewProjection | null;
  candidateProjections: Map<string, CandidateOpportunityProjectionV3>;
  dispatchSequence: number;
}

export interface InMemoryBlindReviewOptions {
  readonly opportunityRef: string;
  readonly opportunityVersion: number;
  readonly opportunityState: "OPEN" | "PAUSED" | "CLOSED";
  readonly reviewerRef: string;
  readonly reviewerDisplayName: string;
  readonly questionVersionRef: string;
  readonly publicSeed: string;
  readonly offerSlaHours: number;
  readonly effortLimitMinutes: number;
  readonly runtimeMode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly availableCredits: number;
  readonly queuedInterests: readonly QueuedInterestRecord[];
  readonly activeCandidateRefs: readonly string[];
  readonly now: Date;
  readonly failAt: InMemoryBlindReviewFailurePoint;
}

export interface InMemoryBlindReviewSnapshot {
  readonly review: RollingBlindReview | null;
  readonly availableCredits: number;
  readonly committedCredits: number;
  readonly heldCredits: number;
  readonly slotCreditReservations: readonly SlotCreditReservationRecord[];
  readonly events: readonly BlindReviewDomainEventRecord[];
  readonly outbox: readonly BlindReviewOutboxRecord[];
  readonly workerReceipts: readonly OfferNextQueuedInterestReceipt[];
  readonly activityLeases: readonly CandidateActivityLeaseRecord[];
  readonly creditHolds: readonly AnswerReviewCreditHoldRecord[];
  readonly employerProjection: EmployerBlindReviewProjection | null;
  readonly candidateProjections: ReadonlyMap<string, CandidateOpportunityProjectionV3>;
}

function cloneState(state: InMemoryBlindReviewState): InMemoryBlindReviewState {
  return {
    ...state,
    queuedInterests: structuredClone(state.queuedInterests),
    preexistingActiveCandidateRefs: new Set(state.preexistingActiveCandidateRefs),
    review: state.review === null ? null : structuredClone(state.review),
    slotCreditReservations: structuredClone(state.slotCreditReservations),
    commandReceipts: new Map(
      [...state.commandReceipts].map(([key, value]) => [key, structuredClone(value)]),
    ),
    workerReceipts: new Map(
      [...state.workerReceipts].map(([key, value]) => [key, structuredClone(value)]),
    ),
    workerReceiptPayloads: new Map(state.workerReceiptPayloads),
    events: structuredClone(state.events),
    outbox: structuredClone(state.outbox),
    workerMessages: structuredClone(state.workerMessages),
    activityLeases: structuredClone(state.activityLeases),
    creditHolds: structuredClone(state.creditHolds),
    employerProjection:
      state.employerProjection === null ? null : structuredClone(state.employerProjection),
    candidateProjections: new Map(
      [...state.candidateProjections].map(([key, value]) => [key, structuredClone(value)]),
    ),
  };
}

function commandReceiptKey(actorRef: string, idempotencyKey: string): string {
  return `${actorRef}:${idempotencyKey}`;
}

function toClaimed(message: StoredWorkerMessage): ClaimedOfferNextQueuedInterestMessage {
  if (message.leaseOwner === null) throw new Error("Worker message is not leased.");
  return {
    messageId: message.messageId,
    messageType: message.messageType,
    eventId: message.eventId,
    idempotencyKey: message.idempotencyKey,
    correlationId: message.correlationId,
    payload: structuredClone(message.payload),
    leaseOwner: message.leaseOwner,
    attempt: message.attempt,
  };
}

function assertMessageLease(
  pending: InMemoryBlindReviewState,
  claimed: ClaimedOfferNextQueuedInterestMessage,
): StoredWorkerMessage {
  const message = pending.workerMessages.find(({ messageId }) => messageId === claimed.messageId);
  if (
    message === undefined ||
    message.processed ||
    message.leaseOwner !== claimed.leaseOwner ||
    message.attempt !== claimed.attempt
  ) {
    const error = new Error("The Offer request no longer owns its worker lease.") as Error & {
      code: string;
      retryable: boolean;
    };
    error.code = "OFFER_MESSAGE_LEASE_LOST";
    error.retryable = true;
    throw error;
  }
  return message;
}

function workerMessageFromOutbox(record: BlindReviewOutboxRecord): StoredWorkerMessage | null {
  if (record.messageType !== "OfferNextQueuedInterestRequested") return null;
  const payload = record.payload as unknown as Partial<OfferNextQueuedInterestPayload>;
  if (
    payload.schema_version !== "offer-next-queued-interest-requested@1" ||
    typeof payload.opportunity_ref !== "string" ||
    typeof payload.commitment_ref !== "string" ||
    typeof payload.expected_commitment_version !== "number" ||
    typeof payload.slot_ref !== "string" ||
    typeof payload.expected_slot_version !== "number" ||
    payload.queue_policy_version !== "onlyboth.interest-queue@1" ||
    typeof payload.public_seed !== "string"
  ) {
    throw new Error("OfferNextQueuedInterestRequested payload is invalid.");
  }
  return {
    messageId: record.messageId,
    messageType: "OfferNextQueuedInterestRequested",
    eventId: record.eventId,
    idempotencyKey: record.idempotencyKey,
    correlationId: record.correlationId,
    payload: payload as OfferNextQueuedInterestPayload,
    attempt: 0,
    leaseOwner: null,
    processed: false,
    lastErrorCode: null,
  };
}

export class InMemoryBlindReviewUnitOfWork
  implements BlindReviewUnitOfWork, InterestQueueWorkerStore
{
  #state: InMemoryBlindReviewState;
  #failurePoint: InMemoryBlindReviewFailurePoint;

  public constructor(private readonly options: InMemoryBlindReviewOptions) {
    this.#failurePoint = options.failAt;
    this.#state = {
      opportunityRef: options.opportunityRef,
      opportunityVersion: options.opportunityVersion,
      opportunityState: options.opportunityState,
      reviewerRef: options.reviewerRef,
      reviewerDisplayName: options.reviewerDisplayName,
      questionVersionRef: options.questionVersionRef,
      publicSeed: options.publicSeed,
      offerSlaHours: options.offerSlaHours,
      effortLimitMinutes: options.effortLimitMinutes,
      runtimeMode: options.runtimeMode,
      synthetic: options.runtimeMode === "GOLDEN_REPLAY",
      queuedInterests: structuredClone(options.queuedInterests),
      preexistingActiveCandidateRefs: new Set(options.activeCandidateRefs),
      review: null,
      accountRef: "credit-account-1",
      creditAccountVersion: 1,
      availableCredits: options.availableCredits,
      committedCredits: 0,
      heldCredits: 0,
      slotCreditReservations: [],
      commandReceipts: new Map(),
      workerReceipts: new Map(),
      workerReceiptPayloads: new Map(),
      events: [],
      outbox: [],
      workerMessages: [],
      activityLeases: [],
      creditHolds: [],
      employerProjection: null,
      candidateProjections: new Map(),
      dispatchSequence: 0,
    };
  }

  public snapshot(): InMemoryBlindReviewSnapshot {
    const state = cloneState(this.#state);
    return {
      review: state.review,
      availableCredits: state.availableCredits,
      committedCredits: state.committedCredits,
      heldCredits: state.heldCredits,
      slotCreditReservations: state.slotCreditReservations,
      events: state.events,
      outbox: state.outbox,
      workerReceipts: [...state.workerReceipts.values()],
      activityLeases: state.activityLeases,
      creditHolds: state.creditHolds,
      employerProjection: state.employerProjection,
      candidateProjections: state.candidateProjections,
    };
  }

  public injectFailure(point: InMemoryBlindReviewFailurePoint): void {
    this.#failurePoint = point;
  }

  public enqueueDuplicate(
    message: ClaimedOfferNextQueuedInterestMessage,
    duplicateMessageId: string,
  ): void {
    this.#state.workerMessages.unshift({
      messageId: duplicateMessageId,
      messageType: message.messageType,
      eventId: message.eventId,
      idempotencyKey: message.idempotencyKey,
      correlationId: message.correlationId,
      payload: structuredClone(message.payload),
      attempt: 0,
      leaseOwner: null,
      processed: false,
      lastErrorCode: null,
    });
  }

  public submitQueuedInterest(interest: QueuedInterestRecord): void {
    this.#state = {
      ...this.#state,
      queuedInterests: [...this.#state.queuedInterests, structuredClone(interest)],
    };
  }

  public async runInTransaction<TResult>(
    work: (transaction: BlindReviewTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const pending = cloneState(this.#state);
    const now = new Date(this.options.now);
    const failurePoint = this.#failurePoint;
    const transaction: BlindReviewTransaction = {
      databaseNow: now,
      async findCommandReceipt(actorRef, idempotencyKey) {
        const receipt = pending.commandReceipts.get(commandReceiptKey(actorRef, idempotencyKey));
        return receipt === undefined ? null : structuredClone(receipt);
      },
      async loadActivationForUpdate(opportunityRef) {
        if (pending.opportunityRef !== opportunityRef) return null;
        const snapshot: BlindReviewActivationSnapshot = {
          opportunityRef: pending.opportunityRef,
          opportunityVersion: pending.opportunityVersion,
          opportunityState: pending.opportunityState,
          reviewerRef: pending.reviewerRef,
          reviewerDisplayName: pending.reviewerDisplayName,
          questionVersionRef: pending.questionVersionRef,
          publicSeed: pending.publicSeed,
          offerSlaHours: pending.offerSlaHours,
          effortLimitMinutes: pending.effortLimitMinutes,
          runtimeMode: pending.runtimeMode,
          synthetic: pending.synthetic,
          review: pending.review === null ? null : structuredClone(pending.review),
          queuedInterests: structuredClone(pending.queuedInterests),
          creditAccount: {
            accountRef: pending.accountRef,
            version: pending.creditAccountVersion,
            availableCredits: pending.availableCredits,
            committedCredits: pending.committedCredits,
            heldCredits: pending.heldCredits,
          },
        };
        return snapshot;
      },
      async persistActivation(input: PersistBlindReviewActivation) {
        if (
          pending.opportunityVersion !== input.expectedOpportunityVersion ||
          (pending.review?.commitment.version ?? 0) !== input.expectedCommitmentVersion ||
          pending.creditAccountVersion !== input.expectedCreditAccountVersion
        ) {
          throw new Error("Injected optimistic concurrency conflict during activation.");
        }
        const totalCredit = input.creditReservations.reduce(
          (sum, reservation) => sum + reservation.amount,
          0,
        );
        if (pending.availableCredits < totalCredit) {
          throw new Error("Credit capacity changed during activation.");
        }
        pending.review = structuredClone(input.nextReview);
        pending.availableCredits -= totalCredit;
        pending.committedCredits += totalCredit;
        pending.creditAccountVersion += 1;
        pending.slotCreditReservations.push(...structuredClone(input.creditReservations));
        pending.events.push(structuredClone(input.event));
        pending.outbox.push(...structuredClone(input.outbox));
        for (const outbox of input.outbox) {
          const workerMessage = workerMessageFromOutbox(outbox);
          if (workerMessage !== null) pending.workerMessages.push(workerMessage);
        }
        if (failurePoint === "ACTIVATION_OUTBOX") {
          throw new Error("Injected activation Outbox failure.");
        }
        pending.employerProjection = structuredClone(input.employerProjection);
        pending.commandReceipts.set(commandReceiptKey(input.actorRef, input.idempotencyKey), {
          actorRef: input.actorRef,
          idempotencyKey: input.idempotencyKey,
          commandFingerprint: input.commandFingerprint,
          receipt: structuredClone(input.receipt),
        });
      },
      async findWorkerReceipt(_consumer, message) {
        const receipt = pending.workerReceipts.get(message.idempotencyKey);
        const storedPayload = pending.workerReceiptPayloads.get(message.idempotencyKey);
        if (receipt !== undefined && storedPayload !== JSON.stringify(message.payload)) {
          const error = new Error(
            "The Interest Queue idempotency key was reused with another payload.",
          ) as Error & { code: string; retryable: boolean };
          error.code = "INTEREST_QUEUE_IDEMPOTENCY_CONFLICT";
          error.retryable = false;
          throw error;
        }
        return receipt === undefined ? null : structuredClone(receipt);
      },
      async loadOfferForUpdate(message) {
        assertMessageLease(pending, message);
        if (
          pending.review === null ||
          pending.review.commitment.opportunityRef !== message.payload.opportunity_ref
        ) {
          return null;
        }
        const reservation = pending.slotCreditReservations.find(
          ({ slotRef }) => slotRef === message.payload.slot_ref,
        );
        const activeCandidateRefs = new Set(pending.preexistingActiveCandidateRefs);
        for (const lease of pending.activityLeases) {
          if (lease.state === "ACTIVE") activeCandidateRefs.add(lease.candidateRef);
        }
        let refreshedReview = structuredClone(pending.review);
        for (const interest of pending.queuedInterests) {
          if (
            !refreshedReview.interests.some(
              ({ interestRef }) => interestRef === interest.interestRef,
            )
          ) {
            refreshedReview = queueCandidateInterest(refreshedReview, interest);
          }
        }
        const snapshot: OfferNextQueuedInterestSnapshot = {
          review: refreshedReview,
          publicSeed: pending.publicSeed,
          activeCandidateRefs,
          slotCreditReservation: reservation === undefined ? null : structuredClone(reservation),
          creditAccount: {
            accountRef: pending.accountRef,
            version: pending.creditAccountVersion,
            availableCredits: pending.availableCredits,
            committedCredits: pending.committedCredits,
            heldCredits: pending.heldCredits,
          },
          reviewerDisplayName: pending.reviewerDisplayName,
          questionVersionRef: pending.questionVersionRef,
          offerSlaHours: pending.offerSlaHours,
          effortLimitMinutes: pending.effortLimitMinutes,
          runtimeMode: pending.runtimeMode,
          synthetic: pending.synthetic,
        };
        return snapshot;
      },
      async persistOffer(input: PersistBackedAnswerOffer) {
        const message = assertMessageLease(pending, input.message);
        if (
          pending.review?.version !== input.previousReview.version ||
          pending.creditAccountVersion !== input.expectedCreditAccountVersion
        ) {
          throw new Error("Blind Review state changed before Offer persistence.");
        }
        const reservationIndex = pending.slotCreditReservations.findIndex(
          ({ reservationRef }) => reservationRef === input.nextCreditReservation.reservationRef,
        );
        const reservation = pending.slotCreditReservations[reservationIndex];
        if (
          reservation === undefined ||
          reservation.version !== input.expectedCreditReservationVersion ||
          reservation.state !== "RESERVED"
        ) {
          throw new Error("Slot Credit Reservation changed before Offer persistence.");
        }
        const candidateAlreadyActive =
          pending.preexistingActiveCandidateRefs.has(input.activityLease.candidateRef) ||
          pending.activityLeases.some(
            ({ candidateRef, state }) =>
              candidateRef === input.activityLease.candidateRef && state === "ACTIVE",
          );
        if (candidateAlreadyActive) {
          const error = new Error(
            "Candidate Activity Lease changed before Offer persistence.",
          ) as Error & { code: string; retryable: boolean };
          error.code = "CANDIDATE_ACTIVITY_RACE";
          error.retryable = true;
          throw error;
        }
        pending.review = structuredClone(input.nextReview);
        pending.slotCreditReservations[reservationIndex] = structuredClone(
          input.nextCreditReservation,
        );
        pending.committedCredits -= input.creditHold.amount;
        pending.heldCredits += input.creditHold.amount;
        pending.creditAccountVersion += 1;
        pending.activityLeases.push(structuredClone(input.activityLease));
        pending.creditHolds.push(structuredClone(input.creditHold));
        pending.events.push(...structuredClone(input.events));
        pending.outbox.push(structuredClone(input.outbox));
        if (failurePoint === "OFFER_OUTBOX") {
          throw new Error("Injected Offer Outbox failure.");
        }
        pending.employerProjection = structuredClone(input.employerProjection);
        pending.candidateProjections.set(
          input.candidateProjection.candidate_ref,
          structuredClone(input.candidateProjection),
        );
        pending.workerReceipts.set(input.message.idempotencyKey, structuredClone(input.receipt));
        pending.workerReceiptPayloads.set(
          input.message.idempotencyKey,
          JSON.stringify(input.message.payload),
        );
        message.processed = true;
        message.leaseOwner = null;
      },
      async completeOfferWithoutMutation(input: CompleteOfferWithoutMutation) {
        const message = assertMessageLease(pending, input.message);
        if (!pending.workerReceipts.has(input.message.idempotencyKey)) {
          pending.workerReceipts.set(input.message.idempotencyKey, structuredClone(input.receipt));
          pending.workerReceiptPayloads.set(
            input.message.idempotencyKey,
            JSON.stringify(input.message.payload),
          );
        }
        message.processed = true;
        message.leaseOwner = null;
      },
    };

    const result = await work(transaction);
    this.#state = pending;
    return result;
  }

  public async scheduleNextAvailableSlot(): Promise<boolean> {
    const review = this.#state.review;
    if (review === null || review.commitment.state !== "ACTIVE") return false;
    const hasWaitingInterest = this.#state.queuedInterests.some((interest) => {
      const aggregateInterest = review.interests.find(
        ({ interestRef }) => interestRef === interest.interestRef,
      );
      return (
        aggregateInterest === undefined || aggregateInterest.state === "WAITING_FOR_BACKED_SLOT"
      );
    });
    if (!hasWaitingInterest) return false;
    const slot = review.slots.find(
      ({ slotRef, state }) =>
        state === "AVAILABLE" &&
        !this.#state.workerMessages.some(
          (message) => !message.processed && message.payload.slot_ref === slotRef,
        ),
    );
    if (slot === undefined) return false;

    this.#state.dispatchSequence += 1;
    const dispatchRef = `interest-queue-dispatch-${this.#state.dispatchSequence}`;
    this.#state.workerMessages.push({
      messageId: `outbox-${dispatchRef}`,
      messageType: "OfferNextQueuedInterestRequested",
      eventId: `event-${dispatchRef}`,
      idempotencyKey: [
        "OfferNextQueuedInterestRequested",
        review.commitment.commitmentRef,
        slot.slotRef,
        dispatchRef,
      ].join(":"),
      correlationId: dispatchRef,
      payload: {
        schema_version: "offer-next-queued-interest-requested@1",
        opportunity_ref: review.commitment.opportunityRef,
        commitment_ref: review.commitment.commitmentRef,
        expected_commitment_version: review.commitment.version,
        slot_ref: slot.slotRef,
        expected_slot_version: slot.version,
        queue_policy_version: review.commitment.queuePolicyVersion,
        public_seed: this.#state.publicSeed,
      },
      attempt: 0,
      leaseOwner: null,
      processed: false,
      lastErrorCode: null,
    });
    return true;
  }

  public async reconcileEligibilityNotification(): Promise<boolean> {
    return false;
  }

  public async claimNext(
    workerId: string,
    _leaseDurationSeconds: number,
  ): Promise<ClaimedOfferNextQueuedInterestMessage | null> {
    const message = this.#state.workerMessages.find(
      ({ processed, leaseOwner }) => !processed && leaseOwner === null,
    );
    if (message === undefined) return null;
    message.leaseOwner = workerId;
    message.attempt += 1;
    return toClaimed(message);
  }

  public async scheduleRetry(
    claimed: ClaimedOfferNextQueuedInterestMessage,
    errorCode: string,
    _retryAfterSeconds: number,
  ): Promise<void> {
    const message = assertMessageLease(this.#state, claimed);
    message.lastErrorCode = errorCode;
    message.leaseOwner = null;
  }

  public async markFailed(
    claimed: ClaimedOfferNextQueuedInterestMessage,
    errorCode: string,
  ): Promise<void> {
    const message = assertMessageLease(this.#state, claimed);
    message.lastErrorCode = errorCode;
    message.processed = true;
    message.leaseOwner = null;
  }
}
