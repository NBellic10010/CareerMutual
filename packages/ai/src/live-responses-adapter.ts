import { randomUUID } from "node:crypto";

import type { HiringIntelligencePort } from "@onlyboth/application";
import {
  BuildMatchEdgeInputV2Schema,
  ChallengeRecommendationSchema,
  MatchEdgeDraftV2Schema,
  RecommendChallengesInputSchema,
  type BuildMatchEdgeInputV2,
  type ChallengeRecommendation,
  type CompileContractInput,
  type CompressEvidenceInput,
  type ContractDraft,
  type EvidenceCardDraft,
  type MatchEdgeDraftV2,
  type RecommendChallengesInput,
} from "@onlyboth/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { canonicalJson } from "./canonical-json.js";
import { BUILD_MATCH_EDGE_DEVELOPER_PROMPT } from "./build-match-edge-prompt.js";
import { HiringIntelligenceError } from "./errors.js";
import { RECOMMEND_CHALLENGES_DEVELOPER_PROMPT } from "./recommend-challenges-prompt.js";

interface ParsedResponseContent {
  readonly type?: string;
  readonly refusal?: string;
}

interface ParsedResponseOutput {
  readonly type?: string;
  readonly content?: readonly ParsedResponseContent[];
}

export interface ParsedResponsesResult {
  readonly id: string;
  readonly model: string;
  readonly status: string;
  readonly incomplete_details?: { readonly reason?: string } | null;
  readonly output: readonly ParsedResponseOutput[];
  readonly output_parsed?: unknown;
}

export interface ResponsesParseClient {
  readonly responses: {
    parse(
      request: Readonly<Record<string, unknown>>,
      options: { readonly headers: Readonly<Record<string, string>> },
    ): Promise<ParsedResponsesResult>;
  };
}

export interface LiveAdapterTelemetry {
  readonly clientRequestId: string;
  readonly providerResponseId: string;
  readonly resolvedModel: string;
}

export interface LiveAdapterOptions {
  readonly apiKey?: string;
  readonly client?: ResponsesParseClient;
  readonly clientRequestId?: () => string;
  readonly onTelemetry?: (telemetry: LiveAdapterTelemetry) => void;
  readonly timeoutMs?: number;
}

function unsupported(operation: "compileContract" | "compressEvidence"): never {
  throw new HiringIntelligenceError(
    "AI_OPERATION_NOT_IMPLEMENTED",
    operation,
    false,
    `LIVE '${operation}' is outside the Candidate 42 milestone.`,
  );
}

function hasRefusal(output: readonly ParsedResponseOutput[]): boolean {
  return output.some(
    (item) =>
      item.type === "message" && item.content?.some((content) => content.type === "refusal"),
  );
}

function mapProviderError(
  error: unknown,
  operation: "buildMatchEdge" | "recommendChallenges",
): HiringIntelligenceError {
  if (error instanceof HiringIntelligenceError) {
    return error;
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return new HiringIntelligenceError(
        "AI_RATE_LIMITED",
        operation,
        true,
        "The OpenAI request was rate limited.",
      );
    }
    if (error.status === 408 || (error.status !== undefined && error.status >= 500)) {
      return new HiringIntelligenceError(
        "AI_PROVIDER_UNAVAILABLE",
        operation,
        true,
        "The OpenAI service was temporarily unavailable.",
      );
    }
    return new HiringIntelligenceError(
      "AI_CONFIGURATION_FAILURE",
      operation,
      false,
      "The OpenAI request was rejected as non-retryable.",
    );
  }
  return new HiringIntelligenceError(
    "AI_PROVIDER_UNAVAILABLE",
    operation,
    true,
    "The OpenAI request failed before a structured response was available.",
  );
}

export class LiveResponsesHiringIntelligenceAdapter implements HiringIntelligencePort {
  readonly #client: ResponsesParseClient;
  readonly #clientRequestId: () => string;
  readonly #onTelemetry: ((telemetry: LiveAdapterTelemetry) => void) | undefined;

