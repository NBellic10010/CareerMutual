import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  InterestQueueWorker,
  OfferNextQueuedInterestHandler,
  type BlindReviewApplicationIdFactory,
} from "@onlyboth/application";
import {
  PostgresInterestQueueStore,
  createPostgresPool,
  runPostgresMigrations,
} from "@onlyboth/db";
import { chromium } from "@playwright/test";
import puppeteer, { type ElementHandle, type Page } from "puppeteer-core";

import { createFunctionalProductWorkerComposition } from "../../apps/worker/src/functional-product-composition";

function requiredEnvironment(name: "TEST_DATABASE_URL" | "OPENAI_API_KEY"): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`BLOCKED: Puppeteer LIVE acceptance requires ${name}.`);
  }
  return value;
}

const databaseUrl = requiredEnvironment("TEST_DATABASE_URL");
const apiKey = requiredEnvironment("OPENAI_API_KEY");
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)).toLowerCase();
if (!/(?:^|[_-])test(?:$|[_-])/u.test(databaseName)) {
  throw new Error("REFUSED: Puppeteer acceptance requires a dedicated test database.");
}

const baseUrl = "http://127.0.0.1:3100";
const reportDirectory = join(process.cwd(), "test-reports", "puppeteer-multi-candidate-demo");
const objectEnvironment = {
  OBJECT_STORE_ENDPOINT: process.env.OBJECT_STORE_ENDPOINT ?? "http://127.0.0.1:9000",
  OBJECT_STORE_REGION: process.env.OBJECT_STORE_REGION ?? "us-east-1",
  OBJECT_STORE_BUCKET: process.env.OBJECT_STORE_BUCKET ?? "onlyboth-private",
  OBJECT_STORE_ACCESS_KEY_ID: process.env.OBJECT_STORE_ACCESS_KEY_ID ?? "onlyboth-local",
  OBJECT_STORE_SECRET_ACCESS_KEY:
    process.env.OBJECT_STORE_SECRET_ACCESS_KEY ?? "onlyboth-local-development-secret",
} as const;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function ids(): BlindReviewApplicationIdFactory {
  return { nextId: (kind) => `${kind}:${randomUUID()}` };
}

async function waitForServer(child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Web server exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Expected while Next starts.
    }
    await delay(500);
  }
  throw new Error("Web server did not become ready within 60 seconds.");
}

async function elementWithText(
  page: Page,
  selector: string,
  text: string,
): Promise<ElementHandle<Element>> {
  await page.waitForFunction(
    (candidateSelector, expectedText) =>
      [...document.querySelectorAll(candidateSelector)].some((element) =>
        element.textContent?.replaceAll(/\s+/gu, " ").trim().includes(expectedText),
      ),
    { timeout: 20_000 },
    selector,
    text,
  );
  const elements = await page.$$(selector);
  for (const element of elements) {
    const content = await element.evaluate((node) =>
      node.textContent?.replaceAll(/\s+/gu, " ").trim(),
    );
    if (content?.includes(text)) return element;
  }
  throw new Error(`Could not find ${selector} containing ${text}.`);
}

async function clickText(page: Page, selector: string, text: string): Promise<void> {
  await (await elementWithText(page, selector, text)).click();
}

async function replaceEditorText(page: Page, value: string): Promise<void> {
  await page.click('[contenteditable="true"]');
  await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
  await page.keyboard.press("A");
  await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
  await page.keyboard.type(value);
}

async function persistEditorRevision(page: Page): Promise<void> {
  const response = page.waitForResponse(
    (candidate) => candidate.url().includes("/drafts") && candidate.request().method() === "POST",
    { timeout: 15_000 },
  );
  await page.click("#answer-sandbox-title");
  const saved = await response;
  if (!saved.ok()) throw new Error(`Draft save failed with ${saved.status()}.`);
  await page.waitForFunction(
    () => document.querySelector(".save-indicator")?.textContent?.trim() === "SAVED",
    { timeout: 10_000 },
  );
}

