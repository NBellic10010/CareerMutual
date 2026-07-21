import { BlindAnswerInvariantError } from "./errors";
import {
  INTEREST_QUEUE_POLICY_VERSION,
  type AdvancementCohort,
  type AdvancementCohortSeat,
  type ActiveBlindAnswerExpiryResult,
  type AnswerInvitation,
  type AnswerReviewObligation,
  type AnswerReviewSettlementResult,
  type AnswerReviewSlot,
  type BackedAnswerOfferDecision,
  type BackedAnswerOfferReleaseReason,
  type BackedAnswerOfferReleaseResult,
  type EmployerReviewBreachSettlementResult,
  type HumanAnswerReviewDecision,
  type InterestQueueEntry,
  type OfferNextQueuedInterestResult,
  type RollingBlindReview,
} from "./types";

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BlindAnswerInvariantError(
      "BLIND_REVIEW_COMMITMENT_INVALID",
      `${label} must be a positive integer.`,
    );
  }
}

function assertIsoDateTime(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new BlindAnswerInvariantError(
      "INTEREST_QUEUE_ENTRY_INVALID",
      `${label} must be an ISO date-time.`,
    );
  }
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeState(state: RollingBlindReview): RollingBlindReview {
  return Object.freeze({
    ...state,
    interests: freezeArray(state.interests),
    slots: freezeArray(state.slots),
    obligations: freezeArray(state.obligations),
    invitations: freezeArray(state.invitations),
    cohorts: freezeArray(state.cohorts),
  });
}

function replaceByRef<T>(
  values: readonly T[],
  ref: string,
  readRef: (value: T) => string,
  replacement: T,
): readonly T[] {
  return freezeArray(values.map((value) => (readRef(value) === ref ? replacement : value)));
}

function createCohort(input: {
  readonly cohortRef: string;
  readonly commitmentRef: string;
  readonly sequence: number;
  readonly targetSize: number;
  readonly seatRefs: readonly string[];
}): AdvancementCohort {
  if (
    input.seatRefs.length !== input.targetSize ||
    new Set(input.seatRefs).size !== input.seatRefs.length
  ) {
    throw new BlindAnswerInvariantError(
      "ADVANCEMENT_COHORT_INVALID",
      "A new Advancement Cohort requires one unique Seat ref per target position.",
    );
  }
  const seats = input.seatRefs.map((cohortSeatRef, index) =>
    Object.freeze({
      cohortSeatRef,
      ordinal: index + 1,
      state: "OPEN" as const,
      obligationRef: null,
      answerSubmissionRef: null,
      humanReviewRef: null,
      reviewDecision: null,
    }),
  );
  return Object.freeze({
    cohortRef: input.cohortRef,
    commitmentRef: input.commitmentRef,
    sequence: input.sequence,
    targetSize: input.targetSize,
    submittedCount: 0,
    reviewedCount: 0,
    state: "COLLECTING",
    seats: freezeArray(seats),
    version: 1,
  });
}

function refreshCohort(
  cohort: AdvancementCohort,
  seats: readonly AdvancementCohortSeat[],
): AdvancementCohort {
  const submittedCount = seats.filter(
    ({ state }) => state === "ANSWER_SUBMITTED" || state === "REVIEWED",
  ).length;
  const reviewedCount = seats.filter(({ state }) => state === "REVIEWED").length;
  const state =
    reviewedCount === cohort.targetSize
      ? ("READY_FOR_ADVANCEMENT" as const)
      : submittedCount > 0
        ? ("REVIEWING" as const)
        : ("COLLECTING" as const);
  return Object.freeze({
    ...cohort,
    submittedCount,
    reviewedCount,
    state,
    seats: freezeArray(seats),
    version: cohort.version + 1,
  });
}

export function createRollingBlindReview(input: {
  readonly commitmentRef: string;
  readonly opportunityRef: string;
  readonly reviewerRef: string;
  readonly answerReviewWip: number;
  readonly answerReviewSlaHours: number;
  readonly advancementCohortSize: number;
  readonly queuePolicyVersion: typeof INTEREST_QUEUE_POLICY_VERSION;
  readonly creditPerAnswerReview: number;
}): RollingBlindReview {
  assertPositiveInteger(input.answerReviewWip, "answerReviewWip");
  assertPositiveInteger(input.answerReviewSlaHours, "answerReviewSlaHours");
  assertPositiveInteger(input.advancementCohortSize, "advancementCohortSize");
  assertPositiveInteger(input.creditPerAnswerReview, "creditPerAnswerReview");
  if (input.advancementCohortSize < 2) {
    throw new BlindAnswerInvariantError(
      "ADVANCEMENT_COHORT_INVALID",
      "Direct and Explore require an Advancement Cohort of at least two Answers.",
    );
  }
  if (input.queuePolicyVersion !== INTEREST_QUEUE_POLICY_VERSION) {
    throw new BlindAnswerInvariantError(
      "QUEUE_POLICY_INVALID",
      `Unsupported Interest Queue policy '${input.queuePolicyVersion}'.`,
    );
  }
  return freezeState({
    commitment: Object.freeze({
      ...input,
      state: "DRAFT",
      version: 0,
      activatedAt: null,
    }),
    interests: [],
    slots: [],
    obligations: [],
    invitations: [],
    cohorts: [],
    version: 0,
  });
}

