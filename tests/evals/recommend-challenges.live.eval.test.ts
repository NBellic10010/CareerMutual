import { readFileSync } from "node:fs";

import { ChallengeCatalogRegistry } from "../../packages/challenge-catalog/src/index";
import {
  LiveResponsesHiringIntelligenceAdapter,
  validateChallengeRecommendation,
} from "../../packages/ai/src/index";
import { describe, expect, it } from "vitest";

import { RECOMMEND_CHALLENGES_EVAL_CORPUS } from "./recommend-challenges-corpus";

const apiKey = process.env.OPENAI_API_KEY;
if (apiKey === undefined || apiKey.length === 0) {
  throw new Error(
    "BLOCKED: test:evals:live requires a Worker-only OPENAI_API_KEY. No case was skipped or substituted.",
  );
}

const manifestJson = readFileSync(
  new URL("../../challenges/payment-retry/v1/manifest.json", import.meta.url),
  "utf8",
);
const lockJson = readFileSync(
  new URL("../../packages/challenge-catalog/src/catalog.lock.json", import.meta.url),
  "utf8",
);

describe("LIVE recommendChallenges model eval", () => {
  it("meets all hard gates and the expert-recognition threshold", async () => {
    const catalog = ChallengeCatalogRegistry.fromJson(manifestJson, lockJson);
    const adapter = new LiveResponsesHiringIntelligenceAdapter({ apiKey });
    let hardGatePasses = 0;
    let normalExpertHits = 0;

    for (const evalCase of RECOMMEND_CHALLENGES_EVAL_CORPUS) {
      const draft = await adapter.recommendChallenges(evalCase.input);
      const output = validateChallengeRecommendation(
        evalCase.input,
        draft,
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

    expect(hardGatePasses).toBe(12);
    expect(normalExpertHits).toBeGreaterThanOrEqual(5);
  });
});
