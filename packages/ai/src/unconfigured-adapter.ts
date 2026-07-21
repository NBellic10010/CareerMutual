import type { HiringIntelligencePort } from "./port.js";
import type {
  BuildMatchEdgeInputV2,
  ChallengeRecommendation,
  CompileContractInput,
  CompressEvidenceInput,
  ContractDraft,
  EvidenceCardDraft,
  MatchEdgeDraftV2,
  RecommendChallengesInput,
} from "./schemas.js";

export class HiringIntelligenceUnavailableError extends Error {
  override readonly name = "HiringIntelligenceUnavailableError";
  readonly code = "AI_ADAPTER_NOT_CONFIGURED";

  constructor(readonly operation: keyof HiringIntelligencePort) {
    super(
      `Hiring intelligence operation '${operation}' is unavailable because no AI adapter is configured.`,
    );
  }
}

/** A fail-closed placeholder. It never fabricates an AI business decision. */
export class UnconfiguredHiringIntelligenceAdapter implements HiringIntelligencePort {
  compileContract(_input: CompileContractInput): Promise<ContractDraft> {
    return Promise.reject(new HiringIntelligenceUnavailableError("compileContract"));
  }

  buildMatchEdge(_input: BuildMatchEdgeInputV2): Promise<MatchEdgeDraftV2> {
    return Promise.reject(new HiringIntelligenceUnavailableError("buildMatchEdge"));
  }

  recommendChallenges(_input: RecommendChallengesInput): Promise<ChallengeRecommendation> {
    return Promise.reject(new HiringIntelligenceUnavailableError("recommendChallenges"));
  }

  compressEvidence(_input: CompressEvidenceInput): Promise<EvidenceCardDraft> {
    return Promise.reject(new HiringIntelligenceUnavailableError("compressEvidence"));
  }
}
