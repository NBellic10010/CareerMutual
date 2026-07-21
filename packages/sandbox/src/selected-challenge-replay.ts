import type {
  SelectedChallengeSandboxPort,
  SelectedChallengeWorkerContext,
} from "@onlyboth/application";

import { PAYMENT_RETRY_REPLAY_FIXTURE } from "./fixtures/payment-retry-v1.js";
import { ReplaySandboxAdapter } from "./replay-adapter.js";

type SelectedChallengeInput = Omit<
  SelectedChallengeWorkerContext,
  "candidateProjection" | "employerProjection"
>;

/**
 * Reconstructs the recorded Stage A boundary, then applies Sarah's actual
 * selected Catalog ref. A fresh adapter per call makes retry behavior
 * deterministic and prevents an earlier partial attempt from selecting a branch.
 */
export class ReplaySelectedChallengeSandboxAdapter implements SelectedChallengeSandboxPort {
  public async applySelectedChallenge(
    input: SelectedChallengeInput,
  ): Promise<{ readonly branchRef: string }> {
    const replay = new ReplaySandboxAdapter(PAYMENT_RETRY_REPLAY_FIXTURE);
    const session = await replay.createSession({
      schema_version: "create-sandbox-input@1",
      session_key: input.sessionKey,
      proof_ref: input.proofRef,
      base_snapshot_version: input.baseSnapshotVersion,
    });
    if (session.session_id !== input.sessionId) {
      throw new Error("Replay Sandbox session does not match the persisted Proof Session.");
    }
    const artifact = await replay.applyCandidatePatch({
      schema_version: "apply-patch-input@1",
      session_id: session.session_id,
      patch_ref: input.patchRef,
    });
    if (artifact.artifact_ref !== input.artifactRef) {
      throw new Error("Replay artifact does not match the persisted Stage A artifact.");
    }
    await replay.runVisibleTests({
      schema_version: "run-visible-tests-input@1",
      session_id: session.session_id,
      artifact_ref: artifact.artifact_ref,
    });
    const snapshot = await replay.createSnapshot({
      schema_version: "create-snapshot-input@1",
      session_id: session.session_id,
      artifact_ref: artifact.artifact_ref,
      remaining_time_seconds: input.remainingTimeSeconds,
    });
    if (snapshot.snapshot_ref !== input.snapshotRef) {
      throw new Error("Replay snapshot does not match the immutable Stage A snapshot.");
    }
    await replay.applyChallenge({
      schema_version: "apply-challenge-input@1",
      session_id: session.session_id,
      snapshot_ref: snapshot.snapshot_ref,
      challenge_ref: input.challengeRef,
      catalog_ref: input.catalogRef,
      catalog_manifest_hash: input.catalogHash,
    });
    const verification = await replay.runHiddenTests({
      schema_version: "run-hidden-tests-input@1",
      session_id: session.session_id,
      snapshot_ref: snapshot.snapshot_ref,
      challenge_ref: input.challengeRef,
    });
    return { branchRef: verification.verification_ref };
  }
}
