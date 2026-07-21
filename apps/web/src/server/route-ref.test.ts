import { describe, expect, it } from "vitest";

import { decodeRouteRef } from "./route-ref.js";

describe("decodeRouteRef", () => {
  it.each([
    ["functional-demo-job:opportunity:1", "functional-demo-job:opportunity:1"],
    ["functional-demo-job%3Aopportunity%3A1", "functional-demo-job:opportunity:1"],
    ["functional-demo-job%253Aopportunity%253A1", "functional-demo-job:opportunity:1"],
  ])("normalizes raw and encoded opaque references", (input, expected) => {
    expect(decodeRouteRef(input)).toBe(expected);
  });

  it("leaves malformed URL encoding for downstream validation instead of throwing", () => {
    expect(decodeRouteRef("answer-session:%E0%A4%A")).toBe("answer-session:%E0%A4%A");
  });
});
