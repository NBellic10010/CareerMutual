export type PrototypeRole = "CANDIDATE" | "EMPLOYER";

export type PrototypePhase =
  | "OPPORTUNITY_OPEN"
  | "WAITING_FOR_BACKED_SLOT"
  | "BACKED_OFFERED"
  | "ANSWER_ACTIVE"
  | "REVIEW_PENDING"
  | "COHORT_READY"
  | "RESUME_REVEALED"
  | "OFFER_RELEASED";

export type PrototypeReviewDecision = "ADVANCE_ELIGIBLE" | "NO_FURTHER_PROOF" | "INCONCLUSIVE";

export interface PrototypeState {
  readonly role: PrototypeRole;
  readonly phase: PrototypePhase;
  readonly answerText: string;
  readonly visibleTestsPassed: boolean;
  readonly conditionalRevealConsent: boolean;
  readonly reviewDecision: PrototypeReviewDecision | null;
  readonly selectedEvidenceRefs: readonly string[];
  readonly stillUnknown: string;
  readonly cohortReviewed: number;
  readonly cohortSize: number;
  readonly slotRecycled: boolean;
  readonly nextInterestOffered: boolean;
  readonly selectedAnswerRef: string | null;
  readonly advancementConfirmationOpen: boolean;
  readonly advancedAnswerRef: string | null;
  readonly deepProofAttentionHeld: boolean;
  readonly resumeRevealed: boolean;
  readonly notice: string;
}

export type PrototypeAction =
  | Readonly<{ type: "SET_ROLE"; role: PrototypeRole }>
  | Readonly<{ type: "REGISTER_INTEREST" }>
  | Readonly<{ type: "SIMULATE_SLOT_AVAILABLE" }>
  | Readonly<{ type: "ACCEPT_BACKED_OFFER" }>
  | Readonly<{ type: "DECLINE_BACKED_OFFER" }>
  | Readonly<{ type: "EDIT_ANSWER"; value: string }>
  | Readonly<{ type: "RUN_VISIBLE_TESTS" }>
  | Readonly<{ type: "SUBMIT_ANSWER" }>
  | Readonly<{ type: "SET_REVIEW_DECISION"; decision: PrototypeReviewDecision }>
  | Readonly<{ type: "TOGGLE_EVIDENCE"; evidenceRef: string }>
  | Readonly<{ type: "SET_STILL_UNKNOWN"; value: string }>
  | Readonly<{ type: "RECORD_HUMAN_REVIEW" }>
  | Readonly<{ type: "OPEN_ADVANCEMENT_CONFIRMATION"; answerRef: string }>
  | Readonly<{ type: "CLOSE_ADVANCEMENT_CONFIRMATION" }>
  | Readonly<{ type: "CONFIRM_ADVANCEMENT" }>
  | Readonly<{ type: "RESET" }>;

export const INITIAL_PROTOTYPE_STATE: PrototypeState = Object.freeze({
  role: "CANDIDATE",
  phase: "OPPORTUNITY_OPEN",
  answerText: "",
  visibleTestsPassed: false,
  conditionalRevealConsent: false,
  reviewDecision: null,
  selectedEvidenceRefs: [],
  stillUnknown: "",
  cohortReviewed: 7,
  cohortSize: 8,
  slotRecycled: false,
  nextInterestOffered: false,
  selectedAnswerRef: null,
  advancementConfirmationOpen: false,
  advancedAnswerRef: null,
  deepProofAttentionHeld: false,
  resumeRevealed: false,
  notice: "Resume v3 is sealed. Registering interest does not create an Application.",
});

export class PrototypeTransitionError extends Error {
  public override readonly name = "PrototypeTransitionError";
}

function requirePhase(state: PrototypeState, phase: PrototypePhase, action: string): void {
  if (state.phase !== phase) {
    throw new PrototypeTransitionError(
      `${action} requires ${phase}; current phase is ${state.phase}.`,
    );
  }
}

function requireEmployer(state: PrototypeState, action: string): void {
  if (state.role !== "EMPLOYER") {
    throw new PrototypeTransitionError(`${action} requires the Employer prototype role.`);
  }
}

