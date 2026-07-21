import {
  MatchEdgeWorker,
  type ClaimedMatchingMessage,
  type MatchEdgeWorkerStore,
  type MatchingInterestContext,
  type MatchingWorkerCompletion,
  type MatchRequestStart,
} from "../../packages/application/src/index";
import type { HiringIntelligencePort } from "../../packages/application/src/index";
import { syntheticBuildMatchEdgeInput, syntheticMatchEdgeOutput } from "@onlyboth/demo-replay";
import { describe, expect, it, vi } from "vitest";

const message: ClaimedMatchingMessage = {
  messageId: "message-42",
  eventId: "event-42",
  correlationId: "correlation-42",
  interestRef: "interest-42",
  matchingCycleRef: "matching-cycle-senior-backend-1",
  candidateRef: "candidate-42",
  leaseOwner: "worker-1",
  attempt: 1,
};

function context(overrides: Partial<MatchingInterestContext> = {}): MatchingInterestContext {
  const input = syntheticBuildMatchEdgeInput("candidate-42");
  return {
    interestRef: "interest-42",
    opportunityRef: input.matching_cycle.opportunity_ref,
    candidateRef: input.claim_snapshot.candidate_ref,
    matchingCycleRef: input.matching_cycle.matching_cycle_ref,
    matchingCycleVersion: input.matching_cycle.version,
    contractVersionRef: input.sealed_contract.contract_version_ref,
    contractHash: input.sealed_contract.contract_hash,
    sealedContract: input.sealed_contract,
    claimSnapshot: input.claim_snapshot,
    sourceRefs: input.source_refs,
    allowedProofTemplates: input.allowed_proof_templates,
    eligibilityPredicates: [
      {
        predicateRef: "predicate:work-authorization",
        factRef: "work_authorization",
        operator: "EQUALS",
        expected: "US",
      },
    ],
    runtimeMode: "GOLDEN_REPLAY",
    replayId: "matching-v1",
    alreadyEvaluated: false,
    ...overrides,
  };
}

class MemoryStore implements MatchEdgeWorkerStore {
  public completions: MatchingWorkerCompletion[] = [];
  public starts: MatchRequestStart[] = [];
  public currentContext: MatchingInterestContext | null = context();

  public async claimNext(): Promise<ClaimedMatchingMessage | null> {
    return message;
  }

  public async loadInterestContext(): Promise<MatchingInterestContext | null> {
    return this.currentContext;
  }

  public async startRequest(_message: ClaimedMatchingMessage, request: MatchRequestStart) {
    this.starts.push(request);
  }

  public async complete(_message: ClaimedMatchingMessage, completion: MatchingWorkerCompletion) {
    this.completions.push(completion);
  }
}

function worker(store: MemoryStore, intelligence: HiringIntelligencePort): MatchEdgeWorker {
  return new MatchEdgeWorker({
    store,
    intelligence,
    validate: (_input, output) => output,
    hash: (value) => `hash:${JSON.stringify(value).length}`,
    prompt: {
      promptId: "onlyboth.build-match-edge",
      promptVersion: "1.0.0",
      promptHash: `sha256:${"1".repeat(64)}`,
      inputSchemaVersion: "build-match-edge-input@2",
      outputSchemaVersion: "match-edge-draft@2",
    },
    adapterId: "golden-replay-match-edge@1",
  });
}

describe("MatchEdge Worker decision mapping", () => {
  it("short-circuits an already evaluated duplicate without invoking AI", async () => {
    const store = new MemoryStore();
    store.currentContext = context({ alreadyEvaluated: true });
    const buildMatchEdge = vi.fn();

    await expect(
      worker(store, {
        compileContract: vi.fn(),
        buildMatchEdge,
        recommendChallenges: vi.fn(),
        compressEvidence: vi.fn(),
      }).runOnce("worker-1"),
    ).resolves.toBe("PROCESSED");

    expect(buildMatchEdge).not.toHaveBeenCalled();
    expect(store.starts).toHaveLength(0);
    expect(store.completions).toEqual([{ kind: "DUPLICATE" }]);
  });

  it("persists a validated terminal proposal", async () => {
    const store = new MemoryStore();
    const output = syntheticMatchEdgeOutput("candidate-42");
    const intelligence: HiringIntelligencePort = {
      compileContract: vi.fn(),
      buildMatchEdge: vi.fn().mockResolvedValue(output),
      recommendChallenges: vi.fn(),
      compressEvidence: vi.fn(),
    };

    await expect(worker(store, intelligence).runOnce("worker-1")).resolves.toBe("PROCESSED");

    expect(store.starts).toHaveLength(1);
    expect(store.completions[0]).toMatchObject({
      kind: "TERMINAL",
      matchEdgeRef: "match-edge-42",
      output: { decision: "propose" },
    });
  });

  it("retries a transient platform failure and sends refusal/incomplete to human review", async () => {
    const transient = Object.assign(new Error("temporary"), {
      code: "AI_TRANSPORT_ERROR",
      retryable: true,
    });
    const retryStore = new MemoryStore();
    await expect(
      worker(retryStore, {
        compileContract: vi.fn(),
        buildMatchEdge: vi.fn().mockRejectedValue(transient),
        recommendChallenges: vi.fn(),
        compressEvidence: vi.fn(),
      }).runOnce("worker-1"),
    ).resolves.toBe("RETRY_SCHEDULED");
    expect(retryStore.completions).toEqual([
      {
        kind: "RETRYABLE",
        requestId: "match-request:42",
        errorCode: "AI_TRANSPORT_ERROR",
        retryAfterSeconds: 1,
      },
    ]);

    for (const code of ["AI_REFUSAL", "AI_INCOMPLETE"] as const) {
      const failedStore = new MemoryStore();
      const error = Object.assign(new Error(code), { code, retryable: false });
      await worker(failedStore, {
        compileContract: vi.fn(),
        buildMatchEdge: vi.fn().mockRejectedValue(error),
        recommendChallenges: vi.fn(),
        compressEvidence: vi.fn(),
      }).runOnce("worker-1");
      expect(failedStore.completions[0]).toEqual({
        kind: "NEEDS_HUMAN",
        requestId: "match-request:42",
        errorCode: code,
      });
    }
  });
});
