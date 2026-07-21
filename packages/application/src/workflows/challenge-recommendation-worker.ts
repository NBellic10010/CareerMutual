import {
  CandidateReviewWindowProjectionSchema,
  EmployerReviewWindowProjectionSchema,
  RecommendChallengesInputSchema,
  type ChallengeRecommendation,
  type EmployerReviewWindowProjection,
  type RecommendChallengesInput,
} from "@onlyboth/contracts";

import type { HiringIntelligencePort } from "../ports/hiring-intelligence";
import type {
  ApplicationIdFactory,
  ChallengeCatalogSelectionPort,
} from "../ports/challenge-selection";

export type ChallengeWorkerMessageType =
  "StageASubmitted" | "RecommendChallengesRequested" | "HumanChallengeSelected" | "PlatformAborted";

export interface ClaimedChallengeWorkerMessage {
  readonly messageId: string;
  readonly messageType: ChallengeWorkerMessageType;
  readonly eventId: string;
  readonly correlationId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attempt: number;
  readonly leaseOwner: string;
}

export interface StageARecommendationContext {
  readonly reviewWindowId: string;
  readonly candidateId: "candidate-42";
  readonly aggregateVersion: number;
  readonly state: "CHECKPOINT_PENDING";
  readonly contractVersionRef: string;
  readonly challengeCatalogVersionRef: string;
  readonly capabilityRefs: readonly string[];
  readonly evidence: RecommendChallengesInput["stage_a_evidence"];
  readonly recommendationRequestRef: string;
  readonly runtimeMode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly replayId: string | null;
}

export interface StoredRecommendationRequest {
  readonly requestId: string;
  readonly input: RecommendChallengesInput;
  readonly inputHash: string;
  readonly aggregateVersion: number;
  readonly runtimeMode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly replayId: string | null;
  readonly catalogRef: string;
  readonly catalogHash: string;
  readonly employerProjection: EmployerReviewWindowProjection;
}

export interface SelectedChallengeWorkerContext {
  readonly reviewWindowId: string;
  readonly aggregateVersion: number;
  readonly challengeRef: string;
  readonly candidateNotice: string;
  readonly sessionKey: string;
  readonly proofRef: string;
  readonly sessionId: string;
  readonly baseSnapshotVersion: string;
  readonly patchRef: string;
  readonly artifactRef: string;
  readonly snapshotRef: string;
  readonly remainingTimeSeconds: number;
  readonly catalogRef: string;
  readonly catalogHash: string;
  readonly candidateProjection: Awaited<
    ReturnType<typeof CandidateReviewWindowProjectionSchema.parse>
  >;
  readonly employerProjection: EmployerReviewWindowProjection;
}

export interface RecommendationCompletion {
  readonly outputRef: string;
  readonly runId: string;
  readonly eventId: string;
  readonly output: ChallengeRecommendation;
  readonly outputHash: string;
  readonly status: "SUCCEEDED" | "NEEDS_HUMAN";
  readonly employerProjection: EmployerReviewWindowProjection;
}

export interface ChallengeRecommendationWorkerStore {
  claimNext(
    workerId: string,
    leaseDurationSeconds: number,
  ): Promise<ClaimedChallengeWorkerMessage | null>;
  loadStageAContext(reviewWindowId: string): Promise<StageARecommendationContext | null>;
  createRecommendationRequest(
    message: ClaimedChallengeWorkerMessage,
    request: StoredRecommendationRequest,
    prompt: {
      readonly promptId: string;
      readonly promptVersion: string;
      readonly promptHash: string;
      readonly inputSchemaVersion: string;
      readonly outputSchemaVersion: string;
    },
  ): Promise<void>;
  loadRecommendationRequest(requestId: string): Promise<StoredRecommendationRequest | null>;
  completeRecommendation(
    message: ClaimedChallengeWorkerMessage,
    completion: RecommendationCompletion,
  ): Promise<void>;
  completeRecommendationFailure(
    message: ClaimedChallengeWorkerMessage,
    input: {
      readonly requestId: string;
      readonly runId: string;
      readonly status: "NEEDS_HUMAN" | "FAILED_PERMANENT" | "SUPERSEDED";
      readonly errorCode: string;
      readonly employerProjection: EmployerReviewWindowProjection;
    },
  ): Promise<void>;
  retryRecommendation(
    message: ClaimedChallengeWorkerMessage,
    input: {
      readonly requestId: string;
      readonly runId: string;
      readonly errorCode: string;
      readonly retryAt: Date;
    },
  ): Promise<void>;
  loadSelectedChallengeContext(
    message: ClaimedChallengeWorkerMessage,
  ): Promise<SelectedChallengeWorkerContext | null>;
  completeSelectedChallenge(
    message: ClaimedChallengeWorkerMessage,
    input: {
      readonly sandboxBranchRef: string;
      readonly candidateProjection: Awaited<
        ReturnType<typeof CandidateReviewWindowProjectionSchema.parse>
      >;
      readonly employerProjection: EmployerReviewWindowProjection;
    },
  ): Promise<void>;
  completePlatformAbortProjection(
    message: ClaimedChallengeWorkerMessage,
    reviewWindowId: string,
  ): Promise<void>;
  retryMessage(
    message: ClaimedChallengeWorkerMessage,
    errorCode: string,
    retryAt: Date,
  ): Promise<void>;
  markMessageProcessed(message: ClaimedChallengeWorkerMessage): Promise<void>;
}

