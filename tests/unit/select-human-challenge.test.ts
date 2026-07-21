import {
  ChallengeSelectionApplicationError,
  SelectHumanChallengeHandler,
  challengeSelectionErrorDetails,
  type ApplicationIdFactory,
  type ChallengeCatalogSelectionPort,
  type StoredChallengeRecommendationOutput,
} from "../../packages/application/src/index";
import { CANDIDATE_42_RECOMMENDATION_OUTPUT } from "../../packages/ai/src/index";
import {
  acceptProofWindow,
  abortForPlatformFailure,
  reserveReviewWindow,
  submitStageA,
  type ReviewWindow,
} from "../../packages/domain/src/index";
import {
  InMemoryChallengeSelectionUnitOfWork,
  makeReservationInput,
} from "../../packages/testkit/src/index";
import { describe, expect, it } from "vitest";

const CATALOG_HASH = "sha256:0c18eb5d79ae4f22e13509a446b4fdcdb6b9c46cedea82ca65f4c108a2d81ee5";
const CHALLENGES = [
  "payment-retry/redis-failover@1",
  "payment-retry/duplicate-webhook@1",
  "payment-retry/cross-region-retry@1",
] as const;

describe("Challenge selection API error details", () => {
  it("recognizes a structurally equivalent error across a server bundle boundary", () => {
    expect(
      challengeSelectionErrorDetails({
        name: "ChallengeSelectionApplicationError",
        code: "STALE_AGGREGATE_VERSION",
        httpStatus: 409,
      }),
    ).toEqual({ code: "STALE_AGGREGATE_VERSION", httpStatus: 409 });
  });

  it("rejects an error whose status does not match its allowlisted code", () => {
    expect(
      challengeSelectionErrorDetails({
        name: "ChallengeSelectionApplicationError",
        code: "STALE_AGGREGATE_VERSION",
        httpStatus: 503,
      }),
    ).toBeNull();
    expect(
      challengeSelectionErrorDetails(
        new ChallengeSelectionApplicationError(
          "EVIDENCE_REFERENCE_INVALID",
          422,
          "Evidence is not current.",
        ),
      ),
    ).toEqual({ code: "EVIDENCE_REFERENCE_INVALID", httpStatus: 422 });
  });
});

function checkpointWindow(): ReviewWindow {
  let window = reserveReviewWindow(
    makeReservationInput({
      id: "review-window-42",
      candidateId: "candidate-42",
      reviewerId: "reviewer-sarah-chen",
      versionPins: {
        contractVersionId: "contract-payment-retry@1",
        labelPolicyVersionId: "label-policy@1",
        proofTemplateVersionId: "payment-retry@1",
        challengeCatalogVersionId: "payment-retry@1",
      },
    }),
  ).window;
  window = acceptProofWindow(window).window;
  return submitStageA(window, "snapshot-42-stage-a").window;
}

function storedOutput(): StoredChallengeRecommendationOutput {
  return {
    outputRef: "ai-output-candidate-42",
    reviewWindowId: "review-window-42",
    aggregateVersion: 3,
    catalogRef: "payment-retry@1",
    catalogHash: CATALOG_HASH,
    output: CANDIDATE_42_RECOMMENDATION_OUTPUT,
    consumedByCommandId: null,
  };
}

function idFactory(): ApplicationIdFactory {
  let sequence = 0;
  return { nextId: (kind) => `${kind}-${++sequence}` };
}

const catalog: ChallengeCatalogSelectionPort = {
  catalogRef: "payment-retry@1",
  catalogHash: CATALOG_HASH,
  listRecommendationOptions() {
    return CHALLENGES.map((challengeRef) => {
      const separator = challengeRef.lastIndexOf("@");
      return {
        challengeId: challengeRef.slice(0, separator),
        version: Number(challengeRef.slice(separator + 1)),
        capabilityRefs: ["inspect_state_transition"],
        candidateNotice: `Sarah chose ${challengeRef}.`,
      };
    });
  },
  resolveChallenge(challengeRef) {
    if (!CHALLENGES.includes(challengeRef as (typeof CHALLENGES)[number])) {
      throw new Error("Unknown challenge.");
    }
    return {
      challengeRef,
      candidateNotice: `Sarah chose ${challengeRef}.`,
      capabilityRefs: ["inspect_state_transition"],
    };
  },
};

function executeAiSelection(
  handler: SelectHumanChallengeHandler,
  challengeRef: (typeof CHALLENGES)[number],
  overrides: Partial<Parameters<SelectHumanChallengeHandler["execute"]>[0]> = {},
) {
  return handler.execute({
    reviewWindowId: "review-window-42",
    actor: { role: "EMPLOYER", actorId: "reviewer-sarah-chen" },
    idempotencyKey: `selection-${challengeRef}`,
    correlationId: "correlation-test",
    command: {
      schema_version: "select-human-challenge-command@1",
      selection_source: "AI_RECOMMENDATION",
      recommendation_output_ref: "ai-output-candidate-42",
      challenge_ref: challengeRef,
      expected_version: 3,
    },
    ...overrides,
  });
}

