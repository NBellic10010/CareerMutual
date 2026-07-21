import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const migration = readRepositoryFile("../../packages/db/migrations/0003_blind_answer_first.sql");
const rollback = readRepositoryFile(
  "../../packages/db/migrations/0003_blind_answer_first.down.sql",
);
const migrationRunner = readRepositoryFile("../../packages/db/src/migrate.ts");

const REQUIRED_TABLES = [
  "blind_review_commitments",
  "answer_review_slots",
  "answer_review_obligations",
  "answer_invitations",
  "answer_sessions",
  "answer_submissions",
  "answer_evidence_edges",
  "human_answer_reviews",
  "advancement_cohorts",
  "advancement_cohort_seats",
  "advancement_allocations",
  "candidate_activity_leases",
  "public_opportunity_projections",
  "employer_blind_review_projections",
  "candidate_answer_projections",
  "blind_review_command_receipts",
  "opportunity_closure_receipts",
] as const;

function expectCreateAndDrop(table: string): void {
  expect(migration, `${table} must be created by the additive migration`).toMatch(
    new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ${table}\\b`, "u"),
  );
  expect(rollback, `${table} must be removed by the explicit down migration`).toContain(
    `DROP TABLE IF EXISTS ${table}`,
  );
}

describe("blind-answer-first PostgreSQL migration contract", () => {
  it("registers one additive 0003 up/down migration without rewriting 0001 or 0002", () => {
    expect(migration).not.toBe("");
    expect(rollback).not.toBe("");
    expect(migrationRunner).toContain('version: "0003_blind_answer_first"');
    expect(migrationRunner).toContain(
      'new URL("../migrations/0003_blind_answer_first.sql", import.meta.url)',
    );
    expect(migrationRunner).toContain('"../migrations/0003_blind_answer_first.down.sql"');
  });

  it("creates and can roll back every target blind-answer persistence boundary", () => {
    for (const table of REQUIRED_TABLES) expectCreateAndDrop(table);
  });

  it("extends legacy tables for lightweight Interests and answer-backed subjects", () => {
    expect(migration).toMatch(/ALTER TABLE candidate_interests\b/u);
    for (const column of [
      "eligible_at",
      "interest_created_at",
      "closure_receipt_ref",
      "consent_version",
      "hard_facts_json",
      "version",
    ]) {
      expect(migration, `candidate_interests.${column} must be migrated`).toContain(column);
    }
    expect(migration).toMatch(/ALTER TABLE attention_commitments\b/u);
    expect(migration).toContain("answer_review_wip");
    expect(migration).toContain("queue_policy_version");
    expect(migration).toContain("credit_per_answer_review");
    expect(migration).toMatch(/ALTER TABLE credit_holds\b/u);
    expect(migration).toContain("ANSWER_REVIEW");
    expect(migration).toContain("DEEP_PROOF");
    expect(migration).toContain("subject_ref");
  });

  it("enforces reusable Slot, immutable Cohort, Credit Hold, and Q_i invariants in SQL", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*answer_review_obligations[\s\S]*WHERE[\s\S]*(?:SETTLED|RELEASED)/u,
    );
    expect(migration).toMatch(/UNIQUE\s*\(\s*commitment_ref\s*,\s*ordinal\s*\)/u);
    expect(migration).toMatch(/UNIQUE\s*\(\s*cohort_ref\s*,\s*ordinal\s*\)/u);
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*candidate_activity_leases[\s\S]*candidate_ref[\s\S]*WHERE/u,
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*credit_holds[\s\S]*(?:subject_ref|answer_review_obligation_ref)[\s\S]*WHERE/u,
    );
    expect(migration).toContain("onlyboth.interest-queue@1");
    expect(migration).toContain("WAITING_FOR_BACKED_SLOT");
    expect(migration).toContain("BACKED_OFFERED");
  });

  it("keeps role projections physically separate and uses pure SQL", () => {
    expect(migration).toContain("public_opportunity_projections");
    expect(migration).toContain("employer_blind_review_projections");
    expect(migration).toContain("candidate_answer_projections");
    expect(migration).not.toMatch(/prisma|typeorm|sequelize|drizzle/iu);
  });
});