export function queueCandidateInterest(
  state: RollingBlindReview,
  input: {
    readonly interestRef: string;
    readonly candidateRef: string;
    readonly eligibilityEdgeRef: string;
    readonly eligibleAt: string;
    readonly interestCreatedAt: string;
  },
): RollingBlindReview {
  assertIsoDateTime(input.eligibleAt, "eligibleAt");
  assertIsoDateTime(input.interestCreatedAt, "interestCreatedAt");
  if (
    state.interests.some(
      ({ interestRef, candidateRef }) =>
        interestRef === input.interestRef || candidateRef === input.candidateRef,
    )
  ) {
    throw new BlindAnswerInvariantError(
      "DUPLICATE_INTEREST",
      "An Opportunity may contain only one active Interest per Candidate and Interest ref.",
    );
  }
  const interest: InterestQueueEntry = Object.freeze({
    ...input,
    opportunityRef: state.commitment.opportunityRef,
    state: "WAITING_FOR_BACKED_SLOT",
    version: 1,
  });
  return freezeState({
    ...state,
    interests: [...state.interests, interest],
    // Candidate Interest is a separate aggregate; hydrating the public Queue must not advance
    // the Blind Review Commitment aggregate version.
    version: state.version,
  });
}

export function activateBlindReviewCommitment(
  state: RollingBlindReview,
  input: { readonly slotRefs: readonly string[]; readonly activatedAt: string },
): RollingBlindReview {
  assertIsoDateTime(input.activatedAt, "activatedAt");
  if (state.commitment.state !== "DRAFT") {
    throw new BlindAnswerInvariantError(
      "BLIND_REVIEW_COMMITMENT_INVALID",
      "Only a Draft Blind Review Commitment can be activated.",
    );
  }
  if (
    input.slotRefs.length !== state.commitment.answerReviewWip ||
    new Set(input.slotRefs).size !== input.slotRefs.length
  ) {
    throw new BlindAnswerInvariantError(
      "REVIEW_SLOT_INVALID",
      "Activation requires exactly one unique Slot ref per configured WIP unit.",
    );
  }
  const slots = input.slotRefs.map((slotRef, index) =>
    Object.freeze({
      slotRef,
      commitmentRef: state.commitment.commitmentRef,
      ordinal: index + 1,
      state: "AVAILABLE" as const,
      currentObligationRef: null,
      version: 1,
    }),
  );
  return freezeState({
    ...state,
    commitment: Object.freeze({
      ...state.commitment,
      state: "ACTIVE",
      version: state.commitment.version + 1,
      activatedAt: input.activatedAt,
    }),
    slots,
    version: state.version + 1,
  });
}

function selectQueueHead(input: {
  readonly state: RollingBlindReview;
  readonly publicSeed: string;
  readonly hash: (value: string) => string;
  readonly activeCandidateRefs: ReadonlySet<string>;
}): { readonly interest: InterestQueueEntry; readonly publicTieBreak: string } | null {
  const candidates = input.state.interests
    .filter(
      ({ candidateRef, state }) =>
        state === "WAITING_FOR_BACKED_SLOT" && !input.activeCandidateRefs.has(candidateRef),
    )
    .map((interest) => ({
      interest,
      eligibleTime: Date.parse(interest.eligibleAt),
      interestTime: Date.parse(interest.interestCreatedAt),
      publicTieBreak: input.hash(
        `${input.publicSeed}|${input.state.commitment.opportunityRef}|${interest.candidateRef}`,
      ),
    }))
    .sort(
      (left, right) =>
        left.eligibleTime - right.eligibleTime ||
        left.interestTime - right.interestTime ||
        left.publicTieBreak.localeCompare(right.publicTieBreak) ||
        left.interest.candidateRef.localeCompare(right.interest.candidateRef),
    );
  const selected = candidates[0];
  return selected === undefined
    ? null
    : Object.freeze({
        interest: selected.interest,
        publicTieBreak: selected.publicTieBreak,
      });
}

