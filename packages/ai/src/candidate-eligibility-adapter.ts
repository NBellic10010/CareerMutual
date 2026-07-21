import { createHash } from "node:crypto";

import type { CandidateEligibilityMatchPort } from "@onlyboth/application";
import {
  CandidateEligibilityMatchInputSchema,
  CandidateEligibilityMatchOutputSchema,
  type CandidateEligibilityMatchInput,
  type CandidateEligibilityMatchOutput,
} from "@onlyboth/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";

import { canonicalJson } from "./canonical-json.js";
import { CANDIDATE_ELIGIBILITY_DEVELOPER_PROMPT } from "./candidate-eligibility-prompt.js";
import { HiringIntelligenceError } from "./errors.js";

interface Content {
  readonly type?: string;
  readonly refusal?: string;
}
interface Output {
  readonly type?: string;
  readonly content?: readonly Content[];
}

export interface CandidateEligibilityResponsesResult {
  readonly id: string;
  readonly model: string;
  readonly status: string;
  readonly incomplete_details?: { readonly reason?: string } | null;
  readonly output: readonly Output[];
  readonly output_parsed?: unknown;
}

export interface CandidateEligibilityResponsesClient {
  readonly responses: {
    parse(
      request: Readonly<Record<string, unknown>>,
      options: { readonly headers: Readonly<Record<string, string>> },
    ): Promise<CandidateEligibilityResponsesResult>;
  };
}

function providerError(error: unknown): HiringIntelligenceError {
  if (error instanceof HiringIntelligenceError) return error;
  if (error instanceof ZodError) {
    return new HiringIntelligenceError(
      "AI_SCHEMA_MISMATCH",
      "deriveCandidateEligibilityMatches",
      false,
      "Candidate eligibility output did not satisfy the strict schema.",
    );
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return new HiringIntelligenceError(
        "AI_RATE_LIMITED",
        "deriveCandidateEligibilityMatches",
        true,
        "Candidate eligibility matching was rate limited.",
      );
    }
    if (error.status === 408 || (error.status !== undefined && error.status >= 500)) {
      return new HiringIntelligenceError(
        "AI_PROVIDER_UNAVAILABLE",
        "deriveCandidateEligibilityMatches",
        true,
        "Candidate eligibility provider is temporarily unavailable.",
      );
    }
    return new HiringIntelligenceError(
      "AI_CONFIGURATION_FAILURE",
      "deriveCandidateEligibilityMatches",
      false,
      "Candidate eligibility request was rejected.",
    );
  }
  return new HiringIntelligenceError(
    "AI_PROVIDER_UNAVAILABLE",
    "deriveCandidateEligibilityMatches",
    true,
    "Candidate eligibility failed before a structured response was available.",
  );
}

export class LiveCandidateEligibilityMatchAdapter implements CandidateEligibilityMatchPort {
  readonly #client: CandidateEligibilityResponsesClient;
  readonly #model: string;

  public constructor(options: {
    readonly apiKey?: string;
    readonly client?: CandidateEligibilityResponsesClient;
    readonly model?: string;
    readonly timeoutMs?: number;
  }) {
    if (options.client === undefined && options.apiKey === undefined) {
      throw new HiringIntelligenceError(
        "AI_CONFIGURATION_FAILURE",
        "deriveCandidateEligibilityMatches",
        false,
        "Candidate eligibility requires a Worker-only OpenAI API key.",
      );
    }
    this.#client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        maxRetries: 0,
        timeout: options.timeoutMs ?? 30_000,
      }) as unknown as CandidateEligibilityResponsesClient);
    this.#model = options.model ?? "gpt-5.6-sol";
  }

  public async deriveMatches(
    input: CandidateEligibilityMatchInput,
    clientRequestId: string,
  ): Promise<{
    readonly output: CandidateEligibilityMatchOutput;
    readonly providerResponseId: string;
    readonly resolvedModel: string;
  }> {
    const parsedInput = CandidateEligibilityMatchInputSchema.parse(input);
    try {
      const response = await this.#client.responses.parse(
        {
          model: this.#model,
          reasoning: { effort: "medium" },
          store: false,
          safety_identifier: createHash("sha256")
            .update(parsedInput.candidate_ref, "utf8")
            .digest("hex"),
          input: [
            { role: "developer", content: CANDIDATE_ELIGIBILITY_DEVELOPER_PROMPT },
            { role: "user", content: canonicalJson(parsedInput) },
          ],
          text: {
            format: zodTextFormat(
              CandidateEligibilityMatchOutputSchema,
              "onlyboth_candidate_eligibility_matches",
            ),
          },
        },
        { headers: { "X-Client-Request-Id": clientRequestId } },
      );
      if (
        response.output.some(
          (item) =>
            item.type === "message" && item.content?.some((content) => content.type === "refusal"),
        )
      ) {
        throw new HiringIntelligenceError(
          "AI_REFUSED",
          "deriveCandidateEligibilityMatches",
          false,
          "Candidate eligibility returned a refusal.",
        );
      }
      if (response.status !== "completed") {
        throw new HiringIntelligenceError(
          "AI_INCOMPLETE",
          "deriveCandidateEligibilityMatches",
          false,
          `Candidate eligibility was incomplete (${response.incomplete_details?.reason ?? "unknown"}).`,
        );
      }
      const output = CandidateEligibilityMatchOutputSchema.safeParse(response.output_parsed);
      if (!output.success) {
        throw new HiringIntelligenceError(
          "AI_SCHEMA_MISMATCH",
          "deriveCandidateEligibilityMatches",
          false,
          "Candidate eligibility output did not satisfy the strict schema.",
        );
      }
      return {
        output: output.data,
        providerResponseId: response.id,
        resolvedModel: response.model,
      };
    } catch (error: unknown) {
      throw providerError(error);
    }
  }
}
