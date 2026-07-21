import { EmployerRevealedCandidatePageSchema } from "@onlyboth/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RoleBreadcrumb, RoleNavigation } from "../app-shell";
import { EmployerRevealedCandidates } from "./employer-revealed-candidates";

function renderPage(items: unknown[]) {
  const result = EmployerRevealedCandidatePageSchema.parse({
    schema_version: "employer-revealed-candidate-page@1",
    reviewer_ref: "reviewer-sarah-chen",
    page: 1,
    page_size: 1,
    total_items: items.length,
    total_pages: items.length,
    items,
  });
  return renderToStaticMarkup(createElement(EmployerRevealedCandidates, { result }));
}

describe("role-aware navigation and Resume reveal workspace", () => {
  it("shows only the active role's top-level navigation", () => {
    const candidate = renderToStaticMarkup(createElement(RoleNavigation, { role: "CANDIDATE" }));
    expect(candidate).toContain("Opportunities");
    expect(candidate).toContain("Evidence Passport");
    expect(candidate).not.toContain("JobPosts");
    expect(candidate).not.toContain("Revealed Candidates");

    const recruiter = renderToStaticMarkup(createElement(RoleNavigation, { role: "EMPLOYER" }));
    expect(recruiter).toContain("JobPosts");
    expect(recruiter).toContain("Revealed Candidates");
    expect(recruiter).not.toContain("Evidence Passport");

    const candidateBreadcrumb = renderToStaticMarkup(
      createElement(RoleBreadcrumb, { role: "CANDIDATE" }),
    );
    const recruiterBreadcrumb = renderToStaticMarkup(
      createElement(RoleBreadcrumb, { role: "EMPLOYER" }),
    );
    expect(candidateBreadcrumb).toContain(
      'OnlyBoth</strong><span aria-hidden="true">/</span><span>Candidate',
    );
    expect(candidateBreadcrumb).toContain('href="/candidate"');
    expect(recruiterBreadcrumb).toContain(
      'OnlyBoth</strong><span aria-hidden="true">/</span><span>Recruiter',
    );
    expect(recruiterBreadcrumb).toContain('href="/employer"');
  });

  it("does not render identity or Resume details before an authorized reveal exists", () => {
    const markup = renderPage([]);
    expect(markup).toContain("No Candidate Resume is available yet");
    expect(markup).not.toContain("Jordan Rivera");
    expect(markup).not.toContain("Synthetic Regional University");
    expect(markup).not.toContain("jordan@example.test");
  });

  it("keeps the Human Review receipt ahead of the separately paginated Resume", () => {
    const markup = renderPage([
      {
        reveal_ref: "resume-reveal:synthetic-1",
        opportunity_ref: "opportunity:functional-demo",
        opportunity_title: "Senior Backend Reliability Engineer",
        human_review_ref: "human-review:synthetic-1",
        answer_submission_ref: "answer-submission:synthetic-1",
        review_comment:
          "The anonymous answer identifies durable idempotency boundaries and falsifiable failure tests.",
        revealed_at: "2026-07-21T12:00:00.000Z",
        resume: {
          schema_version: "candidate-resume-snapshot@1",
          resume_snapshot_ref: "resume-snapshot:candidate-42:1",
          candidate_ref: "candidate-42",
          snapshot_version: 1,
          display_name: "Jordan Rivera",
          headline: "Backend reliability engineer",
          location: "New York, NY",
          contact_email: "jordan@example.test",
          summary:
            "Synthetic backend engineer focused on payment reliability, durable workflows, and observable recovery paths.",
          education: [
            {
              institution: "Synthetic Regional University",
              credential: "Bachelor of Science",
              field_of_study: "Computer science",
              graduation_date: "2025-05-15",
            },
          ],
          experience: [
            {
              organization: "Synthetic Payments Lab",
              title: "Backend Engineer",
              started_on: "2023-01-01",
              ended_on: null,
              highlights: [
                "Designed a synthetic payment retry ledger with durable idempotency boundaries.",
              ],
            },
          ],
          certifications: ["Synthetic cloud reliability certificate"],
          skills: ["PostgreSQL", "Distributed systems"],
          source_sha256: `sha256:${"a".repeat(64)}`,
          synthetic: true,
          sealed_at: "2026-07-21T10:00:00.000Z",
        },
      },
    ]);
    expect(markup.indexOf("Answer passed before identity reveal")).toBeLessThan(
      markup.indexOf("Jordan Rivera"),
    );
    expect(markup).toContain("1 / 1");
    expect(markup).toContain("Synthetic Regional University");
  });
});
