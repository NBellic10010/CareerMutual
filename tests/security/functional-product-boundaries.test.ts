import { readFileSync } from "node:fs";

import {
  CandidateEvidencePassportProjectionSchema,
  CandidateOpportunityFeedV2Schema,
  CandidateOpportunityFeedSchema,
  EmployerCurrentReviewProjectionSchema,
} from "../../packages/contracts/src/index";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const functionalStore = read("../../packages/db/src/postgres-functional-product-store.ts");
const functionalService = read("../../packages/application/src/commands/functional-product.ts");
const webComposition = read("../../apps/web/src/server/functional-services.ts");
const answerSandbox = read("../../apps/web/src/components/functional/answer-sandbox.tsx");
const reviewWorkspace = read(
  "../../apps/web/src/components/functional/sequential-review-workspace.tsx",
);
const aiAdapter = read("../../packages/ai/src/candidate-answer-adapters.ts");
const worker = read("../../apps/worker/src/functional-product-composition.ts");
const discoveryStore = read("../../packages/db/src/postgres-candidate-discovery-store.ts");
const discoveryAdapter = read("../../packages/ai/src/candidate-discovery-adapter.ts");
const eligibilityStore = read("../../packages/db/src/postgres-candidate-eligibility-store.ts");
const eligibilityAdapter = read("../../packages/ai/src/candidate-eligibility-adapter.ts");
const employerAnalystAdapter = read("../../packages/ai/src/employer-review-analyst-adapter.ts");
const employerAnalystPolicy = read("../../apps/worker/src/employer-review-analyst-policy.ts");
const candidatePassport = read(
  "../../apps/web/src/components/functional/candidate-evidence-passport.tsx",
);
const employerDashboard = read("../../apps/web/src/components/functional/employer-dashboard.tsx");

