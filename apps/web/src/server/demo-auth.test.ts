import { describe, expect, it } from "vitest";

import { DemoAuthConfigurationError, issueDemoSession, verifyDemoSession } from "./demo-auth.js";

const ENVIRONMENT = {
  DEMO_MODE: "true",
  DEMO_SESSION_SECRET: "synthetic-test-secret-with-at-least-32-characters",
};
const NOW = new Date("2026-07-19T12:00:00.000Z");

describe("signed demo role sessions", () => {
  it("binds separate HttpOnly session payloads to Sarah and registered Candidates", () => {
    const employer = issueDemoSession("EMPLOYER", ENVIRONMENT, NOW);
    const candidate = issueDemoSession("CANDIDATE", ENVIRONMENT, NOW);
    const maya = issueDemoSession("CANDIDATE", ENVIRONMENT, NOW, "candidate-17");

    expect(verifyDemoSession(employer.token, "EMPLOYER", ENVIRONMENT, NOW)).toMatchObject({
      actorId: "reviewer-sarah-chen",
      role: "EMPLOYER",
    });
    expect(verifyDemoSession(candidate.token, "CANDIDATE", ENVIRONMENT, NOW)).toMatchObject({
      actorId: "candidate-42",
      role: "CANDIDATE",
    });
    expect(verifyDemoSession(maya.token, "CANDIDATE", ENVIRONMENT, NOW)).toMatchObject({
      actorId: "candidate-17",
      role: "CANDIDATE",
    });
    expect(verifyDemoSession(employer.token, "CANDIDATE", ENVIRONMENT, NOW)).toBeNull();
    expect(verifyDemoSession(candidate.token, "EMPLOYER", ENVIRONMENT, NOW)).toBeNull();
  });

  it("rejects tampering, expiry, and a different signing secret", () => {
    const { token } = issueDemoSession("EMPLOYER", ENVIRONMENT, NOW);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(verifyDemoSession(tampered, "EMPLOYER", ENVIRONMENT, NOW)).toBeNull();
    expect(
      verifyDemoSession(token, "EMPLOYER", ENVIRONMENT, new Date("2027-07-19T11:59:59.000Z")),
    ).not.toBeNull();
    expect(
      verifyDemoSession(token, "EMPLOYER", ENVIRONMENT, new Date("2027-07-19T12:00:01.000Z")),
    ).toBeNull();
    expect(
      verifyDemoSession(
        token,
        "EMPLOYER",
        { ...ENVIRONMENT, DEMO_SESSION_SECRET: "another-32-character-synthetic-secret-value" },
        NOW,
      ),
    ).toBeNull();
  });

  it("fails closed outside DEMO_MODE or without a strong signing secret", () => {
    expect(() => issueDemoSession("EMPLOYER", {}, NOW)).toThrowError(DemoAuthConfigurationError);
    expect(() =>
      issueDemoSession("EMPLOYER", { DEMO_MODE: "true", DEMO_SESSION_SECRET: "short" }, NOW),
    ).toThrowError(DemoAuthConfigurationError);
    expect(() =>
      issueDemoSession("CANDIDATE", ENVIRONMENT, NOW, "candidate-not-registered"),
    ).toThrowError(DemoAuthConfigurationError);
    expect(() => issueDemoSession("EMPLOYER", ENVIRONMENT, NOW, "candidate-17")).toThrowError(
      DemoAuthConfigurationError,
    );
  });
});
