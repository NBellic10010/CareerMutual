import type { BuildMatchEdgeInputV2, MatchEdgeDraftV2 } from "@onlyboth/contracts";
import {
  evaluateEligibility,
  type EligibilityEdge,
  type EligibilityPredicate,
} from "@onlyboth/domain";

import type { HiringIntelligencePort } from "../ports/hiring-intelligence";

export interface ClaimedMatchingMessage {
  readonly messageId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly interestRef: string;
  readonly matchingCycleRef: string;
  readonly candidateRef: string;
  readonly leaseOwner: string;
  readonly attempt: number;
}

export interface MatchingInterestContext {
  readonly interestRef: string;
  readonly opportunityRef: string;
  readonly candidateRef: string;
  readonly matchingCycleRef: string;
  readonly matchingCycleVersion: number;
  readonly contractVersionRef: string;
  readonly contractHash: string;
  readonly sealedContract: BuildMatchEdgeInputV2["sealed_contract"];
  readonly claimSnapshot: BuildMatchEdgeInputV2["claim_snapshot"];
  readonly sourceRefs: BuildMatchEdgeInputV2["source_refs"];
  readonly allowedProofTemplates: BuildMatchEdgeInputV2["allowed_proof_templates"];
  readonly eligibilityPredicates: readonly EligibilityPredicate[];
  readonly runtimeMode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly replayId: string | null;
  readonly alreadyEvaluated: boolean;
}

export interface MatchRequestStart {
  readonly requestId: string;
  readonly input: BuildMatchEdgeInputV2;
  readonly inputHash: string;
  readonly eligibility: EligibilityEdge;
  readonly promptId: string;
  readonly promptVersion: string;
  readonly promptHash: string;
  readonly inputSchemaVersion: string;
  readonly outputSchemaVersion: string;
  readonly adapterId: string;
}

export type MatchingWorkerCompletion =
  | {
      readonly kind: "DUPLICATE";
    }
  | {
      readonly kind: "TERMINAL";
      readonly requestId: string;
      readonly input: BuildMatchEdgeInputV2;
      readonly output: MatchEdgeDraftV2;
      readonly outputHash: string;
      readonly aiOutputRef: string;
      readonly matchEdgeRef: string | null;
      readonly validationPolicyVersion: string;
    }
  | {
      readonly kind: "NEEDS_HUMAN";
      readonly requestId: string;
      readonly errorCode: string;
    }
  | {
      readonly kind: "RETRYABLE";
      readonly requestId: string;
      readonly errorCode: string;
      readonly retryAfterSeconds: number;
    };

export interface MatchEdgeWorkerStore {
  claimNext(workerId: string, leaseDurationSeconds: number): Promise<ClaimedMatchingMessage | null>;
  loadInterestContext(interestRef: string): Promise<MatchingInterestContext | null>;
  startRequest(message: ClaimedMatchingMessage, request: MatchRequestStart): Promise<void>;
  complete(message: ClaimedMatchingMessage, completion: MatchingWorkerCompletion): Promise<void>;
}

export interface MatchEdgeWorkerOptions {
  readonly store: MatchEdgeWorkerStore;
  readonly intelligence: HiringIntelligencePort;
  readonly validate: (input: BuildMatchEdgeInputV2, output: MatchEdgeDraftV2) => MatchEdgeDraftV2;
  readonly hash: (value: unknown) => string;
  readonly prompt: {
    readonly promptId: string;
    readonly promptVersion: string;
    readonly promptHash: string;
    readonly inputSchemaVersion: string;
    readonly outputSchemaVersion: string;
  };
  readonly adapterId: string;
  readonly maxAttempts?: number;
}

function factMap(
  context: MatchingInterestContext,
): Readonly<Record<string, boolean | number | string>> {
  return Object.fromEntries(
    context.claimSnapshot.hard_facts.map((fact) => [fact.fact_type, fact.value]),
  );
}

function inputFor(context: MatchingInterestContext): BuildMatchEdgeInputV2 {
  return {
    schema_version: "build-match-edge-input@2",
    request_ref: `match-request:${context.candidateRef.slice("candidate-".length)}`,
    matching_cycle: {
      matching_cycle_ref: context.matchingCycleRef,
      version: context.matchingCycleVersion,
      opportunity_ref: context.opportunityRef,
    },
    sealed_contract: context.sealedContract,
    claim_snapshot: context.claimSnapshot,
    source_refs: [...context.sourceRefs],
    allowed_proof_templates: [...context.allowedProofTemplates],
  };
}

function errorMetadata(error: unknown): { readonly code: string; readonly retryable: boolean } {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  ) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: "AI_SCHEMA_MISMATCH", retryable: false };
}

export class MatchEdgeWorker {
  readonly #maxAttempts: number;

  public constructor(private readonly options: MatchEdgeWorkerOptions) {
    this.#maxAttempts = options.maxAttempts ?? 3;
  }

  public async runOnce(workerId: string): Promise<"IDLE" | "PROCESSED" | "RETRY_SCHEDULED"> {
    const message = await this.options.store.claimNext(workerId, 30);
    if (message === null) return "IDLE";
    const context = await this.options.store.loadInterestContext(message.interestRef);
    if (context === null) {
      await this.options.store.complete(message, {
        kind: "NEEDS_HUMAN",
        requestId: `match-request:${message.candidateRef.slice("candidate-".length)}`,
        errorCode: "MATCH_CONTEXT_STALE",
      });
      return "PROCESSED";
    }
    if (context.alreadyEvaluated) {
      await this.options.store.complete(message, { kind: "DUPLICATE" });
      return "PROCESSED";
    }
    const eligibility = evaluateEligibility({
      eligibilityEdgeRef: `eligibility-${context.candidateRef.slice("candidate-".length)}`,
      opportunityRef: context.opportunityRef,
      candidateRef: context.candidateRef,
      contractVersionRef: context.contractVersionRef,
      predicates: context.eligibilityPredicates,
      hardFacts: factMap(context),
    });
    const input = inputFor(context);
    const requestId = input.request_ref;
    await this.options.store.startRequest(message, {
      requestId,
      input,
      inputHash: this.options.hash(input),
      eligibility,
      ...this.options.prompt,
      adapterId: this.options.adapterId,
    });
    if (!eligibility.eligible) {
      await this.options.store.complete(message, {
        kind: "NEEDS_HUMAN",
        requestId,
        errorCode: "CANDIDATE_INELIGIBLE",
      });
      return "PROCESSED";
    }
    try {
      const output = this.options.validate(
        input,
        await this.options.intelligence.buildMatchEdge(input),
      );
      await this.options.store.complete(message, {
        kind: "TERMINAL",
        requestId,
        input,
        output,
        outputHash: this.options.hash(output),
        aiOutputRef: `ai-output-match-${context.candidateRef.slice("candidate-".length)}`,
        matchEdgeRef:
          output.decision === "propose"
            ? `match-edge-${context.candidateRef.slice("candidate-".length)}`
            : null,
        validationPolicyVersion: "onlyboth.match-edge-validation@1",
      });
      return "PROCESSED";
    } catch (error: unknown) {
      const metadata = errorMetadata(error);
      if (metadata.retryable && message.attempt < this.#maxAttempts) {
        await this.options.store.complete(message, {
          kind: "RETRYABLE",
          requestId,
          errorCode: metadata.code,
          retryAfterSeconds: message.attempt,
        });
        return "RETRY_SCHEDULED";
      }
      await this.options.store.complete(message, {
        kind: "NEEDS_HUMAN",
        requestId,
        errorCode: metadata.code,
      });
      return "PROCESSED";
    }
  }
}