export function offerNextQueuedInterest(
  state: RollingBlindReview,
  input: {
    readonly slotRef: string;
    readonly obligationRef: string;
    readonly invitationRef: string;
    readonly creditHoldRef: string;
    readonly offeredAt: string;
    readonly offerExpiresAt: string;
    readonly publicSeed: string;
    readonly hash: (value: string) => string;
    readonly activeCandidateRefs: ReadonlySet<string>;
    readonly newCohort:
      { readonly cohortRef: string; readonly seatRefs: readonly string[] } | undefined;
  },
): OfferNextQueuedInterestResult | null {
  if (state.commitment.state !== "ACTIVE") {
    throw new BlindAnswerInvariantError(
      "BLIND_REVIEW_COMMITMENT_NOT_ACTIVE",
      "A backed Offer requires an Active Blind Review Commitment.",
    );
  }
  assertIsoDateTime(input.offeredAt, "offeredAt");
  assertIsoDateTime(input.offerExpiresAt, "offerExpiresAt");
  if (Date.parse(input.offerExpiresAt) <= Date.parse(input.offeredAt)) {
    throw new BlindAnswerInvariantError(
      "BACKED_OFFER_STATE_INVALID",
      "A backed Offer must expire after it is created.",
    );
  }
  const slot = state.slots.find(({ slotRef }) => slotRef === input.slotRef);
  if (slot === undefined || slot.state !== "AVAILABLE" || slot.currentObligationRef !== null) {
    throw new BlindAnswerInvariantError(
      "REVIEW_SLOT_NOT_AVAILABLE",
      "The requested Answer Review Slot is not available.",
    );
  }
  const selected = selectQueueHead({
    state,
    publicSeed: input.publicSeed,
    hash: input.hash,
    activeCandidateRefs: input.activeCandidateRefs,
  });
  if (selected === null) {
    return null;
  }

  let cohorts: readonly AdvancementCohort[] = [...state.cohorts].sort(
    (left, right) => left.sequence - right.sequence,
  );
  let cohort = cohorts.find(({ seats }) =>
    seats.some(({ state: seatState }) => seatState === "OPEN"),
  );
  if (cohort === undefined) {
    if (input.newCohort === undefined) {
      throw new BlindAnswerInvariantError(
        "ADVANCEMENT_COHORT_INVALID",
        "A new Cohort ref and Seat refs are required when no open Cohort Seat exists.",
      );
    }
    if (cohorts.some(({ cohortRef }) => cohortRef === input.newCohort?.cohortRef)) {
      throw new BlindAnswerInvariantError(
        "ADVANCEMENT_COHORT_INVALID",
        "The new Advancement Cohort ref already exists.",
      );
    }
    cohort = createCohort({
      cohortRef: input.newCohort.cohortRef,
      commitmentRef: state.commitment.commitmentRef,
      sequence: Math.max(0, ...cohorts.map(({ sequence }) => sequence)) + 1,
      targetSize: state.commitment.advancementCohortSize,
      seatRefs: input.newCohort.seatRefs,
    });
    cohorts = [...cohorts, cohort];
  }
  const seat = cohort.seats.find(({ state: seatState }) => seatState === "OPEN");
  if (seat === undefined) {
    throw new BlindAnswerInvariantError(
      "COHORT_SEAT_STATE_INVALID",
      "The selected Advancement Cohort has no open Seat.",
    );
  }
  if (
    state.obligations.some(({ obligationRef }) => obligationRef === input.obligationRef) ||
    state.invitations.some(({ invitationRef }) => invitationRef === input.invitationRef)
  ) {
    throw new BlindAnswerInvariantError(
      "BACKED_OFFER_STATE_INVALID",
      "Obligation and Invitation refs must be unique.",
    );
  }

  const reservedSeat: AdvancementCohortSeat = Object.freeze({
    ...seat,
    state: "RESERVED",
    obligationRef: input.obligationRef,
  });
  const updatedCohort = refreshCohort(
    cohort,
    replaceByRef(
      cohort.seats,
      seat.cohortSeatRef,
      (current) => current.cohortSeatRef,
      reservedSeat,
    ),
  );
  cohorts = replaceByRef(cohorts, cohort.cohortRef, (current) => current.cohortRef, updatedCohort);

  const obligation: AnswerReviewObligation = Object.freeze({
    obligationRef: input.obligationRef,
    commitmentRef: state.commitment.commitmentRef,
    slotRef: slot.slotRef,
    interestRef: selected.interest.interestRef,
    candidateRef: selected.interest.candidateRef,
    cohortRef: cohort.cohortRef,
    cohortSeatRef: seat.cohortSeatRef,
    creditHoldRef: input.creditHoldRef,
    state: "INVITED",
    answerSubmissionRef: null,
    snapshotRef: null,
    humanReviewRef: null,
    reviewDecision: null,
    version: 1,
  });
  const invitation: AnswerInvitation = Object.freeze({
    invitationRef: input.invitationRef,
    obligationRef: input.obligationRef,
    candidateRef: selected.interest.candidateRef,
    cohortRef: cohort.cohortRef,
    cohortSeatRef: seat.cohortSeatRef,
    state: "OFFERED",
    queuePolicyVersion: INTEREST_QUEUE_POLICY_VERSION,
    publicTieBreak: selected.publicTieBreak,
    offeredAt: input.offeredAt,
    offerExpiresAt: input.offerExpiresAt,
    version: 1,
  });
  const offeredSlot: AnswerReviewSlot = Object.freeze({
    ...slot,
    state: "OFFERED",
    currentObligationRef: obligation.obligationRef,
    version: slot.version + 1,
  });
  const offeredInterest: InterestQueueEntry = Object.freeze({
    ...selected.interest,
    state: "BACKED_OFFERED",
    version: selected.interest.version + 1,
  });
  const nextState = freezeState({
    ...state,
    interests: replaceByRef(
      state.interests,
      selected.interest.interestRef,
      (current) => current.interestRef,
      offeredInterest,
    ),
    slots: replaceByRef(state.slots, slot.slotRef, (current) => current.slotRef, offeredSlot),
    obligations: [...state.obligations, obligation],
    invitations: [...state.invitations, invitation],
    cohorts,
    version: state.version + 1,
  });
  const offer: BackedAnswerOfferDecision = Object.freeze({
    invitationRef: invitation.invitationRef,
    obligationRef: obligation.obligationRef,
    slotRef: slot.slotRef,
    interestRef: selected.interest.interestRef,
    candidateRef: selected.interest.candidateRef,
    cohortRef: cohort.cohortRef,
    cohortSeatRef: seat.cohortSeatRef,
    creditHoldRef: input.creditHoldRef,
    queuePolicyVersion: INTEREST_QUEUE_POLICY_VERSION,
    publicTieBreak: selected.publicTieBreak,
    offeredAt: input.offeredAt,
    offerExpiresAt: input.offerExpiresAt,
  });
  return Object.freeze({ state: nextState, offer });
}