async function drainQueue(
  worker: InterestQueueWorker,
  pool: ReturnType<typeof createPostgresPool>,
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await worker.runOnce("puppeteer-multi-candidate");
    const offer = await pool.query(
      `SELECT 1 FROM answer_invitations
        WHERE candidate_ref = 'candidate-17' AND status = 'OFFERED' LIMIT 1`,
    );
    if (offer.rowCount === 1) return;
    await delay(100);
  }
  throw new Error("Interest Queue did not create Maya's backed offer.");
}

async function run(): Promise<void> {
  await mkdir(reportDirectory, { recursive: true });
  const pool = createPostgresPool(databaseUrl);
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

  const queuePool = createPostgresPool(databaseUrl);
  const queueStore = new PostgresInterestQueueStore(queuePool);
  const queueWorker = new InterestQueueWorker(
    queueStore,
    new OfferNextQueuedInterestHandler(queueStore, ids(), sha256),
  );
  const functionalWorker = createFunctionalProductWorkerComposition(databaseUrl, {
    ...objectEnvironment,
    OPENAI_API_KEY: apiKey,
    EMPLOYER_REVIEW_AI_ENABLED: "true",
    EMPLOYER_REVIEW_AI_MODE: "LIVE",
    EMPLOYER_REVIEW_AI_MODEL: "gpt-5.6-luna",
  });
  const webEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "OPENAI_API_KEY",
    ),
  );
  const server: ChildProcess = spawn(
    "pnpm",
    ["--filter", "@onlyboth/web", "exec", "next", "start", "-p", "3100"],
    {
      cwd: process.cwd(),
      env: {
        ...webEnvironment,
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        DEMO_MODE: "true",
        DEMO_SESSION_SECRET: "puppeteer-multi-candidate-secret-at-least-32-characters",
        RUNTIME_MODE: "GOLDEN_REPLAY",
        SANDBOX_ADAPTER: "replay",
        REPLAY_ID: "payment-retry-v1",
        ...objectEnvironment,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverTail = "";
  const capture = (chunk: Buffer) => {
    serverTail = `${serverTail}${chunk.toString("utf8")}`.slice(-8_000);
  };
  server.stdout?.on("data", capture);
  server.stderr?.on("data", capture);

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    await waitForServer(server);
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? chromium.executablePath(),
      headless: true,
      args: ["--no-sandbox"],
    });
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle0" });
    await page.select('select[aria-label="Start as"]', "candidate-17");
    await page.screenshot({ path: join(reportDirectory, "01-start-as-candidate.png") });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      clickText(page, "button", "Start as Maya Patel"),
    ]);
    await page.waitForFunction(
      () => document.querySelector(".role-breadcrumb")?.textContent?.includes("Candidate 17"),
      { timeout: 10_000 },
    );
    await page.screenshot({ path: join(reportDirectory, "02-maya-opportunity-feed.png") });

    const roleCard = await elementWithText(
      page,
      "article.job-row",
      "Senior Backend Reliability Engineer",
    );
    const roleLink = await roleCard.$("a");
    if (roleLink === null) throw new Error("Main role link is missing.");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), roleLink.click()]);
    await page.screenshot({ path: join(reportDirectory, "03-sealed-job-and-challenge.png") });

    const interestResponse = page.waitForResponse(
      (response) => response.url().endsWith("/interests") && response.request().method() === "POST",
    );
    await clickText(page, "button", "Register interest — free");
    if (!(await interestResponse).ok()) throw new Error("Maya's Interest was not accepted.");
    await drainQueue(queueWorker, queuePool);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.textContent?.includes("BACKED OFFERED"), {
      timeout: 10_000,
    });
    await page.screenshot({ path: join(reportDirectory, "04-backed-offer.png") });

    await clickText(page, "button", "Apply with 1 Credit");
    const checkboxes = await page.$$('section[role="dialog"] input[type="checkbox"]');
    if (checkboxes.length !== 7)
      throw new Error(`Expected 7 consent checks, received ${checkboxes.length}.`);
    for (const checkbox of checkboxes) await checkbox.click();
    const acceptResponse = page.waitForResponse(
      (response) => response.url().endsWith("/accept") && response.request().method() === "POST",
    );
    await clickText(page, "button", "Consume 1 Credit & start");
    if (!(await acceptResponse).ok()) throw new Error("Backed Offer acceptance failed.");
    await page.waitForSelector('[contenteditable="true"]', { visible: true });

    const verboseDraft =
      "I would retry the charge and then update Redis, while also writing logs, metrics, dashboards, alerts, and several broad recovery jobs. The worker could use a fresh request token each time and compare timestamps later. This draft intentionally overstates a weak approach so the revision ledger records a substantial deletion before the final answer is sealed.";
    await replaceEditorText(page, verboseDraft);
    await persistEditorRevision(page);
    await replaceEditorText(page, "Retry again and inspect the logs later.");
    await persistEditorRevision(page);

    const blurResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/activity-events") && response.request().method() === "POST",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await blurResponse;
    await delay(2_600);
    const focusResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/activity-events") && response.request().method() === "POST",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await focusResponse;
    await page.waitForFunction(() => document.body.textContent?.includes("FOCUS NOTICE 01 / 02"));
    await clickText(page, "button", "I understand — return to the challenge");

    const finalAnswer =
      "Invariant one: one logical payment attempt maps to one durable attempt row and one stable provider idempotency key. Invariant two: acknowledgement loss leaves the attempt UNKNOWN, never safe-to-recharge. Persist the attempt and key in PostgreSQL before calling the provider; on replay, reconcile the provider result with that same key and atomically move the ledger to one terminal state. Redis is only an acceleration layer, not charge authority. Falsify this design by crashing after provider success but before acknowledgement, failing Redis, and concurrently replaying the same job. The test must assert exactly one provider charge, one terminal ledger transition, and safe recovery from UNKNOWN without inventing a second key.";
    await replaceEditorText(page, finalAnswer);
    await persistEditorRevision(page);
    await page.screenshot({ path: join(reportDirectory, "05-answer-with-focus-warning.png") });

    const submitResponse = page.waitForResponse(
      (response) => response.url().endsWith("/submit") && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await clickText(page, "button", "Submit immutable answer");
    if (!(await submitResponse).ok()) throw new Error("Immutable Answer submission failed.");
    await page.waitForFunction(() =>
      document.body.textContent?.includes("Your answer is immutable."),
    );
    await page.screenshot({ path: join(reportDirectory, "06-immutable-process-summary.png") });

    const workerOutcomes: string[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const outcome = await functionalWorker.worker.runOnce("puppeteer-live-analyst");
      workerOutcomes.push(outcome);
      if (outcome === "EMPLOYER_ANALYSIS_PROCESSED") break;
    }
    if (!workerOutcomes.includes("EMPLOYER_ANALYSIS_PROCESSED")) {
      throw new Error(`Employer analysis did not complete: ${workerOutcomes.join(", ")}`);
    }

    await clickText(page, "button", "Return to the JobPost");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      clickText(page, "button", "Sign out"),
    ]);
    await page.waitForSelector('select[aria-label="Start as"]');
    await page.select('select[aria-label="Start as"]', "reviewer-sarah-chen");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      clickText(page, "button", "Start as Sarah Chen"),
    ]);
    const reviewCard = await elementWithText(
      page,
      "article.operation-row",
      "Senior Backend Reliability Engineer",
    );
    const reviewLink = await reviewCard.$("a");
    if (reviewLink === null) throw new Error("Review link is missing.");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), reviewLink.click()]);
    await clickText(page, "summary", "AI Evidence Analyst · READY");
    await page.waitForFunction(() => document.body.textContent?.includes("GOOD ANSWER"));
    await page.screenshot({
      path: join(reportDirectory, "07-recruiter-ai-evidence.png"),
      fullPage: true,
    });

    const aiSummary = await page.$eval(
      ".analyst-output",
      (element) => element.textContent?.trim() ?? "",
    );
    const behaviorProfile = await page.$eval(
      ".behavior-profile",
      (element) => element.textContent?.trim() ?? "",
    );
    await page.click('input[value="ADVANCE_ELIGIBLE"]');
    const redSignal = await page.$('.severity-card--red input[type="checkbox"]');
    if (redSignal !== null) await redSignal.click();
    const reviewTextareas = await page.$$(".review-form textarea");
    if (reviewTextareas.length !== 2) throw new Error("Human Review textareas are incomplete.");
    await reviewTextareas[0]!.type(
      "The answer pins a stable provider idempotency key, treats acknowledgement loss as unknown, and names a concurrent crash test that can falsify the design.",
    );
    await reviewTextareas[1]!.type(
      "Cross-region provider reconciliation and sustained production ownership remain outside this bounded task.",
    );
    const reviewResponse = page.waitForResponse(
      (response) => response.url().endsWith("/review") && response.request().method() === "POST",
    );
    await clickText(page, "button", "Record review & release Slot");
    if (!(await reviewResponse).ok()) throw new Error("Human Review settlement failed.");
    await page.waitForFunction(() =>
      document.body.textContent?.includes("Review receipt recorded."),
    );
    await page.screenshot({ path: join(reportDirectory, "08-human-review-settlement.png") });

    await page.goto(`${baseUrl}/employer/candidates`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.textContent?.includes("Maya Patel"));
    await page.screenshot({
      path: join(reportDirectory, "09-post-review-resume-reveal.png"),
      fullPage: true,
    });

    const persisted = await pool.query<{
      candidate_credit: number;
      analyst_status: string;
      decision: string;
      process_manifest_json: { behavior_signals?: readonly { kind: string; severity: string }[] };
    }>(
      `SELECT credit.available_credits AS candidate_credit,
              analyst.status AS analyst_status,
              review.decision,
              process.process_manifest_json
         FROM answer_submissions AS submission
         JOIN candidate_credit_accounts AS credit ON credit.candidate_ref = submission.candidate_ref
         JOIN answer_process_evidence AS process
           ON process.answer_submission_ref = submission.answer_submission_ref
         JOIN employer_answer_review_projections AS analyst
           ON analyst.answer_submission_ref = submission.answer_submission_ref
         JOIN human_answer_reviews AS review
           ON review.answer_submission_ref = submission.answer_submission_ref
        WHERE submission.candidate_ref = 'candidate-17'
        ORDER BY submission.submitted_at DESC
        LIMIT 1`,
    );
    const databaseProof = persisted.rows[0];
    if (
      databaseProof === undefined ||
      databaseProof.candidate_credit !== 2 ||
      databaseProof.analyst_status !== "READY" ||
      databaseProof.decision !== "ADVANCE_ELIGIBLE" ||
      !databaseProof.process_manifest_json.behavior_signals?.some(
        ({ kind, severity }) => kind === "REVISION_VOLATILITY" && severity === "RED",
      )
    ) {
      throw new Error(`Persisted acceptance proof is incomplete: ${JSON.stringify(databaseProof)}`);
    }

    console.log(
      JSON.stringify(
        {
          outcome: "PUPPETEER_MULTI_CANDIDATE_LIVE_DEMO_PASSED",
          controlled_candidate: "candidate-17",
          candidate_display_name: "Maya Patel",
          synthetic_candidate_count: 7,
          candidate_credit_after_start: databaseProof.candidate_credit,
          analyst_status: databaseProof.analyst_status,
          human_review_decision: databaseProof.decision,
          revision_volatility: "RED",
          worker_outcomes: workerOutcomes,
          ai_summary_excerpt: aiSummary.slice(0, 420),
          behavior_profile_excerpt: behaviorProfile.slice(0, 420),
          screenshot_directory: reportDirectory,
          browser_controller: "puppeteer-core@25.3.0",
          browser_executable: process.env.PUPPETEER_EXECUTABLE_PATH ?? chromium.executablePath(),
          web_received_openai_key: false,
        },
        null,
        2,
      ),
    );
    await context.close();
  } catch (error: unknown) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nWeb server tail:\n${serverTail}`,
      { cause: error },
    );
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
    await Promise.all([functionalWorker.pool.end(), queuePool.end(), pool.end()]);
  }
}

await run();
