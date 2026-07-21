import { MatchingInvariantError } from "./errors";
import type {
  AllocationDecision,
  AttentionCommitmentSnapshot,
  AttentionSlotSnapshot,
  CreditAccountSnapshot,
  ExploreCandidate,
  MatchingCycle,
} from "./types";

export const DIRECT_EXPLORE_ALGORITHM_VERSION = "onlyboth.direct-explore@1";

export function selectDirectAndExplore(input: {
  readonly cycle: MatchingCycle;
  readonly directMatchEdgeRef: string;
  readonly candidates: readonly ExploreCandidate[];
  readonly activeCandidateRefs: ReadonlySet<string>;
  readonly publicSeed: string;
  readonly hash: (value: string) => string;
}): readonly [AllocationDecision, AllocationDecision] {
  if (input.cycle.state !== "READY_FOR_DIRECT") {
    throw new MatchingInvariantError(
      "MATCHING_CYCLE_NOT_READY",
      "Direct selection requires a fully terminal Matching Cycle.",
    );
  }
  const direct = input.candidates.find(
    (candidate) => candidate.matchEdgeRef === input.directMatchEdgeRef,
  );
  if (direct === undefined || input.activeCandidateRefs.has(direct.candidateRef)) {
    throw new MatchingInvariantError(
      "DIRECT_MATCH_EDGE_INVALID",
      "The Direct MatchEdge is absent, ineligible, or already bound to an Active Window.",
    );
  }

  const explorePool = input.candidates
    .filter(
      (candidate) =>
        candidate.matchEdgeRef !== direct.matchEdgeRef &&
        !input.activeCandidateRefs.has(candidate.candidateRef),
    )
    .map((candidate) => ({
      ...candidate,
      publicHash: input.hash(
        `${input.publicSeed}|${input.cycle.opportunityRef}|${candidate.candidateRef}|${candidate.matchEdgeRef}`,
      ),
    }))
    .sort(
      (left, right) =>
        left.publicHash.localeCompare(right.publicHash) ||
        left.candidateRef.localeCompare(right.candidateRef),
    );
  const explore = explorePool[0];
  if (explore === undefined) {
    throw new MatchingInvariantError(
      "EXPLORE_POOL_INSUFFICIENT",
      "At least one non-Direct proofable candidate is required for Explore.",
    );
  }
  return Object.freeze([
    Object.freeze({
      allocationKind: "DIRECT",
      candidateRef: direct.candidateRef,
      matchEdgeRef: direct.matchEdgeRef,
      publicHash: null,
    }),
    Object.freeze({
      allocationKind: "EXPLORE",
      candidateRef: explore.candidateRef,
      matchEdgeRef: explore.matchEdgeRef,
      publicHash: explore.publicHash,
    }),
  ]);
}

export function assertAttentionAllocationCapacity(input: {
  readonly commitment: AttentionCommitmentSnapshot;
  readonly slots: readonly AttentionSlotSnapshot[];
  readonly creditAccount: CreditAccountSnapshot;
  readonly activeWindowCount: number;
  readonly candidateActiveWindowCounts: Readonly<Record<string, number>>;
  readonly candidateRefs: readonly string[];
}): void {
  const { commitment } = input;
  if (
    commitment.activeWip !== 2 ||
    commitment.directSlots !== 1 ||
    commitment.exploreSlots !== 1 ||
    input.activeWindowCount + 2 > commitment.activeWip
  ) {
    throw new MatchingInvariantError(
      "ALLOCATION_CAPACITY_INVALID",
      "The MVP allocation requires exactly one Direct and one Explore within WIP=2.",
    );
  }
  if (input.slots.length < 2 || input.slots.filter((slot) => slot.available).length < 2) {
    throw new MatchingInvariantError(
      "SLOT_CAPACITY_INVALID",
      "Two available Attention Slots are required.",
    );
  }
  if (input.creditAccount.availableCredits < commitment.creditPerWindow * 2) {
    throw new MatchingInvariantError(
      "CREDIT_CAPACITY_INVALID",
      "The Credit Account cannot fund both Review Windows.",
    );
  }
  if (input.candidateRefs.some((candidateRef) => input.candidateActiveWindowCounts[candidateRef])) {
    throw new MatchingInvariantError(
      "ACTIVE_WINDOW_LIMIT_REACHED",
      "A candidate may hold at most one Active Window across opportunities.",
    );
  }
}
