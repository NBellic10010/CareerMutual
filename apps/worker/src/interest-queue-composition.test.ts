import { readFileSync } from "node:fs";

import { ExpireAnswerInvitationHandler, InterestQueueWorker } from "@onlyboth/application";
import { describe, expect, it } from "vitest";

import type { WorkerConfig } from "./config.js";
import { createInterestQueueWorkerComposition } from "./interest-queue-composition.js";

const CONFIG: WorkerConfig = {
  runtimeMode: "GOLDEN_REPLAY",
  databaseUrl: "postgresql://onlyboth@localhost/onlyboth_test",
  sandboxAdapter: "replay",
  replayId: "matching-v1",
};

describe("Interest Queue Worker composition", () => {
  it("composes the Application Worker and PostgreSQL Store without opening a connection", async () => {
    const composition = createInterestQueueWorkerComposition(CONFIG);
    try {
      expect(composition.worker).toBeInstanceOf(InterestQueueWorker);
      expect(composition.expiry).toBeInstanceOf(ExpireAnswerInvitationHandler);
    } finally {
      await composition.pool.end();
    }
  });

  it("contains no AI, Sandbox, HTTP, or model adapter", () => {
    const source = readFileSync(
      new URL("./interest-queue-composition.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("PostgresInterestQueueStore");
    expect(source).toContain("PostgresAnswerInvitationDecisionStore");
    expect(source).toContain("OfferNextQueuedInterestHandler");
    expect(source).toContain("ExpireAnswerInvitationHandler");
    expect(source).toContain("`sha256:${");
    expect(source).not.toMatch(
      /@onlyboth\/ai|@onlyboth\/sandbox|OpenAI|HiringIntelligence|fetch\(|axios/iu,
    );
  });

  it("is run and closed by both once and continuous runtime paths", () => {
    const source = readFileSync(new URL("./worker-runtime.ts", import.meta.url), "utf8");

    expect(source).toContain("createInterestQueueWorkerComposition");
    expect(source).toMatch(
      /interestQueueComposition\.worker\.runOnce\(\s*"interest-queue-worker-once"/u,
    );
    expect(source).toMatch(
      /interestQueueComposition\.worker\.runOnce\(\s*"interest-queue-worker-continuous"/u,
    );
    expect(source).toContain("interestQueueComposition.expiry.executeNext()");
    expect(source).toContain("interestQueueComposition.pool.end()");
    expect(source).toContain("await Promise.all(");
  });
});
