import { createHash } from "node:crypto";

import {
  ActivateBlindReviewCommitmentHandler,
  InterestQueueWorker,
  OfferNextQueuedInterestHandler,
  type BlindReviewApplicationIdFactory,
} from "../../packages/application/src/index";
import {
  InMemoryBlindReviewUnitOfWork,
  type InMemoryBlindReviewFailurePoint,
} from "../../packages/testkit/src/index";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-07-19T21:00:00.000Z");

function canonicalHash(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function ids(): BlindReviewApplicationIdFactory {
  let sequence = 0;
  return {
    nextId: (kind) => `${kind}-${++sequence}`,
  };
}

function interest(candidateRef: string, ordinal: number) {
  return {
    interestRef: `interest-${candidateRef}`,
    candidateRef,
    eligibilityEdgeRef: `eligibility-${candidateRef}`,
    eligibleAt: new Date(NOW.getTime() + ordinal * 1_000).toISOString(),
    interestCreatedAt: new Date(NOW.getTime() + ordinal * 2_000).toISOString(),
  };
}

function activationRequest(
  overrides: {
    readonly actorId?: string;
    readonly idempotencyKey?: string;
    readonly expectedOpportunityVersion?: number;
    readonly expectedCommitmentVersion?: number;
    readonly answerReviewWip?: number;
    readonly creditPerAnswerReview?: number;
  } = {},
) {
  return {
    opportunityRef: "opportunity-backend-1",
    actor: {
      role: "EMPLOYER" as const,
      actorId: overrides.actorId ?? "reviewer-sarah-chen",
    },
    idempotencyKey: overrides.idempotencyKey ?? "activate-blind-review",
    correlationId: "correlation-activate-blind-review",
    command: {
      schema_version: "activate-blind-review-commitment-command@1" as const,
      answer_review_wip: overrides.answerReviewWip ?? 8,
      answer_review_sla_hours: 24,
      advancement_cohort_size: 8,
      queue_policy_version: "onlyboth.interest-queue@1" as const,
      credit_per_answer_review: overrides.creditPerAnswerReview ?? 1,
      expected_opportunity_version: overrides.expectedOpportunityVersion ?? 1,
      expected_commitment_version: overrides.expectedCommitmentVersion ?? 0,
    },
  };
}

function createUnitOfWork(
  input: {
    readonly queuedInterests?: readonly ReturnType<typeof interest>[];
    readonly activeCandidateRefs?: readonly string[];
    readonly availableCredits?: number;
    readonly failAt?: InMemoryBlindReviewFailurePoint;
  } = {},
) {
  return new InMemoryBlindReviewUnitOfWork({
    opportunityRef: "opportunity-backend-1",
    opportunityVersion: 1,
    opportunityState: "OPEN",
    reviewerRef: "reviewer-sarah-chen",
    reviewerDisplayName: "Sarah Chen",
    questionVersionRef: "payment-retry-question@1",
    publicSeed: "onlyboth-interest-v1-00001",
    offerSlaHours: 24,
    effortLimitMinutes: 6,
    runtimeMode: "GOLDEN_REPLAY",
    availableCredits: input.availableCredits ?? 8,
    queuedInterests: input.queuedInterests ?? [],
    activeCandidateRefs: input.activeCandidateRefs ?? [],
    now: NOW,
    failAt: input.failAt ?? null,
  });
}

async function activate(unitOfWork: InMemoryBlindReviewUnitOfWork, factory = ids()) {
  return new ActivateBlindReviewCommitmentHandler(unitOfWork, factory).execute(activationRequest());
}

describe("ActivateBlindReviewCommitmentHandler", () => {
  it("atomically creates exactly eight reusable funded Slots and eight queue requests", async () => {
    const unitOfWork = createUnitOfWork({
      queuedInterests: Array.from({ length: 10 }, (_, index) =>
        interest(`candidate-${String(index + 1).padStart(2, "0")}`, index),
      ),
    });

    const receipt = await activate(unitOfWork);
    const snapshot = unitOfWork.snapshot();

    expect(receipt).toMatchObject({
      state: "ACTIVE",
      new_commitment_version: 1,
    });
    expect(receipt.slot_refs).toHaveLength(8);
    expect(new Set(receipt.slot_refs)).toHaveLength(8);
    expect(snapshot.review?.slots).toHaveLength(8);
    expect(snapshot.review?.slots.every(({ state }) => state === "AVAILABLE")).toBe(true);
    expect(snapshot.committedCredits).toBe(8);
    expect(snapshot.availableCredits).toBe(0);
    expect(snapshot.slotCreditReservations).toHaveLength(8);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.eventType).toBe("BlindReviewCommitmentActivated");
    expect(snapshot.outbox).toHaveLength(8);
    expect(
      snapshot.outbox.every(
        ({ messageType }) => messageType === "OfferNextQueuedInterestRequested",
      ),
    ).toBe(true);
  });

  it("returns the original Receipt for the same key and rejects a changed command", async () => {
    const unitOfWork = createUnitOfWork();
    const handler = new ActivateBlindReviewCommitmentHandler(unitOfWork, ids());
    const first = await handler.execute(activationRequest());

    await expect(handler.execute(activationRequest())).resolves.toEqual(first);
    await expect(handler.execute(activationRequest({ answerReviewWip: 7 }))).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      httpStatus: 409,
    });
    expect(unitOfWork.snapshot().events).toHaveLength(1);
  });

  it.each([
    {
      name: "reviewer mismatch",
      request: activationRequest({ actorId: "reviewer-other" }),
      code: "REVIEWER_MISMATCH",
      httpStatus: 403,
    },
    {
      name: "stale Opportunity",
      request: activationRequest({ expectedOpportunityVersion: 2 }),
      code: "STALE_OPPORTUNITY_VERSION",
      httpStatus: 409,
    },
    {
      name: "stale absent Commitment",
      request: activationRequest({ expectedCommitmentVersion: 1 }),
      code: "STALE_COMMITMENT_VERSION",
      httpStatus: 409,
    },
  ])("rejects $name before persistence", async ({ request, code, httpStatus }) => {
    const unitOfWork = createUnitOfWork();
    const handler = new ActivateBlindReviewCommitmentHandler(unitOfWork, ids());

    await expect(handler.execute(request)).rejects.toMatchObject({ code, httpStatus });
    expect(unitOfWork.snapshot().review).toBeNull();
  });

  it("rejects activation when all configured Slot Credits cannot be funded", async () => {
    const unitOfWork = createUnitOfWork({ availableCredits: 7 });

    await expect(activate(unitOfWork)).rejects.toMatchObject({
      code: "CREDIT_CAPACITY_CONFLICT",
      httpStatus: 409,
    });
    expect(unitOfWork.snapshot().review).toBeNull();
  });

  it("rolls Slots, Credits, Event, Outbox, and Receipt back together", async () => {
    const unitOfWork = createUnitOfWork({ failAt: "ACTIVATION_OUTBOX" });

    await expect(activate(unitOfWork)).rejects.toThrow("Injected activation Outbox failure");
    expect(unitOfWork.snapshot()).toMatchObject({
      review: null,
      availableCredits: 8,
      committedCredits: 0,
      events: [],
      outbox: [],
    });
  });
});