export interface CanonicalAiInputHasher {
  hash(value: unknown): string;
}

export interface ChallengeRecommendationValidatorPort {
  validate(
    input: RecommendChallengesInput,
    output: ChallengeRecommendation,
  ): ChallengeRecommendation;
}

export interface SelectedChallengeSandboxPort {
  applySelectedChallenge(
    input: Omit<SelectedChallengeWorkerContext, "candidateProjection" | "employerProjection">,
  ): Promise<{
    readonly branchRef: string;
  }>;
}

export interface PlatformAbortCommandPort {
  abortAfterSandboxFailure(input: {
    readonly message: ClaimedChallengeWorkerMessage;
    readonly reviewWindowId: string;
    readonly reasonRef: string;
  }): Promise<void>;
}

export interface RecommendationPromptMetadata {
  readonly promptId: string;
  readonly promptVersion: string;
  readonly promptHash: string;
  readonly inputSchemaVersion: string;
  readonly outputSchemaVersion: string;
}

export class VeiledChallengeInputAssembler {
  public constructor(private readonly catalog: ChallengeCatalogSelectionPort) {}

  public get catalogRef(): string {
    return this.catalog.catalogRef;
  }

  public get catalogHash(): string {
    return this.catalog.catalogHash;
  }

  public assemble(context: StageARecommendationContext): RecommendChallengesInput {
    if (context.candidateId !== "candidate-42") {
      throw new Error("The current milestone accepts only the synthetic Candidate 42 context.");
    }
    return RecommendChallengesInputSchema.parse({
      schema_version: "recommend-challenges-input@1",
      request_ref: context.recommendationRequestRef,
      review_window_ref: context.reviewWindowId,
      contract_version_ref: context.contractVersionRef,
      challenge_catalog_version_ref: context.challengeCatalogVersionRef,
      capability_refs: context.capabilityRefs,
      stage_a_evidence: context.evidence,
      allowed_challenges: this.catalog
        .listRecommendationOptions(context.capabilityRefs)
        .map((option) => ({
          challenge_id: option.challengeId,
          version: option.version,
          capability_refs: option.capabilityRefs,
          candidate_notice: option.candidateNotice,
        })),
    });
  }
}

