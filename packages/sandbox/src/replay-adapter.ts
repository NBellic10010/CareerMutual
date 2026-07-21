import type { SandboxPort } from "./port.js";
import {
  ApplyChallengeInputSchema,
  ApplyPatchInputSchema,
  CreateSandboxInputSchema,
  CreateSnapshotInputSchema,
  ReplaySandboxFixtureSchema,
  RunHiddenTestsInputSchema,
  RunVisibleTestsInputSchema,
  type ApplyChallengeInput,
  type ApplyPatchInput,
  type ArtifactRef,
  type CreateSandboxInput,
  type CreateSnapshotInput,
  type ReplayChallengeBranch,
  type ReplaySandboxFixture,
  type ReplaySessionFixture,
  type RunHiddenTestsInput,
  type RunVisibleTestsInput,
  type SandboxSession,
  type SnapshotRef,
  type TestRunRef,
  type VerificationRef,
} from "./schemas.js";

type ReplaySessionState = "ACTIVE" | "CHECKPOINT_PENDING" | "STAGE_B_ACTIVE" | "DESTROYED";

interface SessionRuntime {
  readonly fixture: ReplaySessionFixture;
  state: ReplaySessionState;
  artifactApplied: boolean;
  visibleTestsRun: boolean;
  selectedChallengeRef: string | null;
}

export class ReplaySandboxError extends Error {
  override readonly name = "ReplaySandboxError";