describe("OfferNextQueuedInterestHandler and InterestQueueWorker", () => {
  it("consumes a durable Eligibility notification even when no Offer message exists yet", async () => {
    const store = {
      reconcileEligibilityNotification: async () => true,
      scheduleNextAvailableSlot: async () => false,
      claimNext: async () => null,
      scheduleRetry: async () => undefined,
      markFailed: async () => undefined,
    };
    const command = { execute: async () => ({}) as never };

    await expect(
      new InterestQueueWorker(store, command).runOnce("interest-reconciler"),
    ).resolves.toBe("PROCESSED");
  });

  it("excludes an actively leased Candidate and offers the Slot to the next public Queue entry", async () => {
    const unitOfWork = createUnitOfWork({
      queuedInterests: [interest("candidate-01", 0), interest("candidate-02", 1)],
      activeCandidateRefs: ["candidate-01"],
    });
    const factory = ids();
    await activate(unitOfWork, factory);
    const handler = new OfferNextQueuedInterestHandler(unitOfWork, factory, canonicalHash);
    const worker = new InterestQueueWorker(unitOfWork, handler);

    await expect(worker.runOnce("interest-worker-1")).resolves.toBe("PROCESSED");
    const snapshot = unitOfWork.snapshot();
    expect(snapshot.review?.invitations).toHaveLength(1);
    expect(snapshot.review?.invitations[0]?.candidateRef).toBe("candidate-02");
    expect(snapshot.review?.invitations[0]?.publicTieBreak).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(snapshot.activityLeases).toEqual([
      expect.objectContaining({ candidateRef: "candidate-02", state: "ACTIVE" }),
    ]);
    expect(snapshot.creditHolds).toEqual([expect.objectContaining({ amount: 1, status: "HELD" })]);
    expect(snapshot.committedCredits).toBe(7);
    expect(snapshot.heldCredits).toBe(1);
  });

  it("completes an empty Queue request without consuming the Slot or Credit", async () => {
    const unitOfWork = createUnitOfWork();
    const factory = ids();
    await activate(unitOfWork, factory);
    const worker = new InterestQueueWorker(
      unitOfWork,
      new OfferNextQueuedInterestHandler(unitOfWork, factory, canonicalHash),
    );

    await expect(worker.runOnce("interest-worker-empty")).resolves.toBe("PROCESSED");
    const snapshot = unitOfWork.snapshot();
    expect(snapshot.review?.slots[0]).toMatchObject({ state: "AVAILABLE", version: 1 });
    expect(snapshot.creditHolds).toHaveLength(0);
    expect(snapshot.activityLeases).toHaveLength(0);
    expect(snapshot.workerReceipts[0]).toMatchObject({ outcome: "NO_WAITING_INTEREST" });
  });

  it("treats a Queue request with a changed public seed as superseded", async () => {
    const unitOfWork = createUnitOfWork({ queuedInterests: [interest("candidate-01", 0)] });
    const factory = ids();
    await activate(unitOfWork, factory);
    const message = await unitOfWork.claimNext("interest-worker-seed-pin", 30);
    if (message === null) throw new Error("Expected an Offer request.");
    const changedSeedMessage = {
      ...message,
      payload: { ...message.payload, public_seed: "changed-public-seed" },
    };
    const handler = new OfferNextQueuedInterestHandler(unitOfWork, factory, canonicalHash);

    await expect(handler.execute(changedSeedMessage)).resolves.toMatchObject({
      outcome: "SUPERSEDED",
      reason_code: "PUBLIC_SEED_CHANGED",
    });
    expect(unitOfWork.snapshot().review?.invitations).toHaveLength(0);
  });

  it("schedules a fresh attempt when an Interest arrives after an empty Queue result", async () => {
    const unitOfWork = createUnitOfWork();
    const factory = ids();
    await activate(unitOfWork, factory);
    const worker = new InterestQueueWorker(
      unitOfWork,
      new OfferNextQueuedInterestHandler(unitOfWork, factory, canonicalHash),
    );
    for (let index = 0; index < 8; index += 1) {
      await expect(worker.runOnce(`interest-worker-empty-${index}`)).resolves.toBe("PROCESSED");
    }

    unitOfWork.submitQueuedInterest(interest("candidate-late", 20));
    await expect(worker.runOnce("interest-worker-late")).resolves.toBe("PROCESSED");

    expect(unitOfWork.snapshot().review?.invitations).toEqual([
      expect.objectContaining({ candidateRef: "candidate-late", state: "OFFERED" }),
    ]);
  });

  it("returns the stored worker Receipt when a duplicate business request is delivered", async () => {
    const unitOfWork = createUnitOfWork({
      queuedInterests: [interest("candidate-01", 0), interest("candidate-02", 1)],
    });
    const factory = ids();
    await activate(unitOfWork, factory);
    const handler = new OfferNextQueuedInterestHandler(unitOfWork, factory, canonicalHash);
    const firstMessage = await unitOfWork.claimNext("interest-worker-first", 30);
    if (firstMessage === null) throw new Error("Expected an Offer request.");
    const first = await handler.execute(firstMessage);
    unitOfWork.enqueueDuplicate(firstMessage, "duplicate-offer-message");
    const duplicateMessage = await unitOfWork.claimNext("interest-worker-duplicate", 30);
    if (duplicateMessage === null) throw new Error("Expected a duplicate Offer request.");

    await expect(handler.execute(duplicateMessage)).resolves.toEqual(first);
    expect(unitOfWork.snapshot().review?.invitations).toHaveLength(1);
    expect(unitOfWork.snapshot().workerReceipts).toHaveLength(1);
  });

  it("rejects reuse of a worker idempotency key with a different payload", async () => {
    const unitOfWork = createUnitOfWork({ queuedInterests: [interest("candidate-01", 0)] });
    const factory = ids();
    await activate(unitOfWork, factory);
    const handler = new OfferNextQueuedInterestHandler(unitOfWork, factory, canonicalHash);
    const firstMessage = await unitOfWork.claimNext("interest-worker-first-payload", 30);
    if (firstMessage === null) throw new Error("Expected an Offer request.");
    await handler.execute(firstMessage);
    unitOfWork.enqueueDuplicate(firstMessage, "duplicate-changed-payload");
    const duplicate = await unitOfWork.claimNext("interest-worker-changed-payload", 30);
    if (duplicate === null) throw new Error("Expected a duplicate Offer request.");
    const changed = {
      ...duplicate,
      payload: { ...duplicate.payload, public_seed: "different-seed" },
    };

    await expect(handler.execute(changed)).rejects.toMatchObject({
      code: "INTEREST_QUEUE_IDEMPOTENCY_CONFLICT",
      retryable: false,
    });
    expect(unitOfWork.snapshot().review?.invitations).toHaveLength(1);
  });

  it("rolls Lease, Hold, Seat, Invitation, Event, Outbox, and worker Receipt back together", async () => {
    const unitOfWork = createUnitOfWork({
      queuedInterests: [interest("candidate-01", 0)],
    });
    const factory = ids();
    await activate(unitOfWork, factory);
    const message = await unitOfWork.claimNext("interest-worker-rollback", 30);
    if (message === null) throw new Error("Expected an Offer request.");
    const before = unitOfWork.snapshot();
    unitOfWork.injectFailure("OFFER_OUTBOX");
    const handler = new OfferNextQueuedInterestHandler(unitOfWork, factory, canonicalHash);

    await expect(handler.execute(message)).rejects.toThrow("Injected Offer Outbox failure");
    const after = unitOfWork.snapshot();
    expect(after.review).toEqual(before.review);
    expect(after.committedCredits).toBe(before.committedCredits);
    expect(after.heldCredits).toBe(0);
    expect(after.creditHolds).toHaveLength(0);
    expect(after.activityLeases).toHaveLength(0);
    expect(after.workerReceipts).toHaveLength(0);
    expect(after.events).toEqual(before.events);
    expect(after.outbox).toEqual(before.outbox);
  });
});
