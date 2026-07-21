import {
  ChallengeRecommendationWorker,
  VeiledChallengeInputAssembler,
  type ChallengeRecommendationWorkerStore,
  type ClaimedChallengeWorkerMessage,
  type PlatformAbortCommandPort,
  type RecommendationCompletion,
  type SelectedChallengeSandboxPort,
  type SelectedChallengeWorkerContext,
  type StageARecommendationContext,
  type StoredRecommendationRequest,
} from "../../packages/application/src/index";
import type { HiringIntelligencePort } from "../../packages/application/src/index";
import {
  CANDIDATE_42_RECOMMENDATION_INPUT,
  CANDIDATE_42_RECOMMENDATION_OUTPUT,
  HiringIntelligenceError,
  hashCanonicalJson,
} from "../../packages/ai/src/index";
import {
  CandidateReviewWindowProjectionSchema,
  EmployerReviewWindowProjectionSchema,
  type BuildMatchEdgeInputV2,
  type ChallengeRecommendation,
  type CompileContractInput,
  type CompressEvidenceInput,
  type ContractDraft,
  type EvidenceCardDraft,
  type MatchEdgeDraftV2,
  type RecommendChallengesInput,
} from "../../packages/contracts/src/index";
import { describe, expect, it } from "vitest";

const CATALOG_HASH = "sha256:0c18eb5d79ae4f22e13509a446b4fdcdb6b9c46cedea82ca65f4c108a2d81ee5";

const employerProjection = EmployerReviewWindowProjectionSchema.parse({
  schema_version: "employer-review-window-projection@1",
  view: "EMPLOYER",
  review_window_id: "review-window-42",
  aggregate_version: 3,
  state: "CHECKPOINT_PENDING",
  runtime_mode: "GOLDEN_REPLAY",
  synthetic: true,
  disclosure: "Synthetic — Pre-recorded external inputs",
  reviewer: { id: "reviewer-sarah-chen", display_name: "Sarah Chen" },
  candidate: { opaque_id: "Candidate 42" },
  recommendation: {
    status: "RUNNING",
    output_ref: null,
    prompt_version: "1.1.0",
    input_hash: hashCanonicalJson(CANDIDATE_42_RECOMMENDATION_INPUT),
    options: [],
    reason_code: null,
  },
  authorization: null,
});

const candidateProjection = CandidateReviewWindowProjectionSchema.parse({
  schema_version: "candidate-review-window-projection@1",
  view: "CANDIDATE",
  review_window_id: "review-window-42",
  aggregate_version: 3,
  candidate_ref: "candidate-42",
  reviewer: { id: "reviewer-sarah-chen", display_name: "Sarah Chen" },
  runtime_mode: "GOLDEN_REPLAY",
  synthetic: true,
  state: "CHECKPOINT_PENDING",
  selected_challenge: null,
  message: "Sarah is reviewing your Stage A evidence.",
});

const recommendationRequest: StoredRecommendationRequest = {
  requestId: "ai-request-candidate-42-challenges",
  input: CANDIDATE_42_RECOMMENDATION_INPUT,
  inputHash: hashCanonicalJson(CANDIDATE_42_RECOMMENDATION_INPUT),
  aggregateVersion: 3,
  runtimeMode: "GOLDEN_REPLAY",
  replayId: "payment-retry-v1",
  catalogRef: "payment-retry@1",
  catalogHash: CATALOG_HASH,
  employerProjection,
};

const selectedContext: SelectedChallengeWorkerContext = {
  reviewWindowId: "review-window-42",
  aggregateVersion: 4,
  challengeRef: "payment-retry/redis-failover@1",
  candidateNotice: "The reviewer chose Redis failover.",
  sessionKey: "candidate-42",
  proofRef: "proof-42",
  sessionId: "replay-session-42",
  baseSnapshotVersion: "payment-retry@1",
  patchRef: "patch-42-stage-a",
  artifactRef: "artifact-42-stage-a",
  snapshotRef: "snapshot-42-stage-a",
  remainingTimeSeconds: 180,
  catalogRef: "payment-retry@1",
  catalogHash: CATALOG_HASH,
  candidateProjection,
  employerProjection,
};

class FakeIntelligence implements HiringIntelligencePort {
  public constructor(
    private readonly result: ChallengeRecommendation | Error = CANDIDATE_42_RECOMMENDATION_OUTPUT,
  ) {}

