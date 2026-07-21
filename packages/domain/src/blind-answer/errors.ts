export type BlindAnswerInvariantCode =
  | "ADVANCEMENT_COHORT_INVALID"
  | "ADVANCEMENT_COHORT_NOT_READY"
  | "ANSWER_REVIEW_EVIDENCE_REQUIRED"
  | "ANSWER_REVIEW_STATE_INVALID"
  | "BACKED_OFFER_STATE_INVALID"
  | "BLIND_REVIEW_COMMITMENT_INVALID"
  | "BLIND_REVIEW_COMMITMENT_NOT_ACTIVE"
  | "COHORT_SEAT_STATE_INVALID"
  | "DUPLICATE_INTEREST"
  | "INTEREST_QUEUE_ENTRY_INVALID"
  | "QUEUE_POLICY_INVALID"
  | "REVIEW_SLOT_INVALID"
  | "REVIEW_SLOT_NOT_AVAILABLE"
  | "UNBACKED_ANSWER_FORBIDDEN";

export class BlindAnswerInvariantError extends Error {
  public override readonly name = "BlindAnswerInvariantError";

  public constructor(
    public readonly code: BlindAnswerInvariantCode,
    message: string,
  ) {
    super(message);
  }
}
