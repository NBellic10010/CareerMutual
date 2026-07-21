import { describe, expect, it } from "vitest";

import { commandResponseError, formatCommandSchemaIssues } from "./employer-job-post-command";

describe("Employer JobPost command diagnostics", () => {
  it("turns a media Part schema issue into an actionable field label", () => {
    expect(
      formatCommandSchemaIssues([
        {
          path: ["draft", "critical_challenge", "parts", 1, "instructions"],
          message: "Too small: expected string to have >=10 characters",
        },
      ]),
    ).toBe(
      "Critical Challenge Part 2 Candidate instructions: Too small: expected string to have >=10 characters",
    );
  });

  it("preserves the closed error code when no bounded issues are returned", () => {
    expect(commandResponseError({ error: { code: "CREDIT_EXHAUSTED" } })).toBe("CREDIT_EXHAUSTED");
  });

  it("prefers a server schema issue over the generic command code", () => {
    expect(
      commandResponseError({
        error: {
          code: "COMMAND_SCHEMA_INVALID",
          issues: [{ path: ["draft", "title"], message: "Title is too short." }],
        },
      }),
    ).toBe("Public role title: Title is too short.");
  });
});
