import {
  CandidateReviewWindowProjectionSchema,
  EmployerReviewWindowProjectionSchema,
} from "@onlyboth/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CandidateCheckpointPanel } from "./candidate-checkpoint-panel";
import { EmployerChallengePanel } from "./employer-challenge-panel";

const employerProjection = EmployerReviewWindowProjectionSchema.parse({
  schema_version: "employer-review-window-projection@1",
  view: "EMPLOYER",
  review_window_id: "review-window-42",
  aggregate_version: 3,
  state: "CHECKPOINT_PENDING",
  runtime_mode: "GOLDEN_REPLAY",
  synthetic: true,
  disclosure: "Synthetic — Pre-recorded external inputs",
  reviewer: { id: "reviewer-sarah-chen", display_name: "Sarah Chen" },
  candidate: { opaque_id: "Candidate 42" },
  recommendation: {
    status: "READY",
    output_ref: "ai-output-42",
    prompt_version: "1.1.0",
    input_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    options: ["redis-failover", "duplicate-webhook", "cross-region-retry"].map((id, index) => ({
      challenge_ref: `payment-retry/${id}@1`,
      tests: [`Capability · test-${index}`],
      why: `Evidence-linked reason ${index}.`,
      sources: ["evidence-E17"],
      still_unknown: ["One bounded unknown remains."],
    })),
    reason_code: null,
  },
  authorization: null,
});

describe("interactive role panels", () => {
  it("renders three equal-weight Employer cards with evidence and human CTAs", () => {
    const markup = renderToStaticMarkup(
      createElement(EmployerChallengePanel, {
        initialProjection: employerProjection,
        csrfToken: "test-csrf-not-rendered",
      }),
    );

    expect(markup.match(/Authorize this challenge/gu)).toHaveLength(3);
    expect(markup).toContain("Tests");
    expect(markup).toContain("Why");
    expect(markup).toContain("Sources");
    expect(markup).toContain("Still unknown");
    expect(markup).not.toContain("test-csrf-not-rendered");
    expect(markup).not.toMatch(/rank|score|best option/iu);
  });

  it("keeps the recommendation list out of a pending Candidate projection", () => {
    const pending = CandidateReviewWindowProjectionSchema.parse({
      schema_version: "candidate-review-window-projection@1",
      view: "CANDIDATE",
      review_window_id: "review-window-42",
      aggregate_version: 3,
      candidate_ref: "candidate-42",
      reviewer: { id: "reviewer-sarah-chen", display_name: "Sarah Chen" },
      runtime_mode: "GOLDEN_REPLAY",
      synthetic: true,
      state: "CHECKPOINT_PENDING",
      selected_challenge: null,
      message: "Sarah is reviewing your Stage A evidence.",
    });
    const markup = renderToStaticMarkup(
      createElement(CandidateCheckpointPanel, { initialProjection: pending }),
    );

    expect(markup).toContain("CHECKPOINT_PENDING");
    expect(markup).not.toContain("redis-failover");
    expect(markup).not.toContain("duplicate-webhook");
    expect(markup).not.toContain("cross-region-retry");
  });

  it("renders the exact selected Challenge and Replay branch after projection", () => {
    const active = CandidateReviewWindowProjectionSchema.parse({
      schema_version: "candidate-review-window-projection@1",
      view: "CANDIDATE",
      review_window_id: "review-window-42",
      aggregate_version: 4,
      candidate_ref: "candidate-42",
      reviewer: { id: "reviewer-sarah-chen", display_name: "Sarah Chen" },
      runtime_mode: "GOLDEN_REPLAY",
      synthetic: true,
      state: "STAGE_B_ACTIVE",
      selected_challenge: {
        challenge_ref: "payment-retry/duplicate-webhook@1",
        candidate_notice: "The reviewer chose duplicate webhook delivery.",
        sandbox_branch_ref: "verification-42-duplicate-webhook",
      },
      message: "Sarah chose to test payment-retry/duplicate-webhook@1.",
    });
    const markup = renderToStaticMarkup(
      createElement(CandidateCheckpointPanel, { initialProjection: active }),
    );

    expect(markup).toContain("payment-retry/duplicate-webhook@1");
    expect(markup).toContain("verification-42-duplicate-webhook");
  });
});
