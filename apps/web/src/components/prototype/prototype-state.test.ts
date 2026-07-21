import { describe, expect, it } from "vitest";

import { INITIAL_PROTOTYPE_STATE, advancePrototype, prototypeReducer } from "./prototype-state";

describe("no-backend UI prototype state", () => {
  it("runs the backed Interest to post-answer Resume Reveal sequence", () => {
    let state = INITIAL_PROTOTYPE_STATE;

    state = advancePrototype(state, { type: "REGISTER_INTEREST" });
    expect(state.phase).toBe("WAITING_FOR_BACKED_SLOT");
    expect(state.cohortReviewed).toBe(7);

    state = advancePrototype(state, { type: "SIMULATE_SLOT_AVAILABLE" });
    expect(state.phase).toBe("BACKED_OFFERED");

    state = advancePrototype(state, { type: "ACCEPT_BACKED_OFFER" });
    expect(state.phase).toBe("ANSWER_ACTIVE");
    expect(state.conditionalRevealConsent).toBe(true);

    state = prototypeReducer(state, {
      type: "EDIT_ANSWER",
      value:
        "Persist the idempotency record and payment transition in one transaction, then replay the stored result.",
    });
    state = advancePrototype(state, { type: "RUN_VISIBLE_TESTS" });
    state = advancePrototype(state, { type: "SUBMIT_ANSWER" });
    expect(state.phase).toBe("REVIEW_PENDING");
    expect(state.resumeRevealed).toBe(false);

    state = prototypeReducer(state, { type: "SET_ROLE", role: "EMPLOYER" });
    state = prototypeReducer(state, {
      type: "SET_REVIEW_DECISION",
      decision: "ADVANCE_ELIGIBLE",
    });
    state = prototypeReducer(state, { type: "TOGGLE_EVIDENCE", evidenceRef: "event-E17" });
    state = prototypeReducer(state, {
      type: "SET_STILL_UNKNOWN",
      value: "Cross-region recovery remains untested.",
    });
    state = advancePrototype(state, { type: "RECORD_HUMAN_REVIEW" });
    expect(state.phase).toBe("COHORT_READY");
    expect(state.cohortReviewed).toBe(8);
    expect(state.slotRecycled).toBe(true);
    expect(state.nextInterestOffered).toBe(true);
    expect(state.resumeRevealed).toBe(false);

    state = prototypeReducer(state, {
      type: "OPEN_ADVANCEMENT_CONFIRMATION",
      answerRef: "answer-08",
    });
    state = advancePrototype(state, { type: "CONFIRM_ADVANCEMENT" });
    expect(state.phase).toBe("RESUME_REVEALED");
    expect(state.deepProofAttentionHeld).toBe(true);
    expect(state.resumeRevealed).toBe(true);
    expect(state.advancedAnswerRef).toBe("answer-08");
  });

  it("rejects Reveal before review, Cohort completion, consent, and Advancement", () => {
    expect(() =>
      advancePrototype(INITIAL_PROTOTYPE_STATE, { type: "CONFIRM_ADVANCEMENT" }),
    ).toThrowError(/confirmation/iu);

    const noConsent = {
      ...INITIAL_PROTOTYPE_STATE,
      role: "EMPLOYER" as const,
      phase: "COHORT_READY" as const,
      cohortReviewed: 8,
      reviewDecision: "ADVANCE_ELIGIBLE" as const,
      selectedEvidenceRefs: ["event-E17"],
      stillUnknown: "Cross-region recovery remains untested.",
      advancementConfirmationOpen: true,
      selectedAnswerRef: "answer-08",
    };
    expect(() => advancePrototype(noConsent, { type: "CONFIRM_ADVANCEMENT" })).toThrowError(
      /consent/iu,
    );
  });

  it("releases a declined Offer without a Candidate failure and resets deterministically", () => {
    let state = advancePrototype(INITIAL_PROTOTYPE_STATE, { type: "REGISTER_INTEREST" });
    state = advancePrototype(state, { type: "SIMULATE_SLOT_AVAILABLE" });
    state = advancePrototype(state, { type: "DECLINE_BACKED_OFFER" });

    expect(state.phase).toBe("OFFER_RELEASED");
    expect(state.slotRecycled).toBe(true);
    expect(state.notice).toMatch(/without penalty/iu);
    expect(prototypeReducer(state, { type: "RESET" })).toEqual(INITIAL_PROTOTYPE_STATE);
  });
});
