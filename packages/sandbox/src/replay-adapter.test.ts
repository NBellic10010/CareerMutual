import { describe, expect, it } from "vitest";

import { PAYMENT_RETRY_REPLAY_FIXTURE } from "./fixtures/payment-retry-v1.js";
import { ReplaySandboxAdapter, ReplaySandboxError } from "./replay-adapter.js";
import type { VerificationRef } from "./schemas.js";

const CATALOG_HASH = "sha256:0c18eb5d79ae4f22e13509a446b4fdcdb6b9c46cedea82ca65f4c108a2d81ee5";

async function runReplayBranch(challengeRef: string): Promise<VerificationRef> {
  const adapter = new ReplaySandboxAdapter(PAYMENT_RETRY_REPLAY_FIXTURE);
  const session = await adapter.createSession({
    schema_version: "create-sandbox-input@1",
    session_key: "candidate-42",
    proof_ref: "proof-42",
    base_snapshot_version: "payment-retry@1",
  });
  const artifact = await adapter.applyCandidatePatch({
    schema_version: "apply-patch-input@1",
    session_id: session.session_id,
    patch_ref: "patch-42-stage-a",
  });
  await adapter.runVisibleTests({
    schema_version: "run-visible-tests-input@1",
    session_id: session.session_id,
    artifact_ref: artifact.artifact_ref,
  });
  const snapshot = await adapter.createSnapshot({
    schema_version: "create-snapshot-input@1",
    session_id: session.session_id,
    artifact_ref: artifact.artifact_ref,
    remaining_time_seconds: 180,
  });
  await adapter.applyChallenge({
    schema_version: "apply-challenge-input@1",
    session_id: session.session_id,
    snapshot_ref: snapshot.snapshot_ref,
    challenge_ref: challengeRef,
    catalog_ref: "payment-retry@1",
    catalog_manifest_hash: CATALOG_HASH,
  });
  return adapter.runHiddenTests({
    schema_version: "run-hidden-tests-input@1",
    session_id: session.session_id,
    snapshot_ref: snapshot.snapshot_ref,
    challenge_ref: challengeRef,
  });
}

describe("ReplaySandboxAdapter", () => {
  it("returns the same normalized verifier result for the same pinned branch", async () => {
    const first = await runReplayBranch("payment-retry/redis-failover@1");
    const second = await runReplayBranch("payment-retry/redis-failover@1");

    expect(first).toEqual(second);
    expect(first.normalized_result_hash).toBe(
      "sha256:853c46d7b9726862ae4af7d7f0e685ab8be587349d4fe587bf82b4dafff83e24",
    );
  });

  it("resolves a different recorded verifier branch for a different human challenge", async () => {
    const failover = await runReplayBranch("payment-retry/redis-failover@1");
    const duplicateWebhook = await runReplayBranch("payment-retry/duplicate-webhook@1");

    expect(duplicateWebhook.challenge_ref).toBe("payment-retry/duplicate-webhook@1");
    expect(duplicateWebhook.normalized_result_hash).not.toBe(failover.normalized_result_hash);
    expect(duplicateWebhook.common_verifier_ref).toBe(failover.common_verifier_ref);
  });

  it("refuses an unrecorded or out-of-order challenge", async () => {
    const adapter = new ReplaySandboxAdapter(PAYMENT_RETRY_REPLAY_FIXTURE);
    const session = await adapter.createSession({
      schema_version: "create-sandbox-input@1",
      session_key: "candidate-42",
      proof_ref: "proof-42",
      base_snapshot_version: "payment-retry@1",
    });

    await expect(
      adapter.runHiddenTests({
        schema_version: "run-hidden-tests-input@1",
        session_id: session.session_id,
        snapshot_ref: "snapshot-42-stage-a",
        challenge_ref: "payment-retry/redis-failover@1",
      }),
    ).rejects.toBeInstanceOf(ReplaySandboxError);
  });
});
