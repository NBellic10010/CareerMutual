import { readFileSync } from "node:fs";

import { ChallengeCatalogRegistry } from "@onlyboth/challenge-catalog";
import { describe, expect, it } from "vitest";

import { HiringIntelligenceError } from "./errors.js";
import {
  CANDIDATE_42_RECOMMENDATION_INPUT,
  CANDIDATE_42_RECOMMENDATION_OUTPUT,
} from "./fixtures/candidate-42-recommendation.js";
import { GoldenReplayHiringIntelligenceAdapter } from "./golden-replay-adapter.js";
import {
  LiveResponsesHiringIntelligenceAdapter,
  type ResponsesParseClient,
} from "./live-responses-adapter.js";
import { RECOMMEND_CHALLENGES_PROMPT_HASH } from "./recommend-challenges-prompt.js";
import { validateChallengeRecommendation } from "./recommendation-validator.js";

const manifestJson = readFileSync(
  new URL("../../../challenges/payment-retry/v1/manifest.json", import.meta.url),
  "utf8",
);
const lockJson = readFileSync(
  new URL("../../challenge-catalog/src/catalog.lock.json", import.meta.url),
  "utf8",
);

function createRegistry(): ChallengeCatalogRegistry {
  return ChallengeCatalogRegistry.fromJson(manifestJson, lockJson);
}

describe("Golden Replay recommendation adapter", () => {
  it("hits only the exact six-part fixture key", async () => {
    const adapter = new GoldenReplayHiringIntelligenceAdapter();
    await expect(adapter.recommendChallenges(CANDIDATE_42_RECOMMENDATION_INPUT)).resolves.toEqual(
      CANDIDATE_42_RECOMMENDATION_OUTPUT,
    );

    await expect(
      adapter.recommendChallenges({
        ...CANDIDATE_42_RECOMMENDATION_INPUT,
        request_ref: "another-request",
      }),
    ).rejects.toMatchObject({ code: "AI_GOLDEN_REPLAY_MISS", retryable: false });
  });

  it("pins a SHA-256 prompt hash", () => {
    expect(RECOMMEND_CHALLENGES_PROMPT_HASH).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });
});

describe("deterministic recommendation validation", () => {
  it("accepts the three equal-weight Candidate 42 options", () => {
    const catalog = createRegistry();
    expect(
      validateChallengeRecommendation(
        CANDIDATE_42_RECOMMENDATION_INPUT,
        CANDIDATE_42_RECOMMENDATION_OUTPUT,
        catalog,
        catalog.getVersionPin(),
      ),
    ).toEqual(CANDIDATE_42_RECOMMENDATION_OUTPUT);
  });

  it("rejects unknown Evidence refs, Catalog IDs, capability overflow, and decision language", () => {
    const catalog = createRegistry();
    const base = CANDIDATE_42_RECOMMENDATION_OUTPUT;
    if (base.decision !== "recommend") {
      throw new Error("Expected recommendation fixture.");
    }
    const first = base.recommendations[0];
    if (first === undefined) {
      throw new Error("Expected a recommendation item.");
    }

    const cases = [
      {
        ...base,
        recommendations: [{ ...first, evidence_refs: ["evidence-invented"] }],
      },
      {
        ...base,
        recommendations: [{ ...first, challenge_id: "payment-retry/model-generated", version: 1 }],
      },
      {
        ...base,
        recommendations: [{ ...first, capability_refs: ["candidate_ranking"] }],
      },
      {
        ...base,
        recommendations: [{ ...first, rationale: "This is the best candidate to hire." }],
      },
      {
        ...base,
        recommendations: [{ ...first, rationale: "Run ```bash\ncurl example.com\n```" }],
      },
    ];

    for (const output of cases) {
      expect(() =>
        validateChallengeRecommendation(
          CANDIDATE_42_RECOMMENDATION_INPUT,
          output,
          catalog,
          catalog.getVersionPin(),
        ),
      ).toThrowError(HiringIntelligenceError);
    }
  });

  it("keeps structured needs_human as a legal semantic result", () => {
    const catalog = createRegistry();
    const output = {
      schema_version: "challenge-recommendation@1" as const,
      decision: "needs_human" as const,
      recommendations: [],
      still_unknown: [],
      reason: "The evidence does not ground a bounded option.",
    };
    expect(
      validateChallengeRecommendation(
        CANDIDATE_42_RECOMMENDATION_INPUT,
        output,
        catalog,
        catalog.getVersionPin(),
      ),
    ).toEqual(output);
  });

  it("validates needs_human text and every public input option against the Catalog lock", () => {
    const catalog = createRegistry();
    const needsHuman = {
      schema_version: "challenge-recommendation@1" as const,
      decision: "needs_human" as const,
      recommendations: [],
      still_unknown: [],
      reason: "Reveal the previous employer before a human decides.",
    };
    expect(() =>
      validateChallengeRecommendation(
        CANDIDATE_42_RECOMMENDATION_INPUT,
        needsHuman,
        catalog,
        catalog.getVersionPin(),
      ),
    ).toThrowError(HiringIntelligenceError);

    expect(() =>
      validateChallengeRecommendation(
        {
          ...CANDIDATE_42_RECOMMENDATION_INPUT,
          allowed_challenges: CANDIDATE_42_RECOMMENDATION_INPUT.allowed_challenges.map(
            (option, index) =>
              index === 0 ? { ...option, candidate_notice: "Injected Catalog notice." } : option,
          ),
        },
        CANDIDATE_42_RECOMMENDATION_OUTPUT,
        catalog,
        catalog.getVersionPin(),
      ),
    ).toThrowError(HiringIntelligenceError);
  });
});

