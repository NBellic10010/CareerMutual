import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
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
    throw new Error(`BLOCKED: poor-Creative Puppeteer acceptance requires ${name}.`);
  }
  return value;
}

const databaseUrl = requiredEnvironment("TEST_DATABASE_URL");
const apiKey = requiredEnvironment("OPENAI_API_KEY");
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)).toLowerCase();
if (!/(?:^|[_-])test(?:$|[_-])/u.test(databaseName)) {
  throw new Error("REFUSED: Puppeteer acceptance requires a dedicated test database.");
}

const baseUrl = "http://127.0.0.1:3101";
const reportDirectory = join(process.cwd(), "test-reports", "puppeteer-poor-creative-demo");
const candidateRef = "candidate-27";
const candidateName = "Avery Stone";
const jobTitle = "Senior Brand Illustrator";
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
  expectedText: string,
): Promise<ElementHandle<Element>> {
  await page.waitForFunction(
    (candidateSelector, text) =>
      [...document.querySelectorAll(candidateSelector)].some((element) =>
        element.textContent?.replaceAll(/\s+/gu, " ").trim().includes(text),
      ),
    { timeout: 20_000 },
    selector,
    expectedText,
  );
  for (const element of await page.$$(selector)) {
    const text = await element.evaluate((node) =>
      node.textContent?.replaceAll(/\s+/gu, " ").trim(),
    );
    if (text?.includes(expectedText)) return element;
  }
  throw new Error(`Could not find ${selector} containing ${expectedText}.`);
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

async function recordAwayAndReturn(page: Page): Promise<void> {
  const blurResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/activity-events") && response.request().method() === "POST",
    { timeout: 15_000 },
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  if (!(await blurResponse).ok()) throw new Error("Window blur activity was not accepted.");
  await delay(2_600);
  const focusResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/activity-events") && response.request().method() === "POST",
    { timeout: 15_000 },
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  if (!(await focusResponse).ok()) throw new Error("Window focus activity was not accepted.");
}

async function drainQueue(
  worker: InterestQueueWorker,
  pool: ReturnType<typeof createPostgresPool>,
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await worker.runOnce("puppeteer-poor-creative");
    const offer = await pool.query(
      `SELECT 1
         FROM answer_invitations AS invitation
         JOIN answer_review_obligations AS obligation
           ON obligation.obligation_ref = invitation.obligation_ref
         JOIN blind_review_commitments AS commitment
           ON commitment.commitment_ref = obligation.commitment_ref
         JOIN opportunities AS opportunity ON opportunity.id = commitment.opportunity_ref
        WHERE invitation.candidate_ref = $1
          AND invitation.status = 'OFFERED'
          AND opportunity.title = $2
        LIMIT 1`,
      [candidateRef, jobTitle],
    );
    if (offer.rowCount === 1) return;
    await delay(100);
  }
  throw new Error("Interest Queue did not create Avery's backed Creative offer.");
}

