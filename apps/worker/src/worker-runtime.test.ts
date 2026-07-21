import { describe, expect, it } from "vitest";

import type { WorkerConfig } from "./config.js";
import type { StructuredLogEntry } from "./structured-logger.js";
import { executeWorkerCommand } from "./worker-runtime.js";

const FIXED_NOW = new Date("2026-07-18T21:00:00.000Z");

function createLogCollector(): {
  readonly entries: StructuredLogEntry[];
  readonly dependencies: {
    readonly now: () => Date;
    readonly emit: (entry: StructuredLogEntry) => void;
  };
} {
  const entries: StructuredLogEntry[] = [];
  return {
    entries,
    dependencies: {
      now: () => FIXED_NOW,
      emit: (entry) => entries.push(entry),
    },
  };
}

describe("executeWorkerCommand", () => {
  it("runs a keyless Golden Replay scaffold smoke and exits successfully", async () => {
    const config: WorkerConfig = {
      runtimeMode: "GOLDEN_REPLAY",
      databaseUrl: "postgresql://onlyboth@localhost/onlyboth",
      sandboxAdapter: "replay",
      replayId: "payment-retry-v1",
    };
    const collector = createLogCollector();

    await expect(executeWorkerCommand(config, "smoke", collector.dependencies)).resolves.toBe(0);
    expect(collector.entries).toEqual([
      {
        timestamp: FIXED_NOW.toISOString(),
        level: "info",
        service: "worker",
        runtime_mode: "GOLDEN_REPLAY",
        trace_id: "worker-bootstrap",
        correlation_id: "worker-bootstrap",
        command_or_job: "golden-replay-scaffold-smoke",
        actor_role: "SYSTEM",
        outcome: "smoke_succeeded",
        fixture_ref: "payment-retry-v1",
        verification_ref: "verification-42-redis-failover",
        synthetic: true,
      },
    ]);
  });

  it.each([
    {
      runtimeMode: "LIVE",
      databaseUrl: "postgresql://onlyboth@localhost/onlyboth",
      sandboxAdapter: "docker",
      openAiApiKey: "test-key-not-logged",
    } satisfies WorkerConfig,
    {
      runtimeMode: "CACHED_AI",
      databaseUrl: "postgresql://onlyboth@localhost/onlyboth",
      sandboxAdapter: "docker",
      aiFixtureId: "payment-retry-ai-v1",
    } satisfies WorkerConfig,
  ])("keeps $runtimeMode fail-closed when composition is not wired", async (config) => {
    const collector = createLogCollector();

    await expect(executeWorkerCommand(config, "smoke", collector.dependencies)).resolves.toBe(1);
    expect(collector.entries).toHaveLength(1);
    expect(collector.entries[0]).toMatchObject({
      level: "error",
      outcome: "refused_to_start",
      error_code: "WORKER_ADAPTERS_NOT_WIRED",
    });
    expect(JSON.stringify(collector.entries)).not.toContain("test-key-not-logged");
  });

  it("fails a Golden Replay smoke when its fixture is not present", async () => {
    const config: WorkerConfig = {
      runtimeMode: "GOLDEN_REPLAY",
      databaseUrl: "postgresql://onlyboth@localhost/onlyboth",
      sandboxAdapter: "replay",
      replayId: "unknown-replay-v1",
    };
    const collector = createLogCollector();

    await expect(executeWorkerCommand(config, "smoke", collector.dependencies)).resolves.toBe(1);
    expect(collector.entries[0]).toMatchObject({
      outcome: "smoke_failed",
      error_code: "GOLDEN_REPLAY_FIXTURE_MISMATCH",
      fixture_ref: "unknown-replay-v1",
    });
  });
});
