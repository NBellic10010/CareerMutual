import type {
  BlindReviewDomainEventRecord,
  BlindReviewOutboxRecord,
  CandidateInterestSubmissionSnapshot,
  CandidateInterestTransaction,
  CandidateInterestUnitOfWork,
  PersistCandidateInterestSubmission,
  StoredCandidateInterest,
  StoredCandidateInterestCommandReceipt,
} from "@onlyboth/application";
import type {
  CandidateInterestCommand,
  CandidateOpportunityProjectionV3,
} from "@onlyboth/contracts";
import type { EligibilityEdge, EligibilityPredicate } from "@onlyboth/domain";

export type InMemoryCandidateInterestFailurePoint = "INTEREST_OUTBOX" | null;

export interface InMemoryCandidateInterestOptions {
  readonly opportunityRef: string;
  readonly opportunityVersion: number;
  readonly opportunityState: "OPEN" | "CLOSED";
  readonly commitmentState: "ACTIVE" | "PAUSED" | "CLOSED";
  readonly contractVersionRef: string;
  readonly requiredConsentVersion: string;
  readonly queuePolicyVersion: "onlyboth.interest-queue@1";
  readonly publicSeed: string;
  readonly runtimeMode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
  readonly eligibilityPredicates: readonly EligibilityPredicate[];
  readonly now: Date;
  readonly failAt: InMemoryCandidateInterestFailurePoint;
}

interface InMemoryCandidateInterestState {
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
  interest: StoredCandidateInterest | null;
  eligibility: EligibilityEdge | null;
  persistedHardFacts: CandidateInterestCommand["hard_facts"];
  candidateProjection: CandidateOpportunityProjectionV3 | null;
  receipts: Map<string, StoredCandidateInterestCommandReceipt>;
  events: BlindReviewDomainEventRecord[];
  outbox: BlindReviewOutboxRecord[];
}

export interface InMemoryCandidateInterestSnapshot {
  readonly interest: StoredCandidateInterest | null;
  readonly eligibility: EligibilityEdge | null;
  readonly persistedHardFacts: CandidateInterestCommand["hard_facts"];
  readonly candidateProjection: CandidateOpportunityProjectionV3 | null;
  readonly events: readonly BlindReviewDomainEventRecord[];
  readonly outbox: readonly BlindReviewOutboxRecord[];
  readonly preselectedCandidateRef: null;
}

function receiptKey(actorRef: string, idempotencyKey: string): string {
  return `${actorRef}:${idempotencyKey}`;
}

function cloneState(state: InMemoryCandidateInterestState): InMemoryCandidateInterestState {
  return {
    ...state,
    eligibilityPredicates: structuredClone(state.eligibilityPredicates),
    interest: state.interest === null ? null : structuredClone(state.interest),
    eligibility: state.eligibility === null ? null : structuredClone(state.eligibility),
    persistedHardFacts: structuredClone(state.persistedHardFacts),
    candidateProjection:
      state.candidateProjection === null ? null : structuredClone(state.candidateProjection),
    receipts: new Map([...state.receipts].map(([key, receipt]) => [key, structuredClone(receipt)])),
    events: structuredClone(state.events),
    outbox: structuredClone(state.outbox),
  };
}

export class InMemoryCandidateInterestUnitOfWork implements CandidateInterestUnitOfWork {
  #state: InMemoryCandidateInterestState;
  #failurePoint: InMemoryCandidateInterestFailurePoint;

  public constructor(private readonly options: InMemoryCandidateInterestOptions) {
    this.#failurePoint = options.failAt;
    this.#state = {
      opportunityRef: options.opportunityRef,
      opportunityVersion: options.opportunityVersion,
      opportunityState: options.opportunityState,
      commitmentState: options.commitmentState,
      contractVersionRef: options.contractVersionRef,
      requiredConsentVersion: options.requiredConsentVersion,
      queuePolicyVersion: options.queuePolicyVersion,
      publicSeed: options.publicSeed,
      runtimeMode: options.runtimeMode,
      synthetic: options.runtimeMode === "GOLDEN_REPLAY",
      eligibilityPredicates: structuredClone(options.eligibilityPredicates),
      interest: null,
      eligibility: null,
      persistedHardFacts: [],
      candidateProjection: null,
      receipts: new Map(),
      events: [],
      outbox: [],
    };
  }

  public snapshot(): InMemoryCandidateInterestSnapshot {
    const snapshot = cloneState(this.#state);
    return {
      interest: snapshot.interest,
      eligibility: snapshot.eligibility,
      persistedHardFacts: snapshot.persistedHardFacts,
      candidateProjection: snapshot.candidateProjection,
      events: snapshot.events,
      outbox: snapshot.outbox,
      preselectedCandidateRef: null,
    };
  }

  public injectFailure(point: InMemoryCandidateInterestFailurePoint): void {
    this.#failurePoint = point;
  }

  public async runInTransaction<TResult>(
    work: (transaction: CandidateInterestTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const pending = cloneState(this.#state);
    const failurePoint = this.#failurePoint;
    const transaction: CandidateInterestTransaction = {
      databaseNow: new Date(this.options.now),
      async findReceipt(actorRef, idempotencyKey) {
        const receipt = pending.receipts.get(receiptKey(actorRef, idempotencyKey));
        return receipt === undefined ? null : structuredClone(receipt);
      },
      async loadForUpdate(opportunityRef, candidateRef) {
        if (pending.opportunityRef !== opportunityRef) return null;
        const existingInterest =
          pending.interest?.candidateRef === candidateRef ? pending.interest : null;
        const snapshot: CandidateInterestSubmissionSnapshot = {
          opportunityRef: pending.opportunityRef,
          opportunityVersion: pending.opportunityVersion,
          opportunityState: pending.opportunityState,
          commitmentState: pending.commitmentState,
          contractVersionRef: pending.contractVersionRef,
          requiredConsentVersion: pending.requiredConsentVersion,
          queuePolicyVersion: pending.queuePolicyVersion,
          publicSeed: pending.publicSeed,
          runtimeMode: pending.runtimeMode,
          synthetic: pending.synthetic,
          eligibilityPredicates: structuredClone(pending.eligibilityPredicates),
          existingInterest: existingInterest === null ? null : structuredClone(existingInterest),
        };
        return snapshot;
      },
      async persist(input: PersistCandidateInterestSubmission) {
        if (pending.opportunityVersion !== input.expectedOpportunityVersion) {
          throw new Error("Candidate Interest Opportunity version changed before persistence.");
        }
        if (pending.interest !== null) {
          throw new Error("Candidate Interest uniqueness changed before persistence.");
        }
        pending.interest = structuredClone(input.interest);
        pending.eligibility = structuredClone(input.eligibility);
        pending.persistedHardFacts = structuredClone(input.hardFacts);
        pending.events.push(...structuredClone(input.events));
        pending.outbox.push(structuredClone(input.outbox));
        if (failurePoint === "INTEREST_OUTBOX") {
          throw new Error("Injected Candidate Interest Outbox failure.");
        }
        pending.candidateProjection = structuredClone(input.candidateProjection);
        pending.receipts.set(receiptKey(input.actorRef, input.idempotencyKey), {
          actorRef: input.actorRef,
          idempotencyKey: input.idempotencyKey,
          commandFingerprint: input.commandFingerprint,
          receipt: structuredClone(input.receipt),
        });
      },
    };

    const result = await work(transaction);
    this.#state = pending;
    return result;
  }
}
