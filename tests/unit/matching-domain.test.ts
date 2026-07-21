import { createHash } from "node:crypto";

import {
  assertAttentionAllocationCapacity,
  createMatchingCycle,
  evaluateEligibility,
  MatchingInvariantError,
  selectDirectAndExplore,
  summarizeMatchingCycle,
} from "@onlyboth/domain";
import {
  MATCHING_OPPORTUNITY_REF,
  MATCHING_PUBLIC_SEED,
  PROOFABLE_CANDIDATE_REFS,
  matchEdgeRef,
} from "@onlyboth/demo-replay";
import { describe, expect, it } from "vitest";

function readyCycle() {
  return summarizeMatchingCycle(
    createMatchingCycle({
      matchingCycleRef: "cycle-1",
      opportunityRef: MATCHING_OPPORTUNITY_REF,
      contractVersionRef: "contract@1",
      contractHash: `sha256:${"1".repeat(64)}`,
      expectedInterestCount: 2,
    }),
    ["propose", "abstain"],
  );
}

describe("deterministic matching domain", () => {
  it("evaluates only typed predicates and returns an explicit missing-fact reason", () => {
    const edge = evaluateEligibility({
      eligibilityEdgeRef: "eligibility-42",
      opportunityRef: "opp-1",
      candidateRef: "candidate-42",
      contractVersionRef: "contract@1",
      predicates: [
        {
          predicateRef: "predicate-auth",
          factRef: "work_authorization",
          operator: "EQUALS",
          expected: "US",
        },
        {
          predicateRef: "predicate-overlap",
          factRef: "timezone_overlap",
          operator: "GTE",
          minimum: 6,
        },
        {
          predicateRef: "predicate-language",
          factRef: "required_language",
          operator: "CONTAINS",
          member: "TypeScript",
        },
      ],
      hardFacts: {
        work_authorization: "US",
        timezone_overlap: 6,
        required_language: "SQL, TypeScript",
      },
    });
    expect(edge.eligible).toBe(true);

    const missing = evaluateEligibility({
      eligibilityEdgeRef: "eligibility-missing",
      opportunityRef: "opp-1",
      candidateRef: "candidate-01",
      contractVersionRef: "contract@1",
      predicates: [
        {
          predicateRef: "predicate-auth",
          factRef: "work_authorization",
          operator: "EQUALS",
          expected: "US",
        },
      ],
      hardFacts: {},
    });
    expect(missing).toMatchObject({
      eligible: false,
      predicateResults: [{ reasonRef: "eligibility:missing:work_authorization" }],
    });
  });

  it("blocks allocation until every result is terminal and needs-human is resolved", () => {
    const cycle = createMatchingCycle({
      matchingCycleRef: "cycle-1",
      opportunityRef: "opp-1",
      contractVersionRef: "contract@1",
      contractHash: `sha256:${"1".repeat(64)}`,
      expectedInterestCount: 2,
    });
    expect(() => summarizeMatchingCycle(cycle, ["propose"])).toThrow(MatchingInvariantError);
    expect(summarizeMatchingCycle(cycle, ["propose", "needs_human"]).state).toBe("NEEDS_HUMAN");
  });

  it("selects Candidate 42 with the public seed after Sarah chooses Candidate 17", () => {
    const decisions = selectDirectAndExplore({
      cycle: readyCycle(),
      directMatchEdgeRef: "match-edge-17",
      candidates: PROOFABLE_CANDIDATE_REFS.map((candidateRef) => ({
        candidateRef,
        matchEdgeRef: matchEdgeRef(candidateRef),
      })),
      activeCandidateRefs: new Set(),
      publicSeed: MATCHING_PUBLIC_SEED,
      hash: (value) => createHash("sha256").update(value).digest("hex"),
    });
    expect(decisions).toMatchObject([
      { allocationKind: "DIRECT", candidateRef: "candidate-17" },
      { allocationKind: "EXPLORE", candidateRef: "candidate-42" },
    ]);
  });

  it("uses candidate_ref as the stable tie-break and excludes active candidates", () => {
    const decisions = selectDirectAndExplore({
      cycle: readyCycle(),
      directMatchEdgeRef: "edge-direct",
      candidates: [
        { candidateRef: "candidate-17", matchEdgeRef: "edge-direct" },
        { candidateRef: "candidate-03", matchEdgeRef: "edge-03" },
        { candidateRef: "candidate-05", matchEdgeRef: "edge-05" },
      ],
      activeCandidateRefs: new Set(["candidate-03"]),
      publicSeed: "seed",
      hash: () => "same-hash",
    });
    expect(decisions[1].candidateRef).toBe("candidate-05");
  });

  it("enforces WIP, two slots, credits, and Q_i=1", () => {
    const base = {
      commitment: {
        commitmentRef: "commitment-1",
        version: 1,
        reviewerRef: "reviewer-1",
        activeWip: 2,
        directSlots: 1,
        exploreSlots: 1,
        creditPerWindow: 10,
      },
      slots: [
        { slotRef: "slot-1", slotKind: "DIRECT", available: true },
        { slotRef: "slot-2", slotKind: "EXPLORE", available: true },
      ],
      creditAccount: { accountRef: "credits-1", availableCredits: 20 },
      activeWindowCount: 0,
      candidateActiveWindowCounts: {},
      candidateRefs: ["candidate-17", "candidate-42"],
    } as const;
    expect(() => assertAttentionAllocationCapacity(base)).not.toThrow();
    expect(() =>
      assertAttentionAllocationCapacity({
        ...base,
        candidateActiveWindowCounts: { "candidate-42": 1 },
      }),
    ).toThrowError(expect.objectContaining({ code: "ACTIVE_WINDOW_LIMIT_REACHED" }));
  });
});
