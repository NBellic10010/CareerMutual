export type ReviewWindowInvariantCode =
  | "ASK_BACK_UNRESOLVED"
  | "ATTENTION_SLOT_UNAVAILABLE"
  | "CREDIT_NOT_HELD"
  | "EVIDENCE_REFERENCE_INVALID"
  | "ILLEGAL_STATE_TRANSITION"
  | "INVALID_IDENTIFIER"
  | "INVALID_TIMESTAMP"
  | "REVEAL_NOT_AUTHORIZED"
  | "REVIEWER_MISMATCH";

export class ReviewWindowInvariantError extends Error {
  public override readonly name = "ReviewWindowInvariantError";

  public constructor(
    public readonly code: ReviewWindowInvariantCode,
    message: string,
  ) {
    super(message);
  }
}
