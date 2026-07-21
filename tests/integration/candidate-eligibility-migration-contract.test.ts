import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../packages/db/migrations/0013_ai_backed_eligibility_match.sql", import.meta.url),
  "utf8",
);
const downMigration = readFileSync(
  new URL(
    "../../packages/db/migrations/0013_ai_backed_eligibility_match.down.sql",
    import.meta.url,
  ),
  "utf8",
);
const migrationRunner = readFileSync(
  new URL("../../packages/db/src/migrate.ts", import.meta.url),
  "utf8",
);

describe("AI-backed Candidate Eligibility migration contract", () => {
  it("registers migration 0013 and its rollback", () => {
    expect(migrationRunner).toContain('version: "0013_ai_backed_eligibility_match"');
    expect(migrationRunner).toContain("0013_ai_backed_eligibility_match.sql");
    expect(migrationRunner).toContain("0013_ai_backed_eligibility_match.down.sql");
    expect(migrationRunner).toContain('version: "0014_eligibility_policy_hash_scope"');
  });

  it("persists the sealed 100-tag catalog and immutable Candidate-only matches", () => {
    for (const table of [
      "eligibility_background_taxonomies",
      "eligibility_background_tags",
      "job_eligibility_match_policies",
      "candidate_eligibility_match_sets",
      "candidate_job_eligibility_matches",
      "candidate_eligibility_projections",
    ]) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
      expect(downMigration).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
    expect(migration).toContain("tag_count integer NOT NULL CHECK (tag_count = 100)");
    expect(migration).toContain("WITH ORDINALITY");
    expect(migration).toContain("candidate_job_eligibility_matches_immutable");
    expect(migration).toContain("deriveCandidateEligibilityMatches");
  });

  it("pins V2 Interest and deterministic hard Eligibility to an authorized background basis", () => {
    expect(migration).toContain("background_access_basis");
    expect(migration).toContain("eligibility_match_ref");
    expect(migration).toContain("passport_snapshot_ref");
    expect(migration).toContain("candidate-interest@2");
    expect(migration).not.toMatch(/ALTER TABLE employer_.*ADD.*passport/isu);
  });
});
