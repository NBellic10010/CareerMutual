import { ReplaySelectedChallengeSandboxAdapter } from "../../packages/sandbox/src/index";
import { describe, expect, it } from "vitest";

const BRANCHES = [
  ["payment-retry/redis-failover@1", "verification-42-redis-failover"],
  ["payment-retry/duplicate-webhook@1", "verification-42-duplicate-webhook"],
  ["payment-retry/cross-region-retry@1", "verification-42-cross-region-retry"],
] as const;

describe("Sarah-selected Replay Sandbox branch parity", () => {
  it.each(BRANCHES)("loads %s as %s", async (challengeRef, branchRef) => {
    const adapter = new ReplaySelectedChallengeSandboxAdapter();
    await expect(
      adapter.applySelectedChallenge({
        reviewWindowId: "review-window-42",
        aggregateVersion: 4,
        challengeRef,
        candidateNotice: `Sarah chose ${challengeRef}.`,
        sessionKey: "candidate-42",
        proofRef: "proof-42",
        sessionId: "replay-session-42",
        baseSnapshotVersion: "payment-retry@1",
        patchRef: "patch-42-stage-a",
        artifactRef: "artifact-42-stage-a",
        snapshotRef: "snapshot-42-stage-a",
        remainingTimeSeconds: 180,
        catalogRef: "payment-retry@1",
        catalogHash: "sha256:0c18eb5d79ae4f22e13509a446b4fdcdb6b9c46cedea82ca65f4c108a2d81ee5",
      }),
    ).resolves.toEqual({ branchRef });
  });

  it("fails closed when persisted Catalog hash does not match the replay branch", async () => {
    const adapter = new ReplaySelectedChallengeSandboxAdapter();
    await expect(
      adapter.applySelectedChallenge({
        reviewWindowId: "review-window-42",
        aggregateVersion: 4,
        challengeRef: "payment-retry/redis-failover@1",
        candidateNotice: "Synthetic notice.",
        sessionKey: "candidate-42",
        proofRef: "proof-42",
        sessionId: "replay-session-42",
        baseSnapshotVersion: "payment-retry@1",
        patchRef: "patch-42-stage-a",
        artifactRef: "artifact-42-stage-a",
        snapshotRef: "snapshot-42-stage-a",
        remainingTimeSeconds: 180,
        catalogRef: "payment-retry@1",
        catalogHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      }),
    ).rejects.toMatchObject({ code: "REPLAY_INPUT_MISMATCH" });
  });
});
