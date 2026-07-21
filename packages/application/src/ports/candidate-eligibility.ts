import type {
  CandidateEligibilityMatchInput,
  CandidateEligibilityMatchOutput,
  CandidateEligibilityProjection,
  RefreshCandidateEligibilityCommand,
} from "@onlyboth/contracts";

import type {
  CandidateDiscoveryCommandContext,
  CandidateDiscoveryIdFactory,
} from "./candidate-discovery";

export interface CandidateEligibilityPromptMetadata {
  readonly promptId: "onlyboth.derive-candidate-eligibility-matches";
  readonly promptVersion: "1.0.0";
  readonly promptHash: string;
  readonly inputSchemaVersion: "candidate-eligibility-match-input@1";
  readonly outputSchemaVersion: "candidate-eligibility-match-output@1";
}

export interface CandidateEligibilityIdFactory {
  nextId(
    kind:
      | Parameters<CandidateDiscoveryIdFactory["nextId"]>[0]
      | "eligibility-match-set"
      | "eligibility-match",
  ): string;
}

export interface ClaimedCandidateEligibilityMessage {
  readonly messageId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly matchSetRef: string;
  readonly candidateRef: string;
  readonly snapshotRef: string;
  readonly attempt: number;
  readonly leaseOwner: string;
}

export interface CandidateEligibilityWorkerStore {
  claimNext(
    workerId: string,
    leaseDurationSeconds: number,
  ): Promise<ClaimedCandidateEligibilityMessage | null>;
  loadInput(
    message: ClaimedCandidateEligibilityMessage,
    requestRef: string,
  ): Promise<CandidateEligibilityMatchInput | null>;
  startRequest(input: {
    readonly message: ClaimedCandidateEligibilityMessage;
    readonly requestRef: string;
    readonly runRef: string;
    readonly input: CandidateEligibilityMatchInput;
    readonly inputHash: string;
    readonly clientRequestId: string;
    readonly prompt: CandidateEligibilityPromptMetadata;
  }): Promise<void>;
  completeRequest(input: {
    readonly message: ClaimedCandidateEligibilityMessage;
    readonly requestRef: string;
    readonly runRef: string;
    readonly outputRef: string;
    readonly input: CandidateEligibilityMatchInput;
    readonly inputHash: string;
    readonly output: CandidateEligibilityMatchOutput;
    readonly outputHash: string;
    readonly resolvedModel: string;
    readonly providerResponseId: string;
    readonly ids: CandidateEligibilityIdFactory;
  }): Promise<"SUCCEEDED" | "SUPERSEDED">;
  failRequest(input: {
    readonly message: ClaimedCandidateEligibilityMessage;
    readonly requestRef: string | null;
    readonly runRef: string | null;
    readonly status: "NEEDS_HUMAN" | "FAILED_PERMANENT";
    readonly errorCode: string;
  }): Promise<void>;
  retryRequest(input: {
    readonly message: ClaimedCandidateEligibilityMessage;
    readonly requestRef: string;
    readonly runRef: string;
    readonly errorCode: string;
    readonly retryAt: Date;
  }): Promise<void>;
  markProcessed(message: ClaimedCandidateEligibilityMessage): Promise<void>;
}

export interface CandidateEligibilityMatchPort {
  deriveMatches(
    input: CandidateEligibilityMatchInput,
    clientRequestId: string,
  ): Promise<{
    readonly output: CandidateEligibilityMatchOutput;
    readonly providerResponseId: string;
    readonly resolvedModel: string;
  }>;
}

export interface CandidateEligibilityMatchValidatorPort {
  validate(
    input: CandidateEligibilityMatchInput,
    output: CandidateEligibilityMatchOutput,
  ): CandidateEligibilityMatchOutput;
}

export interface CandidateEligibilityStore {
  getProjection(candidateRef: string): Promise<CandidateEligibilityProjection>;
  refresh(input: {
    readonly context: CandidateDiscoveryCommandContext;
    readonly command: RefreshCandidateEligibilityCommand;
    readonly ids: CandidateEligibilityIdFactory;
  }): Promise<CandidateEligibilityProjection>;
}
