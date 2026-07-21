import { ReviewWindowInvariantError } from "./errors";
import type {
  CandidateDecision,
  HumanOutcomeType,
  ReserveReviewWindowInput,
  ReviewWindow,
  ReviewWindowState,
  ReviewWindowTransition,
  ReviewWindowVersionPins,
  PrestartReleaseReason,
} from "./types";

function requireIdentifier(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new ReviewWindowInvariantError(
      "INVALID_IDENTIFIER",
      `${field} must be a non-empty identifier`,
    );
  }
}

function requireIsoTimestamp(value: string, field: string): void {
  requireIdentifier(value, field);
  if (Number.isNaN(Date.parse(value))) {
    throw new ReviewWindowInvariantError("INVALID_TIMESTAMP", `${field} must be an ISO timestamp`);
  }
}

function requireVersionPins(pins: ReviewWindowVersionPins): void {
  requireIdentifier(pins.contractVersionId, "contractVersionId");
  requireIdentifier(pins.labelPolicyVersionId, "labelPolicyVersionId");
  requireIdentifier(pins.proofTemplateVersionId, "proofTemplateVersionId");
  requireIdentifier(pins.challengeCatalogVersionId, "challengeCatalogVersionId");
}

function requireState(window: ReviewWindow, expected: ReviewWindowState): void {
  if (window.state !== expected) {
    throw new ReviewWindowInvariantError(
      "ILLEGAL_STATE_TRANSITION",
      `Expected ${expected}, received ${window.state}`,
    );
  }
}

function transition(window: ReviewWindow, patch: Partial<ReviewWindow>): ReviewWindow {
  return {
    ...window,
    ...patch,
    version: window.version + 1,
  };
}

export function reserveReviewWindow(input: ReserveReviewWindowInput): ReviewWindowTransition {
  requireIdentifier(input.id, "id");
  requireIdentifier(input.candidateId, "candidateId");
  requireIdentifier(input.opportunityId, "opportunityId");
  requireIdentifier(input.reviewerId, "reviewerId");
  requireIdentifier(input.attentionSlotId, "attentionSlotId");
  requireIdentifier(input.creditHoldId, "creditHoldId");
  requireIdentifier(input.matchEdgeId, "matchEdgeId");
  requireVersionPins(input.versionPins);

  if (!input.attentionSlotAvailable) {
    throw new ReviewWindowInvariantError(
      "ATTENTION_SLOT_UNAVAILABLE",
      "A Review Window requires an available Attention Slot",
    );
  }

  if (input.creditHoldStatus !== "HELD") {
    throw new ReviewWindowInvariantError(
      "CREDIT_NOT_HELD",
      "A Review Window requires a held Credit Hold",
    );
  }

  const window: ReviewWindow = {
    id: input.id,
    candidateId: input.candidateId,
    opportunityId: input.opportunityId,
    reviewerId: input.reviewerId,
    attentionSlotId: input.attentionSlotId,
    creditHoldId: input.creditHoldId,
    creditHoldStatus: input.creditHoldStatus,
    matchEdgeId: input.matchEdgeId,
    versionPins: { ...input.versionPins },
    state: "RESERVED",
    version: 1,
    ...(input.acceptBy === undefined ? {} : { acceptBy: input.acceptBy }),
    evidenceIds: [],
    candidateDecision: "PENDING",
    askBackStatus: "UNAVAILABLE",
    revealAuthorized: false,
  };

  return {
    window,
    events: [
      {
        type: "AttentionReserved",
        reviewWindowId: window.id,
        reviewerId: window.reviewerId,
        attentionSlotId: window.attentionSlotId,
      },
    ],
  };
}

export function releaseProofWindow(
  window: ReviewWindow,
  reason: PrestartReleaseReason,
): ReviewWindowTransition {
  requireState(window, "RESERVED");
  const next = transition(window, {
    state: "RELEASED",
    creditHoldStatus: "RETURNED",
    releaseReason: reason,
  });
  return {
    window: next,
    events: [{ type: "ProofWindowReleased", reviewWindowId: window.id, reason }],
  };
}

