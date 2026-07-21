import { existsSync, readFileSync } from "node:fs";

import {
  CandidateOpportunityProjectionV3Schema,
  EmployerBlindReviewProjectionSchema,
} from "../../packages/contracts/src/index";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const queueStoreSource = readRepositoryFile(
  "../../packages/db/src/postgres-interest-queue-worker-store.ts",
);
const offerCommandSource = readRepositoryFile(
  "../../packages/application/src/commands/offer-next-queued-interest.ts",
);
const interestCommandSource = readRepositoryFile(
  "../../packages/application/src/commands/submit-candidate-interest.ts",
);
const invitationDecisionSource = readRepositoryFile(
  "../../packages/application/src/commands/decide-answer-invitation.ts",
);
const interestStoreSource = readRepositoryFile(
  "../../packages/db/src/postgres-candidate-interest-store.ts",
);
const invitationDecisionStoreSource = readRepositoryFile(
  "../../packages/db/src/postgres-answer-invitation-decision-store.ts",
);

const FORBIDDEN_PRE_ANSWER_SOURCES = [
  "candidate_claim_snapshots",
  "candidate_claims",
  "candidate_private_labels",
  "match_edges",
  "match_edge_evaluations",
  "ai_outputs",
  "hiring_intelligence_requests",
  "employer_matching_projections",
] as const;

const FORBIDDEN_PROFILE_FIELDS = [
  "school_name",
  "previous_employer_name",
  "referral_source",
  "candidate_photo",
  "resume_profile",
  "resume_rank",
] as const;

describe("rolling blind-review attention boundaries", () => {
  it("makes the Queue Store depend only on public policy, hard Eligibility, time, and Activity Lease", () => {
    expect(queueStoreSource).not.toBe("");
    expect(queueStoreSource).toContain("queue_policy_version");
    expect(queueStoreSource).toContain("eligible_at");
    expect(queueStoreSource).toContain("interest_created_at");
    expect(queueStoreSource).toContain("candidate_activity_leases");
    expect(queueStoreSource).toContain("FOR UPDATE SKIP LOCKED");

    for (const forbidden of FORBIDDEN_PRE_ANSWER_SOURCES) {
      expect(queueStoreSource, `Queue Store must not read ${forbidden}`).not.toContain(forbidden);
    }
    for (const forbidden of FORBIDDEN_PROFILE_FIELDS) {
      expect(queueStoreSource, `Queue Store must not read ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps the Offer command deterministic and free of AI or Employer selection authority", () => {
    expect(offerCommandSource).not.toBe("");
    expect(offerCommandSource).toContain("offerNextQueuedInterest");
    expect(offerCommandSource).not.toMatch(
      /openai|buildMatchEdge|\bscore\b|\brank\b|\bDirect\b|\bExplore\b/iu,
    );
    expect(offerCommandSource).not.toMatch(/EmployerPreference|CandidateProfile|PrivateLabel/iu);
  });

  it("keeps Interest Eligibility and Invitation decisions outside AI, profile, and Sandbox authority", () => {
    expect(interestCommandSource).toContain("evaluateEligibility");
    expect(invitationDecisionSource).toContain("acceptBackedAnswerOffer");
    expect(invitationDecisionSource).toContain("releaseBackedAnswerOffer");

    for (const source of [
      interestCommandSource,
      invitationDecisionSource,
      interestStoreSource,
      invitationDecisionStoreSource,
    ]) {
      expect(source).not.toBe("");
      expect(source).not.toMatch(
        /OpenAI|HiringIntelligence|buildMatchEdge|GoldenReplayAdapter|SandboxPort/iu,
      );
      expect(source).not.toMatch(
        /candidate_private_labels|candidate_claim_snapshots|match_edges/iu,
      );
      expect(source).not.toMatch(
        /school_name|previous_employer_name|referral_source|resume_profile|candidate_photo/iu,
      );
    }
  });

  it("structurally rejects Candidate cards and profile material before an Answer exists", () => {
    const projection = {
      schema_version: "employer-blind-review-projection@2",
      view: "EMPLOYER",
      phase: "PRE_ANSWER",
      opportunity_ref: "opportunity-1",
      commitment_ref: "commitment-1",
      commitment_version: 1,
      queue_policy_version: "onlyboth.interest-queue@1",
      eligible_interest_count: 20,
      waiting_interest_count: 12,
      answer_review_wip: 8,
      available_slot_count: 0,
      outstanding_obligation_count: 8,
      disclosure: "Candidate profiles are unavailable before recorded answers exist.",
      runtime_mode: "GOLDEN_REPLAY",
      synthetic: true,
    } as const;

    expect(EmployerBlindReviewProjectionSchema.safeParse(projection).success).toBe(true);
    expect(
      EmployerBlindReviewProjectionSchema.safeParse({
        ...projection,
        candidate_cards: [{ candidate_ref: "candidate-42", resume_profile: "hidden" }],
      }).success,
    ).toBe(false);
  });

  it("keeps Employer-only Queue and pool data out of the Candidate projection", () => {
    const projection = {
      schema_version: "candidate-opportunity-projection@3",
      view: "CANDIDATE",
      state: "WAITING_FOR_BACKED_SLOT",
      opportunity_ref: "opportunity-1",
      candidate_ref: "candidate-42",
      queue_policy_version: "onlyboth.interest-queue@1",
      eligible_interests_ahead: 8,
      commitment_status: "ACTIVE",
      message: "Your Interest is waiting for the next backed review Slot.",
      runtime_mode: "GOLDEN_REPLAY",
      synthetic: true,
    } as const;

    expect(CandidateOpportunityProjectionV3Schema.safeParse(projection).success).toBe(true);
    expect(
      CandidateOpportunityProjectionV3Schema.safeParse({
        ...projection,
        candidate_pool: ["candidate-01", "candidate-17"],
        employer_queue: ["interest-01", "interest-17"],
        match_edges: ["match-edge-17"],
      }).success,
    ).toBe(false);
  });

  it("keeps Cohort membership and other Candidates out of an active Answer projection", () => {
    const projection = {
      schema_version: "candidate-opportunity-projection@3",
      view: "CANDIDATE",
      state: "ANSWER_ACTIVE",
      opportunity_ref: "opportunity-1",
      candidate_ref: "candidate-42",
      queue_policy_version: "onlyboth.interest-queue@1",
      eligible_interests_ahead: null,
      commitment_status: "ACTIVE",
      invitation_ref: "invitation-42",
      obligation_ref: "obligation-42",
      credit_hold_ref: "credit-hold-42",
      answer_session_ref: "answer-session-42",
      answer_due_at: "2026-07-19T22:06:00.000Z",
      reviewer: { reviewer_ref: "reviewer-sarah", display_name: "Sarah Chen" },
      message: "Your backed blind Answer session is active.",
      runtime_mode: "LIVE",
      synthetic: false,
    } as const;

    expect(CandidateOpportunityProjectionV3Schema.safeParse(projection).success).toBe(true);
    expect(
      CandidateOpportunityProjectionV3Schema.safeParse({
        ...projection,
        cohort_ref: "cohort-1",
        cohort_members: ["candidate-17", "candidate-42"],
        allocation_kind: "EXPLORE",
      }).success,
    ).toBe(false);
  });
});
