import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../packages/db/migrations/0005_candidate_interest_and_answer_invitation_decisions.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../../packages/db/migrations/0005_candidate_interest_and_answer_invitation_decisions.down.sql",
    import.meta.url,
  ),
  "utf8",
);
const runner = readFileSync(new URL("../../packages/db/src/migrate.ts", import.meta.url), "utf8");

describe("Candidate Interest and Answer Invitation decision migration", () => {
  it("registers an additive 0005 without rewriting prior migrations", () => {
    expect(runner).toContain('version: "0005_candidate_interest_and_answer_invitation_decisions"');
    expect(migration).toContain("required_interest_consent_version");
    expect(migration).toContain("ADD COLUMN contract_version_ref");
    expect(rollback).toContain("DROP COLUMN contract_version_ref");
  });

  it("pins target Interests to a sealed Contract and fails closed on incomplete backfill", () => {
    expect(migration).toContain("interest_schema_version = 'candidate-interest@1'");
    expect(migration).toContain("AND contract_version_ref IS NOT NULL");
    expect(migration).toContain(
      "cannot apply 0005 while a target Candidate Interest lacks its sealed Contract pin",
    );
  });

  it("provides a partial database-time expiry scan index", () => {
    expect(migration).toContain("answer_invitations_expiry_scan_idx");
    expect(migration).toContain("ON answer_invitations (offer_expires_at, invitation_ref)");
    expect(migration).toContain("WHERE status = 'OFFERED'");
    expect(rollback).toContain("DROP INDEX IF EXISTS answer_invitations_expiry_scan_idx");
  });
});
