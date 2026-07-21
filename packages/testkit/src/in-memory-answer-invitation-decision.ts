import type {
  AnswerInvitationDecisionSnapshot,
  AnswerInvitationDecisionTransaction,
  AnswerInvitationDecisionUnitOfWork,
  AnswerSessionStartRecord,
  PersistAnswerInvitationDecision,
  StoredAnswerInvitationDecisionReceipt,
} from "@onlyboth/application";
import type {
  CandidateOpportunityProjectionV3,
  EmployerBlindReviewProjection,
} from "@onlyboth/contracts";

export type InMemoryAnswerInvitationDecisionFailurePoint = "DECISION_OUTBOX" | null;

interface ReturnedCreditLedgerEntry {
  readonly creditHoldRef: string;
  readonly amount: number;
  readonly entryType: "RETURN";
  readonly occurredAt: string;
}

interface InMemoryAnswerInvitationDecisionState {
  snapshot: AnswerInvitationDecisionSnapshot;
  receipts: Map<string, StoredAnswerInvitationDecisionReceipt>;
  answerSessions: AnswerSessionStartRecord[];
  events: PersistAnswerInvitationDecision["event"][];
  outbox: PersistAnswerInvitationDecision["outbox"][number][];
  returnedCreditLedger: ReturnedCreditLedgerEntry[];
  employerProjection: EmployerBlindReviewProjection | null;
  candidateProjection: CandidateOpportunityProjectionV3 | null;
}

export interface InMemoryAnswerInvitationDecisionOptions {
  readonly snapshot: AnswerInvitationDecisionSnapshot;
  readonly now: Date;
  readonly failAt?: InMemoryAnswerInvitationDecisionFailurePoint;
}

export interface InMemoryAnswerInvitationDecisionView {
  readonly snapshot: AnswerInvitationDecisionSnapshot;
  readonly receipts: readonly StoredAnswerInvitationDecisionReceipt[];
  readonly answerSessions: readonly AnswerSessionStartRecord[];
  readonly events: readonly PersistAnswerInvitationDecision["event"][];
  readonly outbox: readonly PersistAnswerInvitationDecision["outbox"][number][];
  readonly returnedCreditLedger: readonly ReturnedCreditLedgerEntry[];
  readonly employerProjection: EmployerBlindReviewProjection | null;
  readonly candidateProjection: CandidateOpportunityProjectionV3 | null;
}

function receiptKey(actorRef: string, idempotencyKey: string): string {
  return `${actorRef}:${idempotencyKey}`;
}

function cloneState(
  state: InMemoryAnswerInvitationDecisionState,
): InMemoryAnswerInvitationDecisionState {
  return {
    snapshot: structuredClone(state.snapshot),
    receipts: new Map([...state.receipts].map(([key, receipt]) => [key, structuredClone(receipt)])),
    answerSessions: structuredClone(state.answerSessions),
    events: structuredClone(state.events),
    outbox: structuredClone(state.outbox),
    returnedCreditLedger: structuredClone(state.returnedCreditLedger),
    employerProjection:
      state.employerProjection === null ? null : structuredClone(state.employerProjection),
    candidateProjection:
      state.candidateProjection === null ? null : structuredClone(state.candidateProjection),
  };
}

function assertSameRefAndVersion(
  current: { readonly version: number },
  previous: { readonly version: number },
  label: string,
): void {
  if (current.version !== previous.version) {
    throw new Error(`${label} changed before the Invitation decision was persisted.`);
  }
}

export class InMemoryAnswerInvitationDecisionUnitOfWork implements AnswerInvitationDecisionUnitOfWork {
  #state: InMemoryAnswerInvitationDecisionState;
  #failurePoint: InMemoryAnswerInvitationDecisionFailurePoint;
  #transactionTail: Promise<void> = Promise.resolve();

