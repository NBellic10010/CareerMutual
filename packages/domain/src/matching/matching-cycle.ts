import { MatchingInvariantError } from "./errors";
import type { MatchingCycle } from "./types";

export function createMatchingCycle(input: {
  readonly matchingCycleRef: string;
  readonly opportunityRef: string;
  readonly contractVersionRef: string;
  readonly contractHash: string;
  readonly expectedInterestCount: number;
}): MatchingCycle {
  if (!Number.isInteger(input.expectedInterestCount) || input.expectedInterestCount <= 0) {
    throw new MatchingInvariantError(
      "MATCHING_RESULT_INCOMPLETE",
      "A Matching Cycle requires a positive expected interest count.",
    );
  }
  return Object.freeze({
    ...input,
    proposeCount: 0,
    abstainCount: 0,
    needsHumanCount: 0,
    state: "EVALUATING",
    version: 1,
  });
}

export function summarizeMatchingCycle(
  cycle: MatchingCycle,
  results: readonly ("propose" | "abstain" | "needs_human")[],
): MatchingCycle {
  if (results.length !== cycle.expectedInterestCount) {
    throw new MatchingInvariantError(
      "MATCHING_RESULT_INCOMPLETE",
      `Expected ${cycle.expectedInterestCount} terminal results, received ${results.length}.`,
    );
  }
  const proposeCount = results.filter((result) => result === "propose").length;
  const abstainCount = results.filter((result) => result === "abstain").length;
  const needsHumanCount = results.filter((result) => result === "needs_human").length;
  return Object.freeze({
    ...cycle,
    proposeCount,
    abstainCount,
    needsHumanCount,
    state: needsHumanCount === 0 ? "READY_FOR_DIRECT" : "NEEDS_HUMAN",
    version: cycle.version + 1,
  });
}
