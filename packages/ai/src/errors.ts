import type { HiringIntelligenceOperation } from "./prompt-registry";

export type HiringIntelligenceErrorCode =
  | "AI_REFUSED"
  | "AI_INCOMPLETE"
  | "AI_SCHEMA_MISMATCH"
  | "AI_SOURCE_REF_INVALID"
  | "AI_CATALOG_INVALID"
  | "AI_OUTPUT_POLICY_VIOLATION"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_CONFIGURATION_FAILURE"
  | "AI_ADAPTER_NOT_CONFIGURED"
  | "AI_GOLDEN_REPLAY_MISS"
  | "AI_OPERATION_NOT_IMPLEMENTED";

export class HiringIntelligenceError extends Error {
  public override readonly name = "HiringIntelligenceError";

  public constructor(
    public readonly code: HiringIntelligenceErrorCode,
    public readonly operation: HiringIntelligenceOperation,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}
