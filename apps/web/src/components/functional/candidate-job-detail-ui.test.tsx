import { CandidateJobDetailV2Schema } from "@onlyboth/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CandidateJobDetailView } from "./candidate-job-detail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const job = CandidateJobDetailV2Schema.parse({
  schema_version: "candidate-job-detail@2",
  opportunity_ref: "opportunity:open-role",
  opportunity_version: 1,
  title: "Customer Success Lead",
  organization_public_name: "Synthetic Organization",
  role_category: "OPERATIONS",
  public_role_summary: "A synthetic role used to verify the Candidate declaration layout.",
  employment_type: "FULL_TIME",
  seniority_band: "SENIOR",
  compensation_range: "$120k–$155k",
  location_and_work_mode: "Remote",
  maximum_candidate_minutes: 6,
  human_review_sla_hours: 24,
  candidate_ai_policy: "PLATFORM_ASSISTANT_ALLOWED",
  employer_ai_review_policy: "OFF",
  challenge_part_kinds: ["TEXT"],
  interest_state: "NOT_REGISTERED",
  backed_offer: null,
  active_answer_session_ref: null,
  public_hard_requirements: ["Authorized to work in the hiring region"],
  capability_areas: ["Account risk"],
  critical_question_preview: "Explain a bounded recovery plan for a synthetic customer escalation.",
  critical_challenge: {
    schema_version: "critical-challenge@1",
    challenge_ref: "critical-challenge:open-role@1",
    title: "Recover a customer escalation",
    objective:
      "Explain a bounded response, fact-finding plan, and recovery milestone for a synthetic escalation.",
    parts: [
      {
        part_ref: "challenge-part:open-role:text",
        kind: "TEXT",
        title: "Escalation facts",
        instructions: "Use only the sealed synthetic facts when constructing the recovery plan.",
        text_content:
          "Three failures occurred in two weeks and engineering has not reproduced the third.",
        asset: null,
      },
    ],
  },
  proof_format: "A bounded response and recovery plan.",
  answer_review_wip: 1,
  available_slot_count: 1,
  waiting_interest_count: 0,
  terms_version: "candidate-application-terms@2",
  ai_disclosure_version: "candidate-ai-disclosure@1",
  conditional_reveal_consent_version: "resume-reveal-consent@1",
  sandbox_focus_policy_version: "sandbox-focus-policy@1",
  focus_tracking_disclosure_version: "sandbox-focus-disclosure@1",
  employer_ai_review_disclosure_version: "employer-ai-review-disclosure@1",
  review_criteria: [
    {
      criterion_ref: "criterion:open-role",
      capability_ref: "capability:account-risk",
      statement: "The answer separates known facts from a bounded recovery commitment.",
      support_indicators: ["Names one observable recovery milestone."],
      contradiction_indicators: ["Invents a root cause or deadline."],
      bounded_limitations: ["This task cannot establish overall job performance."],
    },
  ],
  eligibility_access: {
    access_basis: "OPEN_TO_ALL",
    match_ref: null,
    match_version: null,
    why: "The Recruiter sealed this role without a background gate.",
    evidence_refs: [],
    tag_refs: [],
    still_unknown: [],
    recorded_live: false,
  },
});

describe("Candidate Job legal and logistical declarations", () => {
  it("keeps the long heading out of the fieldset legend and groups fields in a shrink-safe grid", () => {
    const markup = renderToStaticMarkup(
      createElement(CandidateJobDetailView, {
        job,
        credit: { available_credits: 3, version: 1 },
        csrfToken: "synthetic-csrf",
        candidateRef: "candidate-42",
      }),
    );

    expect(markup).toContain("<legend>Eligibility declarations</legend>");
    expect(markup).toContain('class="candidate-hard-facts-heading"');
    expect(markup).toContain("Declare legal and logistical requirements");
    expect(markup).toContain('class="candidate-hard-fact-checkbox"');
    expect(markup).toContain('class="candidate-hard-fact-fields"');
    expect(markup).not.toContain("<legend>Declare legal and logistical requirements</legend>");
  });

  it("places the Candidate action illustration behind the View Role workspace", () => {
    const markup = renderToStaticMarkup(
      createElement(CandidateJobDetailView, {
        job,
        credit: { available_credits: 3, version: 1 },
        csrfToken: "synthetic-csrf",
        candidateRef: "candidate-42",
      }),
    );

    expect(markup).toContain('data-role-theme="candidate"');
    expect(markup).toContain('data-role-page-artwork="candidate-role"');
    expect(markup).toContain("candidate-roll-up-sleeves-v1.webp");
    expect(markup).not.toContain("recruiter-glasses-review-v1.webp");
  });

  it("keeps the public contract and complete Challenge in one continuous primary column", () => {
    const markup = renderToStaticMarkup(
      createElement(CandidateJobDetailView, {
        job,
        credit: { available_credits: 3, version: 1 },
        csrfToken: "synthetic-csrf",
        candidateRef: "candidate-42",
      }),
    );

    const primaryColumnStart = markup.indexOf('class="job-detail-primary"');
    const contractStart = markup.indexOf('class="functional-card job-contract-card"');
    const challengeStart = markup.indexOf('class="critical-challenge ');
    const actionStart = markup.indexOf('class="functional-card action-card"');

    expect(primaryColumnStart).toBeGreaterThan(-1);
    expect(contractStart).toBeGreaterThan(primaryColumnStart);
    expect(challengeStart).toBeGreaterThan(contractStart);
    expect(actionStart).toBeGreaterThan(challengeStart);
  });
});
