import { loadWorkerConfig, WorkerConfigurationError } from "./config.js";
import { parseWorkerCommand, WorkerCommandError } from "./worker-command.js";
import { executeWorkerCommand } from "./worker-runtime.js";
import { writeStructuredLog } from "./structured-logger.js";

const BOOT_TRACE_ID = "worker-bootstrap";

async function main(): Promise<void> {
  try {
    const config = loadWorkerConfig(process.env);
    const command = parseWorkerCommand(process.argv.slice(2));
    process.exitCode = await executeWorkerCommand(config, command, {
      now: () => new Date(),
      emit: writeStructuredLog,
      environment: process.env,
    });
  } catch (error: unknown) {
    const knownError =
      error instanceof WorkerConfigurationError || error instanceof WorkerCommandError
        ? error
        : null;
    writeStructuredLog({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "worker",
      runtime_mode: process.env.RUNTIME_MODE ?? "UNCONFIGURED",
      trace_id: BOOT_TRACE_ID,
      correlation_id: BOOT_TRACE_ID,
      command_or_job: "bootstrap",
      actor_role: "SYSTEM",
      outcome: "refused_to_start",
      error_code: knownError?.code ?? "WORKER_BOOTSTRAP_FAILED",
      synthetic: process.env.RUNTIME_MODE === "GOLDEN_REPLAY",
    });
    process.exitCode = 1;
  }
}

void main();