  public constructor(options: LiveAdapterOptions) {
    if (options.client === undefined && options.apiKey === undefined) {
      throw new HiringIntelligenceError(
        "AI_CONFIGURATION_FAILURE",
        "recommendChallenges",
        false,
        "LIVE adapter requires a Worker-only OpenAI API key.",
      );
    }
    this.#client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        maxRetries: 0,
        timeout: options.timeoutMs ?? 30_000,
      }) as unknown as ResponsesParseClient);
    this.#clientRequestId = options.clientRequestId ?? randomUUID;
    this.#onTelemetry = options.onTelemetry;
  }

  public async compileContract(_input: CompileContractInput): Promise<ContractDraft> {
    return unsupported("compileContract");
  }

  public async buildMatchEdge(input: BuildMatchEdgeInputV2): Promise<MatchEdgeDraftV2> {
    const parsedInput = BuildMatchEdgeInputV2Schema.parse(input);
    const clientRequestId = this.#clientRequestId();
    try {
      const response = await this.#client.responses.parse(
        {
          model: "gpt-5.6-sol",
          reasoning: { effort: "medium" },
          store: false,
          input: [
            { role: "developer", content: BUILD_MATCH_EDGE_DEVELOPER_PROMPT },
            { role: "user", content: canonicalJson(parsedInput) },
          ],
          text: {
            format: zodTextFormat(MatchEdgeDraftV2Schema, "onlyboth_match_edge_draft"),
          },
        },
        { headers: { "X-Client-Request-Id": clientRequestId } },
      );
      this.#onTelemetry?.({
        clientRequestId,
        providerResponseId: response.id,
        resolvedModel: response.model,
      });
      if (hasRefusal(response.output)) {
        throw new HiringIntelligenceError(
          "AI_REFUSED",
          "buildMatchEdge",
          false,
          "The model returned a refusal; human handling is required.",
        );
      }
      if (response.status !== "completed") {
        throw new HiringIntelligenceError(
          "AI_INCOMPLETE",
          "buildMatchEdge",
          false,
          `The model response was incomplete (${response.incomplete_details?.reason ?? "unknown"}).`,
        );
      }
      const result = MatchEdgeDraftV2Schema.safeParse(response.output_parsed);
      if (!result.success) {
        throw new HiringIntelligenceError(
          "AI_SCHEMA_MISMATCH",
          "buildMatchEdge",
          false,
          "The model response did not satisfy the strict MatchEdge schema.",
        );
      }
      return result.data;
    } catch (error: unknown) {
      throw mapProviderError(error, "buildMatchEdge");
    }
  }

  public async recommendChallenges(
    input: RecommendChallengesInput,
  ): Promise<ChallengeRecommendation> {
    const parsedInput = RecommendChallengesInputSchema.parse(input);
    const clientRequestId = this.#clientRequestId();
    try {
      const response = await this.#client.responses.parse(
        {
          model: "gpt-5.6-sol",
          reasoning: { effort: "medium" },
          store: false,
          input: [
            { role: "developer", content: RECOMMEND_CHALLENGES_DEVELOPER_PROMPT },
            { role: "user", content: canonicalJson(parsedInput) },
          ],
          text: {
            format: zodTextFormat(
              ChallengeRecommendationSchema,
              "onlyboth_challenge_recommendation",
            ),
          },
        },
        { headers: { "X-Client-Request-Id": clientRequestId } },
      );

      this.#onTelemetry?.({
        clientRequestId,
        providerResponseId: response.id,
        resolvedModel: response.model,
      });

      if (hasRefusal(response.output)) {
        throw new HiringIntelligenceError(
          "AI_REFUSED",
          "recommendChallenges",
          false,
          "The model returned a refusal; human handling is required.",
        );
      }
      if (response.status !== "completed") {
        throw new HiringIntelligenceError(
          "AI_INCOMPLETE",
          "recommendChallenges",
          false,
          `The model response was incomplete (${response.incomplete_details?.reason ?? "unknown"}).`,
        );
      }
      const result = ChallengeRecommendationSchema.safeParse(response.output_parsed);
      if (!result.success) {
        throw new HiringIntelligenceError(
          "AI_SCHEMA_MISMATCH",
          "recommendChallenges",
          false,
          "The model response did not satisfy the strict output schema.",
        );
      }
      return result.data;
    } catch (error: unknown) {
      throw mapProviderError(error, "recommendChallenges");
    }
  }

  public async compressEvidence(_input: CompressEvidenceInput): Promise<EvidenceCardDraft> {
    return unsupported("compressEvidence");
  }
}
