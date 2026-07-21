import { createHash } from "node:crypto";

import type { EmployerReviewAnalystPort } from "@onlyboth/application";
import {
  AnswerEvidenceEdgeDraftSchema,
  AnswerEvidenceEdgeDraftV2Schema,
  BuildAnswerEvidenceEdgeInputSchema,
  type AnswerEvidenceEdgeDraft,
  type BuildAnswerEvidenceEdgeInput,
} from "@onlyboth/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";

import { canonicalJson } from "./canonical-json.js";
import {
  EMPLOYER_REVIEW_ANALYST_DEVELOPER_PROMPT,
  EMPLOYER_REVIEW_ANALYST_OUTPUT_RULES,
} from "./employer-review-analyst-prompt.js";
import { HiringIntelligenceError } from "./errors.js";

interface AnalystResponse {
  readonly id: string;
  readonly model: string;
  readonly status: string;
  readonly incomplete_details?: { readonly reason?: string } | null;
  readonly output: readonly {
    readonly type?: string;
    readonly content?: readonly { readonly type?: string; readonly refusal?: string }[];
  }[];
  readonly output_parsed?: unknown;
}

export interface EmployerReviewResponsesClient {
  readonly responses: {
    parse(
      request: Readonly<Record<string, unknown>>,
      options: { readonly headers: Readonly<Record<string, string>> },
    ): Promise<AnalystResponse>;
  };
}

export function mapEmployerReviewAnalystError(error: unknown): HiringIntelligenceError {
  if (error instanceof HiringIntelligenceError) return error;
  if (error instanceof ZodError) {
    return new HiringIntelligenceError(
      "AI_SCHEMA_MISMATCH",
      "buildAnswerEvidenceEdge",
      false,
      "Employer review analysis did not satisfy the strict schema.",
    );
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new HiringIntelligenceError(
      "AI_TIMEOUT",
      "buildAnswerEvidenceEdge",
      true,
      "Employer review analysis provider request timed out.",
    );
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new HiringIntelligenceError(
      "AI_PROVIDER_UNAVAILABLE",
      "buildAnswerEvidenceEdge",
      true,
      "Employer review analysis provider connection failed.",
    );
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429 && error.code === "insufficient_quota") {
      return new HiringIntelligenceError(
        "AI_CONFIGURATION_FAILURE",
        "buildAnswerEvidenceEdge",
        false,
        "Employer review analysis provider quota is unavailable.",
      );
    }
    if (error.status === 429) {
      return new HiringIntelligenceError(
        "AI_RATE_LIMITED",
        "buildAnswerEvidenceEdge",
        true,
        "Employer review analysis provider rate limit was reached.",
      );
    }
    if (error.status === 408) {
      return new HiringIntelligenceError(
        "AI_TIMEOUT",
        "buildAnswerEvidenceEdge",
        true,
        "Employer review analysis provider request timed out.",
      );
    }
    if ((error.status ?? 0) >= 500) {
      return new HiringIntelligenceError(
        "AI_PROVIDER_UNAVAILABLE",
        "buildAnswerEvidenceEdge",
        true,
        "Employer review analysis provider is temporarily unavailable.",
      );
    }
    return new HiringIntelligenceError(
      "AI_CONFIGURATION_FAILURE",
      "buildAnswerEvidenceEdge",
      false,
      "Employer review analysis provider request failed.",
    );
  }
  return new HiringIntelligenceError(
    "AI_PROVIDER_UNAVAILABLE",
    "buildAnswerEvidenceEdge",
    true,
    "Employer review analysis failed before a structured response was available.",
  );
}

export class LiveEmployerReviewAnalystAdapter implements EmployerReviewAnalystPort {
  readonly #client: EmployerReviewResponsesClient;
  readonly #model: string;

  public constructor(options: {
    readonly apiKey?: string;
    readonly client?: EmployerReviewResponsesClient;
    /** Explicit model policy supplied by a composition root or isolated eval harness. */
    readonly model?: string;
    readonly timeoutMs?: number;
  }) {
    if (options.apiKey === undefined && options.client === undefined) {
      throw new HiringIntelligenceError(
        "AI_CONFIGURATION_FAILURE",
        "buildAnswerEvidenceEdge",
        false,
        "Employer review analysis requires a Worker-only OpenAI API key.",
      );
    }
    this.#client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        maxRetries: 0,
        timeout: options.timeoutMs ?? 45_000,
      }) as unknown as EmployerReviewResponsesClient);
    this.#model = options.model ?? "gpt-5.6-sol";
  }

  public async buildAnswerEvidenceEdge(
    rawInput: BuildAnswerEvidenceEdgeInput,
    clientRequestId: string,
  ) {
    const input = BuildAnswerEvidenceEdgeInputSchema.parse(rawInput);
    try {
      const response = await this.#client.responses.parse(
        {
          model: this.#model,
          reasoning: { effort: "medium" },
          store: false,
          safety_identifier: createHash("sha256")
            .update(input.answer_submission_ref, "utf8")
            .digest("hex"),
          input: [
            {
              role: "developer",
              content: `${EMPLOYER_REVIEW_ANALYST_DEVELOPER_PROMPT}\n${EMPLOYER_REVIEW_ANALYST_OUTPUT_RULES}`,
            },
            { role: "user", content: canonicalJson(input) },
          ],
          text: {
            format: zodTextFormat(
              AnswerEvidenceEdgeDraftV2Schema,
              "onlyboth_answer_evidence_edge_v2",
            ),
          },
        },
        { headers: { "X-Client-Request-Id": clientRequestId } },
      );
      if (
        response.output.some(
          (item) => item.type === "message" && item.content?.some(({ type }) => type === "refusal"),
        )
      ) {
        throw new HiringIntelligenceError(
          "AI_REFUSED",
          "buildAnswerEvidenceEdge",
          false,
          "Employer review analysis returned a refusal.",
        );
      }
      if (response.status !== "completed") {
        throw new HiringIntelligenceError(
          "AI_INCOMPLETE",
          "buildAnswerEvidenceEdge",
          false,
          `Employer review analysis was incomplete (${response.incomplete_details?.reason ?? "unknown"}).`,
        );
      }
      const output = AnswerEvidenceEdgeDraftV2Schema.safeParse(response.output_parsed);
      if (!output.success) {
        throw new HiringIntelligenceError(
          "AI_SCHEMA_MISMATCH",
          "buildAnswerEvidenceEdge",
          false,
          "Employer review analysis did not satisfy the strict schema.",
        );
      }
      return {
        output: output.data,
        providerResponseId: response.id,
        resolvedModel: response.model,
      };
    } catch (error: unknown) {
      throw mapEmployerReviewAnalystError(error);
    }
  }
}

