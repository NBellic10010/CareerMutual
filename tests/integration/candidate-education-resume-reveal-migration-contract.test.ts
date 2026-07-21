import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../packages/db/migrations/0012_candidate_education_and_review_reveal.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../../packages/db/migrations/0012_candidate_education_and_review_reveal.down.sql",
    import.meta.url,
  ),
  "utf8",
);
const runner = readFileSync(new URL("../../packages/db/src/migrate.ts", import.meta.url), "utf8");

describe("Candidate education and post-review Resume reveal migration", () => {
  it("registers migration 0012 and its rollback", () => {
    expect(runner).toContain('version: "0012_candidate_education_and_review_reveal"');
    expect(runner).toContain("0012_candidate_education_and_review_reveal.sql");
    expect(runner).toContain("0012_candidate_education_and_review_reveal.down.sql");
  });

  it("requires education and pins an immutable Resume snapshot at consent", () => {
    expect(migration).toContain("ALTER COLUMN education_json SET NOT NULL");
    expect(migration).toContain("CREATE TABLE candidate_resume_snapshots");
    expect(migration).toContain("ADD COLUMN resume_snapshot_ref");
    expect(migration).toContain("candidate_resume_snapshots_immutable");
    expect(rollback).toContain("DROP TABLE IF EXISTS candidate_resume_snapshots");
  });

  it("stores a reviewer-scoped immutable Reveal authorization for passed answers", () => {
    expect(migration).toContain("CREATE TABLE employer_resume_reveals");
    expect(migration).toContain("ADVANCE_ELIGIBLE_HUMAN_REVIEW");
    expect(migration).toContain("employer_resume_reveals_reviewer_page_idx");
    expect(migration).toContain("employer_resume_reveals_immutable");
    expect(rollback).toContain("DROP TABLE IF EXISTS employer_resume_reveals");
  });
});
