import type {
  ClaimedOfferNextQueuedInterestMessage,
  InterestQueueWorkerStore,
  OfferNextQueuedInterestReceipt,
} from "../ports/blind-review";

export interface OfferNextQueuedInterestCommandPort {
  execute(message: ClaimedOfferNextQueuedInterestMessage): Promise<OfferNextQueuedInterestReceipt>;
}

function failureMetadata(error: unknown): { readonly code: string; readonly retryable: boolean } {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return {
      code: error.code,
      retryable: !("retryable" in error) || error.retryable !== false,
    };
  }
  return { code: "INTEREST_QUEUE_PLATFORM_FAILURE", retryable: true };
}

export class InterestQueueWorker {
  public constructor(
    private readonly store: InterestQueueWorkerStore,
    private readonly command: OfferNextQueuedInterestCommandPort,
    private readonly maximumAttempts = 3,
  ) {}

  public async runOnce(workerId: string): Promise<"IDLE" | "PROCESSED" | "RETRY_SCHEDULED"> {
    const reconciled = await this.store.reconcileEligibilityNotification();
    const scheduled = await this.store.scheduleNextAvailableSlot();
    const message = await this.store.claimNext(workerId, 30);
    if (message === null) return reconciled || scheduled ? "PROCESSED" : "IDLE";
    try {
      await this.command.execute(message);
      return "PROCESSED";
    } catch (error: unknown) {
      const failure = failureMetadata(error);
      if (failure.retryable && message.attempt < this.maximumAttempts) {
        await this.store.scheduleRetry(message, failure.code, message.attempt);
        return "RETRY_SCHEDULED";
      }
      await this.store.markFailed(message, failure.code);
      return "PROCESSED";
    }
  }
}
