import type {
  BackedAnswerOffer,
  AnswerInvitationDecisionReceipt,
  BlindReviewCommitmentReceipt,
  CandidateOpportunityProjectionV3,
  EmployerBlindReviewProjection,
} from "@onlyboth/contracts";
import type { RollingBlindReview } from "@onlyboth/domain";

export interface QueuedInterestRecord {
  readonly interestRef: string;
  readonly candidateRef: string;
  readonly eligibilityEdgeRef: string;
  readonly eligibleAt: string;
  readonly interestCreatedAt: string;
}

export interface BlindReviewCreditAccountSnapshot {
  readonly accountRef: string;
  readonly version: number;
  readonly availableCredits: number;
  readonly committedCredits: number;
  readonly heldCredits: number;
}

export interface BlindReviewActivationSnapshot {
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
  readonly review: RollingBlindReview | null;
  readonly queuedInterests: readonly QueuedInterestRecord[];
  readonly creditAccount: BlindReviewCreditAccountSnapshot;
}

export interface StoredBlindReviewCommandReceipt {
  readonly actorRef: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly receipt: BlindReviewCommitmentReceipt;
}

export interface BlindReviewDomainEventRecord {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: 1;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly correlationId: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface BlindReviewOutboxRecord {
  readonly messageId: string;
  readonly messageType: string;
  readonly messageVersion: 1;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly availableAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface SlotCreditReservationRecord {
  readonly reservationRef: string;
  readonly slotRef: string;
  readonly accountRef: string;
  readonly amount: number;
  readonly state: "RESERVED" | "BOUND" | "RELEASED";
  readonly version: number;
}

export interface PersistBlindReviewActivation {
  readonly actorRef: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly expectedOpportunityVersion: number;
  readonly expectedCommitmentVersion: number;
  readonly expectedCreditAccountVersion: number;
  readonly previousReview: RollingBlindReview | null;
  readonly nextReview: RollingBlindReview;
  readonly creditReservations: readonly SlotCreditReservationRecord[];
  readonly event: BlindReviewDomainEventRecord;
  readonly outbox: readonly BlindReviewOutboxRecord[];
  readonly employerProjection: EmployerBlindReviewProjection;
  readonly receipt: BlindReviewCommitmentReceipt;
}

export interface OfferNextQueuedInterestPayload {
  readonly schema_version: "offer-next-queued-interest-requested@1";
  readonly opportunity_ref: string;
  readonly commitment_ref: string;
  readonly expected_commitment_version: number;
  readonly slot_ref: string;
  readonly expected_slot_version: number;
  readonly queue_policy_version: "onlyboth.interest-queue@1";
  readonly public_seed: string;
}

export interface ClaimedOfferNextQueuedInterestMessage {
  readonly messageId: string;
  readonly messageType: "OfferNextQueuedInterestRequested";
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly payload: OfferNextQueuedInterestPayload;
  readonly leaseOwner: string;
  readonly attempt: number;
}

interface OfferNextQueuedInterestReceiptBase {
  readonly schema_version: "offer-next-queued-interest-receipt@1";
  readonly message_id: string;
  readonly idempotency_key: string;
  readonly slot_ref: string;
  readonly processed_at: string;
}

export type OfferNextQueuedInterestReceipt =
  | (OfferNextQueuedInterestReceiptBase & {
      readonly outcome: "OFFERED";
      readonly offer: BackedAnswerOffer;
    })
  | (OfferNextQueuedInterestReceiptBase & {
      readonly outcome: "NO_WAITING_INTEREST";
      readonly slot_version: number;
    })
  | (OfferNextQueuedInterestReceiptBase & {
      readonly outcome: "SUPERSEDED";
      readonly reason_code: string;
    });

export interface OfferNextQueuedInterestSnapshot {
  readonly review: RollingBlindReview;
  readonly publicSeed: string;
  readonly activeCandidateRefs: ReadonlySet<string>;
  readonly slotCreditReservation: SlotCreditReservationRecord | null;
  readonly creditAccount: BlindReviewCreditAccountSnapshot;
  readonly reviewerDisplayName: string;
  readonly questionVersionRef: string;
  readonly offerSlaHours: number;
  readonly effortLimitMinutes: number;
  readonly runtimeMode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly synthetic: boolean;
}

export interface CandidateActivityLeaseRecord {
  readonly leaseRef: string;
  readonly candidateRef: string;
  readonly opportunityRef: string;
  readonly bindingKind: "ANSWER_REVIEW";
  readonly bindingRef: string;
  readonly state: "ACTIVE" | "RELEASED";
  readonly version: number;
  readonly acquiredAt: string;
  readonly releasedAt: string | null;
}

export interface AnswerReviewCreditHoldRecord {
  readonly creditHoldRef: string;
  readonly accountRef: string;
  readonly reservationRef: string;
  readonly obligationRef: string;
  readonly amount: number;
  readonly purpose: "ANSWER_REVIEW";
  readonly status: "HELD" | "RETURNED" | "FORFEITED";
  readonly createdAt: string;
  readonly settledAt: string | null;
}

export interface PersistBackedAnswerOffer {
  readonly message: ClaimedOfferNextQueuedInterestMessage;
  readonly previousReview: RollingBlindReview;
  readonly nextReview: RollingBlindReview;
  readonly expectedCreditAccountVersion: number;
  readonly expectedCreditReservationVersion: number;
  readonly nextCreditReservation: SlotCreditReservationRecord;
  readonly activityLease: CandidateActivityLeaseRecord;
  readonly creditHold: AnswerReviewCreditHoldRecord;
  readonly events: readonly [BlindReviewDomainEventRecord, BlindReviewDomainEventRecord];
  readonly outbox: BlindReviewOutboxRecord;
  readonly employerProjection: EmployerBlindReviewProjection;
  readonly candidateProjection: CandidateOpportunityProjectionV3;
  readonly receipt: OfferNextQueuedInterestReceipt & { readonly outcome: "OFFERED" };
}

export interface CompleteOfferWithoutMutation {
  readonly message: ClaimedOfferNextQueuedInterestMessage;
  readonly receipt: OfferNextQueuedInterestReceipt;
}

export interface BlindReviewTransaction {
  readonly databaseNow: Date;
  findCommandReceipt(
    actorRef: string,
    idempotencyKey: string,
  ): Promise<StoredBlindReviewCommandReceipt | null>;
  loadActivationForUpdate(opportunityRef: string): Promise<BlindReviewActivationSnapshot | null>;
  persistActivation(input: PersistBlindReviewActivation): Promise<void>;
  findWorkerReceipt(
    consumer: "interest-queue-worker",
    message: ClaimedOfferNextQueuedInterestMessage,
  ): Promise<OfferNextQueuedInterestReceipt | null>;
  loadOfferForUpdate(
    message: ClaimedOfferNextQueuedInterestMessage,
  ): Promise<OfferNextQueuedInterestSnapshot | null>;
  persistOffer(input: PersistBackedAnswerOffer): Promise<void>;
  completeOfferWithoutMutation(input: CompleteOfferWithoutMutation): Promise<void>;
}

export interface BlindReviewUnitOfWork {
  runInTransaction<TResult>(
    work: (transaction: BlindReviewTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface InterestQueueWorkerStore {
  reconcileEligibilityNotification(): Promise<boolean>;
  scheduleNextAvailableSlot(): Promise<boolean>;
  claimNext(
    workerId: string,
    leaseDurationSeconds: number,
  ): Promise<ClaimedOfferNextQueuedInterestMessage | null>;
  scheduleRetry(
    message: ClaimedOfferNextQueuedInterestMessage,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<void>;
  markFailed(message: ClaimedOfferNextQueuedInterestMessage, errorCode: string): Promise<void>;
}

export interface BlindReviewApplicationIdFactory {
  nextId(
    kind:
      | "command"
      | "event"
      | "outbox"
      | "blind-review-commitment"
      | "answer-review-slot"
      | "slot-credit-reservation"
      | "answer-review-obligation"
      | "answer-invitation"
      | "answer-session"
      | "credit-hold"
      | "candidate-activity-lease"
      | "advancement-cohort"
      | "advancement-cohort-seat",
  ): string;
}

export interface StoredAnswerInvitationDecisionReceipt {
  readonly actorRef: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly receipt: AnswerInvitationDecisionReceipt;
}

export interface AnswerSessionStartRecord {
  readonly answerSessionRef: string;
  readonly invitationRef: string;
  readonly obligationRef: string;
  readonly startedAt: string;
  readonly answerDueAt: string;
  readonly state: "ACTIVE";
  readonly version: 1;
}

export interface AnswerInvitationDecisionSnapshot {
  readonly review: RollingBlindReview;
  readonly targetInvitationRef: string;
  readonly publicSeed: string;
  readonly reviewerDisplayName: string;
  readonly effortLimitMinutes: number;
  readonly runtimeMode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly synthetic: boolean;
  readonly creditAccount: BlindReviewCreditAccountSnapshot;
  readonly slotCreditReservation: SlotCreditReservationRecord;
  readonly creditHold: AnswerReviewCreditHoldRecord;
  readonly activityLease: CandidateActivityLeaseRecord;
}

export interface PersistAnswerInvitationDecision {
  readonly actorRef: string | null;
  readonly idempotencyKey: string | null;
  readonly commandFingerprint: string | null;
  readonly previousReview: RollingBlindReview;
  readonly nextReview: RollingBlindReview;
  readonly invitationRef: string;
  readonly decidedAt: Date;
  readonly terminalStatus: "DECLINED" | "EXPIRED" | null;
  readonly expectedCreditAccountVersion: number;
  readonly nextCreditAccount: BlindReviewCreditAccountSnapshot;
  readonly previousCreditReservation: SlotCreditReservationRecord;
  readonly nextCreditReservation: SlotCreditReservationRecord;
  readonly previousCreditHold: AnswerReviewCreditHoldRecord;
  readonly nextCreditHold: AnswerReviewCreditHoldRecord;
  readonly previousActivityLease: CandidateActivityLeaseRecord;
  readonly nextActivityLease: CandidateActivityLeaseRecord;
  readonly answerSession: AnswerSessionStartRecord | null;
  readonly event: BlindReviewDomainEventRecord;
  readonly outbox: readonly BlindReviewOutboxRecord[];
  readonly employerProjection: EmployerBlindReviewProjection;
  readonly candidateProjection: CandidateOpportunityProjectionV3;
  readonly receipt: AnswerInvitationDecisionReceipt | null;
}

export interface AnswerInvitationDecisionTransaction {
  readonly databaseNow: Date;
  findReceipt(
    actorRef: string,
    idempotencyKey: string,
  ): Promise<StoredAnswerInvitationDecisionReceipt | null>;
  loadInvitationForUpdate(invitationRef: string): Promise<AnswerInvitationDecisionSnapshot | null>;
  findExpiredInvitationForUpdate(): Promise<AnswerInvitationDecisionSnapshot | null>;
  persistDecision(input: PersistAnswerInvitationDecision): Promise<void>;
}

export interface AnswerInvitationDecisionUnitOfWork {
  runInTransaction<TResult>(
    work: (transaction: AnswerInvitationDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface AnswerInvitationDecisionIdFactory {
  nextId(kind: "command" | "event" | "outbox" | "answer-session"): string;
}