export function acceptBackedAnswerOffer(
  state: RollingBlindReview,
  input: { readonly invitationRef: string; readonly acceptedAt: string },
): RollingBlindReview {
  assertIsoDateTime(input.acceptedAt, "acceptedAt");
  const invitation = state.invitations.find(
    ({ invitationRef }) => invitationRef === input.invitationRef,
  );
  if (invitation === undefined || invitation.state !== "OFFERED") {
    throw new BlindAnswerInvariantError(
      "BACKED_OFFER_STATE_INVALID",
      "Only an Offered backed Invitation can be accepted.",
    );
  }
  if (
    Date.parse(input.acceptedAt) < Date.parse(invitation.offeredAt) ||
    Date.parse(input.acceptedAt) >= Date.parse(invitation.offerExpiresAt)
  ) {
    throw new BlindAnswerInvariantError(
      "BACKED_OFFER_STATE_INVALID",
      "A backed Invitation can be accepted only before its offer deadline.",
    );
  }
  const obligation = state.obligations.find(
    ({ obligationRef }) => obligationRef === invitation.obligationRef,
  );
  const slot = state.slots.find(
    ({ currentObligationRef }) => currentObligationRef === invitation.obligationRef,
  );
  if (
    obligation === undefined ||
    obligation.state !== "INVITED" ||
    slot?.state !== "OFFERED" ||
    slot.currentObligationRef !== obligation.obligationRef
  ) {
    throw new BlindAnswerInvariantError(
      "BACKED_OFFER_STATE_INVALID",
      "Invitation, Obligation, and Slot are not in one accept-ready state.",
    );
  }
  const interest = state.interests.find(
    ({ interestRef }) => interestRef === obligation.interestRef,
  );
  if (interest === undefined || interest.state !== "BACKED_OFFERED") {
    throw new BlindAnswerInvariantError(
      "BACKED_OFFER_STATE_INVALID",
      "The Candidate Interest is not bound to the backed Offer.",
    );
  }
  const cohort = state.cohorts.find(({ cohortRef }) => cohortRef === obligation.cohortRef);
  const seat = cohort?.seats.find(
    ({ cohortSeatRef }) => cohortSeatRef === obligation.cohortSeatRef,
  );
  if (
    cohort === undefined ||
    seat === undefined ||
    seat.state !== "RESERVED" ||
    seat.obligationRef !== obligation.obligationRef
  ) {
    throw new BlindAnswerInvariantError(
      "COHORT_SEAT_STATE_INVALID",
      "The backed Invitation is not bound to one reserved Cohort Seat.",
    );
  }
  return freezeState({
    ...state,
    invitations: replaceByRef(
      state.invitations,
      invitation.invitationRef,
      (current) => current.invitationRef,
      Object.freeze({ ...invitation, state: "ACCEPTED", version: invitation.version + 1 }),
    ),
    obligations: replaceByRef(
      state.obligations,
      obligation.obligationRef,
      (current) => current.obligationRef,
      Object.freeze({ ...obligation, state: "ANSWER_ACTIVE", version: obligation.version + 1 }),
    ),
    slots: replaceByRef(
      state.slots,
      slot.slotRef,
      (current) => current.slotRef,
      Object.freeze({ ...slot, state: "ANSWER_ACTIVE", version: slot.version + 1 }),
    ),
    interests: replaceByRef(
      state.interests,
      interest.interestRef,
      (current) => current.interestRef,
      Object.freeze({ ...interest, state: "APPLICATION_ACTIVE", version: interest.version + 1 }),
    ),
    version: state.version + 1,
  });
}

