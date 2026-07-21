import type {
  CandidateInterestCommand,
  CandidateInterestReceipt,
  CandidateOpportunityProjectionV3,
} from "@onlyboth/contracts";
import type { EligibilityEdge, EligibilityPredicate } from "@onlyboth/domain";

import type { BlindReviewDomainEventRecord, BlindReviewOutboxRecord } from "./blind-review";

export type CandidateInterestFinalState = "WAITING_FOR_BACKED_SLOT" | "INELIGIBLE_HARD_REQUIREMENT";

export interface StoredCandidateInterest {
  readonly interestRef: string;
  readonly opportunityRef: string;
  readonly candidateRef: string;
  readonly status: CandidateInterestFinalState;
  readonly queuePolicyVersion: "onlyboth.interest-queue@1";
  readonly queueTieBreak: string;
  readonly consentVersion: string;
  readonly interestCreatedAt: string;
  readonly eligibleAt: string | null;
  readonly version: 2;
}

export interface CandidateInterestSubmissionSnapshot {
  readonly opportunityRef: string;
  readonly opportunityVersion: number;
  readonly opportunityState: "OPEN" | "CLOSED";
  readonly commitmentState: "ACTIVE" | "PAUSED" | "CLOSED";
  readonly contractVersionRef: string;
  readonly requiredConsentVersion: string;
  readonly queuePolicyVersion: "onlyboth.interest-queue@1";
  readonly publicSeed: string;
  readonly runtimeMode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly synthetic: boolean;
  readonly eligibilityPredicates: readonly EligibilityPredicate[];
  readonly existingInterest: StoredCandidateInterest | null;
}

export interface StoredCandidateInterestCommandReceipt {
  readonly actorRef: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly receipt: CandidateInterestReceipt;
}

export interface PersistCandidateInterestSubmission {
  readonly actorRef: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly expectedOpportunityVersion: number;
  readonly interest: StoredCandidateInterest;
  readonly hardFacts: CandidateInterestCommand["hard_facts"];
  readonly eligibility: EligibilityEdge;
  readonly events: readonly [BlindReviewDomainEventRecord, BlindReviewDomainEventRecord];
  readonly outbox: BlindReviewOutboxRecord;
  readonly candidateProjection: CandidateOpportunityProjectionV3;
  readonly receipt: CandidateInterestReceipt;
}

export interface CandidateInterestTransaction {
  readonly databaseNow: Date;
  findReceipt(
    actorRef: string,
    idempotencyKey: string,
  ): Promise<StoredCandidateInterestCommandReceipt | null>;
  loadForUpdate(
    opportunityRef: string,
    candidateRef: string,
  ): Promise<CandidateInterestSubmissionSnapshot | null>;
  persist(input: PersistCandidateInterestSubmission): Promise<void>;
}

export interface CandidateInterestUnitOfWork {
  runInTransaction<TResult>(
    work: (transaction: CandidateInterestTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface CandidateInterestIdFactory {
  nextId(kind: "command" | "event" | "outbox" | "candidate-interest" | "eligibility-edge"): string;
}
