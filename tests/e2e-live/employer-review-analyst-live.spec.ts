import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { createFunctionalProductWorkerComposition } from "../../apps/worker/src/functional-product-composition";
import { createPostgresPool, runPostgresMigrations } from "../../packages/db/src/index";

const databaseUrl = process.env.TEST_DATABASE_URL;
const apiKey = process.env.OPENAI_API_KEY;
if (databaseUrl === undefined || apiKey === undefined) {
  throw new Error("BLOCKED: LIVE analyst E2E requires TEST_DATABASE_URL and OPENAI_API_KEY.");
}

const objectEnvironment = {
  OBJECT_STORE_ENDPOINT: process.env.OBJECT_STORE_ENDPOINT ?? "http://127.0.0.1:9000",
  OBJECT_STORE_REGION: process.env.OBJECT_STORE_REGION ?? "us-east-1",
  OBJECT_STORE_BUCKET: process.env.OBJECT_STORE_BUCKET ?? "onlyboth-private",
  OBJECT_STORE_ACCESS_KEY_ID: process.env.OBJECT_STORE_ACCESS_KEY_ID ?? "onlyboth-local",
  OBJECT_STORE_SECRET_ACCESS_KEY:
    process.env.OBJECT_STORE_SECRET_ACCESS_KEY ?? "onlyboth-local-development-secret",
} as const;

const pool = createPostgresPool(databaseUrl);
const functionalWorker = createFunctionalProductWorkerComposition(databaseUrl, {
  ...objectEnvironment,
  OPENAI_API_KEY: apiKey,
  EMPLOYER_REVIEW_AI_ENABLED: "true",
  EMPLOYER_REVIEW_AI_MODE: "LIVE",
  EMPLOYER_REVIEW_AI_MODEL: "gpt-5.6-luna",
});

async function login(page: Page, role: "Candidate 42" | "Recruiter"): Promise<void> {
  await page.goto(role === "Candidate 42" ? "/candidate" : "/employer");
  await page
    .getByLabel("Start as")
    .selectOption(role === "Candidate 42" ? "candidate-42" : "reviewer-sarah-chen");
  await page
    .getByRole("button", {
      name: role === "Candidate 42" ? "Start as Jordan Lee" : "Start as Sarah Chen",
    })
    .click();
  await expect(page).toHaveURL(role === "Candidate 42" ? /\/candidate$/u : /\/employer$/u);
}

test.beforeAll(async () => {
  await runPostgresMigrations(pool);
  execFileSync("pnpm", ["demo:reset:functional"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DEMO_MODE: "true",
      DEMO_EMPLOYER_AI_REVIEW_POLICY: "ANSWER_PLUS_PROCESS",
    },
    stdio: "pipe",
  });
});

test.afterAll(async () => {
  await Promise.all([functionalWorker.pool.end(), pool.end()]);
});