  constructor(
    readonly code:
      | "REPLAY_FIXTURE_NOT_FOUND"
      | "REPLAY_INPUT_MISMATCH"
      | "REPLAY_SESSION_NOT_FOUND"
      | "REPLAY_INVALID_STATE"
      | "REPLAY_CHALLENGE_NOT_RECORDED",
    message: string,
  ) {
    super(message);
  }
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class ReplaySandboxAdapter implements SandboxPort {
  readonly #fixture: ReplaySandboxFixture;
  readonly #runtimeBySessionId = new Map<string, SessionRuntime>();

  constructor(fixtureInput: unknown) {
    this.#fixture = ReplaySandboxFixtureSchema.parse(fixtureInput);
  }

  async createSession(input: CreateSandboxInput): Promise<SandboxSession> {
    const parsed = CreateSandboxInputSchema.parse(input);
    const fixture = this.#fixture.sessions.find(
      (session) => session.session_key === parsed.session_key,
    );
    if (fixture === undefined) {
      throw new ReplaySandboxError(
        "REPLAY_FIXTURE_NOT_FOUND",
        `No replay session exists for key '${parsed.session_key}'.`,
      );
    }
    if (
      fixture.proof_ref !== parsed.proof_ref ||
      fixture.base_snapshot_version !== parsed.base_snapshot_version
    ) {
      throw new ReplaySandboxError(
        "REPLAY_INPUT_MISMATCH",
        "Replay create input does not match the pinned fixture.",
      );
    }

    const existing = this.#runtimeBySessionId.get(fixture.session.session_id);
    if (existing?.state === "DESTROYED") {
      throw new ReplaySandboxError(
        "REPLAY_INVALID_STATE",
        "A destroyed replay session cannot be restarted in place.",
      );
    }
    if (existing === undefined) {
      this.#runtimeBySessionId.set(fixture.session.session_id, {
        fixture,
        state: "ACTIVE",
        artifactApplied: false,
        visibleTestsRun: false,
        selectedChallengeRef: null,
      });
    }

    return copy(fixture.session);
  }

  async applyCandidatePatch(input: ApplyPatchInput): Promise<ArtifactRef> {
    const parsed = ApplyPatchInputSchema.parse(input);
    const runtime = this.getRuntime(parsed.session_id);
    this.assertState(runtime, "ACTIVE");
    if (parsed.patch_ref !== runtime.fixture.expected_patch_ref) {
      throw new ReplaySandboxError(
        "REPLAY_INPUT_MISMATCH",
        "Patch reference does not match the recorded candidate artifact.",
      );
    }
    runtime.artifactApplied = true;
    return copy(runtime.fixture.artifact);
  }

  async runVisibleTests(input: RunVisibleTestsInput): Promise<TestRunRef> {
    const parsed = RunVisibleTestsInputSchema.parse(input);
    const runtime = this.getRuntime(parsed.session_id);
    this.assertState(runtime, "ACTIVE");
    if (!runtime.artifactApplied || parsed.artifact_ref !== runtime.fixture.artifact.artifact_ref) {
      throw new ReplaySandboxError(
        "REPLAY_INVALID_STATE",
        "Visible tests require the pinned candidate artifact.",
      );
    }
    runtime.visibleTestsRun = true;
    return copy(runtime.fixture.visible_test_run);
  }

  async createSnapshot(input: CreateSnapshotInput): Promise<SnapshotRef> {
    const parsed = CreateSnapshotInputSchema.parse(input);
    const runtime = this.getRuntime(parsed.session_id);
    this.assertState(runtime, "ACTIVE");
    if (
      !runtime.artifactApplied ||
      !runtime.visibleTestsRun ||
      parsed.artifact_ref !== runtime.fixture.artifact.artifact_ref
    ) {
      throw new ReplaySandboxError(
        "REPLAY_INVALID_STATE",
        "Stage A snapshot requires the pinned artifact and visible test run.",
      );
    }
    if (parsed.remaining_time_seconds !== runtime.fixture.snapshot.remaining_time_seconds) {
      throw new ReplaySandboxError(
        "REPLAY_INPUT_MISMATCH",
        "Remaining proof time does not match the recorded snapshot.",
      );
    }
    runtime.state = "CHECKPOINT_PENDING";
    return copy(runtime.fixture.snapshot);
  }

  async applyChallenge(input: ApplyChallengeInput): Promise<void> {
    const parsed = ApplyChallengeInputSchema.parse(input);
    const runtime = this.getRuntime(parsed.session_id);
    this.assertState(runtime, "CHECKPOINT_PENDING");
    if (parsed.snapshot_ref !== runtime.fixture.snapshot.snapshot_ref) {
      throw new ReplaySandboxError(
        "REPLAY_INPUT_MISMATCH",
        "Challenge must be applied to the immutable Stage A snapshot.",
      );
    }

    this.findBranch(runtime.fixture, parsed);
    runtime.selectedChallengeRef = parsed.challenge_ref;
    runtime.state = "STAGE_B_ACTIVE";
  }

  async runHiddenTests(input: RunHiddenTestsInput): Promise<VerificationRef> {
    const parsed = RunHiddenTestsInputSchema.parse(input);
    const runtime = this.getRuntime(parsed.session_id);
    this.assertState(runtime, "STAGE_B_ACTIVE");
    if (
      parsed.snapshot_ref !== runtime.fixture.snapshot.snapshot_ref ||
      parsed.challenge_ref !== runtime.selectedChallengeRef
    ) {
      throw new ReplaySandboxError(
        "REPLAY_INPUT_MISMATCH",
        "Verification input does not match the selected Stage B branch.",
      );
    }

    const branch = runtime.fixture.challenge_branches.find(
      (candidate) => candidate.challenge_ref === parsed.challenge_ref,
    );
    if (branch === undefined) {
      throw new ReplaySandboxError(
        "REPLAY_CHALLENGE_NOT_RECORDED",
        "Selected challenge has no verifier replay branch.",
      );
    }
    return copy(branch.verification);
  }

  async destroySession(sessionId: string): Promise<void> {
    const runtime = this.getRuntime(sessionId);
    runtime.state = "DESTROYED";
  }

  private getRuntime(sessionId: string): SessionRuntime {
    const runtime = this.#runtimeBySessionId.get(sessionId);
    if (runtime === undefined) {
      throw new ReplaySandboxError(
        "REPLAY_SESSION_NOT_FOUND",
        `Replay session '${sessionId}' does not exist.`,
      );
    }
    return runtime;
  }

  private assertState(runtime: SessionRuntime, expected: ReplaySessionState): void {
    if (runtime.state !== expected) {
      throw new ReplaySandboxError(
        "REPLAY_INVALID_STATE",
        `Replay operation requires state '${expected}', but session is '${runtime.state}'.`,
      );
    }
  }

  private findBranch(
    fixture: ReplaySessionFixture,
    input: ApplyChallengeInput,
  ): ReplayChallengeBranch {
    const branch = fixture.challenge_branches.find(
      (candidate) => candidate.challenge_ref === input.challenge_ref,
    );
    if (branch === undefined) {
      throw new ReplaySandboxError(
        "REPLAY_CHALLENGE_NOT_RECORDED",
        `Challenge '${input.challenge_ref}' is not present in this replay fixture.`,
      );
    }
    if (
      branch.catalog_ref !== input.catalog_ref ||
      branch.catalog_manifest_hash !== input.catalog_manifest_hash
    ) {
      throw new ReplaySandboxError(
        "REPLAY_INPUT_MISMATCH",
        "Challenge branch does not match the pinned Catalog version.",
      );
    }
    return branch;
  }
}
