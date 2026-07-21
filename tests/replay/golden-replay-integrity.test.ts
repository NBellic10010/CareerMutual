import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ChallengeCatalogRegistry } from "@onlyboth/challenge-catalog";
import { buildGoldenReplayViews, loadGoldenReplay } from "@onlyboth/demo-replay";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function loadCatalog(): ChallengeCatalogRegistry {
  return ChallengeCatalogRegistry.fromJson(
    readFileSync(join(root, "challenges/payment-retry/v1/manifest.json"), "utf8"),
    readFileSync(join(root, "packages/challenge-catalog/src/catalog.lock.json"), "utf8"),
  );
}

describe("Golden Replay integrity", () => {
  const replay = loadGoldenReplay();

  it("is explicitly synthetic and produces all three role projections", () => {
    const views = buildGoldenReplayViews(replay);

    expect(replay.synthetic).toBe(true);
    expect(replay.notice).toBe("Synthetic — Pre-recorded external inputs");
    expect(views.employer.view).toBe("EMPLOYER");
    expect(Object.values(views.candidates)).toHaveLength(2);
    expect(views.judge.view).toBe("SYNTHETIC_JUDGE");
  });

  it("references only challenges in the pinned Catalog", () => {
    const catalog = loadCatalog();
    const pin = catalog.getVersionPin();

    for (const candidate of replay.candidates) {
      expect(() =>
        catalog.resolveExecutableChallenge(candidate.proof.selectedChallengeId, pin),
      ).not.toThrow();
    }
  });

  it("keeps the closed candidate sealed and reveals only mutual Advance", () => {
    const closed = replay.candidates.find(({ outcome }) => outcome === "CLOSE");
    const advanced = replay.candidates.find(({ outcome }) => outcome === "ADVANCE");

    expect(closed?.revealAuthorized).toBe(false);
    expect(advanced?.candidateContinues).toBe(true);
    expect(advanced?.revealAuthorized).toBe(true);
  });
});
