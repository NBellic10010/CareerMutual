import {
  acceptProofWindow,
  authorizeLabelReveal,
  recordCandidateDecision,
  recordEvidenceReady,
  recordHumanOutcome,
  releaseProofWindow,
  reserveReviewWindow,
  selectHumanChallenge,
  settleReviewWindow,
  submitStageA,
  type ReviewWindow,
  type ReviewWindowInvariantError,
  waiveAskBack,
} from "../../packages/domain/src/index";
import { makeReservationInput } from "../../packages/testkit/src/index";
import { describe, expect, it } from "vitest";

function buildEvidenceReadyWindow(): ReviewWindow {
  let window = reserveReviewWindow(makeReservationInput()).window;
  window = acceptProofWindow(window).window;
  window = submitStageA(window, "snapshot-stage-a").window;
  window = selectHumanChallenge(window, {
    reviewerId: "reviewer-sarah",
    challengeId: "payment-retry/redis-failover@1",
    catalogHash: "sha256:catalog-test",
    evidenceRefs: ["stage-a-evidence"],
    selectionSource: "MANUAL_CATALOG",
    selectedAt: "2026-07-19T12:00:00.000Z",
  }).window;
  return recordEvidenceReady(window, ["evidence-final-1"]).window;
}

describe("ReviewWindow reservation invariants", () => {
  it("requires a named reviewer", () => {
    expect(() => reserveReviewWindow(makeReservationInput({ reviewerId: "" }))).toThrowError(
      expect.objectContaining<Partial<ReviewWindowInvariantError>>({
        code: "INVALID_IDENTIFIER",
      }),
    );
  });

  it("requires an available Attention Slot", () => {
    expect(() =>
      reserveReviewWindow(makeReservationInput({ attentionSlotAvailable: false })),
    ).toThrowError(
      expect.objectContaining<Partial<ReviewWindowInvariantError>>({
        code: "ATTENTION_SLOT_UNAVAILABLE",
      }),
    );
  });

  it("requires a held Credit Hold", () => {
    expect(() =>
      reserveReviewWindow(makeReservationInput({ creditHoldStatus: "RETURNED" })),
    ).toThrowError(
      expect.objectContaining<Partial<ReviewWindowInvariantError>>({
        code: "CREDIT_NOT_HELD",
      }),
    );
  });

  it("pins every version required by the proof", () => {
    const result = reserveReviewWindow(makeReservationInput());
    expect(result.window.versionPins).toEqual({
      contractVersionId: "contract-v1",
      labelPolicyVersionId: "label-policy-v1",
      proofTemplateVersionId: "proof-template-v1",
      challengeCatalogVersionId: "catalog-v1",
    });
    expect(result.window.state).toBe("RESERVED");
    expect(result.events[0]?.type).toBe("AttentionReserved");
  });

  it("releases a pre-start Window without a capability conclusion", () => {
    const reserved = reserveReviewWindow(makeReservationInput()).window;
    const released = releaseProofWindow(reserved, "CANDIDATE_DECLINED");

    expect(released.window).toMatchObject({
      state: "RELEASED",
      releaseReason: "CANDIDATE_DECLINED",
    });
    expect(released.events).toEqual([
      {
        type: "ProofWindowReleased",
        reviewWindowId: reserved.id,
        reason: "CANDIDATE_DECLINED",
      },
    ]);
  });

  it("does not allow Decline or Expiry to erase work after Stage A starts", () => {
    const active = acceptProofWindow(reserveReviewWindow(makeReservationInput()).window).window;

    expect(() => releaseProofWindow(active, "PRESTART_EXPIRED")).toThrowError(
      expect.objectContaining<Partial<ReviewWindowInvariantError>>({
        code: "ILLEGAL_STATE_TRANSITION",
      }),
    );
  });
});

describe("ReviewWindow reveal invariants", () => {
  it("rejects Reveal for an evidence-linked Close", () => {
    const evidenceReady = buildEvidenceReadyWindow();
    const closed = recordHumanOutcome(evidenceReady, "CLOSE", ["evidence-final-1"]).window;

    expect(() => authorizeLabelReveal(closed)).toThrowError(
      expect.objectContaining<Partial<ReviewWindowInvariantError>>({
        code: "REVEAL_NOT_AUTHORIZED",
      }),
    );
  });

  it("rejects Reveal until the candidate explicitly continues", () => {
    const advanced = recordHumanOutcome(buildEvidenceReadyWindow(), "ADVANCE", [
      "evidence-final-1",
    ]).window;

    expect(() => authorizeLabelReveal(advanced)).toThrowError(
      expect.objectContaining<Partial<ReviewWindowInvariantError>>({
        code: "REVEAL_NOT_AUTHORIZED",
      }),
    );
  });

  it("authorizes Reveal only after checkpoint, evidence, Advance, and continuation", () => {
    const advanced = recordHumanOutcome(buildEvidenceReadyWindow(), "ADVANCE", [
      "evidence-final-1",
    ]).window;
    const continued = recordCandidateDecision(advanced, "CONTINUE").window;
    const revealed = authorizeLabelReveal(continued);

    expect(revealed.window.state).toBe("REVEALED");
    expect(revealed.window.revealAuthorized).toBe(true);
    expect(revealed.events).toEqual([
      {
        type: "LabelRevealAuthorized",
        reviewWindowId: "review-window-test",
      },
    ]);
  });

  it("does not settle a closed Window until Ask Back is answered or waived", () => {
    const closed = recordHumanOutcome(buildEvidenceReadyWindow(), "CLOSE", [
      "evidence-final-1",
    ]).window;

    expect(() => settleReviewWindow(closed)).toThrowError(
      expect.objectContaining<Partial<ReviewWindowInvariantError>>({
        code: "ASK_BACK_UNRESOLVED",
      }),
    );

    const waived = waiveAskBack(closed).window;
    expect(settleReviewWindow(waived).window.state).toBe("SETTLED");
  });
});
