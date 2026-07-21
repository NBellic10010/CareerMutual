import { validateMatchEdgeDraft } from "../../packages/ai/src/index";
import { describe, expect, it } from "vitest";

import { BUILD_MATCH_EDGE_EVAL_CORPUS } from "./build-match-edge-corpus";

describe("buildMatchEdge 12-case contract eval", () => {
  it("passes every Schema/ref/capability/source/no-label/no-score hard gate", () => {
    let hardGatePasses = 0;
    let normalExpertHits = 0;

    for (const evalCase of BUILD_MATCH_EDGE_EVAL_CORPUS) {
      const output = validateMatchEdgeDraft(evalCase.input, evalCase.contractFixture);
      hardGatePasses += 1;
      if (
        evalCase.kind === "PROPOSE" &&
        output.decision === "propose" &&
        output.uncertainty_ref === evalCase.expectedUncertaintyRef &&
        output.proof_template_ref === evalCase.expectedProofTemplateRef
      ) {
        normalExpertHits += 1;
      }
      if (evalCase.kind === "ABSTAIN" || evalCase.kind === "INJECTION") {
        expect(output.decision, evalCase.id).toBe("abstain");
      }
    }

    expect(BUILD_MATCH_EDGE_EVAL_CORPUS).toHaveLength(12);
    expect(hardGatePasses).toBe(12);
    expect(normalExpertHits).toBeGreaterThanOrEqual(5);
  });
});
