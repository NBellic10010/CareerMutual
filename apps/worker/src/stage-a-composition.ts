import { randomUUID } from "node:crypto";

import {
  ExpireProofWindowHandler,
  StageAReplayWorker,
  SubmitMatchingStageAHandler,
  type MatchingStageAIdFactory,
  type ProofWindowDecisionIdFactory,
  type StageAReplayContext,
  type StageAReplayExecutionPort,
  type StageAReplayResult,
} from "@onlyboth/application";
import {
  PostgresMatchingStageAStore,
  PostgresProofWindowDecisionStore,
  createPostgresPool,
} from "@onlyboth/db";
import {
  DockerSandboxAdapter,
  PAYMENT_RETRY_REPLAY_FIXTURE,
  ReplaySandboxAdapter,
  type SandboxPort,
} from "@onlyboth/sandbox";

import type { WorkerConfig } from "./config.js";

class SandboxStageAReplayExecution implements StageAReplayExecutionPort {
  public constructor(private readonly sandbox: SandboxPort) {}

  public async execute(context: StageAReplayContext): Promise<StageAReplayResult> {
    const session = await this.sandbox.createSession({
      schema_version: "create-sandbox-input@1",
      session_key: context.replaySessionKey,
      proof_ref: context.proofSessionRef,
      base_snapshot_version: context.baseSnapshotVersion,
    });
    const artifact = await this.sandbox.applyCandidatePatch({
      schema_version: "apply-patch-input@1",
      session_id: session.session_id,
      patch_ref: context.patchRef,
    });
    if (artifact.artifact_ref !== context.expectedArtifactRef) {
      throw new Error("Stage A artifact does not match the pinned Replay input.");
    }
    const visibleTests = await this.sandbox.runVisibleTests({
      schema_version: "run-visible-tests-input@1",
      session_id: session.session_id,
      artifact_ref: artifact.artifact_ref,
    });
    const snapshot = await this.sandbox.createSnapshot({
      schema_version: "create-snapshot-input@1",
      session_id: session.session_id,
      artifact_ref: artifact.artifact_ref,
      remaining_time_seconds: context.remainingTimeSeconds,
    });
    if (snapshot.snapshot_ref !== context.expectedSnapshotRef) {
      throw new Error("Stage A snapshot does not match the pinned Replay input.");
    }
    return {
      sandboxSessionRef: session.session_id,
      artifactRef: artifact.artifact_ref,
      artifactHash: artifact.sha256,
      visibleTestRunRef: visibleTests.test_run_ref,
      visibleTestResultHash: visibleTests.normalized_result_hash,
      snapshotRef: snapshot.snapshot_ref,
      snapshotHash: snapshot.sha256,
      remainingTimeSeconds: snapshot.remaining_time_seconds,
    };
  }
}

const ids: MatchingStageAIdFactory = {
  nextId: (kind) => `${kind}-${randomUUID()}`,
};

const expiryIds: ProofWindowDecisionIdFactory = {
  nextId: (kind) => `${kind}-${randomUUID()}`,
};

export function createStageAWorkerComposition(config: WorkerConfig): {
  readonly pool: ReturnType<typeof createPostgresPool>;
  readonly worker: StageAReplayWorker;
  readonly expiry: ExpireProofWindowHandler;
} {
  const pool = createPostgresPool(config.databaseUrl);
  const store = new PostgresMatchingStageAStore(pool);
  const sandbox =
    config.runtimeMode === "GOLDEN_REPLAY"
      ? new ReplaySandboxAdapter(PAYMENT_RETRY_REPLAY_FIXTURE)
      : new DockerSandboxAdapter();
  return {
    pool,
    worker: new StageAReplayWorker(
      store,
      new SandboxStageAReplayExecution(sandbox),
      new SubmitMatchingStageAHandler(store, ids),
    ),
    expiry: new ExpireProofWindowHandler(new PostgresProofWindowDecisionStore(pool), expiryIds),
  };
}