export function releaseBackedAnswerOffer(
  state: RollingBlindReview,
  input: {
    readonly invitationRef: string;
    readonly reason: BackedAnswerOfferReleaseReason;
    readonly releasedAt: string;
  },
): BackedAnswerOfferReleaseResult {
  assertIsoDateTime(input.releasedAt, "releasedAt");
  const invitation = state.invitations.find(
    ({ invitationRef }) => invitationRef === input.invitationRef,
  );
  if (invitation === undefined || invitation.state !== "OFFERED") {
    throw new BlindAnswerInvariantError(
      "BACKED_OFFER_STATE_INVALID",
      "Only an Offered backed Invitation can be released.",
    );
  }
  const releasedTime = Date.parse(input.releasedAt);
  const offeredTime = Date.parse(invitation.offeredAt);
  const expiresTime = Date.parse(invitation.offerExpiresAt);
  const timeIsValid =
    input.reason === "CANDIDATE_DECLINED"
      ? releasedTime >= offeredTime && releasedTime < expiresTime
      : releasedTime >= expiresTime;
  if (!timeIsValid) {
    throw new BlindAnswerInvariantError(
      "BACKED_OFFER_STATE_INVALID",
      input.reason === "CANDIDATE_DECLINED"
        ? "A Candidate decline must occur before the offer deadline."
        : "An Invitation cannot expire before its offer deadline.",
    );
  }

  const obligation = state.obligations.find(
    ({ obligationRef }) => obligationRef === invitation.obligationRef,
  );
  const slot = state.slots.find(({ slotRef }) => slotRef === obligation?.slotRef);
  const interest = state.interests.find(
    ({ interestRef }) => interestRef === obligation?.interestRef,
  );
  const cohort = state.cohorts.find(({ cohortRef }) => cohortRef === obligation?.cohortRef);
  const seat = cohort?.seats.find(
    ({ cohortSeatRef }) => cohortSeatRef === obligation?.cohortSeatRef,
  );
  if (
    obligation === undefined ||
    obligation.state !== "INVITED" ||
    slot === undefined ||
    slot.state !== "OFFERED" ||
    slot.currentObligationRef !== obligation.obligationRef ||
    interest === undefined ||
    interest.state !== "BACKED_OFFERED" ||
    cohort === undefined ||
    seat === undefined ||
    seat.state !== "RESERVED" ||
    seat.obligationRef !== obligation.obligationRef
  ) {
    throw new BlindAnswerInvariantError(
      "BACKED_OFFER_STATE_INVALID",
      "Invitation, Obligation, Slot, Interest, and Cohort Seat are not release-ready.",
    );
  }

  const openedSeat: AdvancementCohortSeat = Object.freeze({
    ...seat,
    state: "OPEN",
    obligationRef: null,
    answerSubmissionRef: null,
    humanReviewRef: null,
    reviewDecision: null,
  });
  const updatedCohort = refreshCohort(
    cohort,
    replaceByRef(cohort.seats, seat.cohortSeatRef, (current) => current.cohortSeatRef, openedSeat),
  );
  const nextState = freezeState({
    ...state,
    invitations: replaceByRef(
      state.invitations,
      invitation.invitationRef,
      (current) => current.invitationRef,
      Object.freeze({
        ...invitation,
        state: input.reason === "CANDIDATE_DECLINED" ? "DECLINED" : "EXPIRED",
        version: invitation.version + 1,
      }),
    ),
    obligations: replaceByRef(
      state.obligations,
      obligation.obligationRef,
      (current) => current.obligationRef,
      Object.freeze({ ...obligation, state: "SETTLED", version: obligation.version + 1 }),
    ),
    slots: replaceByRef(
      state.slots,
      slot.slotRef,
      (current) => current.slotRef,
      Object.freeze({
        ...slot,
        state: "AVAILABLE",
        currentObligationRef: null,
        version: slot.version + 1,
      }),
    ),
    interests: replaceByRef(
      state.interests,
      interest.interestRef,
      (current) => current.interestRef,
      Object.freeze({
        ...interest,
        state: input.reason === "CANDIDATE_DECLINED" ? "OFFER_DECLINED" : "OFFER_EXPIRED",
        version: interest.version + 1,
      }),
    ),
    cohorts: replaceByRef(
      state.cohorts,
      cohort.cohortRef,
      (current) => current.cohortRef,
      updatedCohort,
    ),
    version: state.version + 1,
  });

  return Object.freeze({
    state: nextState,
    invitationRef: invitation.invitationRef,
    obligationRef: obligation.obligationRef,
    slotRef: slot.slotRef,
    interestRef: interest.interestRef,
    candidateRef: invitation.candidateRef,
    cohortRef: cohort.cohortRef,
    cohortSeatRef: seat.cohortSeatRef,
    creditHoldRef: obligation.creditHoldRef,
    reason: input.reason,
    nextOfferRequested: true,
  });
}