  public async compileContract(_input: CompileContractInput): Promise<ContractDraft> {
    throw new Error("unused");
  }

  public async buildMatchEdge(_input: BuildMatchEdgeInputV2): Promise<MatchEdgeDraftV2> {
    throw new Error("unused");
  }

  public async recommendChallenges(
    _input: RecommendChallengesInput,
  ): Promise<ChallengeRecommendation> {
    if (this.result instanceof Error) {
      throw this.result;
    }
    return structuredClone(this.result);
  }

  public async compressEvidence(_input: CompressEvidenceInput): Promise<EvidenceCardDraft> {
    throw new Error("unused");
  }
}

class FakeWorkerStore implements ChallengeRecommendationWorkerStore {
  public createdRequest: StoredRecommendationRequest | null = null;
  public completion: RecommendationCompletion | null = null;
  public failure:
    Parameters<ChallengeRecommendationWorkerStore["completeRecommendationFailure"]>[1] | null =
    null;
  public retry: { readonly code: string; readonly at: Date } | null = null;
  public selectedCompletion:
    Parameters<ChallengeRecommendationWorkerStore["completeSelectedChallenge"]>[1] | null = null;
  public processed = false;
  #claimed = false;

  public constructor(
    private readonly message: ClaimedChallengeWorkerMessage,
    private readonly request: StoredRecommendationRequest | null = recommendationRequest,
    private readonly selected: SelectedChallengeWorkerContext | null = selectedContext,
    private readonly stage: StageARecommendationContext | null = null,
  ) {}

  public async claimNext(): Promise<ClaimedChallengeWorkerMessage | null> {
    if (this.#claimed) {
      return null;
    }
    this.#claimed = true;
    return this.message;
  }

  public async loadStageAContext(): Promise<StageARecommendationContext | null> {
    return this.stage;
  }

  public async createRecommendationRequest(
    _message: ClaimedChallengeWorkerMessage,
    request: StoredRecommendationRequest,
  ): Promise<void> {
    this.createdRequest = request;
  }

  public async loadRecommendationRequest(): Promise<StoredRecommendationRequest | null> {
    return this.request;
  }

  public async completeRecommendation(
    _message: ClaimedChallengeWorkerMessage,
    completion: RecommendationCompletion,
  ): Promise<void> {
    this.completion = completion;
  }

  public async completeRecommendationFailure(
    _message: ClaimedChallengeWorkerMessage,
    failure: Parameters<ChallengeRecommendationWorkerStore["completeRecommendationFailure"]>[1],
  ): Promise<void> {
    this.failure = failure;
  }

  public async retryRecommendation(
    _message: ClaimedChallengeWorkerMessage,
    input: Parameters<ChallengeRecommendationWorkerStore["retryRecommendation"]>[1],
  ): Promise<void> {
    this.retry = { code: input.errorCode, at: input.retryAt };
  }

  public async loadSelectedChallengeContext(): Promise<SelectedChallengeWorkerContext | null> {
    return this.selected;
  }

  public async completeSelectedChallenge(
    _message: ClaimedChallengeWorkerMessage,
    completion: Parameters<ChallengeRecommendationWorkerStore["completeSelectedChallenge"]>[1],
  ): Promise<void> {
    this.selectedCompletion = completion;
  }

  public async completePlatformAbortProjection(): Promise<void> {
    this.processed = true;
  }

  public async retryMessage(
    _message: ClaimedChallengeWorkerMessage,
    errorCode: string,
    retryAt: Date,
  ): Promise<void> {
    this.retry = { code: errorCode, at: retryAt };
  }

  public async markMessageProcessed(): Promise<void> {
    this.processed = true;
  }
}

class FakeSandbox implements SelectedChallengeSandboxPort {
  public constructor(private readonly result: string | Error) {}

  public async applySelectedChallenge(): Promise<{ readonly branchRef: string }> {
    if (this.result instanceof Error) {
      throw this.result;
    }
    return { branchRef: this.result };
  }
}

class FakePlatformAbort implements PlatformAbortCommandPort {
  public calls: Parameters<PlatformAbortCommandPort["abortAfterSandboxFailure"]>[0][] = [];

  public async abortAfterSandboxFailure(
    input: Parameters<PlatformAbortCommandPort["abortAfterSandboxFailure"]>[0],
  ): Promise<void> {
    this.calls.push(input);
  }
}

