import OpenAI from "openai";
import { z } from "zod";
import { describe, expect, it } from "vitest";

import { mapEmployerReviewAnalystError } from "./employer-review-analyst-adapter.js";

function openAiApiError(status: number, code: string): ReturnType<typeof OpenAI.APIError.generate> {
  return OpenAI.APIError.generate(
    status,
    {
      error: {
        code,
        type: code,
        message: "Provider error body is not propagated to the application error.",
      },
    },
    undefined,
    new Headers(),
  );
}

describe("Employer review analyst provider error mapping", () => {
  it("maps SDK-side Zod refinement failures to a permanent schema mismatch", () => {
    const failure = z.string().min(2).safeParse("x");
    if (failure.success) throw new Error("Expected a synthetic Zod failure.");
    expect(mapEmployerReviewAnalystError(failure.error)).toMatchObject({
      code: "AI_SCHEMA_MISMATCH",
      retryable: false,
      operation: "buildAnswerEvidenceEdge",
    });
  });

  it("does not retry an insufficient-quota 429", () => {
    expect(mapEmployerReviewAnalystError(openAiApiError(429, "insufficient_quota"))).toMatchObject({
      code: "AI_CONFIGURATION_FAILURE",
      retryable: false,
      operation: "buildAnswerEvidenceEdge",
    });
  });

  it("keeps an ordinary rate-limit 429 retryable", () => {
    expect(mapEmployerReviewAnalystError(openAiApiError(429, "rate_limit_exceeded"))).toMatchObject(
      {
        code: "AI_RATE_LIMITED",
        retryable: true,
        operation: "buildAnswerEvidenceEdge",
      },
    );
  });

  it("maps provider timeouts and connection failures to retryable typed errors", () => {
    expect(mapEmployerReviewAnalystError(new OpenAI.APIConnectionTimeoutError())).toMatchObject({
      code: "AI_TIMEOUT",
      retryable: true,
    });
    expect(
      mapEmployerReviewAnalystError(
        new OpenAI.APIConnectionError({ message: "connection failed" }),
      ),
    ).toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
      retryable: true,
    });
  });

  it("keeps server failures retryable and request-shape failures permanent", () => {
    expect(mapEmployerReviewAnalystError(openAiApiError(503, "service_unavailable"))).toMatchObject(
      {
        code: "AI_PROVIDER_UNAVAILABLE",
        retryable: true,
      },
    );
    expect(
      mapEmployerReviewAnalystError(openAiApiError(400, "invalid_request_error")),
    ).toMatchObject({
      code: "AI_CONFIGURATION_FAILURE",
      retryable: false,
    });
  });
});
