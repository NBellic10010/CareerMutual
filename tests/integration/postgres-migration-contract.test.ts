import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../packages/db/migrations/0001_challenge_recommendation_vertical.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../../packages/db/migrations/0001_challenge_recommendation_vertical.down.sql",
    import.meta.url,
  ),
  "utf8",
);
const storeSource = readFileSync(
  new URL("../../packages/db/src/postgres-challenge-store.ts", import.meta.url),
  "utf8",
);
const workerStoreSource = readFileSync(
  new URL("../../packages/db/src/postgres-challenge-worker-store.ts", import.meta.url),
  "utf8",
);

const REQUIRED_TABLES = [
  "review_windows",
  "proof_sessions",
  "stage_a_evidence",
  "hiring_intelligence_requests",
  "ai_model_runs",
  "ai_source_refs",
  "ai_outputs",
  "domain_events",
  "outbox_messages",
  "inbox_messages",
  "employer_review_window_projections",
  "candidate_review_window_projections",
] as const;

describe("PostgreSQL vertical-slice migration contract", () => {
  it("creates every required table with physically separate role projections", () => {
    for (const table of REQUIRED_TABLES) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "u"));
      expect(rollback).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
    expect(migration).not.toContain("candidate_private_labels");
  });

  it("enforces immutable AI outputs, event versions, outbox idempotency, and leases", () => {
    expect(migration).toContain("CREATE TRIGGER ai_outputs_immutable");
    expect(migration).toContain("UNIQUE (aggregate_type, aggregate_id, aggregate_version)");
    expect(migration).toContain("idempotency_key text NOT NULL UNIQUE");
    expect(migration).toContain("lease_expires_at timestamptz");
    expect(workerStoreSource).toContain("FOR UPDATE SKIP LOCKED");
    expect(workerStoreSource).toContain("ON CONFLICT (consumer, message_id) DO NOTHING");
    expect(workerStoreSource).toContain("'FAILED_RETRYABLE'");
  });

  it("uses database time and aggregate compare-and-swap in the command transaction", () => {
    expect(storeSource).toContain("SELECT clock_timestamp() AS database_now");
    expect(storeSource).toContain("pg_advisory_xact_lock");
    expect(storeSource).toContain("WHERE id = $6 AND version = $7");
    expect(storeSource).toContain("INSERT INTO domain_events");
    expect(storeSource).toContain("INSERT INTO outbox_messages");
    expect(storeSource).toContain('client.query("ROLLBACK")');
  });

  it("uses pure SQL and no ORM surface", () => {
    expect(`${migration}\n${storeSource}\n${workerStoreSource}`).not.toMatch(
      /prisma|typeorm|sequelize|drizzle/iu,
    );
  });
});
