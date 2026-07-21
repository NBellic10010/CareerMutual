export const INTEREST_QUEUE_POLICY_VERSION = "onlyboth.interest-queue@1" as const;

export type BlindReviewCommitmentState =
  "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSING" | "CLOSED" | "SUSPENDED";

export interface BlindReviewCommitment {
  readonly commitmentRef: string;
  readonly opportunityRef: string;
  readonly reviewerRef: string;
  readonly answerReviewWip: number;
  readonly answerReviewSlaHours: number;
  readonly advancementCohortSize: number;
  readonly queuePolicyVersion: typeof INTEREST_QUEUE_POLICY_VERSION;
  readonly creditPerAnswerReview: number;
  readonly state: BlindReviewCommitmentState;
  readonly version: number;
  readonly activatedAt: string | null;
}

export type InterestQueueEntryState =
  | "WAITING_FOR_BACKED_SLOT"
  | "BACKED_OFFERED"
  | "APPLICATION_ACTIVE"
  | "APPLICATION_SUBMITTED"
  | "REVIEWED"
  | "EMPLOYER_BREACH"
  | "OFFER_DECLINED"
  | "OFFER_EXPIRED"
  | "OPPORTUNITY_CLOSED";

export interface InterestQueueEntry {
  readonly interestRef: string;
  readonly opportunityRef: string;
  readonly candidateRef: string;
  readonly eligibilityEdgeRef: string;
  readonly eligibleAt: string;
  readonly interestCreatedAt: string;
  readonly state: InterestQueueEntryState;
  readonly version: number;
}

export type AnswerReviewSlotState =
  "AVAILABLE" | "OFFERED" | "ANSWER_ACTIVE" | "REVIEW_PENDING" | "REMEDIATING" | "RETIRED";

export interface AnswerReviewSlot {
  readonly slotRef: string;
  readonly commitmentRef: string;
  readonly ordinal: number;
  readonly state: AnswerReviewSlotState;
  readonly currentObligationRef: string | null;
  readonly version: number;
}

export type AnswerReviewObligationState =
  "INVITED" | "ANSWER_ACTIVE" | "REVIEW_PENDING" | "SETTLED" | "BREACH_SETTLED";

export type HumanAnswerReviewDecision = "ADVANCE_ELIGIBLE" | "NO_FURTHER_PROOF" | "INCONCLUSIVE";

export interface AnswerReviewObligation {
  readonly obligationRef: string;
  readonly commitmentRef: string;
  readonly slotRef: string;
  readonly interestRef: string;
  readonly candidateRef: string;
  readonly cohortRef: string;
  readonly cohortSeatRef: string;
  readonly creditHoldRef: string;
  readonly state: AnswerReviewObligationState;
  readonly answerSubmissionRef: string | null;
  readonly snapshotRef: string | null;
  readonly humanReviewRef: string | null;
  readonly reviewDecision: HumanAnswerReviewDecision | null;
  readonly version: number;
}

export type AnswerInvitationState = "OFFERED" | "ACCEPTED" | "DECLINED" | "EXPIRED";

export interface AnswerInvitation {
  readonly invitationRef: string;
  readonly obligationRef: string;
  readonly candidateRef: string;
  readonly cohortRef: string;
  readonly cohortSeatRef: string;
  readonly state: AnswerInvitationState;
  readonly queuePolicyVersion: typeof INTEREST_QUEUE_POLICY_VERSION;
  readonly publicTieBreak: string;
  readonly offeredAt: string;
  readonly offerExpiresAt: string;
  readonly version: number;
}

export type AdvancementCohortSeatState =
  "OPEN" | "RESERVED" | "ANSWER_SUBMITTED" | "REVIEWED" | "BREACH_SETTLED";

export interface AdvancementCohortSeat {
  readonly cohortSeatRef: string;
  readonly ordinal: number;
  readonly state: AdvancementCohortSeatState;
  readonly obligationRef: string | null;
  readonly answerSubmissionRef: string | null;
  readonly humanReviewRef: string | null;
  readonly reviewDecision: HumanAnswerReviewDecision | null;
}

export type AdvancementCohortState =
  "COLLECTING" | "REVIEWING" | "READY_FOR_ADVANCEMENT" | "ALLOCATED" | "CLOSED_NO_ALLOCATION";

export interface AdvancementCohort {
  readonly cohortRef: string;
  readonly commitmentRef: string;
  readonly sequence: number;
  readonly targetSize: number;
  readonly submittedCount: number;
  readonly reviewedCount: number;
  readonly state: AdvancementCohortState;
  readonly seats: readonly AdvancementCohortSeat[];
  readonly version: number;
}

export interface RollingBlindReview {
  readonly commitment: BlindReviewCommitment;
  readonly interests: readonly InterestQueueEntry[];
  readonly slots: readonly AnswerReviewSlot[];
  readonly obligations: readonly AnswerReviewObligation[];
  readonly invitations: readonly AnswerInvitation[];
  readonly cohorts: readonly AdvancementCohort[];
  readonly version: number;
}

export interface BackedAnswerOfferDecision {
  readonly invitationRef: string;
  readonly obligationRef: string;
  readonly slotRef: string;
  readonly interestRef: string;
  readonly candidateRef: string;
  readonly cohortRef: string;
  readonly cohortSeatRef: string;
  readonly creditHoldRef: string;
  readonly queuePolicyVersion: typeof INTEREST_QUEUE_POLICY_VERSION;
  readonly publicTieBreak: string;
  readonly offeredAt: string;
  readonly offerExpiresAt: string;
}

export interface OfferNextQueuedInterestResult {
  readonly state: RollingBlindReview;
  readonly offer: BackedAnswerOfferDecision;
}

export type BackedAnswerOfferReleaseReason = "CANDIDATE_DECLINED" | "OFFER_EXPIRED";

export interface BackedAnswerOfferReleaseResult {
  readonly state: RollingBlindReview;
  readonly invitationRef: string;
  readonly obligationRef: string;
  readonly slotRef: string;
  readonly interestRef: string;
  readonly candidateRef: string;
  readonly cohortRef: string;
  readonly cohortSeatRef: string;
  readonly creditHoldRef: string;
  readonly reason: BackedAnswerOfferReleaseReason;
  readonly nextOfferRequested: true;
}

export interface AnswerReviewSettlementResult {
  readonly state: RollingBlindReview;
  readonly slotRef: string;
  readonly obligationRef: string;
  readonly cohortRef: string;
  readonly humanReviewRef: string;
  readonly nextOfferRequested: true;
  readonly cohortReady: boolean;
}

export interface EmployerReviewBreachSettlementResult {
  readonly state: RollingBlindReview;
  readonly slotRef: string;
  readonly obligationRef: string;
  readonly interestRef: string;
  readonly candidateRef: string;
  readonly cohortRef: string;
  readonly cohortSeatRef: string;
  readonly creditHoldRef: string;
}

export interface ActiveBlindAnswerExpiryResult {
  readonly state: RollingBlindReview;
  readonly invitationRef: string;
  readonly obligationRef: string;
  readonly slotRef: string;
  readonly interestRef: string;
  readonly candidateRef: string;
  readonly cohortRef: string;
  readonly cohortSeatRef: string;
  readonly creditHoldRef: string;
  readonly nextOfferRequested: true;
}
