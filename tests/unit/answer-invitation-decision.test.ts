import { createHash } from "node:crypto";

import {
  DecideAnswerInvitationHandler,
  ExpireAnswerInvitationHandler,
  type AnswerInvitationDecisionIdFactory,
  type AnswerInvitationDecisionSnapshot,
  type DecideAnswerInvitationRequest,
} from "../../packages/application/src/index";
import {
  activateBlindReviewCommitment,
  createRollingBlindReview,
  offerNextQueuedInterest,
  queueCandidateInterest,
} from "../../packages/domain/src/index";
import { InMemoryAnswerInvitationDecisionUnitOfWork } from "../../packages/testkit/src/index";
import { describe, expect, it } from "vitest";

const OFFERED_AT = "2026-07-19T21:00:00.000Z";
const OFFER_EXPIRES_AT = "2026-07-19T23:00:00.000Z";
const DECISION_NOW = new Date("2026-07-19T22:00:00.000Z");
const EXPIRED_NOW = new Date(OFFER_EXPIRES_AT);

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function ids(): AnswerInvitationDecisionIdFactory {
  let sequence = 0;
  return { nextId: (kind) => `${kind}-decision-${++sequence}` };
}

function backedSnapshot(): AnswerInvitationDecisionSnapshot {
  let review = createRollingBlindReview({
    commitmentRef: "blind-review-commitment-1",
    opportunityRef: "opportunity-1",
    reviewerRef: "reviewer-sarah",
    answerReviewWip: 1,
    answerReviewSlaHours: 24,
    advancementCohortSize: 2,
    queuePolicyVersion: "onlyboth.interest-queue@1",
    creditPerAnswerReview: 1,
  });
  review = queueCandidateInterest(review, {
    interestRef: "interest-42",
    candidateRef: "candidate-42",
    eligibilityEdgeRef: "eligibility-42",
    eligibleAt: "2026-07-19T20:00:00.000Z",
    interestCreatedAt: "2026-07-19T20:00:00.000Z",
  });
  review = activateBlindReviewCommitment(review, {
    slotRefs: ["answer-slot-1"],
    activatedAt: "2026-07-19T20:30:00.000Z",
  });
  review = offerNextQueuedInterest(review, {
    slotRef: "answer-slot-1",
    obligationRef: "obligation-42",
    invitationRef: "invitation-42",
    creditHoldRef: "credit-hold-42",
    offeredAt: OFFERED_AT,
    offerExpiresAt: OFFER_EXPIRES_AT,
    publicSeed: "onlyboth-interest-queue-seed@1",
    hash: sha256,
    activeCandidateRefs: new Set(),
    newCohort: {
      cohortRef: "cohort-1",
      seatRefs: ["cohort-seat-1", "cohort-seat-2"],
    },
  })!.state;

  return {
    review,
    targetInvitationRef: "invitation-42",
    publicSeed: "onlyboth-interest-queue-seed@1",
    reviewerDisplayName: "Sarah Chen",
    effortLimitMinutes: 6,
    runtimeMode: "LIVE",
    synthetic: false,
    creditAccount: {
      accountRef: "credit-account-1",
      version: 3,
      availableCredits: 27,
      committedCredits: 0,
      heldCredits: 1,
    },
    slotCreditReservation: {
      reservationRef: "slot-credit-reservation-1",
      slotRef: "answer-slot-1",
      accountRef: "credit-account-1",
      amount: 1,
      state: "BOUND",
      version: 2,
    },
    creditHold: {
      creditHoldRef: "credit-hold-42",
      accountRef: "credit-account-1",
      reservationRef: "slot-credit-reservation-1",
      obligationRef: "obligation-42",
      amount: 1,
      purpose: "ANSWER_REVIEW",
      status: "HELD",
      createdAt: OFFERED_AT,
      settledAt: null,
    },
    activityLease: {
      leaseRef: "candidate-activity-lease-42",
      candidateRef: "candidate-42",
      opportunityRef: "opportunity-1",
      bindingKind: "ANSWER_REVIEW",
      bindingRef: "obligation-42",
      state: "ACTIVE",
      version: 1,
      acquiredAt: OFFERED_AT,
      releasedAt: null,
    },
  };
}

