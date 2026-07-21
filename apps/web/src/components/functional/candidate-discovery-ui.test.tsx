import { CandidateOpportunityFeedV3Schema } from "@onlyboth/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  belongsToMatchedCandidateFeed,
  CandidateHome,
  candidateOpportunitySignal,
  candidateJobsForFeedLayer,
} from "./candidate-home";

function job(
  opportunityRef: string,
  title: string,
  accessBasis: "OPEN_TO_ALL" | "AI_POSITIVE_EVIDENCE" | "ACTIVE_JOURNEY_PIN",
  interestState:
    | "NOT_REGISTERED"
    | "WAITING_FOR_BACKED_SLOT"
    | "BACKED_OFFERED"
    | "APPLICATION_ACTIVE"
    | "APPLICATION_SUBMITTED"
    | "REVIEWED"
    | "EMPLOYER_BREACH"
    | "OFFER_DECLINED"
    | "OFFER_EXPIRED" = "NOT_REGISTERED",
) {
  const matched = accessBasis === "AI_POSITIVE_EVIDENCE";
  return {
    schema_version: "candidate-job-card@3" as const,
    opportunity_ref: opportunityRef,
    opportunity_version: 1,
    title,
    organization_public_name: "Synthetic Public Organization",
    role_category: "TECHNOLOGY" as const,
    public_role_summary: "A synthetic role exposed only through a current access basis.",
    employment_type: "FULL_TIME",
    seniority_band: "SENIOR",
    compensation_range: "$180k–$220k",
    location_and_work_mode: "Remote",
    maximum_candidate_minutes: 6,
    human_review_sla_hours: 24,
    candidate_ai_policy: "PLATFORM_ASSISTANT_ALLOWED" as const,
    employer_ai_review_policy: "OFF" as const,
    challenge_part_kinds: ["TEXT" as const],
    interest_state: interestState,
    backed_offer: null,
    active_answer_session_ref: null,
    eligibility_access: {
      access_basis: accessBasis,
      match_ref: matched ? "eligibility-match:synthetic-1" : null,
      match_version: matched ? 1 : null,
      why: matched
        ? "A Candidate-only synthetic source connects to one Recruiter-sealed background tag."
        : accessBasis === "OPEN_TO_ALL"
          ? "This Recruiter sealed the role without a background gate."
          : "An existing Candidate journey keeps its original access pin.",
      evidence_refs: matched ? ["evidence:synthetic-work-sample"] : [],
      tag_refs: matched ? ["eligibility-tag:work:backend-engineering@1"] : [],
      still_unknown: matched
        ? ["Whether the source-shaped evidence transfers to this exact role boundary."]
        : [],
      recorded_live: false,
    },
  };
}

describe("Candidate AI-backed Eligibility UI", () => {
  it("renders only server-authorized jobs and removes full-market exploration", () => {
    const feed = CandidateOpportunityFeedV3Schema.parse({
      schema_version: "candidate-opportunity-feed@3",
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
      eligibility_status: "READY",
      eligibility_snapshot_ref: "passport-snapshot:42:1",
      opportunities: [
        job("opportunity:connected", "Connected reliability role", "AI_POSITIVE_EVIDENCE"),
        job("opportunity:open", "Open apprenticeship", "OPEN_TO_ALL"),
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(CandidateHome, { feed, candidateLabel: "Candidate 42 · Jordan Lee" }),
    );

    expect(markup).toContain("Connected reliability role");
    expect(markup).toContain("Open apprenticeship");
    expect(markup).toContain("A source connection unlocks the right to apply.");
    expect(markup).toContain("AI POSITIVE EVIDENCE");
    expect(markup).toContain("evidence:synthetic-work-sample");
    expect(markup).toContain("Still unknown (1)");
    expect(markup).not.toContain("Explore all jobs");
    expect(markup).not.toContain("Nothing hidden");
    expect(markup).not.toMatch(/Employer queue|Direct|Candidate 17/iu);
  });

  it("keeps positive, open, and active-journey access while never expanding ALL locally", () => {
    const connected = job("opportunity:connected", "Connected", "AI_POSITIVE_EVIDENCE");
    const open = job("opportunity:open", "Open", "OPEN_TO_ALL");
    const active = job(
      "opportunity:active",
      "Active application",
      "ACTIVE_JOURNEY_PIN",
      "APPLICATION_ACTIVE",
    );
    const jobs = [connected, open, active];

    expect(jobs.every(belongsToMatchedCandidateFeed)).toBe(true);
    expect(candidateJobsForFeedLayer(jobs, "MATCHED")).toHaveLength(3);
    expect(candidateJobsForFeedLayer(jobs, "ALL")).toHaveLength(3);
  });

  it("maps each Candidate journey to a truthful mutual-intent visual state", () => {
    expect(candidateOpportunitySignal(job("open", "Open", "OPEN_TO_ALL"))).toEqual({
      state: "OPEN",
      label: "Open to your intent",
    });
    expect(
      candidateOpportunitySignal(
        job("waiting", "Waiting", "AI_POSITIVE_EVIDENCE", "WAITING_FOR_BACKED_SLOT"),
      ),
    ).toEqual({ state: "QUEUED", label: "Interest seen · awaiting backed attention" });
  });
});
