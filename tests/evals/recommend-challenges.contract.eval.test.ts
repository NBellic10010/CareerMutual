import { readFileSync } from "node:fs";

import { ChallengeCatalogRegistry } from "../../packages/challenge-catalog/src/index";
import { validateChallengeRecommendation } from "../../packages/ai/src/index";
import { describe, expect, it } from "vitest";

import { RECOMMEND_CHALLENGES_EVAL_CORPUS } from "./recommend-challenges-corpus";

const manifestJson = readFileSync(
  new URL("../../challenges/payment-retry/v1/manifest.json", import.meta.url),
  "utf8",
);
const lockJson = readFileSync(
  new URL("../../packages/challenge-catalog/src/catalog.lock.json", import.meta.url),
  "utf8",
);

describe("recommendChallenges 12-case contract eval", () => {
  it("passes every Schema, source, Catalog, no-leak, and no-decision hard gate", () => {
    const catalog = ChallengeCatalogRegistry.fromJson(manifestJson, lockJson);
    let hardGatePasses = 0;
    let normalExpertHits = 0;

    for (const evalCase of RECOMMEND_CHALLENGES_EVAL_CORPUS) {
      const output = validateChallengeRecommendation(
        evalCase.input,
        evalCase.contractFixture,
        catalog,
        catalog.getVersionPin(),
      );
      hardGatePasses += 1;
      const selectedRefs =
        output.decision === "recommend"
          ? output.recommendations.map(
              (recommendation) => `${recommendation.challenge_id}@${recommendation.version}`,
            )
          : [];
      if (
        evalCase.kind === "NORMAL" &&
        selectedRefs.some((reference) => evalCase.expectedChallengeRefs.includes(reference))
      ) {
        normalExpertHits += 1;
      }
      if (evalCase.kind === "INSUFFICIENT") {
        expect(output.decision, evalCase.id).toBe("needs_human");
      }
    }

    expect(RECOMMEND_CHALLENGES_EVAL_CORPUS).toHaveLength(12);
    expect(hardGatePasses).toBe(12);
    expect(normalExpertHits).toBeGreaterThanOrEqual(5);
  });
});