  public constructor(private readonly options: InMemoryAnswerInvitationDecisionOptions) {
    this.#failurePoint = options.failAt ?? null;
    this.#state = {
      snapshot: structuredClone(options.snapshot),
      receipts: new Map(),
      answerSessions: [],
      events: [],
      outbox: [],
      returnedCreditLedger: [],
      employerProjection: null,
      candidateProjection: null,
    };
  }

  public injectFailure(point: InMemoryAnswerInvitationDecisionFailurePoint): void {
    this.#failurePoint = point;
  }

  public view(): InMemoryAnswerInvitationDecisionView {
    const state = cloneState(this.#state);
    return {
      snapshot: state.snapshot,
      receipts: [...state.receipts.values()],
      answerSessions: state.answerSessions,
      events: state.events,
      outbox: state.outbox,
      returnedCreditLedger: state.returnedCreditLedger,
      employerProjection: state.employerProjection,
      candidateProjection: state.candidateProjection,
    };
  }

  public async runInTransaction<TResult>(
    work: (transaction: AnswerInvitationDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const predecessor = this.#transactionTail;
    let release: (() => void) | undefined;
    this.#transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await predecessor;

    try {
      const pending = cloneState(this.#state);
      const failurePoint = this.#failurePoint;
      const transaction: AnswerInvitationDecisionTransaction = {
        databaseNow: new Date(this.options.now),
        async findReceipt(actorRef, idempotencyKey) {
          const receipt = pending.receipts.get(receiptKey(actorRef, idempotencyKey));
          return receipt === undefined ? null : structuredClone(receipt);
        },
        async loadInvitationForUpdate(invitationRef) {
          if (pending.snapshot.targetInvitationRef !== invitationRef) return null;
          const invitation = pending.snapshot.review.invitations.find(
            ({ invitationRef: current }) => current === invitationRef,
          );
          return invitation === undefined ? null : structuredClone(pending.snapshot);
        },
        async findExpiredInvitationForUpdate() {
          const invitation = pending.snapshot.review.invitations.find(
            ({ invitationRef }) => invitationRef === pending.snapshot.targetInvitationRef,
          );
          if (
            invitation === undefined ||
            invitation.state !== "OFFERED" ||
            Date.parse(invitation.offerExpiresAt) > transaction.databaseNow.getTime()
          ) {
            return null;
          }
          return structuredClone(pending.snapshot);
        },
        async persistDecision(input) {
          if (pending.snapshot.review.version !== input.previousReview.version) {
            throw new Error("Blind Review changed before the Invitation decision was persisted.");
          }
          if (pending.snapshot.creditAccount.version !== input.expectedCreditAccountVersion) {
            throw new Error("Credit Account changed before the Invitation decision was persisted.");
          }
          assertSameRefAndVersion(
            pending.snapshot.slotCreditReservation,
            input.previousCreditReservation,
            "Slot Credit Reservation",
          );
          if (
            pending.snapshot.creditHold.creditHoldRef !== input.previousCreditHold.creditHoldRef ||
            pending.snapshot.creditHold.status !== input.previousCreditHold.status
          ) {
            throw new Error("Credit Hold changed before the Invitation decision was persisted.");
          }
          assertSameRefAndVersion(
            pending.snapshot.activityLease,
            input.previousActivityLease,
            "Candidate Activity Lease",
          );
          if (
            input.answerSession !== null &&
            pending.answerSessions.some(
              ({ invitationRef }) => invitationRef === input.answerSession?.invitationRef,
            )
          ) {
            throw new Error("The Invitation already owns an Answer Session.");
          }

          pending.snapshot = {
            ...pending.snapshot,
            review: structuredClone(input.nextReview),
            creditAccount: structuredClone(input.nextCreditAccount),
            slotCreditReservation: structuredClone(input.nextCreditReservation),
            creditHold: structuredClone(input.nextCreditHold),
            activityLease: structuredClone(input.nextActivityLease),
          };
          if (input.answerSession !== null) {
            pending.answerSessions.push(structuredClone(input.answerSession));
          }
          if (
            input.previousCreditHold.status === "HELD" &&
            input.nextCreditHold.status === "RETURNED"
          ) {
            pending.returnedCreditLedger.push({
              creditHoldRef: input.nextCreditHold.creditHoldRef,
              amount: input.nextCreditHold.amount,
              entryType: "RETURN",
              occurredAt: input.nextCreditHold.settledAt ?? input.decidedAt.toISOString(),
            });
          }
          pending.events.push(structuredClone(input.event));
          pending.outbox.push(...structuredClone(input.outbox));
          if (failurePoint === "DECISION_OUTBOX") {
            throw new Error("Injected Answer Invitation Outbox failure.");
          }
          pending.employerProjection = structuredClone(input.employerProjection);
          pending.candidateProjection = structuredClone(input.candidateProjection);
          if (
            input.actorRef !== null &&
            input.idempotencyKey !== null &&
            input.commandFingerprint !== null &&
            input.receipt !== null
          ) {
            pending.receipts.set(receiptKey(input.actorRef, input.idempotencyKey), {
              actorRef: input.actorRef,
              idempotencyKey: input.idempotencyKey,
              commandFingerprint: input.commandFingerprint,
              receipt: structuredClone(input.receipt),
            });
          }
        },
      };

      const result = await work(transaction);
      this.#state = pending;
      return result;
    } finally {
      release?.();
    }
  }
}
