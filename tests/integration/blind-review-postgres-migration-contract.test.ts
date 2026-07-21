import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../packages/db/migrations/0003_blind_answer_first.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../../packages/db/migrations/0003_blind_answer_first.down.sql", import.meta.url),
  "utf8",
);
const migrationRunner = readFileSync(
  new URL("../../packages/db/src/migrate.ts", import.meta.url),
  "utf8",
);

const TARGET_TABLES = [
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

describe("Blind-answer-first PostgreSQL migration contract", () => {
  it("registers an additive migration and explicit rollback for every target table", () => {
    expect(migrationRunner).toContain('version: "0003_blind_answer_first"');
    for (const table of TARGET_TABLES) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE ${table}\\b`, "u"));
      expect(rollback).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
    expect(migration).not.toMatch(/prisma|typeorm|sequelize|drizzle/iu);
  });

  it("keeps legacy Interest rows while creating a claim-free target Interest shape", () => {
    expect(migration).toContain("ALTER COLUMN claim_snapshot_ref DROP NOT NULL");
    expect(migration).toContain("candidate-interest@legacy");
    expect(migration).toContain("candidate-interest@1");
    expect(migration).toContain("WAITING_FOR_BACKED_SLOT");
    expect(migration).toContain("candidate_interests_public_queue_idx");
    expect(migration).toContain("eligibility_edges_legacy_or_interest_check");
  });

  it("reserves durable rolling Credit and prevents duplicate active Slot or Candidate activity", () => {
    expect(migration).toContain("reserved_credits integer NOT NULL DEFAULT 0");
    expect(migration).toContain(
      "reserved_credit_amount = answer_review_wip * credit_per_answer_review",
    );
    expect(migration).toContain("one_unsettled_obligation_per_answer_slot");
    expect(migration).toContain("one_unsettled_obligation_per_interest");
    expect(migration).toContain("one_active_candidate_activity");
    expect(migration).toContain("WHERE status = 'ACTIVE'");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("pins Cohort membership and immutable evidence-bearing artifacts", () => {
    expect(migration).toContain("UNIQUE (commitment_ref, sequence)");
    expect(migration).toContain(
      "CHECK (reviewed_count <= submitted_count AND submitted_count <= target_size)",
    );
    expect(migration).toContain("protect_submitted_advancement_cohort_seat");
    expect(migration).toContain("answer_submissions_immutable");
    expect(migration).toContain("answer_evidence_edges_immutable");
    expect(migration).toContain("human_answer_reviews_immutable");
    expect(migration).toContain("domain_events_immutable");
  });
});
