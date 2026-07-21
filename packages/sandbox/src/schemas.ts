import { z } from "zod";

const OpaqueRefSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/u);
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

export const CreateSandboxInputSchema = z
  .object({
    schema_version: z.literal("create-sandbox-input@1"),
    session_key: OpaqueRefSchema,
    proof_ref: OpaqueRefSchema,
    base_snapshot_version: OpaqueRefSchema,
  })
  .strict();

export const SandboxSessionSchema = z
  .object({
    schema_version: z.literal("sandbox-session@1"),
    session_id: OpaqueRefSchema,
    proof_ref: OpaqueRefSchema,
    base_snapshot_version: OpaqueRefSchema,
  })
  .strict();

export const ApplyPatchInputSchema = z
  .object({
    schema_version: z.literal("apply-patch-input@1"),
    session_id: OpaqueRefSchema,
    patch_ref: OpaqueRefSchema,
  })
  .strict();

export const ArtifactRefSchema = z
  .object({
    schema_version: z.literal("artifact-ref@1"),
    artifact_ref: OpaqueRefSchema,
    sha256: Sha256Schema,
  })
  .strict();

export const RunVisibleTestsInputSchema = z
  .object({
    schema_version: z.literal("run-visible-tests-input@1"),
    session_id: OpaqueRefSchema,
    artifact_ref: OpaqueRefSchema,
  })
  .strict();

export const TestRunRefSchema = z
  .object({
    schema_version: z.literal("test-run-ref@1"),
    test_run_ref: OpaqueRefSchema,
    status: z.enum(["passed", "failed"]),
    normalized_result_hash: Sha256Schema,
  })
  .strict();

export const CreateSnapshotInputSchema = z
  .object({
    schema_version: z.literal("create-snapshot-input@1"),
    session_id: OpaqueRefSchema,
    artifact_ref: OpaqueRefSchema,
    remaining_time_seconds: z.number().int().min(0).max(3600),
  })
  .strict();

export const SnapshotRefSchema = z
  .object({
    schema_version: z.literal("snapshot-ref@1"),
    snapshot_ref: OpaqueRefSchema,
    artifact_ref: OpaqueRefSchema,
    sha256: Sha256Schema,
    remaining_time_seconds: z.number().int().min(0).max(3600),
  })
  .strict();

export const ApplyChallengeInputSchema = z
  .object({
    schema_version: z.literal("apply-challenge-input@1"),
    session_id: OpaqueRefSchema,
    snapshot_ref: OpaqueRefSchema,
    challenge_ref: OpaqueRefSchema,
    catalog_ref: OpaqueRefSchema,
    catalog_manifest_hash: Sha256Schema,
  })
  .strict();

export const RunHiddenTestsInputSchema = z
  .object({
    schema_version: z.literal("run-hidden-tests-input@1"),
    session_id: OpaqueRefSchema,
    snapshot_ref: OpaqueRefSchema,
    challenge_ref: OpaqueRefSchema,
  })
  .strict();

export const VerificationRefSchema = z
  .object({
    schema_version: z.literal("verification-ref@1"),
    verification_ref: OpaqueRefSchema,
    challenge_ref: OpaqueRefSchema,
    common_verifier_ref: OpaqueRefSchema,
    scenario_verifier_ref: OpaqueRefSchema,
    normalized_result_hash: Sha256Schema,
  })
  .strict();

export const ReplayChallengeBranchSchema = z
  .object({
    challenge_ref: OpaqueRefSchema,
    catalog_ref: OpaqueRefSchema,
    catalog_manifest_hash: Sha256Schema,
    verification: VerificationRefSchema,
  })
  .strict();

export const ReplaySessionFixtureSchema = z
  .object({
    session_key: OpaqueRefSchema,
    proof_ref: OpaqueRefSchema,
    base_snapshot_version: OpaqueRefSchema,
    session: SandboxSessionSchema,
    expected_patch_ref: OpaqueRefSchema,
    artifact: ArtifactRefSchema,
    visible_test_run: TestRunRefSchema,
    snapshot: SnapshotRefSchema,
    challenge_branches: z.array(ReplayChallengeBranchSchema).min(1).max(20),
  })
  .strict();

export const ReplaySandboxFixtureSchema = z
  .object({
    schema_version: z.literal("sandbox-replay@1"),
    replay_id: OpaqueRefSchema,
    sessions: z.array(ReplaySessionFixtureSchema).min(1).max(100),
  })
  .strict()
  .superRefine((fixture, context) => {
    const sessionKeys = new Set<string>();
    const sessionIds = new Set<string>();

    fixture.sessions.forEach((session, index) => {
      if (sessionKeys.has(session.session_key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate replay session key.",
          path: ["sessions", index, "session_key"],
        });
      }
      if (sessionIds.has(session.session.session_id)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate replay session ID.",
          path: ["sessions", index, "session", "session_id"],
        });
      }
      if (
        session.session.proof_ref !== session.proof_ref ||
        session.session.base_snapshot_version !== session.base_snapshot_version
      ) {
        context.addIssue({
          code: "custom",
          message: "Replay session output must match its create input.",
          path: ["sessions", index, "session"],
        });
      }
      if (session.snapshot.artifact_ref !== session.artifact.artifact_ref) {
        context.addIssue({
          code: "custom",
          message: "Snapshot must pin the replay artifact.",
          path: ["sessions", index, "snapshot"],
        });
      }

      const branchRefs = new Set<string>();
      session.challenge_branches.forEach((branch, branchIndex) => {
        if (branchRefs.has(branch.challenge_ref)) {
          context.addIssue({
            code: "custom",
            message: "Duplicate challenge branch.",
            path: ["sessions", index, "challenge_branches", branchIndex, "challenge_ref"],
          });
        }
        if (branch.verification.challenge_ref !== branch.challenge_ref) {
          context.addIssue({
            code: "custom",
            message: "Verification challenge must match its replay branch.",
            path: ["sessions", index, "challenge_branches", branchIndex, "verification"],
          });
        }
        branchRefs.add(branch.challenge_ref);
      });

      sessionKeys.add(session.session_key);
      sessionIds.add(session.session.session_id);
    });
  });

export type CreateSandboxInput = z.infer<typeof CreateSandboxInputSchema>;
export type SandboxSession = z.infer<typeof SandboxSessionSchema>;
export type ApplyPatchInput = z.infer<typeof ApplyPatchInputSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type RunVisibleTestsInput = z.infer<typeof RunVisibleTestsInputSchema>;
export type TestRunRef = z.infer<typeof TestRunRefSchema>;
export type CreateSnapshotInput = z.infer<typeof CreateSnapshotInputSchema>;
export type SnapshotRef = z.infer<typeof SnapshotRefSchema>;
export type ApplyChallengeInput = z.infer<typeof ApplyChallengeInputSchema>;
export type RunHiddenTestsInput = z.infer<typeof RunHiddenTestsInputSchema>;
export type VerificationRef = z.infer<typeof VerificationRefSchema>;
export type ReplayChallengeBranch = z.infer<typeof ReplayChallengeBranchSchema>;
export type ReplaySessionFixture = z.infer<typeof ReplaySessionFixtureSchema>;
export type ReplaySandboxFixture = z.infer<typeof ReplaySandboxFixtureSchema>;
