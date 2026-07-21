import { readFile } from "node:fs/promises";

import type { Pool, PoolClient } from "pg";

interface MigrationDefinition {
  readonly version: string;
  readonly upUrl: URL;
  readonly downUrl: URL;
}

const MIGRATIONS: readonly MigrationDefinition[] = [
  {
    version: "0001_challenge_recommendation_vertical",
    upUrl: new URL("../migrations/0001_challenge_recommendation_vertical.sql", import.meta.url),
    downUrl: new URL(
      "../migrations/0001_challenge_recommendation_vertical.down.sql",
      import.meta.url,
    ),
  },
  {
    version: "0002_matching_vertical",
    upUrl: new URL("../migrations/0002_matching_vertical.sql", import.meta.url),
    downUrl: new URL("../migrations/0002_matching_vertical.down.sql", import.meta.url),
  },
  {
    version: "0003_blind_answer_first",
    upUrl: new URL("../migrations/0003_blind_answer_first.sql", import.meta.url),
    downUrl: new URL("../migrations/0003_blind_answer_first.down.sql", import.meta.url),
  },
  {
    version: "0004_blind_review_runtime_pins",
    upUrl: new URL("../migrations/0004_blind_review_runtime_pins.sql", import.meta.url),
    downUrl: new URL("../migrations/0004_blind_review_runtime_pins.down.sql", import.meta.url),
  },
  {
    version: "0005_candidate_interest_and_answer_invitation_decisions",
    upUrl: new URL(
      "../migrations/0005_candidate_interest_and_answer_invitation_decisions.sql",
      import.meta.url,
    ),
    downUrl: new URL(
      "../migrations/0005_candidate_interest_and_answer_invitation_decisions.down.sql",
      import.meta.url,
    ),
  },
  {
    version: "0006_functional_product_vertical",
    upUrl: new URL("../migrations/0006_functional_product_vertical.sql", import.meta.url),
    downUrl: new URL("../migrations/0006_functional_product_vertical.down.sql", import.meta.url),
  },
  {
    version: "0007_review_sla_breach_settlement",
    upUrl: new URL("../migrations/0007_review_sla_breach_settlement.sql", import.meta.url),
    downUrl: new URL("../migrations/0007_review_sla_breach_settlement.down.sql", import.meta.url),
  },
  {
    version: "0008_candidate_evidence_passport",
    upUrl: new URL("../migrations/0008_candidate_evidence_passport.sql", import.meta.url),
    downUrl: new URL("../migrations/0008_candidate_evidence_passport.down.sql", import.meta.url),
  },
  {
    version: "0009_candidate_answer_focus_policy",
    upUrl: new URL("../migrations/0009_candidate_answer_focus_policy.sql", import.meta.url),
    downUrl: new URL("../migrations/0009_candidate_answer_focus_policy.down.sql", import.meta.url),
  },
  {
    version: "0010_employer_ai_review_analyst",
    upUrl: new URL("../migrations/0010_employer_ai_review_analyst.sql", import.meta.url),
    downUrl: new URL("../migrations/0010_employer_ai_review_analyst.down.sql", import.meta.url),
  },
  {
    version: "0011_answer_behavior_profile",
    upUrl: new URL("../migrations/0011_answer_behavior_profile.sql", import.meta.url),
    downUrl: new URL("../migrations/0011_answer_behavior_profile.down.sql", import.meta.url),
  },
  {
    version: "0012_candidate_education_and_review_reveal",
    upUrl: new URL("../migrations/0012_candidate_education_and_review_reveal.sql", import.meta.url),
    downUrl: new URL(
      "../migrations/0012_candidate_education_and_review_reveal.down.sql",
      import.meta.url,
    ),
  },
];

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
}

export async function runPostgresMigrations(pool: Pool): Promise<readonly string[]> {
  const applied: string[] = [];
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    for (const migration of MIGRATIONS) {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          "onlyboth-schema-migrations",
        ]);
        const existing = await client.query<{ version: string }>(
          "SELECT version FROM schema_migrations WHERE version = $1",
          [migration.version],
        );
        if (existing.rowCount === 0) {
          await client.query(await readFile(migration.upUrl, "utf8"));
          await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [
            migration.version,
          ]);
          applied.push(migration.version);
        }
        await client.query("COMMIT");
      } catch (error: unknown) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return applied;
  } finally {
    client.release();
  }
}

export async function rollbackLatestPostgresMigration(pool: Pool): Promise<string | null> {
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const latest = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY applied_at DESC, version DESC LIMIT 1",
    );
    const version = latest.rows[0]?.version;
    if (version === undefined) {
      return null;
    }
    const migration = MIGRATIONS.find((candidate) => candidate.version === version);
    if (migration === undefined) {
      throw new Error(`No rollback is registered for migration '${version}'.`);
    }

    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "onlyboth-schema-migrations",
      ]);
      await client.query(await readFile(migration.downUrl, "utf8"));
      await client.query("DELETE FROM schema_migrations WHERE version = $1", [version]);
      await client.query("COMMIT");
      return version;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}
