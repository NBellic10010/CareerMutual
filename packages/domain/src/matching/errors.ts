export type MatchingInvariantCode =
  | "ACTIVE_WINDOW_LIMIT_REACHED"
  | "ALLOCATION_CAPACITY_INVALID"
  | "CREDIT_CAPACITY_INVALID"
  | "DIRECT_MATCH_EDGE_INVALID"
  | "ELIGIBILITY_PREDICATE_INVALID"
  | "EXPLORE_POOL_INSUFFICIENT"
  | "MATCHING_CYCLE_NOT_READY"
  | "MATCHING_RESULT_INCOMPLETE"
  | "SLOT_CAPACITY_INVALID";

export class MatchingInvariantError extends Error {
  public override readonly name = "MatchingInvariantError";

  public constructor(
    public readonly code: MatchingInvariantCode,
    message: string,
  ) {
    super(message);
  }
}
