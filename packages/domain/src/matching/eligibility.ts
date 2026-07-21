import { MatchingInvariantError } from "./errors";
import type {
  EligibilityEdge,
  EligibilityPredicate,
  EligibilityPredicateResult,
  HardFactValue,
} from "./types";

function evaluatePredicate(
  predicate: EligibilityPredicate,
  facts: Readonly<Record<string, HardFactValue>>,
): EligibilityPredicateResult {
  const value = facts[predicate.factRef];
  if (value === undefined) {
    return {
      predicateRef: predicate.predicateRef,
      factRef: predicate.factRef,
      passed: false,
      reasonRef: `eligibility:missing:${predicate.factRef}`,
    };
  }

  let passed: boolean;
  switch (predicate.operator) {
    case "EQUALS":
      passed = value === predicate.expected;
      break;
    case "GTE":
      passed = typeof value === "number" && value >= predicate.minimum;
      break;
    case "CONTAINS":
      passed =
        typeof value === "string" &&
        value
          .split(",")
          .map((item) => item.trim())
          .includes(predicate.member);
      break;
    default: {
      const exhaustive: never = predicate;
      throw new MatchingInvariantError(
        "ELIGIBILITY_PREDICATE_INVALID",
        `Unsupported predicate '${String(exhaustive)}'.`,
      );
    }
  }

  return {
    predicateRef: predicate.predicateRef,
    factRef: predicate.factRef,
    passed,
    reasonRef: passed
      ? `eligibility:passed:${predicate.predicateRef}`
      : `eligibility:failed:${predicate.predicateRef}`,
  };
}

export function evaluateEligibility(input: {
  readonly eligibilityEdgeRef: string;
  readonly opportunityRef: string;
  readonly candidateRef: string;
  readonly contractVersionRef: string;
  readonly predicates: readonly EligibilityPredicate[];
  readonly hardFacts: Readonly<Record<string, HardFactValue>>;
  readonly backgroundAccess?:
    | {
        readonly basis: "OPEN_TO_ALL";
        readonly eligibilityPolicyRef: string;
      }
    | {
        readonly basis: "AI_POSITIVE_EVIDENCE";
        readonly eligibilityPolicyRef: string;
        readonly passportSnapshotRef: string;
        readonly eligibilityMatchRef: string;
      };
}): EligibilityEdge {
  if (input.predicates.length === 0) {
    throw new MatchingInvariantError(
      "ELIGIBILITY_PREDICATE_INVALID",
      "Eligibility requires at least one sealed hard predicate.",
    );
  }
  const predicateResults = input.predicates.map((predicate) =>
    evaluatePredicate(predicate, input.hardFacts),
  );
  return Object.freeze({
    schemaVersion:
      input.backgroundAccess === undefined ? "eligibility-edge@1" : "eligibility-edge@2",
    eligibilityEdgeRef: input.eligibilityEdgeRef,
    opportunityRef: input.opportunityRef,
    candidateRef: input.candidateRef,
    contractVersionRef: input.contractVersionRef,
    eligible: predicateResults.every((result) => result.passed),
    predicateResults: Object.freeze(predicateResults),
    backgroundAccessBasis: input.backgroundAccess?.basis ?? null,
    eligibilityPolicyRef: input.backgroundAccess?.eligibilityPolicyRef ?? null,
    passportSnapshotRef:
      input.backgroundAccess?.basis === "AI_POSITIVE_EVIDENCE"
        ? input.backgroundAccess.passportSnapshotRef
        : null,
    eligibilityMatchRef:
      input.backgroundAccess?.basis === "AI_POSITIVE_EVIDENCE"
        ? input.backgroundAccess.eligibilityMatchRef
        : null,
  });
}