describe("functional product privacy and authority boundaries", () => {
  it("keeps OpenAI credentials and calls in the Worker rather than browser or Web composition", () => {
    expect(webComposition).not.toMatch(/OPENAI_API_KEY|new OpenAI|responses\.create/iu);
    expect(answerSandbox).not.toMatch(/OPENAI_API_KEY|new OpenAI|responses\.create/iu);
    expect(aiAdapter).toContain('model: "gpt-5.6-terra"');
    expect(aiAdapter).toContain("store: false");
    expect(aiAdapter).not.toMatch(/tools:|web_search|file_search/iu);
    expect(worker).toContain('"OPENAI_KEY_UNAVAILABLE"');
    expect(worker).toContain('analystPolicy.mode === "SYNTHETIC"');
    expect(worker).toContain("loadEmployerReviewAnalystRuntimePolicy(environment)");
    expect(worker).toContain("apiKey === undefined");
    expect(worker).not.toMatch(
      /apiKey\s*===\s*undefined\s*\?\s*new\s+SyntheticEmployerReviewAnalystAdapter/iu,
    );
    expect(candidatePassport).not.toMatch(/OPENAI_API_KEY|new OpenAI|responses\.parse/iu);
    expect(discoveryAdapter).toContain('options.model ?? "gpt-5.6-luna"');
    expect(discoveryAdapter).toContain("model: this.#model");
    expect(discoveryAdapter).toContain("store: false");
    expect(discoveryAdapter).not.toMatch(/tools:|web_search|file_search/iu);
    expect(eligibilityAdapter).toContain('options.model ?? "gpt-5.6-sol"');
    expect(eligibilityAdapter).toContain('reasoning: { effort: "medium" }');
    expect(eligibilityAdapter).toContain("store: false");
    expect(eligibilityAdapter).toContain("maxRetries: 0");
    expect(eligibilityAdapter).not.toMatch(/tools:|web_search|file_search/iu);
    expect(employerAnalystAdapter).toContain('options.model ?? "gpt-5.6-sol"');
    expect(employerAnalystAdapter).toContain("model: this.#model");
    expect(employerAnalystPolicy).toContain(
      'environment.EMPLOYER_REVIEW_AI_MODEL ?? "gpt-5.6-sol"',
    );
    expect(employerAnalystPolicy).toContain('"gpt-5.6-luna"');
    expect(worker).toContain("new LiveCandidateJobDiscoveryAdapter({ apiKey })");
    expect(worker).toContain("new LiveCandidateEligibilityMatchAdapter({ apiKey })");
    expect(worker).toContain(
      "new LiveEmployerReviewAnalystAdapter({ apiKey, model: analystPolicy.model })",
    );
    expect(worker).not.toContain("OPENAI_EVAL_MODEL");
  });

  it("does not use the Private Label Vault or résumé fields to create, submit, or review answers", () => {
    for (const source of [functionalStore, functionalService, webComposition, answerSandbox]) {
      expect(source).not.toMatch(/FROM\s+candidate_private_labels/iu);
      expect(source).not.toMatch(/JOIN\s+candidate_private_labels/iu);
      expect(source).not.toMatch(/resume_profile|candidate_photo/iu);
    }
    expect(reviewWorkspace).not.toMatch(
      /candidate_ref|school_name|previous_employer_name|referral_source|resume/iu,
    );
  });

  it("keeps Passport and discovery reasons Candidate-only and out of Employer or queue inputs", () => {
    expect(discoveryStore).not.toMatch(/INSERT INTO eligibility_edges/iu);
    expect(discoveryStore).not.toMatch(/UPDATE candidate_interests/iu);
    expect(discoveryStore).not.toMatch(/INSERT INTO answer_invitations/iu);
    expect(discoveryStore).not.toMatch(/employer_.*projection/iu);
    expect(employerDashboard).not.toMatch(/evidence.passport|discovery.signal|passport_snapshot/iu);
    expect(candidatePassport).toContain("Candidate only");
    expect(candidatePassport).toContain("Never shown to Sarah before anonymous advancement");
    expect(eligibilityStore).not.toMatch(/employer_.*projection/iu);
    expect(eligibilityStore).not.toMatch(/candidate_private_labels|candidate_resume_snapshots/iu);
    expect(employerDashboard).not.toMatch(
      /eligibility_match_ref|candidate_job_eligibility_matches/iu,
    );
  });

  it("renders structured rich text without an HTML injection escape hatch", () => {
    expect(answerSandbox).not.toContain("dangerouslySetInnerHTML");
    expect(reviewWorkspace).not.toContain("dangerouslySetInnerHTML");
    expect(reviewWorkspace).not.toMatch(/\.innerHTML/iu);
  });

  it("structurally rejects pool data from Candidate payloads and identity labels from review payloads", () => {
    expect(
      CandidateOpportunityFeedSchema.safeParse({
        schema_version: "candidate-opportunity-feed@1",
        candidate_ref: "candidate-42",
        credit: {
          schema_version: "candidate-application-credit-projection@1",
          account_ref: "credit-42",
          candidate_ref: "candidate-42",
          period_ref: "period-1",
          allowance: 3,
          available_credits: 3,
          consumed_credits: 0,
          version: 1,
          period_ends_at: "2026-08-20T00:00:00.000Z",
        },
        opportunities: [],
        employer_queue: ["candidate-17"],
      }).success,
    ).toBe(false);

    expect(
      CandidateOpportunityFeedV2Schema.safeParse({
        schema_version: "candidate-opportunity-feed@2",
        candidate_ref: "candidate-42",
        credit: {
          schema_version: "candidate-application-credit-projection@1",
          account_ref: "credit-42",
          candidate_ref: "candidate-42",
          period_ref: "period-1",
          allowance: 3,
          available_credits: 3,
          consumed_credits: 0,
          version: 1,
          period_ends_at: "2026-08-20T00:00:00.000Z",
        },
        discovery_status: "READY",
        discovery_snapshot_ref: "passport-snapshot:42:1",
        opportunities: [],
        employer_queue: ["candidate-17"],
      }).success,
    ).toBe(false);

    const passportProjection = {
      schema_version: "candidate-evidence-passport-projection@2",
      candidate_ref: "candidate-42",
      projection_version: 1,
      current_draft: {
        schema_version: "candidate-evidence-passport-draft@2",
        candidate_ref: "candidate-42",
        draft_version: 0,
        education: null,
        evidence_items: [],
        has_unpublished_changes: false,
        updated_at: "2026-07-20T12:00:00.000Z",
      },
      last_published_snapshot: null,
      discovery: {
        status: "STALE",
        current_signal_set_ref: null,
        last_ready_signal_set_ref: null,
        job_set_hash: null,
        synthetic_preloaded: false,
        reason_code: "PASSPORT_NOT_PUBLISHED",
        updated_at: "2026-07-20T12:00:00.000Z",
      },
      disclosure:
        "Synthetic Evidence Passport — Candidate-only discovery input; not employer-visible.",
    } as const;
    expect(CandidateEvidencePassportProjectionSchema.safeParse(passportProjection).success).toBe(
      true,
    );
    expect(
      EmployerCurrentReviewProjectionSchema.safeParse({
        schema_version: "employer-current-review-projection@3",
        opportunity_ref: "opportunity-1",
        title: "Senior Backend Engineer",
        reviewer_ref: "reviewer-sarah-chen",
        queue: { pending_review_count: 0, available_slot_count: 1, waiting_interest_count: 1 },
        current: null,
        candidate_passport: passportProjection,
      }).success,
    ).toBe(false);

    const review = {
      schema_version: "employer-current-review-projection@3",
      opportunity_ref: "opportunity-1",
      title: "Senior Backend Engineer",
      reviewer_ref: "reviewer-sarah-chen",
      queue: {
        pending_review_count: 1,
        available_slot_count: 0,
        waiting_interest_count: 4,
      },
      current: {
        obligation_ref: "obligation-1",
        obligation_version: 3,
        cohort_ref: "cohort-1",
        cohort_version: 2,
        answer_submission_ref: "submission-1",
        opaque_candidate_label: "Anonymous answer A-07",
        submitted_at: "2026-07-20T12:00:00.000Z",
        critical_question: "Explain the payment retry invariant and tests.",
        rich_text_document: null,
        rich_text_plain_text: null,
        artifacts: [],
        assistant_trace: [],
        permitted_evidence_refs: ["submission-1"],
        focus_policy_auto_submitted: false,
        ai_review: {
          schema_version: "employer-ai-review-projection@1",
          policy: "OFF",
          status: "DISABLED",
          answer_submission_ref: "submission-1",
          process_evidence: null,
          analysis: null,
          ai_output_ref: null,
          error_code: null,
          synthetic: false,
          disclosure: "Human review only.",
        },
      },
    } as const;
    expect(EmployerCurrentReviewProjectionSchema.safeParse(review).success).toBe(true);
    expect(
      EmployerCurrentReviewProjectionSchema.safeParse({
        ...review,
        current: { ...review.current, candidate_name: "Candidate 42", school_name: "MIT" },
      }).success,
    ).toBe(false);
  });
});