export function acceptProofWindow(window: ReviewWindow): ReviewWindowTransition {
  requireState(window, "RESERVED");
  if (window.creditHoldStatus !== "HELD") {
    throw new ReviewWindowInvariantError(
      "CREDIT_NOT_HELD",
      "Proof cannot start unless its Credit Hold remains held",
    );
  }

  const next = transition(window, { state: "STAGE_A_ACTIVE" });
  return {
    window: next,
    events: [{ type: "ProofWindowAccepted", reviewWindowId: window.id }],
  };
}

export function submitStageA(window: ReviewWindow, snapshotId: string): ReviewWindowTransition {
  requireState(window, "STAGE_A_ACTIVE");
  requireIdentifier(snapshotId, "snapshotId");
  const next = transition(window, {
    state: "CHECKPOINT_PENDING",
    stageASnapshotId: snapshotId,
  });
  return {
    window: next,
    events: [{ type: "StageASubmitted", reviewWindowId: window.id, snapshotId }],
  };
}

export function selectHumanChallenge(
  window: ReviewWindow,
  input: {
    readonly reviewerId: string;
    readonly challengeId: string;
    readonly catalogHash: string;
    readonly evidenceRefs: readonly string[];
    readonly selectionSource: "AI_RECOMMENDATION" | "MANUAL_CATALOG";
    readonly recommendationOutputRef?: string;
    readonly selectedAt: string;
  },
): ReviewWindowTransition {
  requireState(window, "CHECKPOINT_PENDING");
  requireIdentifier(input.challengeId, "challengeId");
  requireIdentifier(input.catalogHash, "catalogHash");
  requireIsoTimestamp(input.selectedAt, "selectedAt");
  if (input.reviewerId !== window.reviewerId) {
    throw new ReviewWindowInvariantError(
      "REVIEWER_MISMATCH",
      "Only the reserved reviewer may select the human challenge",
    );
  }
  if (window.stageASnapshotId === undefined) {
    throw new ReviewWindowInvariantError(
      "ILLEGAL_STATE_TRANSITION",
      "A Stage A snapshot is required before challenge selection",
    );
  }
  if (input.evidenceRefs.length === 0) {
    throw new ReviewWindowInvariantError(
      "EVIDENCE_REFERENCE_INVALID",
      "The human challenge must reference Stage A evidence",
    );
  }

  const checkpoint = {
    reviewerId: input.reviewerId,
    stageASnapshotId: window.stageASnapshotId,
    challengeId: input.challengeId,
    catalogHash: input.catalogHash,
    evidenceRefs: [...input.evidenceRefs],
    selectionSource: input.selectionSource,
    ...(input.recommendationOutputRef === undefined
      ? {}
      : { recommendationOutputRef: input.recommendationOutputRef }),
    selectedAt: input.selectedAt,
  };
  const next = transition(window, {
    state: "STAGE_B_ACTIVE",
    checkpoint,
  });
  return {
    window: next,
    events: [
      {
        type: "HumanChallengeSelected",
        reviewWindowId: window.id,
        reviewerId: input.reviewerId,
        snapshotId: window.stageASnapshotId,
        challengeId: input.challengeId,
        catalogHash: input.catalogHash,
        evidenceRefs: [...input.evidenceRefs],
        selectionSource: input.selectionSource,
        ...(input.recommendationOutputRef === undefined
          ? {}
          : { recommendationOutputRef: input.recommendationOutputRef }),
        selectedAt: input.selectedAt,
      },
    ],
  };
}