function firstQuote(input: BuildAnswerEvidenceEdgeInput) {
  const block = input.source_blocks.find(({ source_kind }) => source_kind !== "PROCESS");
  if (block === undefined) return null;
  const quote = block.text.slice(0, 240).trim();
  return {
    block,
    quote: quote.length > 0 ? quote : block.text,
  };
}

/** Explicitly synthetic deterministic adapter for offline demos and tests only. */
export class SyntheticEmployerReviewAnalystAdapter implements EmployerReviewAnalystPort {
  public async buildAnswerEvidenceEdge(
    rawInput: BuildAnswerEvidenceEdgeInput,
    _clientRequestId?: string,
  ) {
    const input = BuildAnswerEvidenceEdgeInputSchema.parse(rawInput);
    const source = firstQuote(input);
    if (source === null) {
      return {
        output: AnswerEvidenceEdgeDraftSchema.parse({
          schema_version: "answer-evidence-edge-draft@1",
          readiness: "needs_human",
          summary: [],
          criterion_findings: input.review_criteria.map(({ criterion_ref }) => ({
            criterion_ref,
            status: "NOT_ADDRESSED",
            explanation: "No textual source is available for bounded analysis.",
            supporting_evidence: [],
            contradicting_evidence: [],
          })),
          still_unknown: ["The submitted non-text Artifact requires direct human review."],
          reviewer_questions: [],
          process_timeline: [],
        }),
        providerResponseId: `synthetic:${input.answer_submission_ref}`,
        resolvedModel: "synthetic-employer-review-analyst@1",
      };
    }
    const { block, quote } = source;
    const citation = {
      source_block_ref: block.source_block_ref,
      exact_quote: quote,
      occurrence_index: 0,
    };
    const output: AnswerEvidenceEdgeDraft = AnswerEvidenceEdgeDraftV2Schema.parse({
      schema_version: "answer-evidence-edge-draft@2",
      readiness: "ready",
      summary: [
        {
          sentence: "The answer presents a bounded response to the sealed challenge.",
          sources: [citation],
        },
      ],
      criterion_findings: input.review_criteria.map((criterion, index) => ({
        criterion_ref: criterion.criterion_ref,
        status: index === 0 ? "SUPPORTED" : "INSUFFICIENT_EVIDENCE",
        explanation:
          index === 0
            ? "The final answer contains directly reviewable evidence for this criterion."
            : "The bounded answer does not provide enough direct evidence for a firmer status.",
        supporting_evidence: index === 0 ? [citation] : [],
        contradicting_evidence: [],
      })),
      still_unknown: ["Performance outside this bounded challenge remains unknown."],
      reviewer_questions: [
        { question: "Which invariant should be verified first?", sources: [citation] },
      ],
      process_timeline:
        input.policy === "ANSWER_PLUS_PROCESS"
          ? input.source_blocks
              .filter(({ source_kind }) => source_kind === "PROCESS")
              .slice(0, 4)
              .map((source) => ({
                statement:
                  "Versioned server-recorded process evidence is available for bounded human review.",
                source_block_ref: source.source_block_ref,
              }))
          : [],
      answer_verdict: {
        verdict: "GOOD_ANSWER",
        explanation:
          "This sealed answer provides directly reviewable task evidence without a contradictory finding.",
        evidence: [citation],
        scope: "THIS_SEALED_CHALLENGE_ONLY",
      },
      language_findings: [
        {
          dimension: "LOGICAL_STRUCTURE",
          status: "CLEAR",
          severity: "GREEN",
          observation: "The answer presents a direct claim that can be checked against the task.",
          evidence: [citation],
        },
        {
          dimension: "CLARITY",
          status: "CLEAR",
          severity: "GREEN",
          observation: "The answer uses concrete and reviewable language.",
          evidence: [citation],
        },
        {
          dimension: "INTERNAL_CONSISTENCY",
          status: "CLEAR",
          severity: "GREEN",
          observation: "No internal contradiction is visible in the bounded source excerpt.",
          evidence: [citation],
        },
        {
          dimension: "RESPONSIVENESS",
          status: "CLEAR",
          severity: "GREEN",
          observation: "The answer responds to the sealed challenge with task-specific content.",
          evidence: [citation],
        },
      ],
    });
    return {
      output,
      providerResponseId: `synthetic:${input.answer_submission_ref}`,
      resolvedModel: "synthetic-employer-review-analyst@1",
    };
  }
}