export function submitBlindAnswer(
  state: RollingBlindReview,
  input: {
    readonly obligationRef: string;
    readonly answerSubmissionRef: string;
    readonly snapshotRef: string;
    readonly submittedAt: string;
  },
): RollingBlindReview {
  assertIsoDateTime(input.submittedAt, "submittedAt");
  const obligation = state.obligations.find(
    ({ obligationRef }) => obligationRef === input.obligationRef,
  );
  if (obligation === undefined || obligation.state !== "ANSWER_ACTIVE") {
    throw new BlindAnswerInvariantError(
      "UNBACKED_ANSWER_FORBIDDEN",
      "An Answer requires an accepted backed Obligation in ANSWER_ACTIVE.",
    );
  }
  if (
    state.obligations.some(
      ({ answerSubmissionRef }) => answerSubmissionRef === input.answerSubmissionRef,
    )
  ) {
    throw new BlindAnswerInvariantError(
      "UNBACKED_ANSWER_FORBIDDEN",
      "Answer Submission refs must be unique.",
    );
  }
  const slot = state.slots.find(({ slotRef }) => slotRef === obligation.slotRef);
  const cohort = state.cohorts.find(({ cohortRef }) => cohortRef === obligation.cohortRef);
  const seat = cohort?.seats.find(
    ({ cohortSeatRef }) => cohortSeatRef === obligation.cohortSeatRef,
  );
  const interest = state.interests.find(
    ({ interestRef }) => interestRef === obligation.interestRef,
  );
  if (
    slot?.state !== "ANSWER_ACTIVE" ||
    slot.currentObligationRef !== obligation.obligationRef ||
    cohort === undefined ||
    seat?.state !== "RESERVED" ||
    seat.obligationRef !== obligation.obligationRef ||
    interest?.state !== "APPLICATION_ACTIVE"
  ) {
    throw new BlindAnswerInvariantError(
      "UNBACKED_ANSWER_FORBIDDEN",
      "Answer Submission requires aligned Slot, Cohort Seat, and Candidate Interest state.",
    );
  }
  const submittedSeat: AdvancementCohortSeat = Object.freeze({
    ...seat,
    state: "ANSWER_SUBMITTED",
    answerSubmissionRef: input.answerSubmissionRef,
  });
  const updatedCohort = refreshCohort(
    cohort,
    replaceByRef(
      cohort.seats,
      seat.cohortSeatRef,
      (current) => current.cohortSeatRef,
      submittedSeat,
    ),
  );
  return freezeState({
    ...state,
    obligations: replaceByRef(
      state.obligations,
      obligation.obligationRef,
      (current) => current.obligationRef,
      Object.freeze({
        ...obligation,
        state: "REVIEW_PENDING",
        answerSubmissionRef: input.answerSubmissionRef,
        snapshotRef: input.snapshotRef,
        version: obligation.version + 1,
      }),
    ),
    slots: replaceByRef(
      state.slots,
      slot.slotRef,
      (current) => current.slotRef,
      Object.freeze({ ...slot, state: "REVIEW_PENDING", version: slot.version + 1 }),
    ),
    interests: replaceByRef(
      state.interests,
      interest.interestRef,
      (current) => current.interestRef,
      Object.freeze({
        ...interest,
        state: "APPLICATION_SUBMITTED",
        version: interest.version + 1,
      }),
    ),
    cohorts: replaceByRef(
      state.cohorts,
      cohort.cohortRef,
      (current) => current.cohortRef,
      updatedCohort,
    ),
    version: state.version + 1,
  });
}

export function expireEmptyActiveBlindAnswer(
  state: RollingBlindReview,
  input: {
    readonly obligationRef: string;
    readonly expiredAt: string;
  },
): ActiveBlindAnswerExpiryResult {
  assertIsoDateTime(input.expiredAt, "expiredAt");
  const obligation = state.obligations.find(
    ({ obligationRef }) => obligationRef === input.obligationRef,
  );
  const invitation = state.invitations.find(
    ({ obligationRef }) => obligationRef === input.obligationRef,
  );
  const slot = state.slots.find(({ slotRef }) => slotRef === obligation?.slotRef);
  const interest = state.interests.find(
    ({ interestRef }) => interestRef === obligation?.interestRef,
  );
  const cohort = state.cohorts.find(({ cohortRef }) => cohortRef === obligation?.cohortRef);
  const seat = cohort?.seats.find(
    ({ cohortSeatRef }) => cohortSeatRef === obligation?.cohortSeatRef,
  );
  if (
    obligation === undefined ||
    obligation.state !== "ANSWER_ACTIVE" ||
    invitation === undefined ||
    invitation.state !== "ACCEPTED" ||
    slot === undefined ||
    slot.state !== "ANSWER_ACTIVE" ||
    slot.currentObligationRef !== obligation.obligationRef ||
    interest === undefined ||
    interest.state !== "APPLICATION_ACTIVE" ||
    cohort === undefined ||
    seat === undefined ||
    seat.state !== "RESERVED" ||
    seat.obligationRef !== obligation.obligationRef
  ) {
    throw new BlindAnswerInvariantError(
      "UNBACKED_ANSWER_FORBIDDEN",
      "Only an aligned, active, empty Answer obligation can expire.",
    );
  }
  const openedSeat: AdvancementCohortSeat = Object.freeze({
    ...seat,
    state: "OPEN",
    obligationRef: null,
    answerSubmissionRef: null,
    humanReviewRef: null,
    reviewDecision: null,
  });
  const updatedCohort = refreshCohort(
    cohort,
    replaceByRef(cohort.seats, seat.cohortSeatRef, (current) => current.cohortSeatRef, openedSeat),
  );
  const nextState = freezeState({
    ...state,
    obligations: replaceByRef(
      state.obligations,
      obligation.obligationRef,
      (current) => current.obligationRef,
      Object.freeze({ ...obligation, state: "SETTLED", version: obligation.version + 1 }),
    ),
    slots: replaceByRef(
      state.slots,
      slot.slotRef,
      (current) => current.slotRef,
      Object.freeze({
        ...slot,
        state: "AVAILABLE",
        currentObligationRef: null,
        version: slot.version + 1,
      }),
    ),
    interests: replaceByRef(
      state.interests,
      interest.interestRef,
      (current) => current.interestRef,
      Object.freeze({ ...interest, state: "OFFER_EXPIRED", version: interest.version + 1 }),
    ),
    invitations: replaceByRef(
      state.invitations,
      invitation.invitationRef,
      (current) => current.invitationRef,
      Object.freeze({ ...invitation, state: "EXPIRED", version: invitation.version + 1 }),
    ),
    cohorts: replaceByRef(
      state.cohorts,
      cohort.cohortRef,
      (current) => current.cohortRef,
      updatedCohort,
    ),
    version: state.version + 1,
  });
  return Object.freeze({
    state: nextState,
    invitationRef: invitation.invitationRef,
    obligationRef: obligation.obligationRef,
    slotRef: slot.slotRef,
    interestRef: interest.interestRef,
    candidateRef: obligation.candidateRef,
    cohortRef: cohort.cohortRef,
    cohortSeatRef: seat.cohortSeatRef,
    creditHoldRef: obligation.creditHoldRef,
    nextOfferRequested: true,
  });
}

