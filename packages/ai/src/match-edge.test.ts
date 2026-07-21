import { MatchEdgeDraftV2Schema, type MatchEdgeDraftV2 } from "@onlyboth/contracts";
import {
  MATCHING_REPLAY_ID,
  syntheticBuildMatchEdgeInput,
  syntheticMatchEdgeOutput,
} from "@onlyboth/demo-replay";
import { describe, expect, it, vi } from "vitest";

import { HiringIntelligenceError } from "./errors";
import { GoldenReplayHiringIntelligenceAdapter } from "./golden-replay-adapter";
import { LiveResponsesHiringIntelligenceAdapter } from "./live-responses-adapter";
import { matchInputPinsAreCurrent, validateMatchEdgeDraft } from "./match-edge-validator";

describe("MatchEdge V2 AI boundary", () => {
  it("validates a grounded proposal and a bounded abstain", () => {
    const proposeInput = syntheticBuildMatchEdgeInput("candidate-42");
    expect(
      validateMatchEdgeDraft(proposeInput, syntheticMatchEdgeOutput("candidate-42")),
    ).toMatchObject({ decision: "propose" });
    const abstainInput = syntheticBuildMatchEdgeInput("candidate-01");
    expect(
      validateMatchEdgeDraft(abstainInput, syntheticMatchEdgeOutput("candidate-01")),
    ).toMatchObject({
      decision: "abstain",
      reason_code: "NO_SHARED_CAPABILITY",
    });
  });

  it("rejects unknown refs, missing source coverage, scores, labels, and executable content", () => {
    const input = syntheticBuildMatchEdgeInput("candidate-42");
    const valid = syntheticMatchEdgeOutput("candidate-42");
    if (valid.decision !== "propose") throw new Error("Expected proposal fixture.");
    const cases: MatchEdgeDraftV2[] = [
      { ...valid, claim_refs: ["claim:unknown"] },
      { ...valid, source_refs: ["source:contract:atomicity-risk"] },
      { ...valid, verifiable_reason: "Candidate score is 98." },
      { ...valid, verifiable_reason: "Their school proves the claim." },
      { ...valid, verifiable_reason: "Run curl https://example.test to verify." },
    ];
    for (const output of cases) {
      expect(() => validateMatchEdgeDraft(input, output)).toThrow(HiringIntelligenceError);
    }
  });

  it("marks changed cycle, contract, or claim pins as stale", () => {
    const input = syntheticBuildMatchEdgeInput("candidate-42");
    expect(
      matchInputPinsAreCurrent(input, {
        matchingCycleRef: input.matching_cycle.matching_cycle_ref,
        matchingCycleVersion: input.matching_cycle.version,
        contractVersionRef: input.sealed_contract.contract_version_ref,
        contractHash: input.sealed_contract.contract_hash,
        claimSnapshotRef: input.claim_snapshot.claim_snapshot_ref,
        claimSnapshotVersion: input.claim_snapshot.version,
      }),
    ).toBe(true);
    expect(
      matchInputPinsAreCurrent(input, {
        matchingCycleRef: input.matching_cycle.matching_cycle_ref,
        matchingCycleVersion: 2,
        contractVersionRef: input.sealed_contract.contract_version_ref,
        contractHash: input.sealed_contract.contract_hash,
        claimSnapshotRef: input.claim_snapshot.claim_snapshot_ref,
        claimSnapshotVersion: input.claim_snapshot.version,
      }),
    ).toBe(false);
  });

  it("uses the exact six-part Golden key and fails closed on a cache miss", async () => {
    const adapter = new GoldenReplayHiringIntelligenceAdapter(MATCHING_REPLAY_ID);
    await expect(
      adapter.buildMatchEdge(syntheticBuildMatchEdgeInput("candidate-42")),
    ).resolves.toMatchObject({ decision: "propose" });
    const changed = syntheticBuildMatchEdgeInput("candidate-42");
    await expect(
      adapter.buildMatchEdge({
        ...changed,
        request_ref: "match-request:changed",
      }),
    ).rejects.toMatchObject({ code: "AI_GOLDEN_REPLAY_MISS" });
  });

  it("sends a tool-free, stateless, strict Responses request for LIVE", async () => {
    const input = syntheticBuildMatchEdgeInput("candidate-42");
    const output = MatchEdgeDraftV2Schema.parse(syntheticMatchEdgeOutput("candidate-42"));
    const parse = vi.fn().mockResolvedValue({
      id: "resp-match-1",
      model: "gpt-5.6-sol",
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text" }] }],
      output_parsed: output,
    });
    const adapter = new LiveResponsesHiringIntelligenceAdapter({
      client: { responses: { parse } },
      clientRequestId: () => "client-match-1",
    });
    await expect(adapter.buildMatchEdge(input)).resolves.toEqual(output);
    const request = parse.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: { effort: "medium" },
      store: false,
    });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("background");
    expect(request).not.toHaveProperty("conversation");
    expect(request).not.toHaveProperty("previous_response_id");
    expect(parse.mock.calls[0]?.[1]).toEqual({
      headers: { "X-Client-Request-Id": "client-match-1" },
    });
  });
});
