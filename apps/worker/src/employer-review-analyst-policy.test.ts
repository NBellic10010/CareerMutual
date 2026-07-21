import { describe, expect, it } from "vitest";

import {
  EmployerReviewAnalystPolicyError,
  loadEmployerReviewAnalystRuntimePolicy,
} from "./employer-review-analyst-policy.js";

describe("loadEmployerReviewAnalystRuntimePolicy", () => {
  it("keeps the platform disabled and Sol-pinned by default", () => {
    expect(loadEmployerReviewAnalystRuntimePolicy({})).toEqual({
      enabled: false,
      mode: "LIVE",
      model: "gpt-5.6-sol",
    });
  });

  it("allows an explicit LIVE Luna Worker policy", () => {
    expect(
      loadEmployerReviewAnalystRuntimePolicy({
        EMPLOYER_REVIEW_AI_ENABLED: "true",
        EMPLOYER_REVIEW_AI_MODE: "LIVE",
        EMPLOYER_REVIEW_AI_MODEL: "gpt-5.6-luna",
      }),
    ).toEqual({ enabled: true, mode: "LIVE", model: "gpt-5.6-luna" });
  });

  it.each([
    ["EMPLOYER_REVIEW_AI_ENABLED", { EMPLOYER_REVIEW_AI_ENABLED: "yes" }],
    ["EMPLOYER_REVIEW_AI_MODE", { EMPLOYER_REVIEW_AI_MODE: "CACHED_AI" }],
    ["EMPLOYER_REVIEW_AI_MODEL", { EMPLOYER_REVIEW_AI_MODEL: "gpt-5.4-mini" }],
  ] as const)("fails closed for invalid %s", (field, environment) => {
    expect(() => loadEmployerReviewAnalystRuntimePolicy(environment)).toThrowError(
      EmployerReviewAnalystPolicyError,
    );
    expect(() => loadEmployerReviewAnalystRuntimePolicy(environment)).toThrow(field);
  });
});