export function abortForPlatformFailure(
  window: ReviewWindow,
  input: { readonly component: string; readonly reasonRef: string },
): ReviewWindowTransition {
  if (
    window.state !== "RESERVED" &&
    window.state !== "STAGE_A_ACTIVE" &&
    window.state !== "CHECKPOINT_PENDING" &&
    window.state !== "STAGE_B_ACTIVE"
  ) {
    throw new ReviewWindowInvariantError(
      "ILLEGAL_STATE_TRANSITION",
      `Platform Abort is not valid from ${window.state}`,
    );
  }
  requireIdentifier(input.component, "component");
  requireIdentifier(input.reasonRef, "reasonRef");

  const next = transition(window, { state: "PLATFORM_ABORT" });
  return {
    window: next,
    events: [
      {
        type: "PlatformAborted",
        reviewWindowId: window.id,
        component: input.component,
        reasonRef: input.reasonRef,
      },
    ],
  };
}

export function recordEvidenceReady(
  window: ReviewWindow,
  evidenceIds: readonly string[],
): ReviewWindowTransition {
  requireState(window, "STAGE_B_ACTIVE");
  if (evidenceIds.length === 0 || evidenceIds.some((id) => id.trim().length === 0)) {
    throw new ReviewWindowInvariantError(
      "EVIDENCE_REFERENCE_INVALID",
      "Evidence-ready state requires at least one valid evidence ID",
    );
  }
  const uniqueEvidenceIds = [...new Set(evidenceIds)];
  const next = transition(window, {
    state: "EVIDENCE_READY",
    evidenceIds: uniqueEvidenceIds,
  });
  return {
    window: next,
    events: [
      {
        type: "EvidenceBecameReady",
        reviewWindowId: window.id,
        evidenceIds: uniqueEvidenceIds,
      },
    ],
  };
}

export function recordHumanOutcome(
  window: ReviewWindow,
  outcome: HumanOutcomeType,
  evidenceRefs: readonly string[],
): ReviewWindowTransition {
  requireState(window, "EVIDENCE_READY");
  if (
    evidenceRefs.length === 0 ||
    evidenceRefs.some((reference) => !window.evidenceIds.includes(reference))
  ) {
    throw new ReviewWindowInvariantError(
      "EVIDENCE_REFERENCE_INVALID",
      "A human outcome must reference evidence from the current proof",
    );
  }
  const next = transition(window, {
    state: "OUTCOME_RECORDED",
    outcome: { type: outcome, evidenceRefs: [...new Set(evidenceRefs)] },
    askBackStatus: "AVAILABLE",
  });
  return {
    window: next,
    events: [
      {
        type: "HumanOutcomeRecorded",
        reviewWindowId: window.id,
        outcome,
        evidenceRefs: [...new Set(evidenceRefs)],
      },
    ],
  };
}

export function recordCandidateDecision(
  window: ReviewWindow,
  decision: Exclude<CandidateDecision, "PENDING">,
): ReviewWindowTransition {
  requireState(window, "OUTCOME_RECORDED");
  if (window.askBackStatus === "PENDING") {
    throw new ReviewWindowInvariantError(
      "ASK_BACK_UNRESOLVED",
      "The reviewer must answer a submitted Ask Back before the candidate decides",
    );
  }
  const next = transition(window, {
    candidateDecision: decision,
    askBackStatus: window.askBackStatus === "AVAILABLE" ? "WAIVED" : window.askBackStatus,
  });
  return {
    window: next,
    events: [
      {
        type: "CandidateDecisionRecorded",
        reviewWindowId: window.id,
        decision,
      },
    ],
  };
}

export function submitAskBack(window: ReviewWindow, question: string): ReviewWindowTransition {
  requireState(window, "OUTCOME_RECORDED");
  requireIdentifier(question, "question");
  if (window.askBackStatus !== "AVAILABLE") {
    throw new ReviewWindowInvariantError(
      "ASK_BACK_UNRESOLVED",
      "Ask Back is not available for this Window",
    );
  }
  const next = transition(window, {
    state: "ASK_BACK_PENDING",
    askBackStatus: "PENDING",
    askBackQuestion: question,
  });
  return {
    window: next,
    events: [{ type: "AskBackSubmitted", reviewWindowId: window.id, question }],
  };
}

