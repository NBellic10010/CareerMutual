import { z } from "zod";

const RuntimeModeSchema = z.enum(["LIVE", "CACHED_AI", "GOLDEN_REPLAY"]);
const SandboxAdapterSchema = z.enum(["docker", "replay"]);

export type WorkerConfig =
  | {
      readonly runtimeMode: "GOLDEN_REPLAY";
      readonly databaseUrl: string;
      readonly sandboxAdapter: "replay";
      readonly replayId: string;
    }
  | {
      readonly runtimeMode: "CACHED_AI";
      readonly databaseUrl: string;
      readonly sandboxAdapter: "docker";
      readonly aiFixtureId: string;
    }
  | {
      readonly runtimeMode: "LIVE";
      readonly databaseUrl: string;
      readonly sandboxAdapter: "docker";
      readonly openAiApiKey: string;
    };

export class WorkerConfigurationError extends Error {
  override readonly name = "WorkerConfigurationError";
  readonly code = "WORKER_CONFIGURATION_INVALID";

  constructor(
    readonly invalidFields: readonly string[],
    message: string,
  ) {
    super(message);
  }
}

function requireValue(value: string | undefined, field: string, invalidFields: string[]): string {
  if (value === undefined || value.trim().length === 0) {
    invalidFields.push(field);
    return "";
  }
  return value;
}

export function loadWorkerConfig(
  environment: Readonly<Record<string, string | undefined>>,
): WorkerConfig {
  const invalidFields: string[] = [];
  const runtimeModeResult = RuntimeModeSchema.safeParse(environment.RUNTIME_MODE);
  const sandboxAdapterResult = SandboxAdapterSchema.safeParse(environment.SANDBOX_ADAPTER);
  const databaseUrl = requireValue(environment.DATABASE_URL, "DATABASE_URL", invalidFields);

  if (!runtimeModeResult.success) {
    invalidFields.push("RUNTIME_MODE");
  }
  if (!sandboxAdapterResult.success) {
    invalidFields.push("SANDBOX_ADAPTER");
  }
  if (
    databaseUrl.length > 0 &&
    !databaseUrl.startsWith("postgresql://") &&
    !databaseUrl.startsWith("postgres://")
  ) {
    invalidFields.push("DATABASE_URL");
  }
  if (!runtimeModeResult.success || !sandboxAdapterResult.success || invalidFields.length > 0) {
    throw new WorkerConfigurationError(
      [...new Set(invalidFields)],
      `Worker configuration is missing or invalid: ${[...new Set(invalidFields)].join(", ")}.`,
    );
  }

  const runtimeMode = runtimeModeResult.data;
  const sandboxAdapter = sandboxAdapterResult.data;

  if (runtimeMode === "GOLDEN_REPLAY") {
    const replayId = requireValue(environment.REPLAY_ID, "REPLAY_ID", invalidFields);
    if (sandboxAdapter !== "replay") {
      invalidFields.push("SANDBOX_ADAPTER");
    }
    if (invalidFields.length > 0) {
      throw new WorkerConfigurationError(
        [...new Set(invalidFields)],
        "GOLDEN_REPLAY requires REPLAY_ID and SANDBOX_ADAPTER=replay.",
      );
    }
    return { runtimeMode, databaseUrl, sandboxAdapter: "replay", replayId };
  }

  if (runtimeMode === "CACHED_AI") {
    const aiFixtureId = requireValue(environment.AI_FIXTURE_ID, "AI_FIXTURE_ID", invalidFields);
    if (sandboxAdapter !== "docker") {
      invalidFields.push("SANDBOX_ADAPTER");
    }
    if (invalidFields.length > 0) {
      throw new WorkerConfigurationError(
        [...new Set(invalidFields)],
        "CACHED_AI requires AI_FIXTURE_ID and SANDBOX_ADAPTER=docker.",
      );
    }
    return { runtimeMode, databaseUrl, sandboxAdapter: "docker", aiFixtureId };
  }

  const openAiApiKey = requireValue(environment.OPENAI_API_KEY, "OPENAI_API_KEY", invalidFields);
  if (sandboxAdapter !== "docker") {
    invalidFields.push("SANDBOX_ADAPTER");
  }
  if (invalidFields.length > 0) {
    throw new WorkerConfigurationError(
      [...new Set(invalidFields)],
      "LIVE requires OPENAI_API_KEY and SANDBOX_ADAPTER=docker.",
    );
  }
  return { runtimeMode, databaseUrl, sandboxAdapter: "docker", openAiApiKey };
}
