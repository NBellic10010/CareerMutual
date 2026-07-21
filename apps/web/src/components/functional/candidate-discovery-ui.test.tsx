import { CandidateOpportunityFeedV2Schema } from "@onlyboth/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CandidateHome } from "./candidate-home";

function job(
  opportunityRef: string,
  title: string,
  status: "EVIDENCE_CONNECTED" | "INSUFFICIENT_SOURCE",
) {
  return {
    schema_version: "candidate-job-card@2" as const,
    opportunity_ref: opportunityRef,
    opportunity_version: 1,
    title,
    organization_public_name: "Synthetic Public Organization",
    public_role_summary:
      "A synthetic public role that remains visible regardless of Candidate discovery guidance.",
    employment_type: "FULL_TIME",
    seniority_band: "SENIOR",
    compensation_range: "$180k–$220k",
    location_and_work_mode: "Remote",
    maximum_candidate_minutes: 6,
    human_review_sla_hours: 24,
    candidate_ai_policy: "PLATFORM_ASSISTANT_ALLOWED" as const,
    interest_state: "NOT_REGISTERED" as const,
    backed_offer: null,
    active_answer_session_ref: null,
    discovery: {
      status,
      signal_set_ref: "signal-set:synthetic-1",
      synthetic_preloaded: true,
      why:
        status === "EVIDENCE_CONNECTED"
          ? "A Candidate-only synthetic source discusses the same bounded reliability concern."
          : null,
      evidence_refs: status === "EVIDENCE_CONNECTED" ? ["evidence:synthetic-work-sample"] : [],
      capability_refs: status === "EVIDENCE_CONNECTED" ? ["capability:reliability"] : [],
      still_unknown:
        status === "EVIDENCE_CONNECTED"
          ? ["Whether the described approach transfers to this exact production boundary."]
          : [],
    },
  };
}

describe("Candidate job discovery UI", () => {
  it("shows evidence-linked guidance while keeping every open job accessible", () => {
    const feed = CandidateOpportunityFeedV2Schema.parse({
      schema_version: "candidate-opportunity-feed@2",
      candidate_ref: "candidate-42",
      credit: {
        schema_version: "candidate-application-credit-projection@1",
        account_ref: "credit:candidate-42",
        candidate_ref: "candidate-42",
        period_ref: "period:synthetic",
        allowance: 3,
        available_credits: 3,
        consumed_credits: 0,
        version: 1,
        period_ends_at: "2027-01-01T00:00:00.000Z",
      },
      discovery_status: "READY",
      discovery_snapshot_ref: "passport-snapshot:42:1",
      opportunities: [
        job("opportunity:connected", "Connected reliability role", "EVIDENCE_CONNECTED"),
        job("opportunity:unknown", "Still-visible adjacent role", "INSUFFICIENT_SOURCE"),
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(CandidateHome, { feed, candidateLabel: "Candidate 42 · Jordan Lee" }),
    );

    expect(markup).toContain("Connected reliability role");
    expect(markup).toContain("Still-visible adjacent role");
    expect(markup).toContain("Why this role reached you");
    expect(markup).toContain("evidence:synthetic-work-sample");
    expect(markup).toContain("Still unknown (1)");
    expect(markup).toContain('href="/candidate/evidence-passport"');
    expect(markup).toContain("all open jobs remain visible");
    expect(markup).not.toMatch(/Employer queue|Direct|Explore|Candidate 17/iu);
  });
});
