import type { ReserveReviewWindowInput } from "@onlyboth/domain";

export function makeReservationInput(
  overrides: Partial<ReserveReviewWindowInput> = {},
): ReserveReviewWindowInput {
  return {
    id: "review-window-test",
    candidateId: "candidate-test",
    opportunityId: "opportunity-test",
    reviewerId: "reviewer-sarah",
    attentionSlotId: "attention-slot-test",
    attentionSlotAvailable: true,
    creditHoldId: "credit-hold-test",
    creditHoldStatus: "HELD",
    matchEdgeId: "match-edge-test",
    versionPins: {
      contractVersionId: "contract-v1",
      labelPolicyVersionId: "label-policy-v1",
      proofTemplateVersionId: "proof-template-v1",
      challengeCatalogVersionId: "catalog-v1",
    },
    ...overrides,
  };
}
