import { describe, expect, it } from "vitest";

import { loadWorkerConfig, WorkerConfigurationError } from "./config.js";

describe("loadWorkerConfig", () => {
  it("accepts Golden Replay without an OpenAI key", () => {
    expect(
      loadWorkerConfig({
        RUNTIME_MODE: "GOLDEN_REPLAY",
        DATABASE_URL: "postgresql://onlyboth@localhost/onlyboth",
        SANDBOX_ADAPTER: "replay",
        REPLAY_ID: "payment-retry-v1",
      }),
    ).toEqual({
      runtimeMode: "GOLDEN_REPLAY",
      databaseUrl: "postgresql://onlyboth@localhost/onlyboth",
      sandboxAdapter: "replay",
      replayId: "payment-retry-v1",
    });
  });

  it("requires the OpenAI key for LIVE", () => {
    expect(() =>
      loadWorkerConfig({
        RUNTIME_MODE: "LIVE",
        DATABASE_URL: "postgresql://onlyboth@localhost/onlyboth",
        SANDBOX_ADAPTER: "docker",
      }),
    ).toThrowError(WorkerConfigurationError);
  });
});