export function recordAndSettleHumanAnswerReview(
  state: RollingBlindReview,
  input: {
    readonly obligationRef: string;
    readonly humanReviewRef: string;
    readonly decision: HumanAnswerReviewDecision;
    readonly evidenceRefs: readonly string[];
    readonly stillUnknown: readonly string[];
    readonly reviewedAt: string;
  },
): AnswerReviewSettlementResult {
  assertIsoDateTime(input.reviewedAt, "reviewedAt");
  if (
    input.evidenceRefs.length === 0 ||
    new Set(input.evidenceRefs).size !== input.evidenceRefs.length
  ) {
    throw new BlindAnswerInvariantError(
      "ANSWER_REVIEW_EVIDENCE_REQUIRED",
      "Human Answer Review requires at least one unique Evidence ref.",
    );
  }
  const obligation = state.obligations.find(
    ({ obligationRef }) => obligationRef === input.obligationRef,
  );
  if (obligation === undefined || obligation.state !== "REVIEW_PENDING") {
    throw new BlindAnswerInvariantError(
      "ANSWER_REVIEW_STATE_INVALID",
      "Only a REVIEW_PENDING Obligation can receive Human Answer Review.",
    );
  }
  const slot = state.slots.find(({ slotRef }) => slotRef === obligation.slotRef);
  const cohort = state.cohorts.find(({ cohortRef }) => cohortRef === obligation.cohortRef);
  const seat = cohort?.seats.find(
    ({ cohortSeatRef }) => cohortSeatRef === obligation.cohortSeatRef,
  );
  const interest = state.interests.find(
    ({ interestRef }) => interestRef === obligation.interestRef,
  );
  if (
    slot?.state !== "REVIEW_PENDING" ||
    slot.currentObligationRef !== obligation.obligationRef ||
    cohort === undefined ||
    seat?.state !== "ANSWER_SUBMITTED" ||
    seat.obligationRef !== obligation.obligationRef ||
    interest?.state !== "APPLICATION_SUBMITTED"
  ) {
    throw new BlindAnswerInvariantError(
      "ANSWER_REVIEW_STATE_INVALID",
      "Human Review requires aligned Slot, Cohort Seat, and Candidate Interest state.",
    );
  }
  const reviewedSeat: AdvancementCohortSeat = Object.freeze({
    ...seat,
    state: "REVIEWED",
    humanReviewRef: input.humanReviewRef,
    reviewDecision: input.decision,
  });
  const updatedCohort = refreshCohort(
    cohort,
    replaceByRef(
      cohort.seats,
      seat.cohortSeatRef,
      (current) => current.cohortSeatRef,
      reviewedSeat,
    ),
  );
  const nextState = freezeState({
    ...state,
    obligations: replaceByRef(
      state.obligations,
      obligation.obligationRef,
      (current) => current.obligationRef,
      Object.freeze({
        ...obligation,
        state: "SETTLED",
        humanReviewRef: input.humanReviewRef,
        reviewDecision: input.decision,
        version: obligation.version + 1,
      }),
    ),
    slots: replaceByRef(
      state.slots,
      slot.slotRef,
      (current) => current.slotRef,
      Object.freeze({
        ...slot,
        state: "AVAILABLE",
        currentObligationRef: null,
        version: slot.version + 1,
      }),
    ),
    interests: replaceByRef(
      state.interests,
      interest.interestRef,
      (current) => current.interestRef,
      Object.freeze({ ...interest, state: "REVIEWED", version: interest.version + 1 }),
    ),
    cohorts: replaceByRef(
      state.cohorts,
      cohort.cohortRef,
      (current) => current.cohortRef,
      updatedCohort,
    ),
    version: state.version + 1,
  });
  return Object.freeze({
    state: nextState,
    slotRef: slot.slotRef,
    obligationRef: obligation.obligationRef,
    cohortRef: cohort.cohortRef,
    humanReviewRef: input.humanReviewRef,
    nextOfferRequested: true,
    cohortReady: updatedCohort.state === "READY_FOR_ADVANCEMENT",
  });
}

