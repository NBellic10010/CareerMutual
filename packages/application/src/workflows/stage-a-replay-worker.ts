import type {
  StageAReplayExecutionPort,
  StageAReplayMessageStore,
  SubmitMatchingStageACommandPort,
} from "../ports/matching-stage-a";

export class StageAReplayWorker {
  public constructor(
    private readonly store: StageAReplayMessageStore,
    private readonly replay: StageAReplayExecutionPort,
    private readonly command: SubmitMatchingStageACommandPort,
    private readonly maxAttempts = 3,
  ) {}

  public async runOnce(workerId: string): Promise<"IDLE" | "PROCESSED" | "RETRY_SCHEDULED"> {
    const message = await this.store.claimNext(workerId, 30);
    if (message === null) return "IDLE";
    const context = await this.store.loadContext(message.reviewWindowRef);
    if (context === null) {
      await this.command.abort(message, "STAGE_A_CONTEXT_MISSING");
      return "PROCESSED";
    }
    try {
      await this.command.submit(message, await this.replay.execute(context));
      return "PROCESSED";
    } catch (error: unknown) {
      const errorCode =
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "STAGE_A_REPLAY_FAILED";
      if (message.attempt < this.maxAttempts) {
        await this.store.scheduleRetry(message, errorCode, message.attempt);
        return "RETRY_SCHEDULED";
      }
      await this.command.abort(message, errorCode);
      return "PROCESSED";
    }
  }
}
