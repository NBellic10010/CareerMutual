import type {
  CandidateEducationRecord,
  CandidateEvidenceItem,
  CandidateEvidencePassportProjection,
  CandidateEvidencePassportReceipt,
  CandidateJobDiscoveryInput,
  CandidateJobDiscoveryOutput,
  CandidateOpportunityFeedV2,
} from "@onlyboth/contracts";

import type { FunctionalActor } from "./functional-product";

export interface CandidateDiscoveryCommandContext {
  readonly actor: FunctionalActor;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export interface CandidateDiscoveryIdFactory {
  nextId(
    kind:
      | "command"
      | "event"
      | "outbox"
      | "passport-snapshot"
      | "signal-set"
      | "ai-request"
      | "ai-run"
      | "ai-output"
      | "job-signal",
  ): string;
}

export interface CandidateEvidencePassportStore {
  getPassportProjection(candidateRef: string): Promise<CandidateEvidencePassportProjection>;
  getCandidateOpportunityFeed(candidateRef: string): Promise<CandidateOpportunityFeedV2>;
  saveDraft(input: {
    readonly context: CandidateDiscoveryCommandContext;
    readonly expectedDraftVersion: number;
    readonly education: CandidateEducationRecord;
    readonly evidenceItems: readonly CandidateEvidenceItem[];
    readonly ids: CandidateDiscoveryIdFactory;
  }): Promise<CandidateEvidencePassportReceipt>;
  publishPassport(input: {
    readonly context: CandidateDiscoveryCommandContext;
    readonly expectedDraftVersion: number;
    readonly discoveryConsentVersion: "candidate-discovery-consent@1";
    readonly ids: CandidateDiscoveryIdFactory;
  }): Promise<CandidateEvidencePassportReceipt>;
  refreshDiscovery(input: {
    readonly context: CandidateDiscoveryCommandContext;
    readonly expectedProjectionVersion: number;
    readonly ids: CandidateDiscoveryIdFactory;
  }): Promise<CandidateEvidencePassportReceipt>;
}

export interface ClaimedCandidateDiscoveryMessage {
  readonly messageId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly signalSetRef: string;
  readonly candidateRef: string;
  readonly snapshotRef: string;
  readonly attempt: number;
  readonly leaseOwner: string;
}

export interface CandidateDiscoveryPromptMetadata {
  readonly promptId: "onlyboth.derive-candidate-job-signals";
  readonly promptVersion: "1.1.0";
  readonly promptHash: string;
  readonly inputSchemaVersion: "candidate-job-discovery-input@2";
  readonly outputSchemaVersion: "candidate-job-discovery-output@1";
}

export interface CandidateDiscoveryWorkerStore {
  claimNext(
    workerId: string,
    leaseDurationSeconds: number,
  ): Promise<ClaimedCandidateDiscoveryMessage | null>;
  loadInput(
    message: ClaimedCandidateDiscoveryMessage,
    requestRef: string,
  ): Promise<CandidateJobDiscoveryInput | null>;
  startRequest(input: {
    readonly message: ClaimedCandidateDiscoveryMessage;
    readonly requestRef: string;
    readonly runRef: string;
    readonly input: CandidateJobDiscoveryInput;
    readonly inputHash: string;
    readonly clientRequestId: string;
    readonly prompt: CandidateDiscoveryPromptMetadata;
  }): Promise<void>;
  completeRequest(input: {
    readonly message: ClaimedCandidateDiscoveryMessage;
    readonly requestRef: string;
    readonly runRef: string;
    readonly outputRef: string;
    readonly input: CandidateJobDiscoveryInput;
    readonly inputHash: string;
    readonly output: CandidateJobDiscoveryOutput;
    readonly outputHash: string;
    readonly resolvedModel: string;
    readonly providerResponseId: string;
    readonly ids: CandidateDiscoveryIdFactory;
  }): Promise<"SUCCEEDED" | "SUPERSEDED">;
  failRequest(input: {
    readonly message: ClaimedCandidateDiscoveryMessage;
    readonly requestRef: string | null;
    readonly runRef: string | null;
    readonly status: "NEEDS_HUMAN" | "FAILED_PERMANENT";
    readonly errorCode: string;
  }): Promise<void>;
  retryRequest(input: {
    readonly message: ClaimedCandidateDiscoveryMessage;
    readonly requestRef: string;
    readonly runRef: string;
    readonly errorCode: string;
    readonly retryAt: Date;
  }): Promise<void>;
  markProcessed(message: ClaimedCandidateDiscoveryMessage): Promise<void>;
}

export interface CandidateJobDiscoveryPort {
  deriveSignals(
    input: CandidateJobDiscoveryInput,
    clientRequestId: string,
  ): Promise<{
    readonly output: CandidateJobDiscoveryOutput;
    readonly providerResponseId: string;
    readonly resolvedModel: string;
  }>;
}

export interface CandidateJobDiscoveryValidatorPort {
  validate(
    input: CandidateJobDiscoveryInput,
    output: CandidateJobDiscoveryOutput,
  ): CandidateJobDiscoveryOutput;
}

export interface CandidateDiscoveryCanonicalHasher {
  hash(value: unknown): string;
}
