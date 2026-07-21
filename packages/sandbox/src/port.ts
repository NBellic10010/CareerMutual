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

/**
 * Application-facing orchestration port. A live adapter must delegate hidden
 * tests to a separate verifier isolation boundary; it must not mount them in
 * the candidate session.
 */
export interface SandboxPort {
  createSession(input: CreateSandboxInput): Promise<SandboxSession>;
  applyCandidatePatch(input: ApplyPatchInput): Promise<ArtifactRef>;
  runVisibleTests(input: RunVisibleTestsInput): Promise<TestRunRef>;
  createSnapshot(input: CreateSnapshotInput): Promise<SnapshotRef>;
  applyChallenge(input: ApplyChallengeInput): Promise<void>;
  runHiddenTests(input: RunHiddenTestsInput): Promise<VerificationRef>;
  destroySession(sessionId: string): Promise<void>;
}
