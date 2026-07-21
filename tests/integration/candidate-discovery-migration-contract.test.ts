import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../packages/db/migrations/0008_candidate_evidence_passport.sql", import.meta.url),
  "utf8",
);
const downMigration = readFileSync(
  new URL(
    "../../packages/db/migrations/0008_candidate_evidence_passport.down.sql",
    import.meta.url,
  ),
  "utf8",
);
const migrationRunner = readFileSync(
  new URL("../../packages/db/src/migrate.ts", import.meta.url),
  "utf8",
);

describe("Candidate Evidence Passport migration contract", () => {
  it("registers the additive 0008 migration and its rollback", () => {
    expect(migrationRunner).toContain('version: "0008_candidate_evidence_passport"');
    expect(migrationRunner).toContain("0008_candidate_evidence_passport.sql");
    expect(migrationRunner).toContain("0008_candidate_evidence_passport.down.sql");
  });

  it("physically separates mutable Drafts, immutable Snapshots, Signals, and Candidate projections", () => {
    for (const table of [
      "candidate_evidence_passport_drafts",
      "candidate_evidence_passport_snapshots",
      "candidate_discovery_signal_sets",
      "candidate_job_discovery_signals",
      "candidate_discovery_projections",
    ]) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
      expect(downMigration).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
    expect(migration).toContain("candidate_evidence_passport_snapshots_immutable");
    expect(migration).toContain("candidate_job_discovery_signals_immutable");
    expect(migration).toContain("candidate_passport_snapshot_ref");
    expect(migration).toContain("deriveCandidateJobSignals");
  });

  it("does not connect Candidate discovery to Employer projections or queue allocation tables", () => {
    expect(migration).not.toMatch(/employer_.*projection/iu);
    expect(migration).not.toMatch(/ALTER TABLE candidate_interests/iu);
    expect(migration).not.toMatch(/ALTER TABLE answer_invitations/iu);
    expect(migration).not.toMatch(/ALTER TABLE eligibility_edges/iu);
  });
});