export function settleEmployerReviewBreach(
  state: RollingBlindReview,
  input: {
    readonly obligationRef: string;
    readonly reviewDueAt: string;
    readonly breachedAt: string;
  },
): EmployerReviewBreachSettlementResult {
  assertIsoDateTime(input.reviewDueAt, "reviewDueAt");
  assertIsoDateTime(input.breachedAt, "breachedAt");
  if (Date.parse(input.breachedAt) < Date.parse(input.reviewDueAt)) {
    throw new BlindAnswerInvariantError(
      "ANSWER_REVIEW_STATE_INVALID",
      "An Employer Review breach cannot settle before its database deadline.",
    );
  }
  const obligation = state.obligations.find(
    ({ obligationRef }) => obligationRef === input.obligationRef,
  );
  if (obligation === undefined || obligation.state !== "REVIEW_PENDING") {
    throw new BlindAnswerInvariantError(
      "ANSWER_REVIEW_STATE_INVALID",
      "Only an overdue REVIEW_PENDING Obligation can enter Employer Breach settlement.",
    );
  }
  const slot = state.slots.find(({ slotRef }) => slotRef === obligation.slotRef);
  const interest = state.interests.find(
    ({ interestRef }) => interestRef === obligation.interestRef,
  );
  const cohort = state.cohorts.find(({ cohortRef }) => cohortRef === obligation.cohortRef);
  const seat = cohort?.seats.find(
    ({ cohortSeatRef }) => cohortSeatRef === obligation.cohortSeatRef,
  );
  if (
    slot?.state !== "REVIEW_PENDING" ||
    slot.currentObligationRef !== obligation.obligationRef ||
    interest?.state !== "APPLICATION_SUBMITTED" ||
    cohort === undefined ||
    seat?.state !== "ANSWER_SUBMITTED" ||
    seat.obligationRef !== obligation.obligationRef
  ) {
    throw new BlindAnswerInvariantError(
      "ANSWER_REVIEW_STATE_INVALID",
      "Employer Breach requires aligned Obligation, Slot, Interest, and Cohort Seat state.",
    );
  }
  const breachedSeat: AdvancementCohortSeat = Object.freeze({
    ...seat,
    state: "BREACH_SETTLED",
  });
  const breachedCohort: AdvancementCohort = Object.freeze({
    ...cohort,
    state: "CLOSED_NO_ALLOCATION",
    seats: replaceByRef(
      cohort.seats,
      seat.cohortSeatRef,
      (current) => current.cohortSeatRef,
      breachedSeat,
    ),
    version: cohort.version + 1,
  });
  const nextState = freezeState({
    ...state,
    obligations: replaceByRef(
      state.obligations,
      obligation.obligationRef,
      (current) => current.obligationRef,
      Object.freeze({
        ...obligation,
        state: "BREACH_SETTLED",
        version: obligation.version + 1,
      }),
    ),
    slots: replaceByRef(
      state.slots,
      slot.slotRef,
      (current) => current.slotRef,
      Object.freeze({
        ...slot,
        state: "RETIRED",
        currentObligationRef: null,
        version: slot.version + 1,
      }),
    ),
    interests: replaceByRef(
      state.interests,
      interest.interestRef,
      (current) => current.interestRef,
      Object.freeze({
        ...interest,
        state: "EMPLOYER_BREACH",
        version: interest.version + 1,
      }),
    ),
    cohorts: replaceByRef(
      state.cohorts,
      cohort.cohortRef,
      (current) => current.cohortRef,
      breachedCohort,
    ),
    version: state.version + 1,
  });
  return Object.freeze({
    state: nextState,
    slotRef: slot.slotRef,
    obligationRef: obligation.obligationRef,
    interestRef: interest.interestRef,
    candidateRef: obligation.candidateRef,
    cohortRef: cohort.cohortRef,
    cohortSeatRef: seat.cohortSeatRef,
    creditHoldRef: obligation.creditHoldRef,
  });
}

export function assertAdvancementCohortReady(
  state: RollingBlindReview,
  cohortRef: string,
): AdvancementCohort {
  const cohort = state.cohorts.find((candidate) => candidate.cohortRef === cohortRef);
  if (
    cohort === undefined ||
    cohort.state !== "READY_FOR_ADVANCEMENT" ||
    cohort.reviewedCount !== cohort.targetSize
  ) {
    throw new BlindAnswerInvariantError(
      "ADVANCEMENT_COHORT_NOT_READY",
      "Direct and Explore require every Seat in the Advancement Cohort to be reviewed.",
    );
  }
  return cohort;
}
