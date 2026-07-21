import { createHash } from "node:crypto";

import {
  acceptBackedAnswerOffer,
  activateBlindReviewCommitment,
  assertAdvancementCohortReady,
  BlindAnswerInvariantError,
  createRollingBlindReview,
  expireEmptyActiveBlindAnswer,
  offerNextQueuedInterest,
  queueCandidateInterest,
  recordAndSettleHumanAnswerReview,
  releaseBackedAnswerOffer,
  settleEmployerReviewBreach,
  submitBlindAnswer,
} from "@onlyboth/domain";
import { describe, expect, it } from "vitest";

const SAME_CANONICAL_HASH = `sha256:${"0".repeat(64)}`;

function canonicalHash(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function makeInterest(index: number) {
  const suffix = String(index).padStart(2, "0");
  return {
    interestRef: `interest-${suffix}`,
    candidateRef: `candidate-${suffix}`,
    eligibilityEdgeRef: `eligibility-${suffix}`,
    eligibleAt: `2026-07-19T12:${suffix}:00.000Z`,
    interestCreatedAt: `2026-07-19T12:${suffix}:01.000Z`,
  } as const;
}

function offerInput(index: number, slotRef: string, newCohortSequence?: number) {
  const suffix = String(index).padStart(2, "0");
  return {
    slotRef,
    obligationRef: `obligation-${suffix}`,
    invitationRef: `invitation-${suffix}`,
    creditHoldRef: `answer-credit-${suffix}`,
    offeredAt: `2026-07-19T13:${suffix}:00.000Z`,
    offerExpiresAt: `2026-07-20T13:${suffix}:00.000Z`,
    publicSeed: "onlyboth-queue-seed-1",
    hash: canonicalHash,
    activeCandidateRefs: new Set<string>(),
    newCohort:
      newCohortSequence === undefined
        ? undefined
        : {
            cohortRef: `cohort-${newCohortSequence}`,
            seatRefs: Array.from(
              { length: 8 },
              (_, seatIndex) => `cohort-${newCohortSequence}-seat-${seatIndex + 1}`,
            ),
          },
  } as const;
}

describe("rolling blind-review domain", () => {
  it("uses version zero only as the absent/create sentinel, then activates at version one", () => {
    const draft = createRollingBlindReview({
      commitmentRef: "commitment-1",
      opportunityRef: "opportunity-1",
      reviewerRef: "reviewer-sarah",
      answerReviewWip: 1,
      answerReviewSlaHours: 24,
      advancementCohortSize: 2,
      queuePolicyVersion: "onlyboth.interest-queue@1",
      creditPerAnswerReview: 1,
    });
    expect(draft.commitment).toMatchObject({ state: "DRAFT", version: 0 });

    const active = activateBlindReviewCommitment(draft, {
      slotRefs: ["answer-slot-1"],
      activatedAt: "2026-07-19T12:30:00.000Z",
    });
    expect(active.commitment).toMatchObject({ state: "ACTIVE", version: 1 });
    expect(active.version).toBe(1);
  });

  it("orders eligible Interests without Candidate profile or model input", () => {
    let state = createRollingBlindReview({
      commitmentRef: "commitment-1",
      opportunityRef: "opportunity-1",
      reviewerRef: "reviewer-sarah",
      answerReviewWip: 1,
      answerReviewSlaHours: 24,
      advancementCohortSize: 2,
      queuePolicyVersion: "onlyboth.interest-queue@1",
      creditPerAnswerReview: 1,
    });
    state = queueCandidateInterest(state, {
      ...makeInterest(2),
      eligibleAt: "2026-07-19T12:00:00.000Z",
      interestCreatedAt: "2026-07-19T12:00:01.000Z",
    });
    state = queueCandidateInterest(state, {
      ...makeInterest(1),
      eligibleAt: "2026-07-19T12:00:00.000Z",
      interestCreatedAt: "2026-07-19T12:00:01.000Z",
    });
    state = activateBlindReviewCommitment(state, {
      slotRefs: ["answer-slot-1"],
      activatedAt: "2026-07-19T12:30:00.000Z",
    });

    const offered = offerNextQueuedInterest(state, {
      ...offerInput(1, "answer-slot-1"),
      newCohort: {
        cohortRef: "cohort-1",
        seatRefs: ["cohort-1-seat-1", "cohort-1-seat-2"],
      },
      hash: () => SAME_CANONICAL_HASH,
    });
    expect(offered?.offer.candidateRef).toBe("candidate-01");
  });

  it("excludes a Candidate with an active cross-Opportunity lease without changing Queue order", () => {
    let state = createRollingBlindReview({
      commitmentRef: "commitment-1",
      opportunityRef: "opportunity-1",
      reviewerRef: "reviewer-sarah",
      answerReviewWip: 1,
      answerReviewSlaHours: 24,
      advancementCohortSize: 2,
      queuePolicyVersion: "onlyboth.interest-queue@1",
      creditPerAnswerReview: 1,
    });
    state = queueCandidateInterest(state, {
      ...makeInterest(1),
      eligibleAt: "2026-07-19T12:00:00.000Z",
      interestCreatedAt: "2026-07-19T12:00:01.000Z",
    });
    state = queueCandidateInterest(state, {
      ...makeInterest(2),
      eligibleAt: "2026-07-19T12:00:00.000Z",
      interestCreatedAt: "2026-07-19T12:00:01.000Z",
    });
    state = activateBlindReviewCommitment(state, {
      slotRefs: ["answer-slot-1"],
      activatedAt: "2026-07-19T12:30:00.000Z",
    });

    const offered = offerNextQueuedInterest(state, {
      ...offerInput(1, "answer-slot-1"),
      newCohort: {
        cohortRef: "cohort-1",
        seatRefs: ["cohort-1-seat-1", "cohort-1-seat-2"],
      },
      hash: () => SAME_CANONICAL_HASH,
      activeCandidateRefs: new Set(["candidate-01"]),
    });
    expect(offered?.offer.candidateRef).toBe("candidate-02");
  });

  it("recycles the first settled Slot before Cohort 1 reaches 8/8 and pins Candidate 09 to Cohort 2", () => {
    let state = createRollingBlindReview({
      commitmentRef: "commitment-1",
      opportunityRef: "opportunity-1",
      reviewerRef: "reviewer-sarah",
      answerReviewWip: 8,
      answerReviewSlaHours: 24,
      advancementCohortSize: 8,
      queuePolicyVersion: "onlyboth.interest-queue@1",
      creditPerAnswerReview: 1,
    });
    for (let index = 1; index <= 20; index += 1) {
      state = queueCandidateInterest(state, makeInterest(index));
    }
    state = activateBlindReviewCommitment(state, {
      slotRefs: Array.from({ length: 8 }, (_, index) => `answer-slot-${index + 1}`),
      activatedAt: "2026-07-19T12:30:00.000Z",
    });

    for (let index = 1; index <= 8; index += 1) {
      const result = offerNextQueuedInterest(
        state,
        offerInput(index, `answer-slot-${index}`, index === 1 ? 1 : undefined),
      );
      expect(result).not.toBeNull();
      state = result!.state;
      expect(result!.offer.cohortRef).toBe("cohort-1");
    }

    state = acceptBackedAnswerOffer(state, {
      invitationRef: "invitation-01",
      acceptedAt: "2026-07-19T13:20:00.000Z",
    });
    state = submitBlindAnswer(state, {
      obligationRef: "obligation-01",
      answerSubmissionRef: "answer-01",
      snapshotRef: "snapshot-01",
      submittedAt: "2026-07-19T13:26:00.000Z",
    });
    const settlement = recordAndSettleHumanAnswerReview(state, {
      obligationRef: "obligation-01",
      humanReviewRef: "human-review-01",
      decision: "ADVANCE_ELIGIBLE",
      evidenceRefs: ["evidence-01"],
      stillUnknown: ["Cross-region retry remains untested."],
      reviewedAt: "2026-07-19T13:27:00.000Z",
    });
    state = settlement.state;

    expect(settlement.nextOfferRequested).toBe(true);
    expect(state.slots.find(({ slotRef }) => slotRef === "answer-slot-1")).toMatchObject({
      state: "AVAILABLE",
      currentObligationRef: null,
    });
    expect(state.cohorts[0]).toMatchObject({
      cohortRef: "cohort-1",
      reviewedCount: 1,
      state: "REVIEWING",
    });

    const ninth = offerNextQueuedInterest(state, offerInput(9, "answer-slot-1", 2));
    expect(ninth?.offer).toMatchObject({
      candidateRef: "candidate-09",
      cohortRef: "cohort-2",
      cohortSeatRef: "cohort-2-seat-1",
    });
    expect(ninth?.state.cohorts[0]).toMatchObject({
      cohortRef: "cohort-1",
      reviewedCount: 1,
      state: "REVIEWING",
    });
  });

  it("keeps Direct and Explore locked at 7/8 reviewed without blocking settled Slots", () => {
    let state = createRollingBlindReview({
      commitmentRef: "commitment-1",
      opportunityRef: "opportunity-1",
      reviewerRef: "reviewer-sarah",
      answerReviewWip: 8,
      answerReviewSlaHours: 24,
      advancementCohortSize: 8,
      queuePolicyVersion: "onlyboth.interest-queue@1",
      creditPerAnswerReview: 1,
    });
    for (let index = 1; index <= 8; index += 1) {
      state = queueCandidateInterest(state, makeInterest(index));
    }
    state = activateBlindReviewCommitment(state, {
      slotRefs: Array.from({ length: 8 }, (_, index) => `answer-slot-${index + 1}`),
      activatedAt: "2026-07-19T12:30:00.000Z",
    });
    for (let index = 1; index <= 8; index += 1) {
      state = offerNextQueuedInterest(
        state,
        offerInput(index, `answer-slot-${index}`, index === 1 ? 1 : undefined),
      )!.state;
      state = acceptBackedAnswerOffer(state, {
        invitationRef: `invitation-${String(index).padStart(2, "0")}`,
        acceptedAt: `2026-07-19T13:${String(index).padStart(2, "0")}:10.000Z`,
      });
      state = submitBlindAnswer(state, {
        obligationRef: `obligation-${String(index).padStart(2, "0")}`,
        answerSubmissionRef: `answer-${String(index).padStart(2, "0")}`,
        snapshotRef: `snapshot-${String(index).padStart(2, "0")}`,
        submittedAt: `2026-07-19T13:${String(index).padStart(2, "0")}:20.000Z`,
      });
    }
    for (let index = 1; index <= 7; index += 1) {
      state = recordAndSettleHumanAnswerReview(state, {
        obligationRef: `obligation-${String(index).padStart(2, "0")}`,
        humanReviewRef: `human-review-${String(index).padStart(2, "0")}`,
        decision: "ADVANCE_ELIGIBLE",
        evidenceRefs: [`evidence-${String(index).padStart(2, "0")}`],
        stillUnknown: [],
        reviewedAt: `2026-07-19T14:${String(index).padStart(2, "0")}:00.000Z`,
      }).state;
    }

    expect(state.slots.filter(({ state: slotState }) => slotState === "AVAILABLE")).toHaveLength(7);
    expect(() => assertAdvancementCohortReady(state, "cohort-1")).toThrowError(
      expect.objectContaining({ code: "ADVANCEMENT_COHORT_NOT_READY" }),
    );

    state = recordAndSettleHumanAnswerReview(state, {
      obligationRef: "obligation-08",
      humanReviewRef: "human-review-08",
      decision: "ADVANCE_ELIGIBLE",
      evidenceRefs: ["evidence-08"],
      stillUnknown: [],
      reviewedAt: "2026-07-19T14:08:00.000Z",
    }).state;
    expect(assertAdvancementCohortReady(state, "cohort-1").reviewedCount).toBe(8);
  });

  it("fails closed when an Answer has no backed active obligation", () => {
    const state = createRollingBlindReview({
      commitmentRef: "commitment-1",
      opportunityRef: "opportunity-1",
      reviewerRef: "reviewer-sarah",
      answerReviewWip: 1,
      answerReviewSlaHours: 24,
      advancementCohortSize: 2,
      queuePolicyVersion: "onlyboth.interest-queue@1",
      creditPerAnswerReview: 1,
    });
    expect(() =>
      submitBlindAnswer(state, {
        obligationRef: "missing-obligation",
        answerSubmissionRef: "answer-unbacked",
        snapshotRef: "snapshot-unbacked",
        submittedAt: "2026-07-19T13:00:00.000Z",
      }),
    ).toThrowError(BlindAnswerInvariantError);
  });

  it("expires an accepted Invitation when an active Answer closes empty", () => {
    let state = createRollingBlindReview({
      commitmentRef: "commitment-1",
      opportunityRef: "opportunity-1",
      reviewerRef: "reviewer-sarah",
      answerReviewWip: 1,
      answerReviewSlaHours: 24,
      advancementCohortSize: 2,
      queuePolicyVersion: "onlyboth.interest-queue@1",
      creditPerAnswerReview: 1,
    });
    state = queueCandidateInterest(state, makeInterest(1));
    state = activateBlindReviewCommitment(state, {
      slotRefs: ["answer-slot-1"],
      activatedAt: "2026-07-19T12:30:00.000Z",
    });
    state = offerNextQueuedInterest(state, {
      ...offerInput(1, "answer-slot-1"),
      newCohort: {
        cohortRef: "cohort-1",
        seatRefs: ["cohort-1-seat-1", "cohort-1-seat-2"],
      },
    })!.state;
    state = acceptBackedAnswerOffer(state, {
      invitationRef: "invitation-01",
      acceptedAt: "2026-07-19T13:20:00.000Z",
    });

    const expired = expireEmptyActiveBlindAnswer(state, {
      obligationRef: "obligation-01",
      expiredAt: "2026-07-19T13:26:00.000Z",
    });
    expect(expired.state.invitations[0]).toMatchObject({ state: "EXPIRED", version: 3 });
    expect(expired.state.cohorts[0]?.seats[0]).toMatchObject({
      state: "OPEN",
      obligationRef: null,
    });
  });

  it("retires the breached Slot and closes the comparison Cohort only after the Review SLA", () => {
    let state = createRollingBlindReview({
      commitmentRef: "commitment-1",
      opportunityRef: "opportunity-1",
      reviewerRef: "reviewer-sarah",
      answerReviewWip: 1,
      answerReviewSlaHours: 24,
      advancementCohortSize: 2,
      queuePolicyVersion: "onlyboth.interest-queue@1",
      creditPerAnswerReview: 1,
    });
    state = queueCandidateInterest(state, makeInterest(1));
    state = activateBlindReviewCommitment(state, {
      slotRefs: ["answer-slot-1"],
      activatedAt: "2026-07-19T12:30:00.000Z",
    });
    state = offerNextQueuedInterest(state, {
      ...offerInput(1, "answer-slot-1"),
      newCohort: {
        cohortRef: "cohort-1",
        seatRefs: ["cohort-1-seat-1", "cohort-1-seat-2"],
      },
    })!.state;
    state = acceptBackedAnswerOffer(state, {
      invitationRef: "invitation-01",
      acceptedAt: "2026-07-19T13:20:00.000Z",
    });
    state = submitBlindAnswer(state, {
      obligationRef: "obligation-01",
      answerSubmissionRef: "answer-01",
      snapshotRef: "snapshot-01",
      submittedAt: "2026-07-19T13:26:00.000Z",
    });

    expect(() =>
      settleEmployerReviewBreach(state, {
        obligationRef: "obligation-01",
        reviewDueAt: "2026-07-20T13:26:00.000Z",
        breachedAt: "2026-07-20T13:25:59.999Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "ANSWER_REVIEW_STATE_INVALID" }));

    const settled = settleEmployerReviewBreach(state, {
      obligationRef: "obligation-01",
      reviewDueAt: "2026-07-20T13:26:00.000Z",
      breachedAt: "2026-07-20T13:26:00.000Z",
    });
    expect(settled.state.obligations[0]).toMatchObject({ state: "BREACH_SETTLED" });
    expect(settled.state.slots[0]).toMatchObject({
      state: "RETIRED",
      currentObligationRef: null,
    });
    expect(settled.state.interests[0]).toMatchObject({ state: "EMPLOYER_BREACH" });
    expect(settled.state.cohorts[0]).toMatchObject({ state: "CLOSED_NO_ALLOCATION" });
    expect(settled.state.cohorts[0]?.seats[0]).toMatchObject({ state: "BREACH_SETTLED" });
  });

  it("rejects acceptance at or after the database-backed offer deadline", () => {
    let state = createRollingBlindReview({
      commitmentRef: "commitment-1",
      opportunityRef: "opportunity-1",
      reviewerRef: "reviewer-sarah",
      answerReviewWip: 1,
      answerReviewSlaHours: 24,
      advancementCohortSize: 2,
      queuePolicyVersion: "onlyboth.interest-queue@1",
      creditPerAnswerReview: 1,
    });
    state = queueCandidateInterest(state, makeInterest(1));
    state = activateBlindReviewCommitment(state, {
      slotRefs: ["answer-slot-1"],
      activatedAt: "2026-07-19T12:30:00.000Z",
    });
    state = offerNextQueuedInterest(state, {
      ...offerInput(1, "answer-slot-1"),
      newCohort: {
        cohortRef: "cohort-1",
        seatRefs: ["cohort-1-seat-1", "cohort-1-seat-2"],
      },
    })!.state;

    expect(() =>
      acceptBackedAnswerOffer(state, {
        invitationRef: "invitation-01",
        acceptedAt: "2026-07-20T13:01:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "BACKED_OFFER_STATE_INVALID" }));
  });

  it.each([
    {
      reason: "CANDIDATE_DECLINED" as const,
      invitationState: "DECLINED",
      interestState: "OFFER_DECLINED",
    },
    {
      reason: "OFFER_EXPIRED" as const,
      invitationState: "EXPIRED",
      interestState: "OFFER_EXPIRED",
    },
  ])(
    "releases the backed Slot and Cohort Seat after $reason without an ability conclusion",
    ({ reason, invitationState, interestState }) => {
      let state = createRollingBlindReview({
        commitmentRef: "commitment-1",
        opportunityRef: "opportunity-1",
        reviewerRef: "reviewer-sarah",
        answerReviewWip: 1,
        answerReviewSlaHours: 24,
        advancementCohortSize: 2,
        queuePolicyVersion: "onlyboth.interest-queue@1",
        creditPerAnswerReview: 1,
      });
      state = queueCandidateInterest(state, makeInterest(1));
      state = activateBlindReviewCommitment(state, {
        slotRefs: ["answer-slot-1"],
        activatedAt: "2026-07-19T12:30:00.000Z",
      });
      state = offerNextQueuedInterest(state, {
        ...offerInput(1, "answer-slot-1"),
        newCohort: {
          cohortRef: "cohort-1",
          seatRefs: ["cohort-1-seat-1", "cohort-1-seat-2"],
        },
      })!.state;

      const released = releaseBackedAnswerOffer(state, {
        invitationRef: "invitation-01",
        reason,
        releasedAt:
          reason === "CANDIDATE_DECLINED" ? "2026-07-19T13:02:00.000Z" : "2026-07-20T13:02:00.000Z",
      });

      expect(released.nextOfferRequested).toBe(true);
      expect(released.state.invitations[0]).toMatchObject({ state: invitationState, version: 2 });
      expect(released.state.obligations[0]).toMatchObject({ state: "SETTLED", version: 2 });
      expect(released.state.slots[0]).toMatchObject({
        state: "AVAILABLE",
        currentObligationRef: null,
        version: 3,
      });
      expect(released.state.interests[0]).toMatchObject({ state: interestState, version: 3 });
      expect(released.state.cohorts[0]?.seats[0]).toMatchObject({
        state: "OPEN",
        obligationRef: null,
        answerSubmissionRef: null,
        humanReviewRef: null,
        reviewDecision: null,
      });
      expect(released.state.cohorts[0]).toMatchObject({
        submittedCount: 0,
        reviewedCount: 0,
        state: "COLLECTING",
      });
    },
  );
});
