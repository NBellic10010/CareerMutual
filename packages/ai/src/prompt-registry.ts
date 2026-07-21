import {
  RECOMMEND_CHALLENGES_PROMPT_HASH,
  RECOMMEND_CHALLENGES_PROMPT_VERSION,
} from "./recommend-challenges-prompt.js";
import {
  BUILD_MATCH_EDGE_PROMPT_HASH,
  BUILD_MATCH_EDGE_PROMPT_VERSION,
} from "./build-match-edge-prompt.js";
import {
  CANDIDATE_DISCOVERY_PROMPT_HASH,
  CANDIDATE_DISCOVERY_PROMPT_VERSION,
} from "./candidate-discovery-prompt.js";
import {
  EMPLOYER_REVIEW_ANALYST_PROMPT_HASH,
  EMPLOYER_REVIEW_ANALYST_PROMPT_VERSION,
} from "./employer-review-analyst-prompt.js";
import {
  CANDIDATE_ELIGIBILITY_PROMPT_HASH,
  CANDIDATE_ELIGIBILITY_PROMPT_VERSION,
} from "./candidate-eligibility-prompt.js";

export type HiringIntelligenceOperation =
  | "compileContract"
  | "buildMatchEdge"
  | "recommendChallenges"
  | "compressEvidence"
  | "deriveCandidateJobSignals"
  | "deriveCandidateEligibilityMatches"
  | "buildAnswerEvidenceEdge";

export interface PromptSpec {
  readonly operation: HiringIntelligenceOperation;
  readonly promptId: string;
  readonly promptVersion: string;
  readonly promptHash?: string;
  readonly inputSchemaVersion: string;
  readonly outputSchemaVersion: string;
  readonly permitsTools: false;
  readonly permitsRemoteConversationState: false;
}

export const PROMPT_REGISTRY = Object.freeze({
  compileContract: {
    operation: "compileContract",
    promptId: "onlyboth.compile-contract",
    promptVersion: "1.0.0",
    inputSchemaVersion: "compile-contract-input@1",
    outputSchemaVersion: "contract-draft@1",
    permitsTools: false,
    permitsRemoteConversationState: false,
  },
  buildMatchEdge: {
    operation: "buildMatchEdge",
    promptId: "onlyboth.build-match-edge",
    promptVersion: BUILD_MATCH_EDGE_PROMPT_VERSION,
    promptHash: BUILD_MATCH_EDGE_PROMPT_HASH,
    inputSchemaVersion: "build-match-edge-input@2",
    outputSchemaVersion: "match-edge-draft@2",
    permitsTools: false,
    permitsRemoteConversationState: false,
  },
  recommendChallenges: {
    operation: "recommendChallenges",
    promptId: "onlyboth.recommend-challenges",
    promptVersion: RECOMMEND_CHALLENGES_PROMPT_VERSION,
    promptHash: RECOMMEND_CHALLENGES_PROMPT_HASH,
    inputSchemaVersion: "recommend-challenges-input@1",
    outputSchemaVersion: "challenge-recommendation@1",
    permitsTools: false,
    permitsRemoteConversationState: false,
  },
  compressEvidence: {
    operation: "compressEvidence",
    promptId: "onlyboth.compress-evidence",
    promptVersion: "1.0.0",
    inputSchemaVersion: "compress-evidence-input@1",
    outputSchemaVersion: "evidence-card-draft@1",
    permitsTools: false,
    permitsRemoteConversationState: false,
  },
  deriveCandidateJobSignals: {
    operation: "deriveCandidateJobSignals",
    promptId: "onlyboth.derive-candidate-job-signals",
    promptVersion: CANDIDATE_DISCOVERY_PROMPT_VERSION,
    promptHash: CANDIDATE_DISCOVERY_PROMPT_HASH,
    inputSchemaVersion: "candidate-job-discovery-input@2",
    outputSchemaVersion: "candidate-job-discovery-output@1",
    permitsTools: false,
    permitsRemoteConversationState: false,
  },
  deriveCandidateEligibilityMatches: {
    operation: "deriveCandidateEligibilityMatches",
    promptId: "onlyboth.derive-candidate-eligibility-matches",
    promptVersion: CANDIDATE_ELIGIBILITY_PROMPT_VERSION,
    promptHash: CANDIDATE_ELIGIBILITY_PROMPT_HASH,
    inputSchemaVersion: "candidate-eligibility-match-input@1",
    outputSchemaVersion: "candidate-eligibility-match-output@1",
    permitsTools: false,
    permitsRemoteConversationState: false,
  },
  buildAnswerEvidenceEdge: {
    operation: "buildAnswerEvidenceEdge",
    promptId: "onlyboth.build-answer-evidence-edge",
    promptVersion: EMPLOYER_REVIEW_ANALYST_PROMPT_VERSION,
    promptHash: EMPLOYER_REVIEW_ANALYST_PROMPT_HASH,
    inputSchemaVersion: "build-answer-evidence-edge-input@1",
    outputSchemaVersion: "answer-evidence-edge-draft@2",
    permitsTools: false,
    permitsRemoteConversationState: false,
  },
} satisfies Readonly<Record<HiringIntelligenceOperation, PromptSpec>>);
