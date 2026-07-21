export type WorkerCommand =
  "run" | "smoke" | "once" | "migrate" | "demo-reset" | "demo-reset-matching" | "live-smoke";

export class WorkerCommandError extends Error {
  override readonly name = "WorkerCommandError";
  readonly code = "WORKER_COMMAND_INVALID";

  constructor() {
    super(
      "Worker accepts no arguments for continuous mode, or one of --smoke, --once, --migrate, --demo-reset, --demo-reset-matching, or --live-smoke.",
    );
  }
}

export function parseWorkerCommand(argumentsList: readonly string[]): WorkerCommand {
  if (argumentsList.length === 0) {
    return "run";
  }
  if (argumentsList.length === 1 && argumentsList[0] === "--smoke") {
    return "smoke";
  }
  if (argumentsList.length === 1 && argumentsList[0] === "--once") {
    return "once";
  }
  if (argumentsList.length === 1 && argumentsList[0] === "--migrate") {
    return "migrate";
  }
  if (argumentsList.length === 1 && argumentsList[0] === "--demo-reset") {
    return "demo-reset";
  }
  if (argumentsList.length === 1 && argumentsList[0] === "--demo-reset-matching") {
    return "demo-reset-matching";
  }
  if (argumentsList.length === 1 && argumentsList[0] === "--live-smoke") {
    return "live-smoke";
  }
  throw new WorkerCommandError();
}
