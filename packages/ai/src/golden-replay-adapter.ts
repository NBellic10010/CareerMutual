import type { HiringIntelligencePort } from "@onlyboth/application";
import {
  BuildMatchEdgeInputV2Schema,
  ChallengeRecommendationSchema,
  MatchEdgeDraftV2Schema,
  RecommendChallengesInputSchema,
  type BuildMatchEdgeInputV2,
  type ChallengeRecommendation,
  type CompileContractInput,
  type CompressEvidenceInput,
  type ContractDraft,
  type EvidenceCardDraft,
  type MatchEdgeDraftV2,
  type RecommendChallengesInput,
} from "@onlyboth/contracts";
import { MATCHING_REPLAY_ID, SYNTHETIC_MATCH_EDGE_CASES } from "@onlyboth/demo-replay";

import { canonicalJson, hashCanonicalJson } from "./canonical-json.js";
import { HiringIntelligenceError } from "./errors.js";
import {
  CANDIDATE_42_GOLDEN_KEY_PARTS,
  CANDIDATE_42_RECOMMENDATION_OUTPUT,
} from "./fixtures/candidate-42-recommendation.js";
import { PROMPT_REGISTRY } from "./prompt-registry.js";

export interface GoldenReplayKeyParts {
  readonly operation: "buildMatchEdge" | "recommendChallenges";
  readonly input_hash: string;
  readonly prompt_version: string;
  readonly input_schema_version: string;
  readonly output_schema_version: string;
  readonly replay_id: string;
}

export function goldenReplayKey(parts: GoldenReplayKeyParts): string {
  return canonicalJson(parts);
}

export interface GoldenRecommendationFixture {
  readonly key: GoldenReplayKeyParts;
  readonly output: ChallengeRecommendation;
}

export interface GoldenMatchEdgeFixture {
  readonly key: GoldenReplayKeyParts;
  readonly output: MatchEdgeDraftV2;
}

function unsupported(operation: "compileContract" | "compressEvidence"): never {
  throw new HiringIntelligenceError(
    "AI_OPERATION_NOT_IMPLEMENTED",
    operation,
    false,
    `Golden Replay does not implement '${operation}' in the Candidate 42 milestone.`,
  );
}

export class GoldenReplayHiringIntelligenceAdapter implements HiringIntelligencePort {
  readonly #fixtures: ReadonlyMap<string, ChallengeRecommendation>;
  readonly #matchFixtures: ReadonlyMap<string, MatchEdgeDraftV2>;
  readonly #replayId: string;

  public constructor(
    replayId = "payment-retry-v1",
    fixtures: readonly GoldenRecommendationFixture[] = [
      {
        key: CANDIDATE_42_GOLDEN_KEY_PARTS,
        output: CANDIDATE_42_RECOMMENDATION_OUTPUT,
      },
      {
        key: { ...CANDIDATE_42_GOLDEN_KEY_PARTS, replay_id: MATCHING_REPLAY_ID },
        output: CANDIDATE_42_RECOMMENDATION_OUTPUT,
      },
    ],
    matchFixtures: readonly GoldenMatchEdgeFixture[] = SYNTHETIC_MATCH_EDGE_CASES.map(
      ({ input, output }) => ({
        key: {
          operation: "buildMatchEdge",
          input_hash: hashCanonicalJson(input),
          prompt_version: PROMPT_REGISTRY.buildMatchEdge.promptVersion,
          input_schema_version: PROMPT_REGISTRY.buildMatchEdge.inputSchemaVersion,
          output_schema_version: PROMPT_REGISTRY.buildMatchEdge.outputSchemaVersion,
          replay_id: MATCHING_REPLAY_ID,
        },
        output,
      }),
    ),
  ) {
    this.#replayId = replayId;
    this.#fixtures = new Map(
      fixtures.map((fixture) => [
        goldenReplayKey(fixture.key),
        ChallengeRecommendationSchema.parse(fixture.output),
      ]),
    );
    this.#matchFixtures = new Map(
      matchFixtures.map((fixture) => [
        goldenReplayKey(fixture.key),
        MatchEdgeDraftV2Schema.parse(fixture.output),
      ]),
    );
  }

  public async compileContract(_input: CompileContractInput): Promise<ContractDraft> {
    return unsupported("compileContract");
  }

  public async buildMatchEdge(input: BuildMatchEdgeInputV2): Promise<MatchEdgeDraftV2> {
    const parsed = BuildMatchEdgeInputV2Schema.parse(input);
    const spec = PROMPT_REGISTRY.buildMatchEdge;
    const key = goldenReplayKey({
      operation: "buildMatchEdge",
      input_hash: hashCanonicalJson(parsed),
      prompt_version: spec.promptVersion,
      input_schema_version: spec.inputSchemaVersion,
      output_schema_version: spec.outputSchemaVersion,
      replay_id: this.#replayId,
    });
    const fixture = this.#matchFixtures.get(key);
    if (fixture === undefined) {
      throw new HiringIntelligenceError(
        "AI_GOLDEN_REPLAY_MISS",
        "buildMatchEdge",
        false,
        "No exact Golden Replay fixture matches the canonical MatchEdge request.",
      );
    }
    return structuredClone(fixture);
  }

  public async recommendChallenges(
    input: RecommendChallengesInput,
  ): Promise<ChallengeRecommendation> {
    const parsed = RecommendChallengesInputSchema.parse(input);
    const spec = PROMPT_REGISTRY.recommendChallenges;
    const key = goldenReplayKey({
      operation: "recommendChallenges",
      input_hash: hashCanonicalJson(parsed),
      prompt_version: spec.promptVersion,
      input_schema_version: spec.inputSchemaVersion,
      output_schema_version: spec.outputSchemaVersion,
      replay_id: this.#replayId,
    });
    const fixture = this.#fixtures.get(key);
    if (fixture === undefined) {
      throw new HiringIntelligenceError(
        "AI_GOLDEN_REPLAY_MISS",
        "recommendChallenges",
        false,
        "No exact Golden Replay fixture matches the canonical request.",
      );
    }
    return structuredClone(fixture);
  }

  public async compressEvidence(_input: CompressEvidenceInput): Promise<EvidenceCardDraft> {
    return unsupported("compressEvidence");
  }
}
