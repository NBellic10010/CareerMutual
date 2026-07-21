export type LogLevel = "info" | "error";

export interface StructuredLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service: "worker";
  readonly runtime_mode: string;
  readonly trace_id: string;
  readonly correlation_id: string;
  readonly command_or_job: string;
  readonly actor_role: "SYSTEM";
  readonly outcome: string;
  readonly error_code?: string;
  readonly fixture_ref?: string;
  readonly verification_ref?: string;
  readonly synthetic: boolean;
}

export function writeStructuredLog(entry: StructuredLogEntry): void {
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}