export function answerAskBack(
  window: ReviewWindow,
  input: { readonly reviewerId: string; readonly answer: string },
): ReviewWindowTransition {
  requireState(window, "ASK_BACK_PENDING");
  requireIdentifier(input.answer, "answer");
  if (input.reviewerId !== window.reviewerId) {
    throw new ReviewWindowInvariantError(
      "REVIEWER_MISMATCH",
      "Only the reserved reviewer may answer Ask Back",
    );
  }
  const next = transition(window, {
    state: "OUTCOME_RECORDED",
    askBackStatus: "ANSWERED",
    askBackAnswer: input.answer,
  });
  return {
    window: next,
    events: [
      {
        type: "AskBackAnswered",
        reviewWindowId: window.id,
        reviewerId: input.reviewerId,
        answer: input.answer,
      },
    ],
  };
}

export function waiveAskBack(window: ReviewWindow): ReviewWindowTransition {
  requireState(window, "OUTCOME_RECORDED");
  if (window.askBackStatus !== "AVAILABLE") {
    throw new ReviewWindowInvariantError(
      "ASK_BACK_UNRESOLVED",
      "Only an available Ask Back can be waived",
    );
  }
  const next = transition(window, { askBackStatus: "WAIVED" });
  return {
    window: next,
    events: [{ type: "AskBackWaived", reviewWindowId: window.id }],
  };
}

export function authorizeLabelReveal(window: ReviewWindow): ReviewWindowTransition {
  requireState(window, "OUTCOME_RECORDED");
  if (
    window.outcome?.type !== "ADVANCE" ||
    window.outcome.evidenceRefs.length === 0 ||
    window.candidateDecision !== "CONTINUE" ||
    (window.askBackStatus !== "ANSWERED" && window.askBackStatus !== "WAIVED") ||
    window.checkpoint === undefined
  ) {
    throw new ReviewWindowInvariantError(
      "REVEAL_NOT_AUTHORIZED",
      "Reveal requires an evidence-linked Advance, a human checkpoint, and explicit candidate continuation",
    );
  }

  const next = transition(window, {
    state: "REVEALED",
    revealAuthorized: true,
  });
  return {
    window: next,
    events: [{ type: "LabelRevealAuthorized", reviewWindowId: window.id }],
  };
}

export function settleReviewWindow(window: ReviewWindow): ReviewWindowTransition {
  const closeOrClarify =
    window.state === "OUTCOME_RECORDED" &&
    (window.outcome?.type === "CLOSE" || window.outcome?.type === "CLARIFY");
  const declinedAdvance =
    window.state === "OUTCOME_RECORDED" &&
    window.outcome?.type === "ADVANCE" &&
    window.candidateDecision === "DECLINE";

  if (window.state !== "REVEALED" && !closeOrClarify && !declinedAdvance) {
    throw new ReviewWindowInvariantError(
      "ILLEGAL_STATE_TRANSITION",
      "A normal settlement requires a completed outcome and resolved candidate decision",
    );
  }
  if (window.checkpoint === undefined || window.outcome === undefined) {
    throw new ReviewWindowInvariantError(
      "ILLEGAL_STATE_TRANSITION",
      "A normal settlement requires both human checkpoint and outcome",
    );
  }
  if (window.askBackStatus !== "ANSWERED" && window.askBackStatus !== "WAIVED") {
    throw new ReviewWindowInvariantError(
      "ASK_BACK_UNRESOLVED",
      "A normal settlement requires Ask Back to be answered or waived",
    );
  }

  const next = transition(window, { state: "SETTLED" });
  return {
    window: next,
    events: [{ type: "ReviewWindowSettled", reviewWindowId: window.id }],
  };
}
