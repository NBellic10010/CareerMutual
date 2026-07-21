import type {
  BuildMatchEdgeInputV2,
  ChallengeRecommendation,
  CompileContractInput,
  CompressEvidenceInput,
  ContractDraft,
  EvidenceCardDraft,
  MatchEdgeDraftV2,
  RecommendChallengesInput,
} from "@onlyboth/contracts";

/**
 * The entire AI authority surface. Implementations return drafts only and
 * never receive business-state mutation tools.
 */
export interface HiringIntelligencePort {
  compileContract(input: CompileContractInput): Promise<ContractDraft>;
  buildMatchEdge(input: BuildMatchEdgeInputV2): Promise<MatchEdgeDraftV2>;
  recommendChallenges(input: RecommendChallengesInput): Promise<ChallengeRecommendation>;
  compressEvidence(input: CompressEvidenceInput): Promise<EvidenceCardDraft>;
}
