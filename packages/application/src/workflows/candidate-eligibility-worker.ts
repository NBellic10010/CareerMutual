import {
  CandidateEligibilityMatchInputSchema,
  CandidateEligibilityMatchOutputSchema,
} from "@onlyboth/contracts";

import type { CandidateDiscoveryCanonicalHasher } from "../ports/candidate-discovery";
import type {
  CandidateEligibilityIdFactory,
  CandidateEligibilityMatchPort,
  CandidateEligibilityMatchValidatorPort,
  CandidateEligibilityPromptMetadata,
  CandidateEligibilityWorkerStore,
} from "../ports/candidate-eligibility";

function errorDetails(error: unknown): { readonly code: string; readonly retryable: boolean } {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return { code: error.code, retryable: "retryable" in error && error.retryable === true };
  }
  return { code: "CANDIDATE_ELIGIBILITY_PLATFORM_FAILURE", retryable: true };
}

export class CandidateEligibilityWorker {
  public constructor(
    private readonly store: CandidateEligibilityWorkerStore,
    private readonly intelligence: CandidateEligibilityMatchPort | null,
    private readonly validator: CandidateEligibilityMatchValidatorPort,
    private readonly hasher: CandidateDiscoveryCanonicalHasher,
    private readonly ids: CandidateEligibilityIdFactory,
    private readonly prompt: CandidateEligibilityPromptMetadata,
    private readonly maximumAttempts = 3,
    private readonly now: () => Date = () => new Date(),
    private readonly clientRequestId?: () => string,
  ) {}

  public async runOnce(workerId: string): Promise<"IDLE" | "PROCESSED" | "RETRY_SCHEDULED"> {
    const message = await this.store.claimNext(workerId, 90);
    if (message === null) return "IDLE";
    const requestRef = this.ids.nextId("ai-request");
    const runRef = this.ids.nextId("ai-run");
    const input = await this.store.loadInput(message, requestRef);
    if (input === null) {
      await this.store.markProcessed(message);
      return "PROCESSED";
    }
    const parsedInput = CandidateEligibilityMatchInputSchema.parse(input);
    const { request_ref: _requestRef, ...stableInput } = parsedInput;
    const inputHash = this.hasher.hash(stableInput);
    const requestId = this.clientRequestId?.() ?? requestRef;
    await this.store.startRequest({
      message,
      requestRef,
      runRef,
      input: parsedInput,
      inputHash,
      clientRequestId: requestId,
      prompt: this.prompt,
    });
    if (this.intelligence === null) {
      await this.store.failRequest({
        message,
        requestRef,
        runRef,
        status: "FAILED_PERMANENT",
        errorCode: "AI_CONFIGURATION_FAILURE",
      });
      return "PROCESSED";
    }
    try {
      const response = await this.intelligence.deriveMatches(parsedInput, requestId);
      const output = this.validator.validate(
        parsedInput,
        CandidateEligibilityMatchOutputSchema.parse(response.output),
      );
      await this.store.completeRequest({
        message,
        requestRef,
        runRef,
        outputRef: this.ids.nextId("ai-output"),
        input: parsedInput,
        inputHash,
        output,
        outputHash: this.hasher.hash(output),
        resolvedModel: response.resolvedModel,
        providerResponseId: response.providerResponseId,
        ids: this.ids,
      });
      return "PROCESSED";
    } catch (error: unknown) {
      const details = errorDetails(error);
      if (details.retryable && message.attempt < this.maximumAttempts) {
        await this.store.retryRequest({
          message,
          requestRef,
          runRef,
          errorCode: details.code,
          retryAt: new Date(this.now().getTime() + message.attempt * 1_000),
        });
        return "RETRY_SCHEDULED";
      }
      const needsHuman = new Set([
        "AI_REFUSED",
        "AI_INCOMPLETE",
        "AI_SCHEMA_MISMATCH",
        "AI_SOURCE_REF_INVALID",
        "AI_OUTPUT_POLICY_VIOLATION",
      ]).has(details.code);
      await this.store.failRequest({
        message,
        requestRef,
        runRef,
        status: needsHuman ? "NEEDS_HUMAN" : "FAILED_PERMANENT",
        errorCode: details.code,
      });
      return "PROCESSED";
    }
  }
}