function payloadString(
  message: ClaimedChallengeWorkerMessage,
  key: "reviewWindowId" | "requestId" | "challengeRef",
): string {
  const value = message.payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Outbox message '${message.messageId}' is missing '${key}'.`);
  }
  return value;
}

function failureCode(error: unknown): { readonly code: string; readonly retryable: boolean } {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return {
      code: error.code,
      retryable: "retryable" in error && error.retryable === true,
    };
  }
  return { code: "PLATFORM_WORKER_FAILURE", retryable: true };
}

function recommendationProjection(
  request: StoredRecommendationRequest,
  outputRef: string | null,
  output: ChallengeRecommendation | null,
  status: "READY" | "NEEDS_HUMAN" | "FAILED" | "SUPERSEDED",
  reasonCode: string | null,
  promptVersion: string,
): EmployerReviewWindowProjection {
  const options =
    output?.decision === "recommend"
      ? output.recommendations.map((item) => ({
          challenge_ref: `${item.challenge_id}@${item.version}`,
          tests: item.capability_refs.map((reference) => `Capability · ${reference}`),
          why: item.rationale,
          sources: item.evidence_refs,
          still_unknown: output.still_unknown,
        }))
      : [];
  return EmployerReviewWindowProjectionSchema.parse({
    ...request.employerProjection,
    recommendation: {
      status,
      output_ref: outputRef,
      prompt_version: promptVersion,
      input_hash: request.inputHash,
      options,
      reason_code: reasonCode,
    },
  });
}

export class ChallengeRecommendationWorker {
  public constructor(
    private readonly store: ChallengeRecommendationWorkerStore,
    private readonly intelligence: HiringIntelligencePort,
    private readonly validator: ChallengeRecommendationValidatorPort,
    private readonly assembler: VeiledChallengeInputAssembler,
    private readonly hasher: CanonicalAiInputHasher,
    private readonly sandbox: SelectedChallengeSandboxPort,
    private readonly platformAbort: PlatformAbortCommandPort,
    private readonly ids: ApplicationIdFactory,
    private readonly prompt: RecommendationPromptMetadata,
    private readonly maximumAttempts = 3,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async runOnce(workerId: string): Promise<"IDLE" | "PROCESSED" | "RETRY_SCHEDULED"> {
    const message = await this.store.claimNext(workerId, 90);
    if (message === null) {
      return "IDLE";
    }
    if (message.messageType === "StageASubmitted") {
      const context = await this.store.loadStageAContext(payloadString(message, "reviewWindowId"));
      if (context === null) {
        await this.store.markMessageProcessed(message);
        return "PROCESSED";
      }
      const input = this.assembler.assemble(context);
      const inputHash = this.hasher.hash(input);
      const request: StoredRecommendationRequest = {
        requestId: context.recommendationRequestRef,
        input,
        inputHash,
        aggregateVersion: context.aggregateVersion,
        runtimeMode: context.runtimeMode,
        replayId: context.replayId,
        catalogRef: this.assembler.catalogRef,
        catalogHash: this.assembler.catalogHash,
        employerProjection: EmployerReviewWindowProjectionSchema.parse({
          schema_version: "employer-review-window-projection@1",
          view: "EMPLOYER",
          review_window_id: context.reviewWindowId,
          aggregate_version: context.aggregateVersion,
          state: context.state,
          runtime_mode: context.runtimeMode,
          synthetic: context.runtimeMode === "GOLDEN_REPLAY",
          disclosure:
            context.runtimeMode === "GOLDEN_REPLAY"
              ? "Synthetic — Pre-recorded external inputs"
              : "Live Hiring Intelligence request",
          reviewer: { id: "reviewer-sarah-chen", display_name: "Sarah Chen" },
          candidate: { opaque_id: "Candidate 42" },
          recommendation: {
            status: "RUNNING",
            output_ref: null,
            prompt_version: this.prompt.promptVersion,
            input_hash: inputHash,
            options: [],
            reason_code: null,
          },
          authorization: null,
        }),
      };
      await this.store.createRecommendationRequest(message, request, this.prompt);
      return "PROCESSED";
    }

    if (message.messageType === "RecommendChallengesRequested") {
      return this.processRecommendation(message);
    }
    if (message.messageType === "HumanChallengeSelected") {
      return this.processSelectedChallenge(message);
    }
    await this.store.completePlatformAbortProjection(
      message,
      payloadString(message, "reviewWindowId"),
    );
    return "PROCESSED";
  }

  private async processRecommendation(
    message: ClaimedChallengeWorkerMessage,
  ): Promise<"PROCESSED" | "RETRY_SCHEDULED"> {
    const request = await this.store.loadRecommendationRequest(payloadString(message, "requestId"));
    if (request === null) {
      await this.store.markMessageProcessed(message);
      return "PROCESSED";
    }
    const runId = this.ids.nextId("ai-run");
    try {
      const draft = await this.intelligence.recommendChallenges(request.input);
      const output = this.validator.validate(request.input, draft);
      const outputRef = this.ids.nextId("ai-output");
      const status = output.decision === "needs_human" ? "NEEDS_HUMAN" : "SUCCEEDED";
      await this.store.completeRecommendation(message, {
        outputRef,
        runId,
        eventId: this.ids.nextId("event"),
        output,
        outputHash: this.hasher.hash(output),
        status,
        employerProjection: recommendationProjection(
          request,
          outputRef,
          output,
          output.decision === "needs_human" ? "NEEDS_HUMAN" : "READY",
          output.decision === "needs_human" ? "AI_STRUCTURED_NEEDS_HUMAN" : null,
          this.prompt.promptVersion,
        ),
      });
      return "PROCESSED";
    } catch (error: unknown) {
      const failure = failureCode(error);
      if (failure.retryable && message.attempt < this.maximumAttempts) {
        await this.store.retryRecommendation(message, {
          requestId: request.requestId,
          runId,
          errorCode: failure.code,
          retryAt: new Date(this.now().getTime() + Math.min(1_000 * 2 ** message.attempt, 30_000)),
        });
        return "RETRY_SCHEDULED";
      }
      const needsHuman = [
        "AI_REFUSED",
        "AI_INCOMPLETE",
        "AI_SCHEMA_MISMATCH",
        "AI_SOURCE_REF_INVALID",
        "AI_CATALOG_INVALID",
        "AI_OUTPUT_POLICY_VIOLATION",
      ].includes(failure.code);
      const superseded = failure.code === "AI_STALE_RESULT";
      await this.store.completeRecommendationFailure(message, {
        requestId: request.requestId,
        runId,
        status: superseded ? "SUPERSEDED" : needsHuman ? "NEEDS_HUMAN" : "FAILED_PERMANENT",
        errorCode: failure.code,
        employerProjection: recommendationProjection(
          request,
          null,
          null,
          superseded ? "SUPERSEDED" : needsHuman ? "NEEDS_HUMAN" : "FAILED",
          failure.code,
          this.prompt.promptVersion,
        ),
      });
      return "PROCESSED";
    }
  }

  private async processSelectedChallenge(
    message: ClaimedChallengeWorkerMessage,
  ): Promise<"PROCESSED" | "RETRY_SCHEDULED"> {
    const reviewWindowId = payloadString(message, "reviewWindowId");
    const challengeRef = payloadString(message, "challengeRef");
    const context = await this.store.loadSelectedChallengeContext(message);
    if (context === null) {
      await this.store.markMessageProcessed(message);
      return "PROCESSED";
    }
    try {
      const result = await this.sandbox.applySelectedChallenge({
        reviewWindowId: context.reviewWindowId,
        aggregateVersion: context.aggregateVersion,
        challengeRef: context.challengeRef,
        candidateNotice: context.candidateNotice,
        sessionKey: context.sessionKey,
        proofRef: context.proofRef,
        sessionId: context.sessionId,
        baseSnapshotVersion: context.baseSnapshotVersion,
        patchRef: context.patchRef,
        artifactRef: context.artifactRef,
        snapshotRef: context.snapshotRef,
        remainingTimeSeconds: context.remainingTimeSeconds,
        catalogRef: context.catalogRef,
        catalogHash: context.catalogHash,
      });
      const candidateProjection = CandidateReviewWindowProjectionSchema.parse({
        ...context.candidateProjection,
        aggregate_version: context.aggregateVersion,
        state: "STAGE_B_ACTIVE",
        selected_challenge: {
          challenge_ref: challengeRef,
          candidate_notice: context.candidateNotice,
          sandbox_branch_ref: result.branchRef,
        },
        message: `Sarah chose to test ${challengeRef}.`,
      });
      const employerProjection = EmployerReviewWindowProjectionSchema.parse({
        ...context.employerProjection,
        aggregate_version: context.aggregateVersion,
        state: "STAGE_B_ACTIVE",
      });
      await this.store.completeSelectedChallenge(message, {
        sandboxBranchRef: result.branchRef,
        candidateProjection,
        employerProjection,
      });
      return "PROCESSED";
    } catch (error: unknown) {
      const failure = failureCode(error);
      if (message.attempt < this.maximumAttempts) {
        await this.store.retryMessage(
          message,
          failure.code === "PLATFORM_WORKER_FAILURE" ? "SANDBOX_FAILURE" : failure.code,
          new Date(this.now().getTime() + Math.min(1_000 * 2 ** message.attempt, 30_000)),
        );
        return "RETRY_SCHEDULED";
      }
      await this.platformAbort.abortAfterSandboxFailure({
        message,
        reviewWindowId,
        reasonRef: "sandbox-retry-exhausted",
      });
      return "PROCESSED";
    }
  }
}