function message(
  messageType: "StageASubmitted" | "RecommendChallengesRequested" | "HumanChallengeSelected",
  attempt = 1,
): ClaimedChallengeWorkerMessage {
  return {
    messageId: `message-${messageType}-${attempt}`,
    messageType,
    eventId: "event-source",
    correlationId: "correlation-worker-test",
    payload:
      messageType === "StageASubmitted"
        ? { reviewWindowId: "review-window-42" }
        : messageType === "RecommendChallengesRequested"
          ? { requestId: recommendationRequest.requestId }
          : {
              reviewWindowId: selectedContext.reviewWindowId,
              challengeRef: selectedContext.challengeRef,
            },
    attempt,
    leaseOwner: "worker-test",
  };
}

function createWorker(
  store: FakeWorkerStore,
  intelligence: HiringIntelligencePort,
  sandbox: SelectedChallengeSandboxPort,
  platformAbort: PlatformAbortCommandPort,
): ChallengeRecommendationWorker {
  let id = 0;
  return new ChallengeRecommendationWorker(
    store,
    intelligence,
    { validate: (_input, output) => output },
    new VeiledChallengeInputAssembler({
      catalogRef: "payment-retry@1",
      catalogHash: CATALOG_HASH,
      listRecommendationOptions: () =>
        CANDIDATE_42_RECOMMENDATION_INPUT.allowed_challenges.map((option) => ({
          challengeId: option.challenge_id,
          version: option.version,
          capabilityRefs: option.capability_refs,
          candidateNotice: option.candidate_notice,
        })),
      resolveChallenge: () => {
        throw new Error("unused");
      },
    }),
    { hash: hashCanonicalJson },
    sandbox,
    platformAbort,
    { nextId: (kind) => `${kind}-worker-${++id}` },
    {
      promptId: "onlyboth.recommend-challenges",
      promptVersion: "1.1.0",
      promptHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      inputSchemaVersion: "recommend-challenges-input@1",
      outputSchemaVersion: "challenge-recommendation@1",
    },
    3,
    () => new Date("2026-07-19T12:00:00.000Z"),
  );
}

