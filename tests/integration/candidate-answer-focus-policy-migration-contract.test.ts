import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../packages/db/migrations/0009_candidate_answer_focus_policy.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../../packages/db/migrations/0009_candidate_answer_focus_policy.down.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Candidate Answer focus-policy migration contract", () => {
  it("creates an immutable raw timeline and a separate worker projection", () => {
    expect(migration).toContain("CREATE TABLE answer_session_activity_events");
    expect(migration).toContain("CREATE TABLE answer_session_focus_projections");
    expect(migration).toContain("answer_session_activity_events_immutable");
    expect(migration).toContain("sandbox-focus-policy@legacy-unmonitored");
    expect(migration).toContain("FOCUS_POLICY_AUTO");
    expect(migration).toContain("FOCUS_POLICY_TERMINATED_EMPTY");
  });

  it("registers a complete rollback for the new objects and columns", () => {
    expect(rollback).toContain("DROP TABLE IF EXISTS answer_session_activity_events");
    expect(rollback).toContain("DROP TABLE IF EXISTS answer_session_focus_projections");
    expect(rollback).toContain("DROP COLUMN focus_tracking_disclosure_version");
    expect(rollback).toContain("DROP COLUMN sandbox_focus_policy_version");
  });
});
