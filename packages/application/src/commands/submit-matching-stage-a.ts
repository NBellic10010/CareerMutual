import { MatchingStageAReceiptSchema, type MatchingStageAReceipt } from "@onlyboth/contracts";
import { abortForPlatformFailure, submitStageA } from "@onlyboth/domain";

import type {
  ClaimedStageAReplayMessage,
  MatchingStageAIdFactory,
  MatchingStageAUnitOfWork,
  StageAReplayResult,
  SubmitMatchingStageACommandPort,
} from "../ports/matching-stage-a";

export class SubmitMatchingStageAHandler implements SubmitMatchingStageACommandPort {
  public constructor(
    private readonly unitOfWork: MatchingStageAUnitOfWork,
    private readonly ids: MatchingStageAIdFactory,
  ) {}

  public async submit(
    message: ClaimedStageAReplayMessage,
    result: StageAReplayResult,
  ): Promise<MatchingStageAReceipt> {
    return this.unitOfWork.runInTransaction(async (transaction) => {
      const window = await transaction.loadWindowForUpdate(message.reviewWindowRef);
      if (window === null) throw new Error("Accepted Review Window no longer exists.");
      const transition = submitStageA(window, result.snapshotRef);
      const receipt = MatchingStageAReceiptSchema.parse({
        schema_version: "matching-stage-a-receipt@1",
        review_window_ref: window.id,
        snapshot_ref: result.snapshotRef,
        snapshot_hash: result.snapshotHash,
        new_version: transition.window.version,
        state: "CHECKPOINT_PENDING",
      });
      await transaction.persistSubmission({
        message,
        previousWindow: window,
        nextWindow: transition.window,
        result,
        eventId: this.ids.nextId("event"),
        outboxId: this.ids.nextId("outbox"),
        receipt,
      });
      return receipt;
    });
  }

  public async abort(message: ClaimedStageAReplayMessage, reasonRef: string): Promise<void> {
    await this.unitOfWork.runInTransaction(async (transaction) => {
      const window = await transaction.loadWindowForUpdate(message.reviewWindowRef);
      if (window === null || window.state === "PLATFORM_ABORT") return;
      const transition = abortForPlatformFailure(window, {
        component: "StageASandbox",
        reasonRef,
      });
      await transaction.persistPlatformAbort({
        message,
        previousWindow: window,
        nextWindow: transition.window,
        reasonRef,
        eventId: this.ids.nextId("event"),
        outboxId: this.ids.nextId("outbox"),
      });
    });
  }
}
