import type {
  AnswerEvidenceEdgeDraft,
  BuildAnswerEvidenceEdgeInput,
  EmployerAiReviewPolicy,
} from "@onlyboth/contracts";

import type { EmployerReviewAnalystPort } from "../ports/employer-review-analyst";

export interface ClaimedAnswerAnalysisMessage {
  readonly messageId: string;
  readonly answerSubmissionRef: string;
  readonly correlationId: string;
  readonly leaseOwner: string;
  readonly attempt: number;
}

export interface AnswerAnalysisContext {
  readonly policy: EmployerAiReviewPolicy;
  readonly humanReviewCompleted: boolean;
  readonly input: BuildAnswerEvidenceEdgeInput | null;
  readonly inputHash: string | null;
}

export interface EmployerReviewAnalystWorkerStore {
  claimNext(workerId: string, leaseSeconds: number): Promise<ClaimedAnswerAnalysisMessage | null>;
  loadContext(answerSubmissionRef: string): Promise<AnswerAnalysisContext | null>;
  finishWithoutAnalysis(
    message: ClaimedAnswerAnalysisMessage,
    outcome: "DISABLED" | "SUPERSEDED" | "NEEDS_HUMAN",
    errorCode?: string,
  ): Promise<void>;
  start(message: ClaimedAnswerAnalysisMessage, context: AnswerAnalysisContext): Promise<string>;
  complete(
    message: ClaimedAnswerAnalysisMessage,
    input: BuildAnswerEvidenceEdgeInput,
    output: AnswerEvidenceEdgeDraft,
    metadata: {
      readonly clientRequestId: string;
      readonly providerResponseId: string;
      readonly resolvedModel: string;
      readonly synthetic: boolean;
    },
  ): Promise<void>;
  fail(
    message: ClaimedAnswerAnalysisMessage,
    errorCode: string,
    retryable: boolean,
    maximumAttempts: number,
  ): Promise<"FAILED" | "RETRY_SCHEDULED">;
}

function errorMetadata(error: unknown): { readonly code: string; readonly retryable: boolean } {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  ) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: "AI_SCHEMA_MISMATCH", retryable: false };
}

export class EmployerReviewAnalystWorker {
  public constructor(
    private readonly store: EmployerReviewAnalystWorkerStore,
    private readonly analyst: EmployerReviewAnalystPort | null,
    private readonly validate: (
      input: BuildAnswerEvidenceEdgeInput,
      output: AnswerEvidenceEdgeDraft,
    ) => AnswerEvidenceEdgeDraft,
    private readonly randomId: () => string,
    private readonly synthetic: boolean,
    private readonly maximumAttempts = 3,
    private readonly unavailableErrorCode = "PLATFORM_KILL_SWITCH_OFF",
  ) {}

  public async runOnce(workerId: string): Promise<"IDLE" | "PROCESSED" | "RETRY_SCHEDULED"> {
    const message = await this.store.claimNext(workerId, 60);
    if (message === null) return "IDLE";
    const context = await this.store.loadContext(message.answerSubmissionRef);
    if (context === null) {
      await this.store.finishWithoutAnalysis(message, "NEEDS_HUMAN", "ANALYSIS_CONTEXT_MISSING");
      return "PROCESSED";
    }
    if (context.policy === "OFF") {
      await this.store.finishWithoutAnalysis(message, "DISABLED");
      return "PROCESSED";
    }
    if (context.humanReviewCompleted) {
      await this.store.finishWithoutAnalysis(message, "SUPERSEDED");
      return "PROCESSED";
    }
    if (context.input === null || context.inputHash === null) {
      await this.store.finishWithoutAnalysis(message, "NEEDS_HUMAN", "NO_TEXTUAL_SOURCE");
      return "PROCESSED";
    }
    if (this.analyst === null) {
      await this.store.finishWithoutAnalysis(message, "NEEDS_HUMAN", this.unavailableErrorCode);
      return "PROCESSED";
    }
    await this.store.start(message, context);
    const clientRequestId = this.randomId();
    try {
      const result = await this.analyst.buildAnswerEvidenceEdge(context.input, clientRequestId);
      const output = this.validate(context.input, result.output);
      await this.store.complete(message, context.input, output, {
        clientRequestId,
        providerResponseId: result.providerResponseId,
        resolvedModel: result.resolvedModel,
        synthetic: this.synthetic,
      });
      return "PROCESSED";
    } catch (error: unknown) {
      const metadata = errorMetadata(error);
      const result = await this.store.fail(
        message,
        metadata.code,
        metadata.retryable,
        this.maximumAttempts,
      );
      return result === "RETRY_SCHEDULED" ? "RETRY_SCHEDULED" : "PROCESSED";
    }
  }
}
