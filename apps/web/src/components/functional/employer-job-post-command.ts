import {
  CreateJobPostDraftCommandSchema,
  type CreateJobPostDraftCommand,
} from "@onlyboth/contracts";

type SchemaIssueLike = Readonly<{
  path?: readonly PropertyKey[];
  message?: unknown;
}>;

function displayPath(path: readonly PropertyKey[]): string {
  const partsIndex = path.findIndex((segment) => segment === "parts");
  const partNumber = partsIndex === -1 ? undefined : path[partsIndex + 1];
  const leaf = path.at(-1);
  if (typeof partNumber === "number") {
    if (leaf === "title") return `Critical Challenge Part ${partNumber + 1} title`;
    if (leaf === "instructions") {
      return `Critical Challenge Part ${partNumber + 1} Candidate instructions`;
    }
    if (leaf === "asset") return `Critical Challenge Part ${partNumber + 1} uploaded source`;
    if (leaf === "text_content") return `Critical Challenge Part ${partNumber + 1} text`;
  }

  const normalized = path.map(String).join(".");
  if (normalized === "draft.title") return "Public role title";
  if (
    normalized === "draft.critical_question" ||
    normalized === "draft.critical_challenge.objective"
  ) {
    return "Critical Challenge objective";
  }
  if (normalized.includes("eligibility_match_policy.accepted_tags")) {
    return "Candidate-side background access tags";
  }
  if (normalized.includes("review_criteria") && leaf === "statement") {
    return "Sealed review criterion";
  }
  if (normalized === "draft.answer_review_wip") return "Reusable concurrent review Slots";
  return normalized.length > 0 ? normalized : "JobPost command";
}

export function formatCommandSchemaIssues(
  issues: readonly SchemaIssueLike[],
  fallback = "COMMAND_SCHEMA_INVALID",
): string {
  const first = issues[0];
  if (first === undefined) return fallback;
  const message = typeof first.message === "string" ? first.message : "Value is invalid.";
  return `${displayPath(first.path ?? [])}: ${message}`;
}

export function parseCreateJobPostDraftCommand(input: unknown): CreateJobPostDraftCommand {
  const result = CreateJobPostDraftCommandSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatCommandSchemaIssues(result.error.issues));
  }
  return result.data;
}

export function commandResponseError(result: unknown): string {
  if (typeof result !== "object" || result === null || !("error" in result)) {
    return "COMMAND_FAILED";
  }
  const error = Reflect.get(result, "error");
  if (typeof error !== "object" || error === null) return "COMMAND_FAILED";
  const code = Reflect.get(error, "code");
  const issues = Reflect.get(error, "issues");
  if (Array.isArray(issues)) {
    return formatCommandSchemaIssues(issues, typeof code === "string" ? code : undefined);
  }
  return typeof code === "string" ? code : "COMMAND_FAILED";
}
