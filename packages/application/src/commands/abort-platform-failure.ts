import { abortForPlatformFailure } from "@onlyboth/domain";

import type {
  ApplicationIdFactory,
  ChallengeSelectionUnitOfWork,
} from "../ports/challenge-selection";
import type {
  ClaimedChallengeWorkerMessage,
  PlatformAbortCommandPort,
} from "../workflows/challenge-recommendation-worker";

export class AbortPlatformFailureHandler implements PlatformAbortCommandPort {
  public constructor(
    private readonly unitOfWork: ChallengeSelectionUnitOfWork,
    private readonly ids: ApplicationIdFactory,
  ) {}

  public async abortAfterSandboxFailure(input: {
    readonly message: ClaimedChallengeWorkerMessage;
    readonly reviewWindowId: string;
    readonly reasonRef: string;
  }): Promise<void> {
    await this.unitOfWork.runInTransaction(async (transaction) => {
      const window = await transaction.loadReviewWindow(input.reviewWindowId);
      if (window === undefined) {
        await transaction.completeClaimedWorkerMessage(
          input.message.messageId,
          input.message.leaseOwner,
          input.message.attempt,
        );
        return;
      }
      if (window.state === "PLATFORM_ABORT") {
        await transaction.completeClaimedWorkerMessage(
          input.message.messageId,
          input.message.leaseOwner,
          input.message.attempt,
        );
        return;
      }
      const transition = abortForPlatformFailure(window, {
        component: "StageBSandbox",
        reasonRef: input.reasonRef,
      });
      const event = transition.events[0];
      if (event?.type !== "PlatformAborted") {
        throw new Error("Platform Abort did not emit PlatformAborted.");
      }
      const eventId = this.ids.nextId("event");
      await transaction.saveReviewWindow(transition.window, window.version);
      await transaction.appendDomainEvent({
        eventId,
        eventType: event.type,
        eventVersion: 1,
        aggregateType: "ReviewWindow",
        aggregateId: window.id,
        aggregateVersion: transition.window.version,
        correlationId: input.message.correlationId,
        occurredAt: transaction.databaseNow,
        payload: event,
      });
      await transaction.enqueueOutbox({
        messageId: this.ids.nextId("outbox"),
        messageType: "PlatformAborted",
        messageVersion: 1,
        eventId,
        idempotencyKey: `PlatformAborted:${window.id}:${transition.window.version}`,
        correlationId: input.message.correlationId,
        availableAt: transaction.databaseNow,
        payload: { reviewWindowId: window.id },
      });
      await transaction.completeClaimedWorkerMessage(
        input.message.messageId,
        input.message.leaseOwner,
        input.message.attempt,
      );
    });
  }
}