export function prototypeReducer(state: PrototypeState, action: PrototypeAction): PrototypeState {
  switch (action.type) {
    case "SET_ROLE":
      return { ...state, role: action.role };
    case "REGISTER_INTEREST":
      requirePhase(state, "OPPORTUNITY_OPEN", "Register interest");
      return {
        ...state,
        phase: "WAITING_FOR_BACKED_SLOT",
        notice:
          "Interest received. You are waiting for funded human capacity—not a ranking decision.",
      };
    case "SIMULATE_SLOT_AVAILABLE":
      requirePhase(state, "WAITING_FOR_BACKED_SLOT", "Simulate Slot availability");
      return {
        ...state,
        phase: "BACKED_OFFERED",
        notice: "A reusable Slot is now backed by Sarah, a 24-hour SLA, and held Credit.",
      };
    case "ACCEPT_BACKED_OFFER":
      requirePhase(state, "BACKED_OFFERED", "Accept backed Offer");
      return {
        ...state,
        phase: "ANSWER_ACTIVE",
        conditionalRevealConsent: true,
        notice:
          "Answer Session active. Resume v3 may be revealed only after backed post-answer Advancement.",
      };
    case "DECLINE_BACKED_OFFER":
      requirePhase(state, "BACKED_OFFERED", "Decline backed Offer");
      return {
        ...state,
        phase: "OFFER_RELEASED",
        slotRecycled: true,
        notice: "Offer released without penalty. No Candidate failure or ability inference exists.",
      };
    case "EDIT_ANSWER":
      requirePhase(state, "ANSWER_ACTIVE", "Edit answer");
      return { ...state, answerText: action.value };
    case "RUN_VISIBLE_TESTS":
      requirePhase(state, "ANSWER_ACTIVE", "Run visible tests");
      return {
        ...state,
        visibleTestsPassed: true,
        notice: "Visible tests passed locally. This prototype executes no code or Sandbox.",
      };
    case "SUBMIT_ANSWER":
      requirePhase(state, "ANSWER_ACTIVE", "Submit answer");
      if (state.answerText.trim().length < 40 || !state.visibleTestsPassed) {
        throw new PrototypeTransitionError(
          "Submit answer requires a substantive response and the simulated visible-test run.",
        );
      }
      return {
        ...state,
        phase: "REVIEW_PENDING",
        notice: "Application submitted. Sarah now owes one evidence-linked Human Review Receipt.",
      };
    case "SET_REVIEW_DECISION":
      requirePhase(state, "REVIEW_PENDING", "Set Human Review decision");
      requireEmployer(state, "Set Human Review decision");
      return { ...state, reviewDecision: action.decision };
    case "TOGGLE_EVIDENCE": {
      requirePhase(state, "REVIEW_PENDING", "Select review Evidence");
      requireEmployer(state, "Select review Evidence");
      const selected = new Set(state.selectedEvidenceRefs);
      if (selected.has(action.evidenceRef)) selected.delete(action.evidenceRef);
      else selected.add(action.evidenceRef);
      return { ...state, selectedEvidenceRefs: [...selected] };
    }
    case "SET_STILL_UNKNOWN":
      requirePhase(state, "REVIEW_PENDING", "Record still unknown");
      requireEmployer(state, "Record still unknown");
      return { ...state, stillUnknown: action.value };
    case "RECORD_HUMAN_REVIEW":
      requirePhase(state, "REVIEW_PENDING", "Record Human Review");
      requireEmployer(state, "Record Human Review");
      if (
        state.reviewDecision === null ||
        state.selectedEvidenceRefs.length === 0 ||
        state.stillUnknown.trim().length === 0
      ) {
        throw new PrototypeTransitionError(
          "Human Review requires one decision, at least one Evidence ref, and still_unknown.",
        );
      }
      return {
        ...state,
        phase: "COHORT_READY",
        cohortReviewed: state.cohortSize,
        slotRecycled: true,
        nextInterestOffered: true,
        notice:
          "Review Receipt recorded. Slot 08 released; the next queued Interest received a backed Offer.",
      };
    case "OPEN_ADVANCEMENT_CONFIRMATION":
      requirePhase(state, "COHORT_READY", "Open Advancement confirmation");
      requireEmployer(state, "Open Advancement confirmation");
      if (action.answerRef.trim().length === 0) {
        throw new PrototypeTransitionError("Advancement requires one anonymous Answer ref.");
      }
      if (action.answerRef === "answer-08" && state.reviewDecision !== "ADVANCE_ELIGIBLE") {
        throw new PrototypeTransitionError(
          "Anonymous Answer 08 is not eligible for post-answer Advancement.",
        );
      }
      return {
        ...state,
        selectedAnswerRef: action.answerRef,
        advancementConfirmationOpen: true,
      };
    case "CLOSE_ADVANCEMENT_CONFIRMATION":
      return { ...state, advancementConfirmationOpen: false, selectedAnswerRef: null };
    case "CONFIRM_ADVANCEMENT":
      if (!state.advancementConfirmationOpen || state.selectedAnswerRef === null) {
        throw new PrototypeTransitionError(
          "Advancement confirmation must be open before the selection can be committed.",
        );
      }
      requirePhase(state, "COHORT_READY", "Confirm Advancement");
      requireEmployer(state, "Confirm Advancement");
      if (state.cohortReviewed !== state.cohortSize) {
        throw new PrototypeTransitionError(
          "Advancement requires the complete Cohort Review barrier.",
        );
      }
      if (!state.conditionalRevealConsent) {
        throw new PrototypeTransitionError(
          "Resume Reveal requires Candidate conditional consent recorded at the backed Offer.",
        );
      }
      return {
        ...state,
        phase: "RESUME_REVEALED",
        advancementConfirmationOpen: false,
        advancedAnswerRef: state.selectedAnswerRef,
        deepProofAttentionHeld: true,
        resumeRevealed: true,
        notice:
          "Selection committed before reveal. Deep Proof attention is held; authorized Resume snapshots are now visible.",
      };
    case "RESET":
      return INITIAL_PROTOTYPE_STATE;
  }
}

export function advancePrototype(state: PrototypeState, action: PrototypeAction): PrototypeState {
  return prototypeReducer(state, action);
}
