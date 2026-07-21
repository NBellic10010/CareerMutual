import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PrototypeCanvas } from "./prototype-experience";
import { SYNTHETIC_PRIVATE_LABEL_VALUES } from "./prototype-fixtures";
import {
  INITIAL_PROTOTYPE_STATE,
  advancePrototype,
  prototypeReducer,
  type PrototypeState,
} from "./prototype-state";

function render(state: PrototypeState): string {
  return renderToStaticMarkup(createElement(PrototypeCanvas, { state, dispatch: () => undefined }));
}

function completeAnswer(): PrototypeState {
  let state = advancePrototype(INITIAL_PROTOTYPE_STATE, { type: "REGISTER_INTEREST" });
  state = advancePrototype(state, { type: "SIMULATE_SLOT_AVAILABLE" });
  state = advancePrototype(state, { type: "ACCEPT_BACKED_OFFER" });
  state = prototypeReducer(state, {
    type: "EDIT_ANSWER",
    value:
      "Persist the idempotency record and payment transition in one transaction, then replay the stored result.",
  });
  state = advancePrototype(state, { type: "RUN_VISIBLE_TESTS" });
  return advancePrototype(state, { type: "SUBMIT_ANSWER" });
}

function completeReview(): PrototypeState {
  let state = prototypeReducer(completeAnswer(), { type: "SET_ROLE", role: "EMPLOYER" });
  state = prototypeReducer(state, {
    type: "SET_REVIEW_DECISION",
    decision: "ADVANCE_ELIGIBLE",
  });
  state = prototypeReducer(state, { type: "TOGGLE_EVIDENCE", evidenceRef: "event-E17" });
  state = prototypeReducer(state, {
    type: "SET_STILL_UNKNOWN",
    value: "Cross-region recovery remains untested.",
  });
  return advancePrototype(state, { type: "RECORD_HUMAN_REVIEW" });
}

describe("prototype role rendering boundaries", () => {
  it("keeps synthetic Resume values out of the Employer DOM before Advancement", () => {
    const employerState = prototypeReducer(completeAnswer(), {
      type: "SET_ROLE",
      role: "EMPLOYER",
    });
    const markup = render(employerState);

    for (const privateValue of SYNTHETIC_PRIVATE_LABEL_VALUES) {
      expect(markup).not.toContain(privateValue);
    }
    expect(markup).toContain("Anonymous Answer 08");
    expect(markup).toContain("Evidence-linked human review");
    expect(markup).toContain("Still unknown");
    expect(markup).not.toMatch(/Choose as Direct/iu);
  });

  it("keeps Cohort and allocation labels out of Candidate rendering", () => {
    const candidateState = prototypeReducer(completeReview(), {
      type: "SET_ROLE",
      role: "CANDIDATE",
    });
    const markup = render(candidateState);

    expect(markup).toContain("Sarah is completing the backed review");
    expect(markup).not.toMatch(/Direct|Explore|Cohort|answer-0[1-7]/iu);
  });

  it("pins Evidence ahead of the Resume after backed Advancement", () => {
    let revealed = prototypeReducer(completeReview(), {
      type: "OPEN_ADVANCEMENT_CONFIRMATION",
      answerRef: "answer-08",
    });
    revealed = advancePrototype(revealed, { type: "CONFIRM_ADVANCEMENT" });
    const markup = render(revealed);

    expect(markup).toContain("Selection committed before reveal");
    expect(markup).toContain("Evidence stays first");
    expect(markup).toContain("Deep Proof attention held");
    for (const privateValue of SYNTHETIC_PRIVATE_LABEL_VALUES) {
      expect(markup).toContain(privateValue);
    }
    expect(markup.indexOf("Evidence stays first")).toBeLessThan(markup.indexOf("Resume v3"));
  });
});
