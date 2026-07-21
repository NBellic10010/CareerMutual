import {
  AuthorizeLabelRevealHandler,
  ReserveReviewWindowHandler,
} from "../../packages/application/src/index";
import {
  acceptProofWindow,
  recordCandidateDecision,
  recordEvidenceReady,
  recordHumanOutcome,
  selectHumanChallenge,
  submitStageA,
} from "../../packages/domain/src/index";
import {
  InMemoryReviewWindowRepository,
  makeReservationInput,
} from "../../packages/testkit/src/index";
import { describe, expect, it } from "vitest";

describe("ReviewWindow application handlers", () => {
  it("persists a reviewer-backed reservation through the repository port", async () => {
    const repository = new InMemoryReviewWindowRepository();
    const handler = new ReserveReviewWindowHandler(repository);

    const result = await handler.execute(makeReservationInput());

    await expect(repository.getById(result.window.id)).resolves.toEqual(result.window);
    expect(result.events[0]?.type).toBe("AttentionReserved");
  });

  it("does not turn a duplicate reservation into a second Window", async () => {
    const repository = new InMemoryReviewWindowRepository();
    const handler = new ReserveReviewWindowHandler(repository);
    const command = makeReservationInput();

    await handler.execute(command);

    await expect(handler.execute(command)).rejects.toThrow("already exists");
  });

  it("saves Reveal with the aggregate version used for optimistic concurrency", async () => {
    const repository = new InMemoryReviewWindowRepository();
    const reservation = await new ReserveReviewWindowHandler(repository).execute(
      makeReservationInput(),
    );
    let window = acceptProofWindow(reservation.window).window;
    window = submitStageA(window, "snapshot-stage-a").window;
    window = selectHumanChallenge(window, {
      reviewerId: "reviewer-sarah",
      challengeId: "payment-retry/redis-failover@1",
      catalogHash: "sha256:catalog-test",
      evidenceRefs: ["stage-a-evidence"],
      selectionSource: "MANUAL_CATALOG",
      selectedAt: "2026-07-19T12:00:00.000Z",
    }).window;
    window = recordEvidenceReady(window, ["evidence-final-1"]).window;
    window = recordHumanOutcome(window, "ADVANCE", ["evidence-final-1"]).window;
    window = recordCandidateDecision(window, "CONTINUE").window;
    await repository.save(window, reservation.window.version);

    const result = await new AuthorizeLabelRevealHandler(repository).execute(window.id);

    expect(result.window.state).toBe("REVEALED");
    await expect(repository.getById(window.id)).resolves.toEqual(result.window);
  });

  it("fails closed when the requested Window does not exist", async () => {
    const handler = new AuthorizeLabelRevealHandler(new InMemoryReviewWindowRepository());

    await expect(handler.execute("missing-window")).rejects.toThrow("was not found");
  });
});
