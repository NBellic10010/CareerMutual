import {
  ActivateBlindReviewCommitmentCommandSchema,
  BackedAnswerOfferSchema,
  CandidateInterestCommandSchema,
  CandidateOpportunityProjectionV3Schema,
  EmployerBlindReviewProjectionSchema,
  HumanAnswerReviewCommandSchema,
  SubmitBlindAnswerCommandSchema,
} from "../../packages/contracts/src/index";
import { describe, expect, it } from "vitest";

describe("rolling blind-review contracts", () => {
  it("keeps lightweight Interest distinct from a formal Application", () => {
    const interest = {
      schema_version: "candidate-interest-command@2",
      background_access_basis: "OPEN_TO_ALL",
      eligibility_match_ref: null,
      eligibility_match_version: null,
      hard_facts: [
        {
          fact_ref: "fact-work-authorization",
          fact_type: "work_authorization",
          value: "US",
        },
      ],
      consent_version: "candidate-interest-consent@1",
      expected_opportunity_version: 1,
    };

    expect(CandidateInterestCommandSchema.safeParse(interest).success).toBe(true);
    expect(
      CandidateInterestCommandSchema.safeParse({
        ...interest,
        answer: "This must not be accepted as lightweight Interest work.",
      }).success,
    ).toBe(false);
    expect(
      CandidateInterestCommandSchema.safeParse({
        ...interest,
        resume_profile: "Ex-BigTech",
      }).success,
    ).toBe(false);
  });

  it("models review capacity as reusable WIP with an independent Cohort size", () => {
    expect(
      ActivateBlindReviewCommitmentCommandSchema.parse({
        schema_version: "activate-blind-review-commitment-command@1",
        answer_review_wip: 8,
        answer_review_sla_hours: 24,
        advancement_cohort_size: 8,
        queue_policy_version: "onlyboth.interest-queue@1",
        credit_per_answer_review: 1,
        expected_opportunity_version: 1,
        expected_commitment_version: 0,
      }),
    ).toMatchObject({
      answer_review_wip: 8,
      advancement_cohort_size: 8,
      expected_commitment_version: 0,
    });
  });

  it("requires a backed Invitation for Answer submission and evidence refs for human review", () => {
    expect(
      SubmitBlindAnswerCommandSchema.safeParse({
        schema_version: "submit-blind-answer-command@1",
        invitation_ref: "invitation-01",
        answer_submission_ref: "answer-01",
        snapshot_ref: "snapshot-01",
        artifact_refs: ["artifact-01"],
        event_refs: ["event-01"],
        expected_obligation_version: 2,
      }).success,
    ).toBe(true);
    expect(
      SubmitBlindAnswerCommandSchema.safeParse({
        schema_version: "submit-blind-answer-command@1",
        answer_submission_ref: "answer-unbacked",
        snapshot_ref: "snapshot-unbacked",
        artifact_refs: ["artifact-unbacked"],
        event_refs: ["event-unbacked"],
        expected_obligation_version: 1,
      }).success,
    ).toBe(false);
    expect(
      HumanAnswerReviewCommandSchema.safeParse({
        schema_version: "human-answer-review-command@1",
        decision: "ADVANCE_ELIGIBLE",
        evidence_refs: [],
        still_unknown: [],
        expected_obligation_version: 3,
        expected_cohort_version: 2,
      }).success,
    ).toBe(false);
  });

  it("requires a canonical SHA-256 public Queue tie-break", () => {
    const offer = {
      schema_version: "backed-answer-offer@1",
      invitation_ref: "invitation-01",
      obligation_ref: "obligation-01",
      slot_ref: "slot-01",
      cohort_ref: "cohort-01",
      cohort_seat_ref: "cohort-01-seat-01",
      candidate_ref: "candidate-01",
      reviewer: {
        reviewer_ref: "reviewer-sarah",
        display_name: "Sarah Chen",
      },
      credit_hold_ref: "credit-hold-01",
      question_version_ref: "payment-retry-question@1",
      queue_policy_version: "onlyboth.interest-queue@1",
      public_tie_break: `sha256:${"a".repeat(64)}`,
      offered_at: "2026-07-19T21:00:00.000Z",
      offer_expires_at: "2026-07-20T21:00:00.000Z",
      answer_review_sla_hours: 24,
      effort_limit_minutes: 6,
      candidate_ai_policy: "PROHIBITED",
    };

    expect(BackedAnswerOfferSchema.safeParse(offer).success).toBe(true);
    expect(
      BackedAnswerOfferSchema.safeParse({
        ...offer,
        public_tie_break: "a".repeat(64),
      }).success,
    ).toBe(false);
  });

  it("makes pre-answer Candidate cards unrepresentable in the Employer projection", () => {
    const projection = {
      schema_version: "employer-blind-review-projection@2",
      view: "EMPLOYER",
      phase: "PRE_ANSWER",
      opportunity_ref: "opportunity-1",
      commitment_ref: "commitment-1",
      commitment_version: 2,
      queue_policy_version: "onlyboth.interest-queue@1",
      eligible_interest_count: 20,
      waiting_interest_count: 12,
      answer_review_wip: 8,
      available_slot_count: 0,
      outstanding_obligation_count: 8,
      disclosure: "Candidate profiles are unavailable before answers.",
      runtime_mode: "GOLDEN_REPLAY",
      synthetic: true,
    };
    expect(EmployerBlindReviewProjectionSchema.safeParse(projection).success).toBe(true);
    expect(
      EmployerBlindReviewProjectionSchema.safeParse({
        ...projection,
        candidate_cards: [{ candidate_ref: "candidate-01" }],
      }).success,
    ).toBe(false);
  });

  it("shows Queue state without pretending the Candidate has submitted an Application", () => {
    expect(
      CandidateOpportunityProjectionV3Schema.parse({
        schema_version: "candidate-opportunity-projection@3",
        view: "CANDIDATE",
        state: "WAITING_FOR_BACKED_SLOT",
        opportunity_ref: "opportunity-1",
        candidate_ref: "candidate-09",
        queue_policy_version: "onlyboth.interest-queue@1",
        eligible_interests_ahead: 0,
        commitment_status: "ACTIVE",
        message: "Your Interest is queued. No Application work has been accepted yet.",
        runtime_mode: "GOLDEN_REPLAY",
        synthetic: true,
      }),
    ).toMatchObject({ state: "WAITING_FOR_BACKED_SLOT" });
  });
});
