import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../packages/db/migrations/0010_employer_ai_review_analyst.sql",
  import.meta.url,
);
const behaviorMigrationUrl = new URL(
  "../../packages/db/migrations/0011_answer_behavior_profile.sql",
  import.meta.url,
);

describe("Employer AI Review Analyst migration contract", () => {
  it("persists immutable process evidence, analysis state, and consulted output audit", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("CREATE TABLE answer_process_evidence");
    expect(sql).toContain("CREATE TABLE employer_answer_review_projections");
    expect(sql).toContain("consulted_ai_output_ref");
    expect(sql).toContain("answer_process_evidence_immutable");
    expect(sql).toContain("ANSWER_PLUS_PROCESS");
    expect(sql).toContain("SUPERSEDED");
    expect(sql).not.toContain("keystroke_events");
  });

  it("adds AnswerProcessEvidence@2 without reclassifying immutable @1 rows", async () => {
    const sql = await readFile(behaviorMigrationUrl, "utf8");
    expect(sql).toContain("answer-process-evidence@1");
    expect(sql).toContain("answer-process-evidence@2");
    expect(sql).toContain("DROP CONSTRAINT answer_submissions_process_evidence_shape");
    expect(sql).not.toContain("UPDATE answer_process_evidence");
  });
});