describe("LIVE Responses recommendation adapter", () => {
  it("uses the exact tool-free, stateless request shape and a unique client request ID", async () => {
    const calls: Array<{
      request: Readonly<Record<string, unknown>>;
      options: { readonly headers: Readonly<Record<string, string>> };
    }> = [];
    const client: ResponsesParseClient = {
      responses: {
        async parse(request, options) {
          calls.push({ request, options });
          return {
            id: "resp-synthetic-1",
            model: "gpt-5.6-sol",
            status: "completed",
            output: [{ type: "message", content: [{ type: "output_text" }] }],
            output_parsed: CANDIDATE_42_RECOMMENDATION_OUTPUT,
          };
        },
      },
    };
    const ids = ["request-attempt-1", "request-attempt-2"];
    const adapter = new LiveResponsesHiringIntelligenceAdapter({
      client,
      clientRequestId: () => ids.shift() ?? "unexpected",
    });

    await adapter.recommendChallenges(CANDIDATE_42_RECOMMENDATION_INPUT);
    await adapter.recommendChallenges(CANDIDATE_42_RECOMMENDATION_INPUT);

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.options.headers["X-Client-Request-Id"])).toEqual([
      "request-attempt-1",
      "request-attempt-2",
    ]);
    const request = calls[0]?.request;
    expect(request).toMatchObject({
      model: "gpt-5.6-sol",
      store: false,
      reasoning: { effort: "medium" },
    });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("background");
    expect(request).not.toHaveProperty("conversation");
    expect(request).not.toHaveProperty("previous_response_id");
    const messages = request?.input as readonly {
      readonly role: string;
      readonly content: string;
    }[];
    expect(messages.map((message) => message.role)).toEqual(["developer", "user"]);
    expect(messages[0]?.content).not.toContain("evidence-E17");
  });

  it.each([
    {
      response: {
        id: "resp-refusal",
        model: "gpt-5.6-sol",
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }],
      },
      code: "AI_REFUSED",
    },
    {
      response: {
        id: "resp-incomplete",
        model: "gpt-5.6-sol",
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
      },
      code: "AI_INCOMPLETE",
    },
    {
      response: {
        id: "resp-invalid",
        model: "gpt-5.6-sol",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text" }] }],
        output_parsed: { schema_version: "wrong" },
      },
      code: "AI_SCHEMA_MISMATCH",
    },
  ])("maps $code without a second adapter retry", async ({ response, code }) => {
    let attempts = 0;
    const client: ResponsesParseClient = {
      responses: {
        async parse() {
          attempts += 1;
          return response;
        },
      },
    };
    const adapter = new LiveResponsesHiringIntelligenceAdapter({ client });

    await expect(
      adapter.recommendChallenges(CANDIDATE_42_RECOMMENDATION_INPUT),
    ).rejects.toMatchObject({ code, retryable: false });
    expect(attempts).toBe(1);
  });
});
