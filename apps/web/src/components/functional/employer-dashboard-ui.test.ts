import { EmployerJobDashboardSchema } from "@onlyboth/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmployerDashboard, summarizeEmployerAttention } from "./employer-dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("Employer mutual-intent dashboard", () => {
  it("summarizes funded capacity, waiting intent, and review debt without ranking Candidates", () => {
    const summary = summarizeEmployerAttention([
      {
        answer_review_wip: 2,
        available_slot_count: 1,
        waiting_interest_count: 4,
        pending_review_count: 1,
      },
      {
        answer_review_wip: 3,
        available_slot_count: 2,
        waiting_interest_count: 5,
        pending_review_count: 0,
      },
    ]);

    expect(summary).toEqual({ slots: 5, available: 3, waiting: 9, reviewDebt: 1 });
    expect(Object.keys(summary)).not.toContain("score");
    expect(Object.keys(summary)).not.toContain("rank");
  });

  it("renders only the Employer theme and Employer comic on the Recruiter Home", () => {
    const dashboard = EmployerJobDashboardSchema.parse({
      schema_version: "employer-job-dashboard@1",
      reviewer_ref: "reviewer-sarah-chen",
      wallet: {
        schema_version: "employer-attention-wallet-projection@1",
        owner_ref: "reviewer-sarah-chen",
        available_credits: 8,
        committed_credits: 0,
        forfeited_credits: 0,
        version: 1,
      },
      drafts: [],
      job_posts: [],
    });
    const markup = renderToStaticMarkup(
      createElement(EmployerDashboard, { initialDashboard: dashboard, csrfToken: "synthetic" }),
    );

    expect(markup).toContain('data-role-theme="employer"');
    expect(markup).toContain("employer-attention-hero.webp");
    expect(markup).not.toContain("candidate-intent-hero.webp");
  });
});
