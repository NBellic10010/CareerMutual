import {
  LiveResponsesHiringIntelligenceAdapter,
  validateMatchEdgeDraft,
} from "../../packages/ai/src/index";
import { describe, expect, it } from "vitest";

import { BUILD_MATCH_EDGE_EVAL_CORPUS } from "./build-match-edge-corpus";

const apiKey = process.env.OPENAI_API_KEY;
if (apiKey === undefined || apiKey.length === 0) {
  throw new Error(
    "BLOCKED: LIVE buildMatchEdge eval requires a Worker-only OPENAI_API_KEY. No Golden case was substituted.",
  );
}

describe("LIVE buildMatchEdge model eval", () => {
  it("meets all hard gates and the expert-recognition threshold", async () => {
    const adapter = new LiveResponsesHiringIntelligenceAdapter({ apiKey });
    let hardGatePasses = 0;
    let normalExpertHits = 0;

    for (const evalCase of BUILD_MATCH_EDGE_EVAL_CORPUS) {
      const output = validateMatchEdgeDraft(
        evalCase.input,
        await adapter.buildMatchEdge(evalCase.input),
      );
      hardGatePasses += 1;
      if (
        evalCase.kind === "PROPOSE" &&
        output.decision === "propose" &&
        output.uncertainty_ref === evalCase.expectedUncertaintyRef &&
        output.proof_template_ref === evalCase.expectedProofTemplateRef
      ) {
        normalExpertHits += 1;
      }
      if (evalCase.kind === "ABSTAIN") {
        expect(output.decision, evalCase.id).toBe("abstain");
      }
    }

    expect(hardGatePasses).toBe(12);
    expect(normalExpertHits).toBeGreaterThanOrEqual(5);
  });
});