function request(
  decision: "ACCEPT" | "DECLINE",
  overrides: Partial<DecideAnswerInvitationRequest> = {},
): DecideAnswerInvitationRequest {
  return {
    invitationRef: "invitation-42",
    actor: { role: "CANDIDATE", actorId: "candidate-42" },
    idempotencyKey: `decision-${decision.toLowerCase()}-42`,
    correlationId: `correlation-${decision.toLowerCase()}-42`,
    command: {
      schema_version: "answer-invitation-decision-command@1",
      decision,
      expected_obligation_version: 1,
      expected_slot_version: 2,
    },
    ...overrides,
  };
}

describe("DecideAnswerInvitationHandler", () => {
  it("accepts only a fully backed Offer and returns the new Session and database deadline", async () => {
    const store = new InMemoryAnswerInvitationDecisionUnitOfWork({
      snapshot: backedSnapshot(),
      now: DECISION_NOW,
    });
    const beforeFinance = store.view().snapshot.creditAccount;

    const receipt = await new DecideAnswerInvitationHandler(store, ids()).execute(
      request("ACCEPT"),
    );
    const view = store.view();

    expect(receipt).toMatchObject({
      decision: "ACCEPT",
      obligation_state: "ANSWER_ACTIVE",
      answer_session_ref: expect.stringMatching(/^answer-session-/u),
      answer_due_at: "2026-07-19T22:06:00.000Z",
    });
    expect(view.answerSessions).toEqual([
      expect.objectContaining({
        invitationRef: "invitation-42",
        state: "ACTIVE",
        answerDueAt: "2026-07-19T22:06:00.000Z",
      }),
    ]);
    expect(view.snapshot.review.invitations[0]?.state).toBe("ACCEPTED");
    expect(view.snapshot.review.obligations[0]?.state).toBe("ANSWER_ACTIVE");
    expect(view.snapshot.review.slots[0]?.state).toBe("ANSWER_ACTIVE");
    expect(view.snapshot.review.interests[0]?.state).toBe("APPLICATION_ACTIVE");
    expect(view.snapshot.creditAccount).toEqual(beforeFinance);
    expect(view.snapshot.slotCreditReservation.state).toBe("BOUND");
    expect(view.snapshot.creditHold.status).toBe("HELD");
    expect(view.snapshot.activityLease.state).toBe("ACTIVE");
    expect(view.returnedCreditLedger).toEqual([]);
    expect(view.outbox).toEqual([expect.objectContaining({ messageType: "AnswerSessionStarted" })]);
    expect(JSON.stringify(view.outbox)).not.toMatch(
      /buildAnswerEvidenceEdge|OpenAI|GoldenReplay|verification/iu,
    );
    expect(JSON.stringify(view.employerProjection)).not.toContain("candidate-42");
    expect(view.candidateProjection).toMatchObject({
      state: "ANSWER_ACTIVE",
      answer_session_ref: receipt.answer_session_ref,
      answer_due_at: receipt.answer_due_at,
      credit_hold_ref: "credit-hold-42",
    });
  });

  it("declines without inference and atomically returns Hold, lease, Slot, Seat, and dispatch", async () => {
    const store = new InMemoryAnswerInvitationDecisionUnitOfWork({
      snapshot: backedSnapshot(),
      now: DECISION_NOW,
    });
    const receipt = await new DecideAnswerInvitationHandler(store, ids()).execute(
      request("DECLINE"),
    );
    const view = store.view();

    expect(receipt).toMatchObject({
      decision: "DECLINE",
      obligation_state: "SETTLED",
      answer_session_ref: null,
      answer_due_at: null,
    });
    expect(view.snapshot.creditAccount).toMatchObject({
      version: 4,
      committedCredits: 1,
      heldCredits: 0,
    });
    expect(view.snapshot.slotCreditReservation).toMatchObject({ state: "RESERVED", version: 3 });
    expect(view.snapshot.creditHold).toMatchObject({ status: "RETURNED" });
    expect(view.snapshot.activityLease).toMatchObject({ state: "RELEASED", version: 2 });
    expect(view.snapshot.review.slots[0]).toMatchObject({
      state: "AVAILABLE",
      currentObligationRef: null,
      version: 3,
    });
    expect(view.snapshot.review.cohorts[0]?.seats[0]).toMatchObject({
      state: "OPEN",
      obligationRef: null,
    });
    expect(view.snapshot.review.interests[0]?.state).toBe("OFFER_DECLINED");
    expect(view.returnedCreditLedger).toEqual([
      expect.objectContaining({ creditHoldRef: "credit-hold-42", entryType: "RETURN", amount: 1 }),
    ]);
    expect(view.outbox).toEqual([
      expect.objectContaining({ messageType: "OfferNextQueuedInterestRequested" }),
    ]);
    expect(JSON.stringify(view.employerProjection)).not.toContain("candidate-42");
    expect(JSON.stringify([view.events, view.candidateProjection])).not.toMatch(
      /unqualified|incapable|ability failure|hiring rejection/iu,
    );
  });

  it.each([
    {
      name: "another Candidate",
      mutate: (value: DecideAnswerInvitationRequest) => ({
        ...value,
        actor: { role: "CANDIDATE" as const, actorId: "candidate-17" },
      }),
      code: "CANDIDATE_MISMATCH",
    },
    {
      name: "a stale Obligation",
      mutate: (value: DecideAnswerInvitationRequest) => ({
        ...value,
        command: { ...value.command, expected_obligation_version: 99 },
      }),
      code: "STALE_OBLIGATION_VERSION",
    },
    {
      name: "a stale Slot",
      mutate: (value: DecideAnswerInvitationRequest) => ({
        ...value,
        command: { ...value.command, expected_slot_version: 99 },
      }),
      code: "STALE_SLOT_VERSION",
    },
  ])("rejects $name without mutation", async ({ mutate, code }) => {
    const store = new InMemoryAnswerInvitationDecisionUnitOfWork({
      snapshot: backedSnapshot(),
      now: DECISION_NOW,
    });
    const before = store.view();
    await expect(
      new DecideAnswerInvitationHandler(store, ids()).execute(mutate(request("ACCEPT"))),
    ).rejects.toMatchObject({ code });
    expect(store.view()).toEqual(before);
  });

  it("runtime-rejects a non-Candidate actor even when the actor id matches", async () => {
    const store = new InMemoryAnswerInvitationDecisionUnitOfWork({
      snapshot: backedSnapshot(),
      now: DECISION_NOW,
    });
    const forged = {
      ...request("ACCEPT"),
      actor: { role: "EMPLOYER", actorId: "candidate-42" },
    } as unknown as DecideAnswerInvitationRequest;

    await expect(
      new DecideAnswerInvitationHandler(store, ids()).execute(forged),
    ).rejects.toMatchObject({ code: "CANDIDATE_AUTH_REQUIRED", httpStatus: 403 });
    expect(store.view().answerSessions).toEqual([]);
  });

  it("rejects an expired Offer and broken Hold or Q_i backing without mutation", async () => {
    const expired = new InMemoryAnswerInvitationDecisionUnitOfWork({
      snapshot: backedSnapshot(),
      now: EXPIRED_NOW,
    });
    await expect(
      new DecideAnswerInvitationHandler(expired, ids()).execute(request("ACCEPT")),
    ).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });

    for (const brokenSnapshot of [
      {
        ...backedSnapshot(),
        creditHold: { ...backedSnapshot().creditHold, status: "RETURNED" as const },
      },
      {
        ...backedSnapshot(),
        activityLease: { ...backedSnapshot().activityLease, state: "RELEASED" as const },
      },
      {
        ...backedSnapshot(),
        activityLease: { ...backedSnapshot().activityLease, candidateRef: "candidate-17" },
      },
      {
        ...backedSnapshot(),
        slotCreditReservation: {
          ...backedSnapshot().slotCreditReservation,
          slotRef: "answer-slot-cross-bound",
        },
      },
      {
        ...backedSnapshot(),
        slotCreditReservation: {
          ...backedSnapshot().slotCreditReservation,
          accountRef: "credit-account-cross-bound",
        },
      },
      {
        ...backedSnapshot(),
        creditHold: {
          ...backedSnapshot().creditHold,
          accountRef: "credit-account-cross-bound",
        },
      },
    ]) {
      const store = new InMemoryAnswerInvitationDecisionUnitOfWork({
        snapshot: brokenSnapshot,
        now: DECISION_NOW,
      });
      const before = store.view();
      await expect(
        new DecideAnswerInvitationHandler(store, ids()).execute(request("ACCEPT")),
      ).rejects.toMatchObject({ code: "ATTENTION_BACKING_INVALID" });
      expect(store.view()).toEqual(before);
    }
  });

  it("deduplicates exact replay, conflicts on changed payload, and rolls back Outbox failure", async () => {
    const store = new InMemoryAnswerInvitationDecisionUnitOfWork({
      snapshot: backedSnapshot(),
      now: DECISION_NOW,
    });
    const handler = new DecideAnswerInvitationHandler(store, ids());
    const first = await handler.execute(request("ACCEPT"));
    await expect(handler.execute(request("ACCEPT"))).resolves.toEqual(first);
    await expect(
      handler.execute(request("DECLINE", { idempotencyKey: request("ACCEPT").idempotencyKey })),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(store.view().answerSessions).toHaveLength(1);

    const rollbackStore = new InMemoryAnswerInvitationDecisionUnitOfWork({
      snapshot: backedSnapshot(),
      now: DECISION_NOW,
      failAt: "DECISION_OUTBOX",
    });
    const before = rollbackStore.view();
    await expect(
      new DecideAnswerInvitationHandler(rollbackStore, ids()).execute(request("DECLINE")),
    ).rejects.toThrow("Injected Answer Invitation Outbox failure");
    expect(rollbackStore.view()).toEqual(before);
  });
});

