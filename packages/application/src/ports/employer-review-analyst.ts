import type { AnswerEvidenceEdgeDraft, BuildAnswerEvidenceEdgeInput } from "@onlyboth/contracts";

/** AI may draft evidence analysis only; it has no business-state mutation capability. */
export interface EmployerReviewAnalystPort {
  buildAnswerEvidenceEdge(
    input: BuildAnswerEvidenceEdgeInput,
    clientRequestId: string,
  ): Promise<{
    readonly output: AnswerEvidenceEdgeDraft;
    readonly providerResponseId: string;
    readonly resolvedModel: string;
  }>;
}