test("persists Luna analysis and renders READY evidence in the Employer review UI", async ({
  browser,
}) => {
  const candidateContext = await browser.newContext();
  const employerContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  const employerPage = await employerContext.newPage();

  await login(candidatePage, "Candidate 42");
  const backedJob = candidatePage.locator("article.job-row").filter({
    hasText: "Senior Backend Reliability Engineer",
  });
  await expect(backedJob).toContainText("BACKED OFFERED");
  await backedJob.getByRole("link", { name: "Open backed offer" }).click();
  await expect(
    candidatePage.getByRole("heading", {
      name: "Employer AI Evidence Analyst: ANSWER PLUS PROCESS",
    }),
  ).toBeVisible();
  await candidatePage.getByRole("button", { name: "Apply with 1 Credit" }).click();
  const consent = candidatePage.getByRole("dialog", {
    name: "Confirm this is a real application.",
  });
  await expect(consent).toContainText("red/yellow/green classification");
  for (const checkbox of await consent.getByRole("checkbox").all()) await checkbox.check();
  const acceptResponsePromise = candidatePage.waitForResponse(
    (response) => response.url().endsWith("/accept") && response.request().method() === "POST",
  );
  await consent.getByRole("button", { name: "Consume 1 Credit & start" }).click();
  const acceptResponse = await acceptResponsePromise;
  expect(acceptResponse.status()).toBe(201);

  const draftResponsePromise = candidatePage.waitForResponse(
    (response) => response.url().includes("/drafts") && response.request().method() === "POST",
  );
  await candidatePage
    .locator('[contenteditable="true"]')
    .fill(
      "Preserve one provider charge per payment attempt with a durable attempt row and one provider idempotency key. Treat acknowledgement loss as unknown completion, reconcile with the same key, and falsify the invariant by concurrently replaying the attempt after Redis failure while asserting exactly one provider charge and one terminal ledger transition.",
    );
  await candidatePage
    .getByRole("dialog", { name: /Senior Backend Reliability Engineer/u })
    .getByRole("heading", { name: "Senior Backend Reliability Engineer", exact: true })
    .click();
  expect((await draftResponsePromise).status()).toBe(200);
  await candidatePage.getByRole("button", { name: "Submit immutable answer" }).click();
  await expect(candidatePage.getByText("Your answer is immutable.")).toBeVisible();

  await login(employerPage, "Recruiter");
  const reviewJob = employerPage.locator("article.operation-row").filter({
    hasText: "Senior Backend Reliability Engineer",
  });
  await expect(reviewJob).toContainText("Review debt");
  await reviewJob.getByRole("link", { name: "Review current answer" }).click();
  await employerPage.getByText("AI Evidence Analyst · ANALYZING").click();
  await expect(employerPage.getByText("Analysis is still running.")).toBeVisible();
  await expect(employerPage.getByText("Answer behavior profile")).toBeVisible();

  const workerOutcomes: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const outcome = await functionalWorker.worker.runOnce("playwright-live-luna-analyst");
    workerOutcomes.push(outcome);
    if (outcome === "EMPLOYER_ANALYSIS_PROCESSED") break;
  }
  expect(workerOutcomes).toContain("EMPLOYER_ANALYSIS_PROCESSED");

  await employerPage.reload();
  await employerPage.getByText("AI Evidence Analyst · READY").click();
  await expect(employerPage.getByLabel("Bounded answer verdict: GOOD ANSWER")).toBeVisible();
  await expect(employerPage.getByRole("heading", { name: "Language analysis" })).toBeVisible();
  await expect(employerPage.getByText("SUPPORTED", { exact: true })).toBeVisible();
  await expect(employerPage.getByText("Answer behavior profile")).toBeVisible();
  await expect(employerPage.getByText("Required human receipt")).toBeVisible();
  await expect(employerPage.locator("body")).not.toContainText("Candidate 42");

  const persisted = await pool.query<{
    projection_status: string;
    synthetic: boolean;
    requested_model: string;
    resolved_model: string;
    run_status: string;
    prompt_version: string;
    output_schema_version: string;
  }>(
    `SELECT projection.status AS projection_status, projection.synthetic,
            run.requested_model, run.resolved_model, run.status AS run_status,
            run.prompt_version, output.output_schema_version
       FROM employer_answer_review_projections AS projection
       JOIN ai_model_runs AS run ON run.request_id = projection.ai_request_ref
       JOIN ai_outputs AS output ON output.id = projection.ai_output_ref
      ORDER BY projection.updated_at DESC, run.attempt DESC
      LIMIT 1`,
  );
  expect(persisted.rows[0]).toEqual({
    projection_status: "READY",
    synthetic: false,
    requested_model: "gpt-5.6-luna",
    resolved_model: "gpt-5.6-luna",
    run_status: "SUCCEEDED",
    prompt_version: "2.0.2",
    output_schema_version: "answer-evidence-edge-draft@2",
  });

  await Promise.all([candidateContext.close(), employerContext.close()]);
});
