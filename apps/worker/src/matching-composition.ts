import { MatchEdgeWorker } from "@onlyboth/application";
import {
  GoldenReplayHiringIntelligenceAdapter,
  LiveResponsesHiringIntelligenceAdapter,
  PROMPT_REGISTRY,
  UnconfiguredHiringIntelligenceAdapter,
  hashCanonicalJson,
  validateMatchEdgeDraft,
} from "@onlyboth/ai";
import { PostgresMatchEdgeWorkerStore, createPostgresPool } from "@onlyboth/db";

import type { WorkerConfig } from "./config.js";

export function createMatchingWorkerComposition(config: WorkerConfig): {
  readonly pool: ReturnType<typeof createPostgresPool>;
  readonly worker: MatchEdgeWorker;
} {
  const pool = createPostgresPool(config.databaseUrl);
  const store = new PostgresMatchEdgeWorkerStore(pool);
  const intelligence =
    config.runtimeMode === "GOLDEN_REPLAY"
      ? new GoldenReplayHiringIntelligenceAdapter(config.replayId)
      : config.runtimeMode === "LIVE"
        ? new LiveResponsesHiringIntelligenceAdapter({ apiKey: config.openAiApiKey })
        : new UnconfiguredHiringIntelligenceAdapter();
  const spec = PROMPT_REGISTRY.buildMatchEdge;
  if (spec.promptHash === undefined) throw new Error("MatchEdge prompt hash is required.");
  return {
    pool,
    worker: new MatchEdgeWorker({
      store,
      intelligence,
      validate: validateMatchEdgeDraft,
      hash: hashCanonicalJson,
      prompt: {
        promptId: spec.promptId,
        promptVersion: spec.promptVersion,
        promptHash: spec.promptHash,
        inputSchemaVersion: spec.inputSchemaVersion,
        outputSchemaVersion: spec.outputSchemaVersion,
      },
      adapterId:
        config.runtimeMode === "GOLDEN_REPLAY"
          ? "golden-replay-match-edge@1"
          : config.runtimeMode === "LIVE"
            ? "openai-responses-match-edge@1"
            : "unconfigured-match-edge@1",
    }),
  };
}
