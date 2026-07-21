import type { SandboxPort } from "./port.js";
import type {
  ApplyChallengeInput,
  ApplyPatchInput,
  ArtifactRef,
  CreateSandboxInput,
  CreateSnapshotInput,
  RunHiddenTestsInput,
  RunVisibleTestsInput,
  SandboxSession,
  SnapshotRef,
  TestRunRef,
  VerificationRef,
} from "./schemas.js";

export class DockerSandboxUnavailableError extends Error {
  override readonly name = "DockerSandboxUnavailableError";
  readonly code = "DOCKER_SANDBOX_NOT_CONFIGURED";

  constructor(readonly operation: keyof SandboxPort) {
    super(
      `Sandbox operation '${operation}' is unavailable because Docker execution has not been configured.`,
    );
  }
}

/**
 * Fail-closed scaffold for the live adapter. No candidate code or model output
 * is executed until the isolation and verifier runners are explicitly wired.
 */
export class DockerSandboxAdapter implements SandboxPort {
  createSession(_input: CreateSandboxInput): Promise<SandboxSession> {
    return Promise.reject(new DockerSandboxUnavailableError("createSession"));
  }

  applyCandidatePatch(_input: ApplyPatchInput): Promise<ArtifactRef> {
    return Promise.reject(new DockerSandboxUnavailableError("applyCandidatePatch"));
  }

  runVisibleTests(_input: RunVisibleTestsInput): Promise<TestRunRef> {
    return Promise.reject(new DockerSandboxUnavailableError("runVisibleTests"));
  }

  createSnapshot(_input: CreateSnapshotInput): Promise<SnapshotRef> {
    return Promise.reject(new DockerSandboxUnavailableError("createSnapshot"));
  }

  applyChallenge(_input: ApplyChallengeInput): Promise<void> {
    return Promise.reject(new DockerSandboxUnavailableError("applyChallenge"));
  }

  runHiddenTests(_input: RunHiddenTestsInput): Promise<VerificationRef> {
    return Promise.reject(new DockerSandboxUnavailableError("runHiddenTests"));
  }

  destroySession(_sessionId: string): Promise<void> {
    return Promise.reject(new DockerSandboxUnavailableError("destroySession"));
  }
}
