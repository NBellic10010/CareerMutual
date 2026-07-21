import {
  AnswerInvitationDecisionReceiptSchema,
  CandidateOpportunityProjectionV3Schema,
} from "../../packages/contracts/src/index";
import { describe, expect, it } from "vitest";

const ACCEPT_RECEIPT = {
  schema_version: "answer-invitation-decision-receipt@1",
  command_id: "command-accept-42",
  event_id: "event-accept-42",
  invitation_ref: "invitation-42",
  obligation_ref: "obligation-42",
  slot_ref: "answer-slot-1",
  decision: "ACCEPT",
  obligation_state: "ANSWER_ACTIVE",
  answer_session_ref: "answer-session-42",
  answer_due_at: "2026-07-19T22:06:00.000Z",
  new_obligation_version: 2,
  new_slot_version: 3,
  occurred_at: "2026-07-19T22:00:00.000Z",
} as const;

describe("Batch 2b Answer Invitation response contract (failing first)", () => {
  it("returns the Answer Session ref and database-time deadline after Accept", () => {
    expect(AnswerInvitationDecisionReceiptSchema.parse(ACCEPT_RECEIPT)).toMatchObject({
      decision: "ACCEPT",
      answer_session_ref: "answer-session-42",
      answer_due_at: "2026-07-19T22:06:00.000Z",
    });
  });

  it("does not permit a declined Invitation to claim an Answer Session", () => {
    expect(
      AnswerInvitationDecisionReceiptSchema.safeParse({
        ...ACCEPT_RECEIPT,
        decision: "DECLINE",
        obligation_state: "SETTLED",
      }).success,
    ).toBe(false);
  });

  it("requires the active Candidate projection to expose the same Session and deadline", () => {
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
      reviewer: { reviewer_ref: "reviewer-sarah", display_name: "Sarah Chen" },
      answer_session_ref: "answer-session-42",
      answer_due_at: "2026-07-19T22:06:00.000Z",
      message: "Your backed Answer Session is active.",
      runtime_mode: "LIVE",
      synthetic: false,
    } as const;

    expect(CandidateOpportunityProjectionV3Schema.parse(projection)).toMatchObject({
      state: "ANSWER_ACTIVE",
      answer_session_ref: "answer-session-42",
      answer_due_at: "2026-07-19T22:06:00.000Z",
    });
    expect(
      CandidateOpportunityProjectionV3Schema.safeParse({
        ...projection,
        answer_session_ref: undefined,
        answer_due_at: undefined,
      }).success,
    ).toBe(false);
  });
});
