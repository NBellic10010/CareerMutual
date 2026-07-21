import { ReplaySandboxFixtureSchema } from "../schemas.js";

const CATALOG_HASH = "sha256:0c18eb5d79ae4f22e13509a446b4fdcdb6b9c46cedea82ca65f4c108a2d81ee5";

export const PAYMENT_RETRY_REPLAY_FIXTURE = ReplaySandboxFixtureSchema.parse({
  schema_version: "sandbox-replay@1",
  replay_id: "payment-retry-v1",
  sessions: [
    {
      session_key: "candidate-42",
      proof_ref: "proof-42",
      base_snapshot_version: "payment-retry@1",
      session: {
        schema_version: "sandbox-session@1",
        session_id: "replay-session-42",
        proof_ref: "proof-42",
        base_snapshot_version: "payment-retry@1",
      },
      expected_patch_ref: "patch-42-stage-a",
      artifact: {
        schema_version: "artifact-ref@1",
        artifact_ref: "artifact-42-stage-a",
        sha256: "sha256:8f2363f4f6c73b702d263b49b0440ce1e6f531a0d79a25aff7d9773e7cd4e5e1",
      },
      visible_test_run: {
        schema_version: "test-run-ref@1",
        test_run_ref: "visible-tests-42-stage-a",
        status: "passed",
        normalized_result_hash:
          "sha256:b79aaaf98e1fed3058429ec2a53cbf877772bca1284ce1fbd09a339fd0dca34c",
      },
      snapshot: {
        schema_version: "snapshot-ref@1",
        snapshot_ref: "snapshot-42-stage-a",
        artifact_ref: "artifact-42-stage-a",
        sha256: "sha256:6cc5ea23916ea9b4dafff0ea1dad6117afc1edee60af42bba700a11574f83e10",
        remaining_time_seconds: 180,
      },
      challenge_branches: [
        {
          challenge_ref: "payment-retry/redis-failover@1",
          catalog_ref: "payment-retry@1",
          catalog_manifest_hash: CATALOG_HASH,
          verification: {
            schema_version: "verification-ref@1",
            verification_ref: "verification-42-redis-failover",
            challenge_ref: "payment-retry/redis-failover@1",
            common_verifier_ref: "common-verifier-42-v1",
            scenario_verifier_ref: "scenario-verifier-42-redis-failover-v1",
            normalized_result_hash:
              "sha256:853c46d7b9726862ae4af7d7f0e685ab8be587349d4fe587bf82b4dafff83e24",
          },
        },
        {
          challenge_ref: "payment-retry/duplicate-webhook@1",
          catalog_ref: "payment-retry@1",
          catalog_manifest_hash: CATALOG_HASH,
          verification: {
            schema_version: "verification-ref@1",
            verification_ref: "verification-42-duplicate-webhook",
            challenge_ref: "payment-retry/duplicate-webhook@1",
            common_verifier_ref: "common-verifier-42-v1",
            scenario_verifier_ref: "scenario-verifier-42-duplicate-webhook-v1",
            normalized_result_hash:
              "sha256:cb3858c44b612fe20968e834e958fe55ab63923e245dce18c5885ba12c475674",
          },
        },
        {
          challenge_ref: "payment-retry/cross-region-retry@1",
          catalog_ref: "payment-retry@1",
          catalog_manifest_hash: CATALOG_HASH,
          verification: {
            schema_version: "verification-ref@1",
            verification_ref: "verification-42-cross-region-retry",
            challenge_ref: "payment-retry/cross-region-retry@1",
            common_verifier_ref: "common-verifier-42-v1",
            scenario_verifier_ref: "scenario-verifier-42-cross-region-retry-v1",
            normalized_result_hash:
              "sha256:27f0917277e8000780b87a143d5051f9ba467e5a586d335fc9c4a3e4afef9072",
          },
        },
      ],
    },
  ],
});
