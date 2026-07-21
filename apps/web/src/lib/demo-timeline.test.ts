import { describe, expect, it } from "vitest";

import {
  COLD_OPEN_DURATION_SECONDS,
  clampColdOpenTime,
  formatColdOpenTime,
  getColdOpenProgress,
  getColdOpenScene,
} from "./demo-timeline";

describe("cold-open timeline", () => {
  it.each([
    [-1, "counterfactual"],
    [0, "counterfactual"],
    [6.999, "counterfactual"],
    [7, "veil"],
    [11.999, "veil"],
    [12, "attention"],
    [17.999, "attention"],
    [18, "proof"],
    [26.999, "proof"],
    [27, "reversal"],
    [30, "reversal"],
    [31, "reversal"],
  ])("maps %s seconds to the %s scene", (seconds, expectedScene) => {
    expect(getColdOpenScene(seconds).id).toBe(expectedScene);
  });

  it("clamps storyboard time without treating it as business state", () => {
    expect(clampColdOpenTime(-20)).toBe(0);
    expect(clampColdOpenTime(12.5)).toBe(12.5);
    expect(clampColdOpenTime(90)).toBe(COLD_OPEN_DURATION_SECONDS);
    expect(clampColdOpenTime(Number.NaN)).toBe(0);
  });

  it("formats the exact cue times and progress", () => {
    expect(formatColdOpenTime(0)).toBe("0:00");
    expect(formatColdOpenTime(7.9)).toBe("0:07");
    expect(formatColdOpenTime(30)).toBe("0:30");
    expect(getColdOpenProgress(15)).toBe(50);
    expect(getColdOpenProgress(100)).toBe(100);
  });
});
