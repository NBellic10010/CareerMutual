import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../packages/db/migrations/0006_functional_product_vertical.sql", import.meta.url),
  "utf8",
);
const downMigration = readFileSync(
  new URL(
    "../../packages/db/migrations/0006_functional_product_vertical.down.sql",
    import.meta.url,
  ),
  "utf8",
);
const breachMigration = readFileSync(
  new URL("../../packages/db/migrations/0007_review_sla_breach_settlement.sql", import.meta.url),
  "utf8",
);
const breachDownMigration = readFileSync(
  new URL(
    "../../packages/db/migrations/0007_review_sla_breach_settlement.down.sql",
    import.meta.url,
  ),
  "utf8",
);
const challengeAssetMigration = readFileSync(
  new URL("../../packages/db/migrations/0015_employer_challenge_assets.sql", import.meta.url),
  "utf8",
);
const challengeAssetDownMigration = readFileSync(
  new URL("../../packages/db/migrations/0015_employer_challenge_assets.down.sql", import.meta.url),
  "utf8",
);

describe("functional product migration contract", () => {
  it("persists wallets, declarations, private Artifact metadata, and disclosed assistant traces", () => {
    for (const table of [
      "employer_attention_wallets",
      "employer_attention_wallet_ledger",
      "job_post_drafts",
      "candidate_credit_accounts",
      "candidate_credit_ledger_entries",
      "answer_terms_acceptances",
      "answer_artifacts",
      "candidate_assistant_exchanges",
    ]) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
      expect(downMigration).toContain(`DROP TABLE ${table}`);
    }
  });

  it("enforces immutable ledgers, declarations, Artifacts, submissions, and reviews", () => {
    for (const trigger of [
      "employer_attention_wallet_ledger_immutable",
      "candidate_credit_ledger_immutable",
      "answer_terms_acceptances_immutable",
      "answer_artifacts_sealed_immutable",
    ]) {
      expect(migration).toContain(`CREATE TRIGGER ${trigger}`);
      expect(downMigration).toContain(`DROP TRIGGER IF EXISTS ${trigger}`);
    }
  });

  it("persists immutable SLA breaches, Candidate compensation, forfeiture, and Slot retirement", () => {
    expect(breachMigration).toContain("CREATE TABLE employer_review_breaches");
    expect(breachMigration).toContain("CREATE TABLE employer_reliability_accounts");
    expect(breachMigration).toContain("CREATE TRIGGER employer_review_breaches_immutable");
    expect(breachMigration).toContain("EMPLOYER_BREACH");
    expect(breachMigration).toContain("BREACH_SETTLED");
    expect(breachDownMigration).toContain("DROP TABLE employer_review_breaches");
  });

  it("persists owner-bound verified Challenge Assets and makes sealed rows immutable", () => {
    expect(challengeAssetMigration).toContain("CREATE TABLE employer_challenge_assets");
    expect(challengeAssetMigration).toContain("part_kind IN ('IMAGE', 'AUDIO', 'FILE')");
    expect(challengeAssetMigration).toContain(
      "CREATE TRIGGER employer_challenge_assets_sealed_immutable",
    );
    expect(challengeAssetMigration).not.toContain("'VIDEO'");
    expect(challengeAssetDownMigration).toContain("DROP TABLE IF EXISTS employer_challenge_assets");
  });
});
