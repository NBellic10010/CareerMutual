import {
  applySandboxActivity,
  initialSandboxFocusState,
  sandboxFocusEffectiveCumulativeMs,
  sandboxFocusThresholdReached,
} from "../../packages/domain/src/index";
import { describe, expect, it } from "vitest";

describe("Candidate Sandbox focus policy", () => {
  it("deduplicates blur and hidden signals into one countable away interval", () => {
    let state = initialSandboxFocusState();
    state = applySandboxActivity(state, "WINDOW_BLURRED", 1_000);
    state = applySandboxActivity(state, "VISIBILITY_HIDDEN", 1_100);
    state = applySandboxActivity(state, "WINDOW_FOCUSED", 4_000);
    expect(state.countableAwayCount).toBe(0);
    state = applySandboxActivity(state, "VISIBILITY_VISIBLE", 4_100);

    expect(state.countableAwayCount).toBe(1);
    expect(state.cumulativeAwayMs).toBe(3_100);
    expect(state.policyState).toBe("WARNED");
  });

  it("ignores a departure within the two-second grace period", () => {
    let state = applySandboxActivity(initialSandboxFocusState(), "WINDOW_BLURRED", 1_000);
    state = applySandboxActivity(state, "WINDOW_FOCUSED", 3_000);
    expect(state.countableAwayCount).toBe(0);
    expect(state.cumulativeAwayMs).toBe(0);
    expect(state.policyState).toBe("ACTIVE");
  });

  it("requests automatic submission on the second countable departure", () => {
    let state = initialSandboxFocusState();
    state = applySandboxActivity(state, "WINDOW_BLURRED", 0);
    state = applySandboxActivity(state, "WINDOW_FOCUSED", 3_000);
    state = applySandboxActivity(state, "VISIBILITY_HIDDEN", 4_000);
    state = applySandboxActivity(state, "VISIBILITY_VISIBLE", 7_000);

    expect(state.countableAwayCount).toBe(2);
    expect(state.cumulativeAwayMs).toBe(6_000);
    expect(state.policyState).toBe("AUTO_SUBMIT_PENDING");
  });

  it("lets the Worker detect fifteen seconds in a still-open away interval", () => {
    const state = applySandboxActivity(initialSandboxFocusState(), "VISIBILITY_HIDDEN", 5_000);
    expect(sandboxFocusEffectiveCumulativeMs(state, 20_000)).toBe(15_000);
    expect(sandboxFocusThresholdReached(state, 20_000)).toBe(true);
  });

  it("suppresses one bounded microphone permission dialog without creating an away event", () => {
    let state = applySandboxActivity(initialSandboxFocusState(), "SYSTEM_DIALOG_STARTED", 0);
    state = applySandboxActivity(state, "WINDOW_BLURRED", 100);
    state = applySandboxActivity(state, "VISIBILITY_HIDDEN", 200);
    state = applySandboxActivity(state, "SYSTEM_DIALOG_ENDED", 10_000);
    state = applySandboxActivity(state, "WINDOW_FOCUSED", 10_100);
    state = applySandboxActivity(state, "VISIBILITY_VISIBLE", 10_200);

    expect(state.countableAwayCount).toBe(0);
    expect(state.systemDialogUsed).toBe(true);

    const repeated = applySandboxActivity(state, "SYSTEM_DIALOG_STARTED", 11_000);
    expect(repeated.systemDialogUntilMs).toBeNull();
  });

  it("counts time beyond the bounded microphone permission grace", () => {
    let state = applySandboxActivity(initialSandboxFocusState(), "SYSTEM_DIALOG_STARTED", 0);
    state = applySandboxActivity(state, "WINDOW_BLURRED", 100);
    state = applySandboxActivity(state, "SYSTEM_DIALOG_ENDED", 33_000);
    state = applySandboxActivity(state, "WINDOW_FOCUSED", 35_100);

    expect(state.countableAwayCount).toBe(1);
    expect(state.cumulativeAwayMs).toBe(5_100);
    expect(state.policyState).toBe("WARNED");
  });
});
