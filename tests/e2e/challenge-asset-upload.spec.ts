import { expect, test } from "@playwright/test";

import { createPostgresPool, runPostgresMigrations } from "../../packages/db/src/index";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("BLOCKED: Challenge Asset E2E requires TEST_DATABASE_URL.");
}
const pool = createPostgresPool(databaseUrl);

test.beforeAll(async () => {
  await runPostgresMigrations(pool);
  await pool.query(`
    TRUNCATE TABLE
      blind_review_command_receipts,
      inbox_messages,
      job_post_drafts,
      employer_attention_wallets,
      opportunities,
      domain_events
    CASCADE
  `);
  await pool.query(`
    INSERT INTO employer_attention_wallets (
      owner_ref, available_credits, committed_credits, forfeited_credits,
      version, created_at, updated_at
    ) VALUES ('reviewer-sarah-chen', 100, 0, 0, 1, clock_timestamp(), clock_timestamp())
  `);
});

test.afterAll(async () => pool.end());

test("Recruiter validates, previews, and seals image, audio, and file Challenge Parts", async ({
  page,
}) => {
  await page.goto("/employer");
  await page.getByLabel("Start as").selectOption("reviewer-sarah-chen");
  await page.getByRole("button", { name: "Start as Sarah Chen" }).click();
  await page.getByRole("button", { name: "Create JobPost" }).click();

  const composer = page.getByRole("dialog", { name: "New JobPost" });
  await expect(composer.getByRole("button", { name: "Video · later" })).toBeDisabled();
  await composer.getByRole("button", { name: "+ image" }).click();
  await composer.getByRole("button", { name: "+ audio" }).click();
  await composer.getByRole("button", { name: "+ file" }).click();

  const parts = composer.locator(".media-part-editor");
  await parts
    .nth(0)
    .getByLabel("Accessible alt text")
    .fill("A synthetic one-pixel direction board for upload validation.");
  await parts
    .nth(0)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "direction-board.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n9sAAAAASUVORK5CYII=",
        "base64",
      ),
    });

  await parts
    .nth(1)
    .getByLabel("Accessible transcript excerpt")
    .fill("A synthetic caller asks which recovery action is reversible.");
  await parts
    .nth(1)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "caller-brief.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF0000WAVE", "ascii"),
    });

  await parts
    .nth(2)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "source-records.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("account,balance\n100,42\n", "utf8"),
    });

  await expect(parts.nth(0).locator("img")).toBeVisible();
  await expect(parts.nth(1).locator("audio")).toBeVisible();
  await expect(parts.nth(2).getByText("DOC", { exact: true })).toBeVisible();

  for (let index = 0; index < 3; index += 1) {
    const completed = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/employer/challenge-assets/complete") &&
        response.request().method() === "POST",
    );
    await parts.nth(index).getByRole("button", { name: "Validate & upload" }).click();
    expect((await completed).status()).toBe(200);
    await expect(parts.nth(index).getByText("Upload verified")).toBeVisible();
  }
  await expect(composer.getByText("3/3 uploaded Parts verified.")).toBeVisible();

  await composer.getByLabel("Public role title").fill("Multimodal Operations Investigator");
  await composer.getByRole("button", { name: "Save Draft" }).click();
  const draft = page
    .locator("article.draft-row")
    .filter({ hasText: "Multimodal Operations Investigator" });
  await expect(draft).toBeVisible();

  const verifiedRows = await pool.query<{
    asset_ref: string;
    state: string;
    draft_ref: string | null;
  }>(
    `SELECT asset_ref, state, draft_ref
       FROM employer_challenge_assets
      ORDER BY part_kind, asset_ref`,
  );
  expect(verifiedRows.rows).toHaveLength(3);
  expect(verifiedRows.rows.every((row) => row.state === "VERIFIED" && row.draft_ref !== null)).toBe(
    true,
  );

  await draft.getByRole("button", { name: /Credits & publish/u }).click();
  await expect(
    page.locator("article.operation-row").filter({ hasText: "Multimodal Operations Investigator" }),
  ).toBeVisible();

  const sealedRows = await pool.query<{
    asset_ref: string;
    state: string;
    opportunity_ref: string | null;
  }>(
    `SELECT asset_ref, state, opportunity_ref
       FROM employer_challenge_assets
      ORDER BY part_kind, asset_ref`,
  );
  expect(sealedRows.rows).toHaveLength(3);
  expect(
    sealedRows.rows.every((row) => row.state === "SEALED" && row.opportunity_ref !== null),
  ).toBe(true);

  const readableAsset = sealedRows.rows[0];
  if (readableAsset === undefined) throw new Error("Expected one sealed Challenge Asset.");
  const readStatus = await page.evaluate(async (assetRef) => {
    const response = await fetch(
      `/api/v1/challenge-assets/${encodeURIComponent(assetRef)}?role=employer`,
    );
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      nosniff: response.headers.get("x-content-type-options"),
    };
  }, readableAsset.asset_ref);
  expect(readStatus).toEqual({
    status: 200,
    cacheControl: "private, no-store",
    nosniff: "nosniff",
  });
});
