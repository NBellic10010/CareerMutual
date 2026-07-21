import { buildGoldenReplayViews, loadGoldenReplay } from "../../packages/demo-replay/src/index";
import { collectObjectKeys, serializeForLeakCheck } from "../../packages/testkit/src/index";
import { describe, expect, it } from "vitest";

const sealedKeys = [
  "name",
  "schoolName",
  "previousEmployerName",
  "referralSource",
  "privateLabels",
  "counterfactual",
  "resumeRank",
] as const;

describe("role-specific Golden Replay projections", () => {
  const replay = loadGoldenReplay();
  const views = buildGoldenReplayViews(replay);

  it.each([
    ["Employer", views.employer],
    ["Candidate", views.candidates],
  ])("does not include sealed label keys in the %s payload", (_role, view) => {
    const keys = collectObjectKeys(view);
    for (const key of sealedKeys) expect(keys).not.toContain(key);
  });

  it.each([
    ["Employer", views.employer],
    ["Candidate", views.candidates],
  ])("does not include sealed label values in the %s payload", (_role, view) => {
    const serialized = serializeForLeakCheck(view);
    for (const candidate of replay.candidates) {
      for (const value of Object.values(candidate.privateLabels)) {
        expect(serialized).not.toContain(value.toLocaleLowerCase("en-US"));
      }
      expect(serialized).not.toContain(`"resumerank":${candidate.counterfactual.resumeRank}`);
    }
  });

  it("exposes counterfactual labels only through the synthetic Judge projection", () => {
    expect(views.judge.synthetic).toBe(true);
    expect(views.judge.notice).toBe("Synthetic — Pre-recorded external inputs");
    expect(views.judge.candidates.map(({ privateProfile }) => privateProfile.name)).toEqual([
      "Alex Mercer",
      "Jordan Lee",
    ]);
    expect(views.judge.candidates.map(({ counterfactual }) => counterfactual.resumeRank)).toEqual([
      1, 73,
    ]);
  });

  it("keeps the closed Candidate 17 sealed while authorizing Candidate 42", () => {
    const candidate17 = views.employer.candidates.find(
      ({ candidate }) => candidate.opaqueId === "Candidate 17",
    );
    const candidate42 = views.employer.candidates.find(
      ({ candidate }) => candidate.opaqueId === "Candidate 42",
    );

    expect(candidate17?.outcome).toBe("CLOSE");
    expect(candidate17?.revealAuthorized).toBe(false);
    expect(candidate42?.outcome).toBe("ADVANCE");
    expect(candidate42?.revealAuthorized).toBe(true);
  });
});