describe("SelectHumanChallengeHandler", () => {
  it.each(CHALLENGES)("atomically authorizes the %s branch", async (challengeRef) => {
    const unitOfWork = new InMemoryChallengeSelectionUnitOfWork(
      checkpointWindow(),
      ["evidence-E17", "evidence-D04", "evidence-C09"],
      [storedOutput()],
    );
    const handler = new SelectHumanChallengeHandler(unitOfWork, catalog, idFactory());

    const receipt = await executeAiSelection(handler, challengeRef);
    const snapshot = unitOfWork.snapshot();

    expect(receipt).toMatchObject({ challenge_ref: challengeRef, aggregate_version: 4 });
    expect(snapshot.window.state).toBe("STAGE_B_ACTIVE");
    expect(snapshot.window.checkpoint?.challengeId).toBe(challengeRef);
    expect(snapshot.window.checkpoint?.evidenceRefs.length).toBeGreaterThan(0);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.payload.type).toBe("HumanChallengeSelected");
    expect(snapshot.outbox[0]?.payload.challengeRef).toBe(challengeRef);
    expect(snapshot.outputs.get("ai-output-candidate-42")?.consumedByCommandId).toBe(
      receipt.command_id,
    );
  });

  it("returns the same receipt for a repeated click with the same idempotency key", async () => {
    const unitOfWork = new InMemoryChallengeSelectionUnitOfWork(
      checkpointWindow(),
      ["evidence-E17", "evidence-D04", "evidence-C09"],
      [storedOutput()],
    );
    const handler = new SelectHumanChallengeHandler(unitOfWork, catalog, idFactory());
    const request = {
      reviewWindowId: "review-window-42",
      actor: { role: "EMPLOYER" as const, actorId: "reviewer-sarah-chen" },
      idempotencyKey: "same-click",
      correlationId: "correlation-test",
      command: {
        schema_version: "select-human-challenge-command@1" as const,
        selection_source: "AI_RECOMMENDATION" as const,
        recommendation_output_ref: "ai-output-candidate-42",
        challenge_ref: CHALLENGES[0],
        expected_version: 3,
      },
    };

    const first = await handler.execute(request);
    const second = await handler.execute(request);

    expect(second).toEqual(first);
    expect(unitOfWork.snapshot().events).toHaveLength(1);
  });

  it("rejects a stale tab before creating a second event", async () => {
    const unitOfWork = new InMemoryChallengeSelectionUnitOfWork(
      checkpointWindow(),
      ["evidence-E17"],
      [storedOutput()],
    );
    const handler = new SelectHumanChallengeHandler(unitOfWork, catalog, idFactory());

    await expect(
      executeAiSelection(handler, CHALLENGES[0], {
        command: {
          schema_version: "select-human-challenge-command@1",
          selection_source: "AI_RECOMMENDATION",
          recommendation_output_ref: "ai-output-candidate-42",
          challenge_ref: CHALLENGES[0],
          expected_version: 2,
        },
      }),
    ).rejects.toMatchObject({ code: "STALE_AGGREGATE_VERSION", httpStatus: 409 });
    expect(unitOfWork.snapshot().events).toHaveLength(0);
  });

  it("rejects reviewer mismatch and manual Evidence outside the current Stage A set", async () => {
    const unitOfWork = new InMemoryChallengeSelectionUnitOfWork(
      checkpointWindow(),
      ["evidence-E17"],
      [storedOutput()],
    );
    const handler = new SelectHumanChallengeHandler(unitOfWork, catalog, idFactory());

    await expect(
      executeAiSelection(handler, CHALLENGES[0], {
        actor: { role: "EMPLOYER", actorId: "reviewer-not-sarah" },
      }),
    ).rejects.toMatchObject({ code: "REVIEWER_MISMATCH", httpStatus: 403 });

    await expect(
      handler.execute({
        reviewWindowId: "review-window-42",
        actor: { role: "EMPLOYER", actorId: "reviewer-sarah-chen" },
        idempotencyKey: "manual-invalid",
        correlationId: "correlation-test",
        command: {
          schema_version: "select-human-challenge-command@1",
          selection_source: "MANUAL_CATALOG",
          challenge_ref: CHALLENGES[1],
          evidence_refs: ["evidence-invented"],
          expected_version: 3,
        },
      }),
    ).rejects.toMatchObject({ code: "EVIDENCE_REFERENCE_INVALID", httpStatus: 422 });
  });

  it("rolls aggregate, event, output consumption, and outbox back together", async () => {
    const unitOfWork = new InMemoryChallengeSelectionUnitOfWork(
      checkpointWindow(),
      ["evidence-E17", "evidence-D04", "evidence-C09"],
      [storedOutput()],
      new Date("2026-07-19T12:00:00.000Z"),
      "outbox",
    );
    const handler = new SelectHumanChallengeHandler(unitOfWork, catalog, idFactory());

    await expect(executeAiSelection(handler, CHALLENGES[0])).rejects.toThrow(
      "Injected outbox failure",
    );
    const snapshot = unitOfWork.snapshot();
    expect(snapshot.window).toMatchObject({ state: "CHECKPOINT_PENDING", version: 3 });
    expect(snapshot.events).toHaveLength(0);
    expect(snapshot.outbox).toHaveLength(0);
    expect(snapshot.outputs.get("ai-output-candidate-42")?.consumedByCommandId).toBeNull();
  });
});

describe("Platform Abort domain path", () => {
  it("records platform responsibility without Candidate or Employer failure", () => {
    const active = {
      ...checkpointWindow(),
      state: "STAGE_B_ACTIVE" as const,
      version: 4,
    };
    const aborted = abortForPlatformFailure(active, {
      component: "ReplaySandbox",
      reasonRef: "sandbox-retry-exhausted",
    });

    expect(aborted.window.state).toBe("PLATFORM_ABORT");
    expect(aborted.events).toEqual([
      {
        type: "PlatformAborted",
        reviewWindowId: "review-window-42",
        component: "ReplaySandbox",
        reasonRef: "sandbox-retry-exhausted",
      },
    ]);
  });
});
