import { ChallengeRecommendationSchema, RecommendChallengesInputSchema } from "@onlyboth/contracts";

import { hashCanonicalJson } from "../canonical-json.js";
import { RECOMMEND_CHALLENGES_PROMPT_VERSION } from "../recommend-challenges-prompt.js";

const HASH_A = "sha256:b79aaaf98e1fed3058429ec2a53cbf877772bca1284ce1fbd09a339fd0dca34c";
const HASH_B = "sha256:8f2363f4f6c73b702d263b49b0440ce1e6f531a0d79a25aff7d9773e7cd4e5e1";
const HASH_C = "sha256:6cc5ea23916ea9b4dafff0ea1dad6117afc1edee60af42bba700a11574f83e10";

export const CANDIDATE_42_RECOMMENDATION_INPUT = RecommendChallengesInputSchema.parse({
  schema_version: "recommend-challenges-input@1",
  request_ref: "ai-request-candidate-42-challenges",
  review_window_ref: "review-window-42",
  contract_version_ref: "contract-payment-retry@1",
  challenge_catalog_version_ref: "payment-retry@1",
  capability_refs: [
    "clarify_ambiguous_failure",
    "inspect_state_transition",
    "design_verification",
    "revise_under_failover",
  ],
  stage_a_evidence: [
    {
      evidence_ref: "evidence-E17",
      evidence_type: "verification",
      summary: "The common verifier exercised concurrent retries against the Stage A artifact.",
      sha256: HASH_A,
    },
    {
      evidence_ref: "evidence-D04",
      evidence_type: "diff",
      summary: "The Stage A change moved the idempotency guard ahead of payment execution.",
      sha256: HASH_B,
    },
    {
      evidence_ref: "evidence-C09",
      evidence_type: "event",
      summary: "The candidate explicitly marked acknowledgement loss as unresolved.",
      sha256: HASH_C,
    },
  ],
  allowed_challenges: [
    {
      challenge_id: "payment-retry/redis-failover",
      version: 1,
      capability_refs: ["inspect_state_transition", "revise_under_failover"],
      candidate_notice: "The reviewer chose to test acknowledgement loss during Redis failover.",
    },
    {
      challenge_id: "payment-retry/duplicate-webhook",
      version: 1,
      capability_refs: ["inspect_state_transition", "design_verification"],
      candidate_notice:
        "The reviewer chose to test duplicate webhook delivery after payment acceptance.",
    },
    {
      challenge_id: "payment-retry/cross-region-retry",
      version: 1,
      capability_refs: ["clarify_ambiguous_failure", "revise_under_failover"],
      candidate_notice:
        "The reviewer chose to test a delayed retry crossing regional ownership boundaries.",
    },
  ],
});

export const CANDIDATE_42_RECOMMENDATION_OUTPUT = ChallengeRecommendationSchema.parse({
  schema_version: "challenge-recommendation@1",
  decision: "recommend",
  recommendations: [
    {
      challenge_id: "payment-retry/redis-failover",
      version: 1,
      capability_refs: ["inspect_state_transition", "revise_under_failover"],
      evidence_refs: ["evidence-E17", "evidence-C09"],
      rationale:
        "Tests whether the Stage A transition remains single-commit when acknowledgement is lost during failover.",
    },
    {
      challenge_id: "payment-retry/duplicate-webhook",
      version: 1,
      capability_refs: ["inspect_state_transition", "design_verification"],
      evidence_refs: ["evidence-E17", "evidence-D04"],
      rationale:
        "Tests whether the earlier idempotency guard also contains repeated delivery after acceptance.",
    },
    {
      challenge_id: "payment-retry/cross-region-retry",
      version: 1,
      capability_refs: ["clarify_ambiguous_failure", "revise_under_failover"],
      evidence_refs: ["evidence-D04", "evidence-C09"],
      rationale:
        "Tests whether the stated failure boundary holds when retry ownership moves across regions.",
    },
  ],
  still_unknown: ["The Stage A evidence does not show behavior after regional ownership transfer."],
  reason: null,
});

export const CANDIDATE_42_RECOMMENDATION_INPUT_HASH = hashCanonicalJson(
  CANDIDATE_42_RECOMMENDATION_INPUT,
);

export const CANDIDATE_42_GOLDEN_KEY_PARTS = Object.freeze({
  operation: "recommendChallenges" as const,
  input_hash: CANDIDATE_42_RECOMMENDATION_INPUT_HASH,
  prompt_version: RECOMMEND_CHALLENGES_PROMPT_VERSION,
  input_schema_version: "recommend-challenges-input@1",
  output_schema_version: "challenge-recommendation@1",
  replay_id: "payment-retry-v1",
});
