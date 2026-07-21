import type {
  ChallengeSelectionTransaction,
  ChallengeSelectionUnitOfWork,
  DomainEventAppend,
  OutboxEnqueue,
  StoredChallengeRecommendationOutput,
  StoredCommandReceipt,
} from "@onlyboth/application";
import type { ReviewWindow } from "@onlyboth/domain";

interface ChallengeSelectionState {
  window: ReviewWindow;
  evidenceRefs: readonly string[];
  outputs: Map<string, StoredChallengeRecommendationOutput>;
  receipts: Map<string, StoredCommandReceipt>;
  events: DomainEventAppend[];
  outbox: OutboxEnqueue[];
}

function cloneState(state: ChallengeSelectionState): ChallengeSelectionState {
  return {
    window: structuredClone(state.window),
    evidenceRefs: structuredClone(state.evidenceRefs),
    outputs: new Map([...state.outputs].map(([key, value]) => [key, structuredClone(value)])),
    receipts: new Map([...state.receipts].map(([key, value]) => [key, structuredClone(value)])),
    events: structuredClone(state.events),
    outbox: structuredClone(state.outbox),
  };
}

export class InMemoryChallengeSelectionUnitOfWork implements ChallengeSelectionUnitOfWork {
  #state: ChallengeSelectionState;

  public constructor(
    window: ReviewWindow,
    evidenceRefs: readonly string[],
    outputs: readonly StoredChallengeRecommendationOutput[] = [],
    private readonly now = new Date("2026-07-19T12:00:00.000Z"),
    private readonly failAt: "save" | "event" | "outbox" | null = null,
  ) {
    this.#state = {
      window: structuredClone(window),
      evidenceRefs: structuredClone(evidenceRefs),
      outputs: new Map(outputs.map((output) => [output.outputRef, structuredClone(output)])),
      receipts: new Map(),
      events: [],
      outbox: [],
    };
  }

  public snapshot(): Readonly<ChallengeSelectionState> {
    return cloneState(this.#state);
  }

  public async runInTransaction<TResult>(
    work: (transaction: ChallengeSelectionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const pending = cloneState(this.#state);
    const failAt = this.failAt;
    const receiptKey = (actorId: string, idempotencyKey: string) => `${actorId}:${idempotencyKey}`;
    const transaction: ChallengeSelectionTransaction = {
      databaseNow: new Date(this.now),
      async loadReviewWindow(reviewWindowId) {
        return pending.window.id === reviewWindowId ? structuredClone(pending.window) : undefined;
      },
      async saveReviewWindow(window, expectedVersion) {
        if (pending.window.version !== expectedVersion) {
          throw new Error("Optimistic concurrency conflict.");
        }
        if (failAt === "save") {
          throw new Error("Injected save failure.");
        }
        pending.window = structuredClone(window);
      },
      async listStageAEvidenceRefs(reviewWindowId) {
        return pending.window.id === reviewWindowId ? structuredClone(pending.evidenceRefs) : [];
      },
      async loadRecommendationOutput(outputRef) {
        const output = pending.outputs.get(outputRef);
        return output === undefined ? null : structuredClone(output);
      },
      async consumeRecommendationOutput(outputRef, commandId) {
        const output = pending.outputs.get(outputRef);
        if (output === undefined || output.consumedByCommandId !== null) {
          throw new Error("Recommendation output cannot be consumed.");
        }
        pending.outputs.set(outputRef, { ...output, consumedByCommandId: commandId });
      },
      async findCommandReceipt(actorId, idempotencyKey) {
        const receipt = pending.receipts.get(receiptKey(actorId, idempotencyKey));
        return receipt === undefined ? null : structuredClone(receipt);
      },
      async saveCommandReceipt(receipt) {
        pending.receipts.set(
          receiptKey(receipt.actorId, receipt.idempotencyKey),
          structuredClone(receipt),
        );
      },
      async appendDomainEvent(event) {
        if (failAt === "event") {
          throw new Error("Injected event failure.");
        }
        pending.events.push(structuredClone(event));
      },
      async enqueueOutbox(message) {
        if (failAt === "outbox") {
          throw new Error("Injected outbox failure.");
        }
        pending.outbox.push(structuredClone(message));
      },
      async completeClaimedWorkerMessage() {},
    };

    const result = await work(transaction);
    this.#state = pending;
    return result;
  }
}
