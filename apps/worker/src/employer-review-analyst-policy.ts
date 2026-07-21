import { z } from "zod";

const EmployerReviewAiEnabledSchema = z.enum(["true", "false"]);
const EmployerReviewAiModeSchema = z.enum(["LIVE", "SYNTHETIC"]);
const EmployerReviewAiModelSchema = z.enum(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);

export interface EmployerReviewAnalystRuntimePolicy {
  readonly enabled: boolean;
  readonly mode: "LIVE" | "SYNTHETIC";
  readonly model: "gpt-5.6-sol" | "gpt-5.6-terra" | "gpt-5.6-luna";
}

export class EmployerReviewAnalystPolicyError extends Error {
  override readonly name = "EmployerReviewAnalystPolicyError";
  readonly code = "EMPLOYER_REVIEW_ANALYST_POLICY_INVALID";

  public constructor(readonly field: string) {
    super(`Employer review analyst configuration is invalid: ${field}.`);
  }
}

export function loadEmployerReviewAnalystRuntimePolicy(
  environment: Readonly<Record<string, string | undefined>>,
): EmployerReviewAnalystRuntimePolicy {
  const enabled = EmployerReviewAiEnabledSchema.safeParse(
    environment.EMPLOYER_REVIEW_AI_ENABLED ?? "false",
  );
  if (!enabled.success) throw new EmployerReviewAnalystPolicyError("EMPLOYER_REVIEW_AI_ENABLED");

  const mode = EmployerReviewAiModeSchema.safeParse(environment.EMPLOYER_REVIEW_AI_MODE ?? "LIVE");
  if (!mode.success) throw new EmployerReviewAnalystPolicyError("EMPLOYER_REVIEW_AI_MODE");

  const model = EmployerReviewAiModelSchema.safeParse(
    environment.EMPLOYER_REVIEW_AI_MODEL ?? "gpt-5.6-sol",
  );
  if (!model.success) throw new EmployerReviewAnalystPolicyError("EMPLOYER_REVIEW_AI_MODEL");

  return { enabled: enabled.data === "true", mode: mode.data, model: model.data };
}
