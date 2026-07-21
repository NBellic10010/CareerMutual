import { createHash } from "node:crypto";

import type { CandidateJobDiscoveryPort } from "@onlyboth/application";
import {
  CandidateJobDiscoveryInputSchema,
  CandidateJobDiscoveryOutputSchema,
  type CandidateJobDiscoveryInput,
  type CandidateJobDiscoveryOutput,
} from "@onlyboth/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";

import { canonicalJson } from "./canonical-json.js";
import { CANDIDATE_DISCOVERY_DEVELOPER_PROMPT } from "./candidate-discovery-prompt.js";
import { HiringIntelligenceError } from "./errors.js";

interface DiscoveryResponseContent {
  readonly type?: string;
  readonly refusal?: string;
}

interface DiscoveryResponseOutput {
  readonly type?: string;
  readonly content?: readonly DiscoveryResponseContent[];
}

export interface CandidateDiscoveryResponsesResult {
  readonly id: string;
  readonly model: string;
  readonly status: string;
  readonly incomplete_details?: { readonly reason?: string } | null;
  readonly output: readonly DiscoveryResponseOutput[];
  readonly output_parsed?: unknown;
}

export interface CandidateDiscoveryResponsesClient {
  readonly responses: {
    parse(
      request: Readonly<Record<string, unknown>>,
      options: { readonly headers: Readonly<Record<string, string>> },
    ): Promise<CandidateDiscoveryResponsesResult>;
  };
}

export interface CandidateDiscoveryAdapterOptions {
  readonly apiKey?: string;
  readonly client?: CandidateDiscoveryResponsesClient;
  /** Explicit model policy supplied by a composition root or isolated eval harness. */
  readonly model?: string;
  readonly timeoutMs?: number;
}

function hasRefusal(output: readonly DiscoveryResponseOutput[]): boolean {
  return output.some(
    (item) =>
      item.type === "message" && item.content?.some((content) => content.type === "refusal"),
  );
}

function providerError(error: unknown): HiringIntelligenceError {
  if (error instanceof HiringIntelligenceError) return error;
  if (error instanceof ZodError) {
    return new HiringIntelligenceError(
      "AI_SCHEMA_MISMATCH",
      "deriveCandidateJobSignals",
      false,
      "Candidate discovery did not satisfy the strict output schema.",
    );
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return new HiringIntelligenceError(
        "AI_RATE_LIMITED",
        "deriveCandidateJobSignals",
        true,
        "Candidate discovery was rate limited.",
      );
    }
    if (error.status === 408 || (error.status !== undefined && error.status >= 500)) {
      return new HiringIntelligenceError(
        "AI_PROVIDER_UNAVAILABLE",
        "deriveCandidateJobSignals",
        true,
        "Candidate discovery provider is temporarily unavailable.",
      );
    }
    return new HiringIntelligenceError(
      "AI_CONFIGURATION_FAILURE",
      "deriveCandidateJobSignals",
      false,
      "Candidate discovery request was rejected as non-retryable.",
    );
  }
  return new HiringIntelligenceError(
    "AI_PROVIDER_UNAVAILABLE",
    "deriveCandidateJobSignals",
    true,
    "Candidate discovery failed before a structured response was available.",
  );
}

export class LiveCandidateJobDiscoveryAdapter implements CandidateJobDiscoveryPort {
  readonly #client: CandidateDiscoveryResponsesClient;
  readonly #model: string;

  public constructor(options: CandidateDiscoveryAdapterOptions) {
    if (options.client === undefined && options.apiKey === undefined) {
      throw new HiringIntelligenceError(
        "AI_CONFIGURATION_FAILURE",
        "deriveCandidateJobSignals",
        false,
        "Candidate discovery requires a Worker-only OpenAI API key.",
      );
    }
    this.#client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        maxRetries: 0,
        timeout: options.timeoutMs ?? 30_000,
      }) as unknown as CandidateDiscoveryResponsesClient);
    this.#model = options.model ?? "gpt-5.6-luna";
  }

  public async deriveSignals(
    input: CandidateJobDiscoveryInput,
    clientRequestId: string,
  ): Promise<{
    readonly output: CandidateJobDiscoveryOutput;
    readonly providerResponseId: string;
    readonly resolvedModel: string;
  }> {
    const parsedInput = CandidateJobDiscoveryInputSchema.parse(input);
    try {
      const response = await this.#client.responses.parse(
        {
          model: this.#model,
          reasoning: { effort: "low" },
          store: false,
          safety_identifier: createHash("sha256")
            .update(parsedInput.candidate_ref, "utf8")
            .digest("hex"),
          input: [
            { role: "developer", content: CANDIDATE_DISCOVERY_DEVELOPER_PROMPT },
            { role: "user", content: canonicalJson(parsedInput) },
          ],
          text: {
            format: zodTextFormat(
              CandidateJobDiscoveryOutputSchema,
              "onlyboth_candidate_job_discovery",
            ),
          },
        },
        { headers: { "X-Client-Request-Id": clientRequestId } },
      );
      if (hasRefusal(response.output)) {
        throw new HiringIntelligenceError(
          "AI_REFUSED",
          "deriveCandidateJobSignals",
          false,
          "Candidate discovery returned a refusal.",
        );
      }
      if (response.status !== "completed") {
        throw new HiringIntelligenceError(
          "AI_INCOMPLETE",
          "deriveCandidateJobSignals",
          false,
          `Candidate discovery was incomplete (${response.incomplete_details?.reason ?? "unknown"}).`,
        );
      }
      const output = CandidateJobDiscoveryOutputSchema.safeParse(response.output_parsed);
      if (!output.success) {
        throw new HiringIntelligenceError(
          "AI_SCHEMA_MISMATCH",
          "deriveCandidateJobSignals",
          false,
          "Candidate discovery did not satisfy the strict output schema.",
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
