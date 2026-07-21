import { PAYMENT_RETRY_REPLAY_FIXTURE, ReplaySandboxAdapter } from "@onlyboth/sandbox";

const CATALOG_HASH = "sha256:0c18eb5d79ae4f22e13509a446b4fdcdb6b9c46cedea82ca65f4c108a2d81ee5";
const SMOKE_CHALLENGE_REF = "payment-retry/redis-failover@1";

export interface GoldenReplaySmokeResult {
  readonly replayId: string;
  readonly verificationRef: string;
}

export class GoldenReplaySmokeError extends Error {
  override readonly name = "GoldenReplaySmokeError";
  readonly code = "GOLDEN_REPLAY_FIXTURE_MISMATCH";

  constructor(replayId: string) {
    super(`Golden Replay fixture '${replayId}' is not available in this worker build.`);
  }
}

export async function runGoldenReplaySmoke(replayId: string): Promise<GoldenReplaySmokeResult> {
  if (replayId !== PAYMENT_RETRY_REPLAY_FIXTURE.replay_id) {
    throw new GoldenReplaySmokeError(replayId);
  }

  const sandbox = new ReplaySandboxAdapter(PAYMENT_RETRY_REPLAY_FIXTURE);
  const session = await sandbox.createSession({
    schema_version: "create-sandbox-input@1",
    session_key: "candidate-42",
    proof_ref: "proof-42",
    base_snapshot_version: "payment-retry@1",
  });
  const artifact = await sandbox.applyCandidatePatch({
    schema_version: "apply-patch-input@1",
    session_id: session.session_id,
    patch_ref: "patch-42-stage-a",
  });
  await sandbox.runVisibleTests({
    schema_version: "run-visible-tests-input@1",
    session_id: session.session_id,
    artifact_ref: artifact.artifact_ref,
  });
  const snapshot = await sandbox.createSnapshot({
    schema_version: "create-snapshot-input@1",
    session_id: session.session_id,
    artifact_ref: artifact.artifact_ref,
    remaining_time_seconds: 180,
  });
  await sandbox.applyChallenge({
    schema_version: "apply-challenge-input@1",
    session_id: session.session_id,
    snapshot_ref: snapshot.snapshot_ref,
    challenge_ref: SMOKE_CHALLENGE_REF,
    catalog_ref: "payment-retry@1",
    catalog_manifest_hash: CATALOG_HASH,
  });
  const verification = await sandbox.runHiddenTests({
    schema_version: "run-hidden-tests-input@1",
    session_id: session.session_id,
    snapshot_ref: snapshot.snapshot_ref,
    challenge_ref: SMOKE_CHALLENGE_REF,
  });
  await sandbox.destroySession(session.session_id);

  return {
    replayId,
    verificationRef: verification.verification_ref,
  };
}
