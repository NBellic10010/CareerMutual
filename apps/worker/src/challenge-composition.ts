import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  AbortPlatformFailureHandler,
  ChallengeRecommendationWorker,
  VeiledChallengeInputAssembler,
  type ApplicationIdFactory,
  type ChallengeCatalogSelectionPort,
  type ChallengeRecommendationValidatorPort,
  type SelectedChallengeSandboxPort,
} from "@onlyboth/application";
import {
  CANDIDATE_42_RECOMMENDATION_INPUT,
  GoldenReplayHiringIntelligenceAdapter,
  LiveResponsesHiringIntelligenceAdapter,
  PROMPT_REGISTRY,
  RECOMMEND_CHALLENGES_PROMPT_HASH,
  hashCanonicalJson,
  validateChallengeRecommendation,
} from "@onlyboth/ai";
import { ChallengeCatalogRegistry } from "@onlyboth/challenge-catalog";
import {
  PostgresChallengeRecommendationWorkerStore,
  PostgresChallengeStore,
  createPostgresPool,
} from "@onlyboth/db";
import { ReplaySelectedChallengeSandboxAdapter } from "@onlyboth/sandbox";
import type { Pool } from "pg";

import type { WorkerConfig } from "./config.js";

const manifestJson = readFileSync(
  new URL("../../../challenges/payment-retry/v1/manifest.json", import.meta.url),
  "utf8",
);
const lockJson = readFileSync(
  new URL("../../../packages/challenge-catalog/src/catalog.lock.json", import.meta.url),
  "utf8",
);

function createCatalogPort(registry: ChallengeCatalogRegistry): ChallengeCatalogSelectionPort {
  const pin = registry.getVersionPin();
  return {
    catalogRef: registry.catalogRef,
    catalogHash: registry.manifestHash,
    listRecommendationOptions(capabilityRefs) {
      return registry.listRecommendationOptions(capabilityRefs).map((option) => ({
        challengeId: option.challenge_id,
        version: option.version,
        capabilityRefs: option.capability_refs,
        candidateNotice: option.candidate_notice,
      }));
    },
    resolveChallenge(challengeRef) {
      const challenge = registry.resolveExecutableChallenge(challengeRef, pin);
      return {
        challengeRef,
        candidateNotice: challenge.candidate_notice,
        capabilityRefs: challenge.capability_refs,
      };
    },
  };
}

const ids: ApplicationIdFactory = {
  nextId: (kind) => `${kind}-${randomUUID()}`,
};

class UnavailableSelectedChallengeSandbox implements SelectedChallengeSandboxPort {
  public async applySelectedChallenge(): Promise<never> {
    const error = new Error("The live Docker Sandbox is outside this milestone.") as Error & {
      code: string;
      retryable: boolean;
    };
    error.code = "SANDBOX_ADAPTER_NOT_CONFIGURED";
    error.retryable = false;
    throw error;
  }
}

export interface ChallengeWorkerComposition {
  readonly pool: Pool;
  readonly worker: ChallengeRecommendationWorker;
}

export function createChallengeWorkerComposition(config: WorkerConfig): ChallengeWorkerComposition {
  const pool = createPostgresPool(config.databaseUrl);
  const registry = ChallengeCatalogRegistry.fromJson(manifestJson, lockJson);
  const catalog = createCatalogPort(registry);
  const intelligence =
    config.runtimeMode === "GOLDEN_REPLAY"
      ? new GoldenReplayHiringIntelligenceAdapter(config.replayId)
      : config.runtimeMode === "LIVE"
        ? new LiveResponsesHiringIntelligenceAdapter({ apiKey: config.openAiApiKey })
        : null;
  if (intelligence === null) {
    void pool.end();
    throw new Error("CACHED_AI is not implemented in the Candidate 42 milestone.");
  }
  const validator: ChallengeRecommendationValidatorPort = {
    validate(input, output) {
      return validateChallengeRecommendation(input, output, registry, registry.getVersionPin());
    },
  };
  const store = new PostgresChallengeRecommendationWorkerStore(pool);
  const commandStore = new PostgresChallengeStore(pool);
  const sandbox =
    config.runtimeMode === "GOLDEN_REPLAY"
      ? new ReplaySelectedChallengeSandboxAdapter()
      : new UnavailableSelectedChallengeSandbox();
  const spec = PROMPT_REGISTRY.recommendChallenges;
  const worker = new ChallengeRecommendationWorker(
    store,
    intelligence,
    validator,
    new VeiledChallengeInputAssembler(catalog),
    { hash: hashCanonicalJson },
    sandbox,
    new AbortPlatformFailureHandler(commandStore, ids),
    ids,
    {
      promptId: spec.promptId,
      promptVersion: spec.promptVersion,
      promptHash: RECOMMEND_CHALLENGES_PROMPT_HASH,
      inputSchemaVersion: spec.inputSchemaVersion,
      outputSchemaVersion: spec.outputSchemaVersion,
    },
  );
  return { pool, worker };
}

export async function runLiveRecommendationSmoke(config: WorkerConfig): Promise<number> {
  if (config.runtimeMode !== "LIVE") {
    throw new Error("LIVE smoke requires RUNTIME_MODE=LIVE.");
  }
  const registry = ChallengeCatalogRegistry.fromJson(manifestJson, lockJson);
  const adapter = new LiveResponsesHiringIntelligenceAdapter({ apiKey: config.openAiApiKey });
  const output = await adapter.recommendChallenges(CANDIDATE_42_RECOMMENDATION_INPUT);
  const validated = validateChallengeRecommendation(
    CANDIDATE_42_RECOMMENDATION_INPUT,
    output,
    registry,
    registry.getVersionPin(),
  );
  return validated.decision === "recommend" ? validated.recommendations.length : 0;
}
