import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../packages/db/migrations/0004_blind_review_runtime_pins.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../../packages/db/migrations/0004_blind_review_runtime_pins.down.sql", import.meta.url),
  "utf8",
);
const migrationRunner = readFileSync(
  new URL("../../packages/db/src/migrate.ts", import.meta.url),
  "utf8",
);

describe("Blind Review runtime-pin migration contract", () => {
  it("registers post-0003 additions as an immutable additive 0004", () => {
    expect(migrationRunner).toContain('version: "0004_blind_review_runtime_pins"');
    expect(migration).toContain("CREATE TABLE answer_review_slot_credit_reservations");
    expect(rollback).toContain("DROP TABLE IF EXISTS answer_review_slot_credit_reservations");
    expect(migration).toContain("question_version_ref");
    expect(migration).toContain("question_hash");
  });

  it("allows historical returned Holds while preventing two concurrent HELD Holds", () => {
    expect(migration).toContain("one_answer_review_hold_per_reservation");
    expect(migration).toContain("WHERE purpose = 'ANSWER_REVIEW' AND status = 'HELD'");
  });

  it("allows a Cohort Seat to be reused only after the current Invitation is terminal", () => {
    expect(migration).toContain("DROP CONSTRAINT answer_invitations_cohort_seat_ref_key");
    expect(migration).toContain("one_active_invitation_per_cohort_seat");
    expect(migration).toContain("WHERE status IN ('OFFERED', 'ACCEPTED')");
    expect(rollback).toContain(
      "cannot roll back 0004 after an Advancement Cohort Seat has been reused",
    );
  });
});