async function run(): Promise<void> {
  await rm(reportDirectory, { recursive: true, force: true });
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
    ["--filter", "@onlyboth/web", "exec", "next", "start", "-p", "3101"],
    {
      cwd: process.cwd(),
      env: {
        ...webEnvironment,
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        DEMO_MODE: "true",
        DEMO_SESSION_SECRET: "puppeteer-poor-creative-secret-at-least-32-characters",
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
    await page.select('select[aria-label="Start as"]', candidateRef);
    await page.screenshot({ path: join(reportDirectory, "01-start-as-avery.png") });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      clickText(page, "button", `Start as ${candidateName}`),
    ]);
    await page.waitForFunction(
      () => document.querySelector(".role-breadcrumb")?.textContent?.includes("Candidate 27"),
      { timeout: 10_000 },
    );
    await clickText(page, "button", "Creative");
    await page.waitForFunction(
      (title) => document.body.textContent?.includes(title),
      { timeout: 10_000 },
      jobTitle,
    );
    await page.screenshot({ path: join(reportDirectory, "02-creative-opportunity-match.png") });

    const roleCard = await elementWithText(page, "article.job-row", jobTitle);
    const roleLink = await roleCard.$("a");
    if (roleLink === null) throw new Error("Creative role link is missing.");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), roleLink.click()]);
    await page.waitForFunction(() => document.body.textContent?.includes("Choose and evolve"));
    await page.screenshot({
      path: join(reportDirectory, "03-sealed-creative-brief.png"),
      fullPage: true,
    });

    const interestResponse = page.waitForResponse(
      (response) => response.url().endsWith("/interests") && response.request().method() === "POST",
    );
    await clickText(page, "button", "Register interest — free");
    if (!(await interestResponse).ok()) throw new Error("Avery's Interest was not accepted.");
    await drainQueue(queueWorker, queuePool);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.textContent?.includes("BACKED OFFERED"));
    await clickText(page, "button", "Apply with 1 Credit");
    await page.screenshot({ path: join(reportDirectory, "04-consent-before-credit.png") });

    const checkboxes = await page.$$('section[role="dialog"] input[type="checkbox"]');
    if (checkboxes.length !== 7) {
      throw new Error(`Expected 7 consent checks, received ${checkboxes.length}.`);
    }
    for (const checkbox of checkboxes) await checkbox.click();
    const acceptResponse = page.waitForResponse(
      (response) => response.url().endsWith("/accept") && response.request().method() === "POST",
    );
    await clickText(page, "button", "Consume 1 Credit & start");
    if (!(await acceptResponse).ok()) throw new Error("Backed Creative Offer acceptance failed.");
    await page.waitForSelector('[contenteditable="true"]', { visible: true });

    const genericDraft =
      "I will create a bold, innovative, premium, energetic, authentic, human-centered, future-ready visual universe with many exciting gradients, expressive shapes, dynamic typography, and a flexible campaign toolkit. The concept will feel trustworthy and disruptive at the same time. I will explore every route, combine all of the strongest ideas, and add enough detail to make each placement feel impressive. The landing page, social card, presentation, event banner, and every other channel can carry the same master composition so the brand remains consistent. Stakeholders can choose whichever variation feels best after seeing polished mockups.";
    await replaceEditorText(page, genericDraft);
    await persistEditorRevision(page);
    await replaceEditorText(page, "Make it pop with gradients and use whichever panel feels best.");
    await persistEditorRevision(page);

    await recordAwayAndReturn(page);
    await page.waitForFunction(() => document.body.textContent?.includes("FOCUS NOTICE 01 / 02"));
    await page.screenshot({ path: join(reportDirectory, "05-first-focus-warning.png") });
    await clickText(page, "button", "I understand — return to the challenge");

    const poorFinalAnswer =
      "Use all three routes at the same time so I do not have to choose one. The board details are not important. Keep the exact same composition at every size, including the small social crop. I would not redraw anything or define a review test; whichever version feels exciting is fine.";
    await replaceEditorText(page, poorFinalAnswer);
    await persistEditorRevision(page);
    await recordAwayAndReturn(page);
    await page.waitForFunction(() => document.body.textContent?.includes("AUTO-SUBMIT REQUESTED"), {
      timeout: 10_000,
    });
    await page.screenshot({ path: join(reportDirectory, "06-second-focus-auto-submit.png") });

    const workerOutcomes: string[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const outcome = await functionalWorker.worker.runOnce("puppeteer-poor-creative-live");
      workerOutcomes.push(outcome);
      if (outcome === "EMPLOYER_ANALYSIS_PROCESSED") break;
      await delay(150);
    }
    if (!workerOutcomes.includes("FOCUS_POLICY_PROGRESS")) {
      throw new Error(`Focus-policy submission did not settle: ${workerOutcomes.join(", ")}`);
    }
    if (!workerOutcomes.includes("EMPLOYER_ANALYSIS_PROCESSED")) {
      throw new Error(`Employer analysis did not complete: ${workerOutcomes.join(", ")}`);
    }
    await page.waitForFunction(
      () => document.body.textContent?.includes("Your answer is immutable."),
      {
        timeout: 15_000,
      },
    );
    await page.screenshot({
      path: join(reportDirectory, "07-immutable-poor-answer-process.png"),
      fullPage: true,
    });

    await clickText(page, "button", "Return to the JobPost");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      clickText(page, "button", "Sign out"),
    ]);
    await page.select('select[aria-label="Start as"]', "reviewer-sarah-chen");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      clickText(page, "button", "Start as Sarah Chen"),
    ]);
    const reviewCard = await elementWithText(page, "article.operation-row", jobTitle);
    const reviewLink = await reviewCard.$("a");
    if (reviewLink === null) throw new Error("Creative Review link is missing.");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), reviewLink.click()]);
    await clickText(page, "summary", "AI Evidence Analyst · READY");
    await page.waitForFunction(() => document.body.textContent?.includes("BAD ANSWER"), {
      timeout: 10_000,
    });
    await page.screenshot({
      path: join(reportDirectory, "08-recruiter-bad-answer-analysis.png"),
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
    await page.click('input[value="NO_FURTHER_PROOF"]');
    for (const redSignal of await page.$$('.severity-card--red input[type="checkbox"]')) {
      if (!(await redSignal.evaluate((element) => (element as HTMLInputElement).checked))) {
        await redSignal.click();
      }
    }
    const reviewTextareas = await page.$$(".review-form textarea");
    if (reviewTextareas.length !== 2) throw new Error("Human Review textareas are incomplete.");
    await reviewTextareas[0]!.type(
      "The response explicitly avoids choosing one direction, ignores the board, preserves one composition across every channel, and provides no review test. The bounded brief is not demonstrated.",
    );
    await reviewTextareas[1]!.type(
      "Hands-on illustration craft and performance with a production file remain outside this text-only task.",
    );
    const reviewResponse = page.waitForResponse(
      (response) => response.url().endsWith("/review") && response.request().method() === "POST",
    );
    await clickText(page, "button", "Record review & release Slot");
    if (!(await reviewResponse).ok()) throw new Error("Human Review settlement failed.");
    await page.waitForFunction(() =>
      document.body.textContent?.includes("Review receipt recorded."),
    );
    await page.screenshot({ path: join(reportDirectory, "09-no-further-proof-settlement.png") });

    await page.goto(`${baseUrl}/employer/candidates`, { waitUntil: "networkidle0" });
    const bodyText = await page.$eval("body", (element) => element.textContent ?? "");
    if (bodyText.includes(candidateName)) {
      throw new Error("A NO_FURTHER_PROOF Review improperly revealed Avery's résumé.");
    }
    await page.screenshot({
      path: join(reportDirectory, "10-resume-remains-sealed.png"),
      fullPage: true,
    });

    const persisted = await pool.query<{
      candidate_credit: number;
      analyst_status: string;
      answer_verdict: string;
      decision: string;
      submission_source: string;
      reveal_count: number;
      process_manifest_json: { behavior_signals?: readonly { kind: string; severity: string }[] };
    }>(
      `SELECT credit.available_credits AS candidate_credit,
              analyst.status AS analyst_status,
              analyst.projection_json->'answer_verdict'->>'verdict' AS answer_verdict,
              review.decision,
              session.submission_source,
              (SELECT count(*)::int FROM employer_resume_reveals AS reveal
                WHERE reveal.candidate_ref = submission.candidate_ref) AS reveal_count,
              process.process_manifest_json
         FROM answer_submissions AS submission
         JOIN answer_sessions AS session
           ON session.answer_session_ref = submission.answer_session_ref
         JOIN answer_review_obligations AS obligation
           ON obligation.obligation_ref = submission.obligation_ref
         JOIN blind_review_commitments AS commitment
           ON commitment.commitment_ref = obligation.commitment_ref
         JOIN opportunities AS opportunity ON opportunity.id = commitment.opportunity_ref
         JOIN candidate_credit_accounts AS credit ON credit.candidate_ref = submission.candidate_ref
         JOIN answer_process_evidence AS process
           ON process.answer_submission_ref = submission.answer_submission_ref
         JOIN employer_answer_review_projections AS analyst
           ON analyst.answer_submission_ref = submission.answer_submission_ref
         JOIN human_answer_reviews AS review
           ON review.answer_submission_ref = submission.answer_submission_ref
        WHERE submission.candidate_ref = $1 AND opportunity.title = $2
        ORDER BY submission.submitted_at DESC
        LIMIT 1`,
      [candidateRef, jobTitle],
    );
    const databaseProof = persisted.rows[0];
    const signals = databaseProof?.process_manifest_json.behavior_signals ?? [];
    if (
      databaseProof === undefined ||
      databaseProof.candidate_credit !== 2 ||
      databaseProof.analyst_status !== "READY" ||
      databaseProof.answer_verdict !== "BAD_ANSWER" ||
      databaseProof.decision !== "NO_FURTHER_PROOF" ||
      databaseProof.submission_source !== "FOCUS_POLICY_AUTO" ||
      databaseProof.reveal_count !== 0 ||
      !signals.some(({ kind, severity }) => kind === "REVISION_VOLATILITY" && severity === "RED") ||
      !signals.some(({ kind, severity }) => kind === "SUBMISSION_PRESSURE" && severity === "RED")
    ) {
      throw new Error(
        `Persisted poor-Creative proof is incomplete: ${JSON.stringify(databaseProof)}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          outcome: "PUPPETEER_POOR_CREATIVE_LIVE_DEMO_PASSED",
          controlled_candidate: candidateRef,
          candidate_display_name: candidateName,
          job_title: jobTitle,
          candidate_credit_after_start: databaseProof.candidate_credit,
          analyst_status: databaseProof.analyst_status,
          answer_verdict: databaseProof.answer_verdict,
          human_review_decision: databaseProof.decision,
          submission_source: databaseProof.submission_source,
          resume_reveal_count: databaseProof.reveal_count,
          red_behavior_signals: signals
            .filter(({ severity }) => severity === "RED")
            .map(({ kind }) => kind),
          worker_outcomes: workerOutcomes,
          ai_summary_excerpt: aiSummary.slice(0, 500),
          behavior_profile_excerpt: behaviorProfile.slice(0, 500),
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