describe("ChallengeRecommendationWorker failure ownership", () => {
  it("turns StageASubmitted into the exact veiled recommendation request", async () => {
    const stageContext: StageARecommendationContext = {
      reviewWindowId: "review-window-42",
      candidateId: "candidate-42",
      aggregateVersion: 3,
      state: "CHECKPOINT_PENDING",
      contractVersionRef: "contract-payment-retry@1",
      challengeCatalogVersionRef: "payment-retry@1",
      capabilityRefs: CANDIDATE_42_RECOMMENDATION_INPUT.capability_refs,
      evidence: CANDIDATE_42_RECOMMENDATION_INPUT.stage_a_evidence,
      recommendationRequestRef: "ai-request-candidate-42-challenges",
      runtimeMode: "GOLDEN_REPLAY",
      replayId: "payment-retry-v1",
    };
    const store = new FakeWorkerStore(
      message("StageASubmitted"),
      recommendationRequest,
      selectedContext,
      stageContext,
    );
    const worker = createWorker(
      store,
      new FakeIntelligence(),
      new FakeSandbox("unused"),
      new FakePlatformAbort(),
    );

    await expect(worker.runOnce("worker-test")).resolves.toBe("PROCESSED");
    expect(store.createdRequest?.input).toEqual(CANDIDATE_42_RECOMMENDATION_INPUT);
    expect(store.createdRequest?.inputHash).toBe(
      hashCanonicalJson(CANDIDATE_42_RECOMMENDATION_INPUT),
    );
    expect(JSON.stringify(store.createdRequest)).not.toMatch(
      /school_name|previous_employer|referral_source|legal_name|candidate_photo/iu,
    );
  });

  it.each(["AI_REFUSED", "AI_INCOMPLETE", "AI_SCHEMA_MISMATCH"] as const)(
    "maps %s to explicit human handling without free text fallback",
    async (code) => {
      const store = new FakeWorkerStore(message("RecommendChallengesRequested"));
      const abort = new FakePlatformAbort();
      const worker = createWorker(
        store,
        new FakeIntelligence(
          new HiringIntelligenceError(code, "recommendChallenges", false, "Synthetic failure."),
        ),
        new FakeSandbox("unused"),
        abort,
      );

      await expect(worker.runOnce("worker-test")).resolves.toBe("PROCESSED");
      expect(store.failure).toMatchObject({ status: "NEEDS_HUMAN", errorCode: code });
      expect(store.retry).toBeNull();
      expect(abort.calls).toHaveLength(0);
    },
  );

  it("lets only the Worker schedule a transient AI retry and then fail permanently", async () => {
    const transient = new HiringIntelligenceError(
      "AI_PROVIDER_UNAVAILABLE",
      "recommendChallenges",
      true,
      "Synthetic provider outage.",
    );
    const retryStore = new FakeWorkerStore(message("RecommendChallengesRequested", 1));
    const abort = new FakePlatformAbort();
    const retryWorker = createWorker(
      retryStore,
      new FakeIntelligence(transient),
      new FakeSandbox("unused"),
      abort,
    );
    await expect(retryWorker.runOnce("worker-test")).resolves.toBe("RETRY_SCHEDULED");
    expect(retryStore.retry).toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
    expect(retryStore.failure).toBeNull();

    const exhaustedStore = new FakeWorkerStore(message("RecommendChallengesRequested", 3));
    const exhaustedWorker = createWorker(
      exhaustedStore,
      new FakeIntelligence(transient),
      new FakeSandbox("unused"),
      abort,
    );
    await expect(exhaustedWorker.runOnce("worker-test")).resolves.toBe("PROCESSED");
    expect(exhaustedStore.failure).toMatchObject({
      status: "FAILED_PERMANENT",
      errorCode: "AI_PROVIDER_UNAVAILABLE",
    });
  });

  it("persists a validated structured recommendation completion", async () => {
    const store = new FakeWorkerStore(message("RecommendChallengesRequested"));
    const worker = createWorker(
      store,
      new FakeIntelligence(),
      new FakeSandbox("unused"),
      new FakePlatformAbort(),
    );

    await expect(worker.runOnce("worker-test")).resolves.toBe("PROCESSED");
    expect(store.completion).toMatchObject({
      status: "SUCCEEDED",
      output: { decision: "recommend" },
      employerProjection: { recommendation: { status: "READY" } },
    });
  });

  it("loads the exact selected branch and projects Candidate Stage B", async () => {
    const store = new FakeWorkerStore(message("HumanChallengeSelected"));
    const worker = createWorker(
      store,
      new FakeIntelligence(),
      new FakeSandbox("verification-42-redis-failover"),
      new FakePlatformAbort(),
    );

    await expect(worker.runOnce("worker-test")).resolves.toBe("PROCESSED");
    expect(store.selectedCompletion).toMatchObject({
      sandboxBranchRef: "verification-42-redis-failover",
      candidateProjection: {
        state: "STAGE_B_ACTIVE",
        selected_challenge: {
          challenge_ref: "payment-retry/redis-failover@1",
          sandbox_branch_ref: "verification-42-redis-failover",
        },
      },
    });
  });

  it("turns exhausted Sandbox failure into Platform Abort, never Employer Breach", async () => {
    const sandboxError = Object.assign(new Error("Synthetic Sandbox failure."), {
      code: "SANDBOX_FAILURE",
      retryable: false,
    });
    const retryStore = new FakeWorkerStore(message("HumanChallengeSelected", 1));
    const abort = new FakePlatformAbort();
    const retryWorker = createWorker(
      retryStore,
      new FakeIntelligence(),
      new FakeSandbox(sandboxError),
      abort,
    );
    await expect(retryWorker.runOnce("worker-test")).resolves.toBe("RETRY_SCHEDULED");
    expect(retryStore.retry).toMatchObject({ code: "SANDBOX_FAILURE" });

    const exhaustedStore = new FakeWorkerStore(message("HumanChallengeSelected", 3));
    const exhaustedWorker = createWorker(
      exhaustedStore,
      new FakeIntelligence(),
      new FakeSandbox(sandboxError),
      abort,
    );
    await expect(exhaustedWorker.runOnce("worker-test")).resolves.toBe("PROCESSED");
    expect(abort.calls).toHaveLength(1);
    expect(abort.calls[0]).toMatchObject({
      reviewWindowId: "review-window-42",
      reasonRef: "sandbox-retry-exhausted",
    });
    expect(JSON.stringify(abort.calls)).not.toContain("EmployerBreach");
    expect(exhaustedStore.selectedCompletion).toBeNull();
  });
});