describe("ExpireAnswerInvitationHandler", () => {
  it("uses database time and releases Credit, Q_i, Slot, and Cohort Seat exactly once", async () => {
    const store = new InMemoryAnswerInvitationDecisionUnitOfWork({
      snapshot: backedSnapshot(),
      now: EXPIRED_NOW,
    });
    const expiry = new ExpireAnswerInvitationHandler(store, ids());

    await expect(expiry.executeNext()).resolves.toBe(true);
    await expect(expiry.executeNext()).resolves.toBe(false);
    const view = store.view();
    expect(view.snapshot.review.invitations[0]?.state).toBe("EXPIRED");
    expect(view.snapshot.review.interests[0]?.state).toBe("OFFER_EXPIRED");
    expect(view.snapshot.review.slots[0]?.state).toBe("AVAILABLE");
    expect(view.snapshot.review.cohorts[0]?.seats[0]?.state).toBe("OPEN");
    expect(view.snapshot.slotCreditReservation.state).toBe("RESERVED");
    expect(view.snapshot.creditHold.status).toBe("RETURNED");
    expect(view.snapshot.activityLease.state).toBe("RELEASED");
    expect(view.snapshot.creditAccount).toMatchObject({ committedCredits: 1, heldCredits: 0 });
    expect(view.returnedCreditLedger).toHaveLength(1);
    expect(view.events).toEqual([
      expect.objectContaining({ eventType: "AnswerInvitationExpired" }),
    ]);
    expect(view.outbox).toEqual([
      expect.objectContaining({ messageType: "OfferNextQueuedInterestRequested" }),
    ]);
    expect(JSON.stringify(view.candidateProjection)).not.toMatch(
      /unqualified|incapable|ability failure|hiring rejection/iu,
    );
  });

  it("does nothing before the database deadline", async () => {
    const store = new InMemoryAnswerInvitationDecisionUnitOfWork({
      snapshot: backedSnapshot(),
      now: DECISION_NOW,
    });
    const before = store.view();
    await expect(new ExpireAnswerInvitationHandler(store, ids()).executeNext()).resolves.toBe(
      false,
    );
    expect(store.view()).toEqual(before);
  });

  it("wins the exact-deadline race once without double Credit return", async () => {
    const store = new InMemoryAnswerInvitationDecisionUnitOfWork({
      snapshot: backedSnapshot(),
      now: EXPIRED_NOW,
    });
    const decision = new DecideAnswerInvitationHandler(store, ids());
    const expiry = new ExpireAnswerInvitationHandler(store, ids());

    const [candidateOutcome, expiryOutcome] = await Promise.allSettled([
      decision.execute(request("ACCEPT")),
      expiry.executeNext(),
    ]);

    expect(candidateOutcome).toMatchObject({ status: "rejected" });
    expect(expiryOutcome).toEqual({ status: "fulfilled", value: true });
    const view = store.view();
    expect(view.snapshot.review.invitations[0]?.state).toBe("EXPIRED");
    expect(view.returnedCreditLedger).toHaveLength(1);
    expect(view.events).toHaveLength(1);
    expect(view.outbox).toHaveLength(1);
    expect(view.answerSessions).toEqual([]);
  });
});
