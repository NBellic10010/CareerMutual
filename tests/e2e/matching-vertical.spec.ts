import { expect, test, type BrowserContext, type Page, type Request } from "@playwright/test";

import { createChallengeWorkerComposition } from "../../apps/worker/src/challenge-composition";
import { createMatchingWorkerComposition } from "../../apps/worker/src/matching-composition";
import { createStageAWorkerComposition } from "../../apps/worker/src/stage-a-composition";
import { createPostgresPool, resetMatchingGoldenDemo } from "../../packages/db/src/index";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("BLOCKED: the Matching E2E suite requires TEST_DATABASE_URL.");
}

const MATCHING_ENVIRONMENT = {
  DEMO_MODE: "true",
  RUNTIME_MODE: "GOLDEN_REPLAY",
  REPLAY_ID: "matching-v1",
} as const;
const WORKER_CONFIG = {
  runtimeMode: "GOLDEN_REPLAY" as const,
  databaseUrl,
  sandboxAdapter: "replay" as const,
  replayId: "matching-v1",
};

const pool = createPostgresPool(databaseUrl);
const matching = createMatchingWorkerComposition(WORKER_CONFIG);
const stageA = createStageAWorkerComposition(WORKER_CONFIG);
const challenge = createChallengeWorkerComposition(WORKER_CONFIG);

async function drain(
  worker: { runOnce(workerId: string): Promise<string> },
  workerId: string,
  limit = 30,
): Promise<void> {
  for (let index = 0; index < limit; index += 1) {
    if ((await worker.runOnce(workerId)) === "IDLE") return;
  }
  throw new Error(`${workerId} did not become idle.`);
}

async function loginMatchingEmployer(page: Page): Promise<void> {
  await page.goto("/employer/matching");
  await page.getByRole("button", { name: "Continue as Sarah" }).click();
  await expect(page).toHaveURL(/\/employer\/matching$/u);
}

async function loginCandidate(page: Page): Promise<void> {
  await page.goto("/candidate");
  await page.getByLabel("Start as").selectOption("candidate-42");
  await page.getByRole("button", { name: "Start as Jordan Lee" }).click();
  await expect(page).toHaveURL(/\/candidate$/u);
}

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
  await Promise.all(contexts.map((context) => context.close()));
}

test.afterAll(async () => {
  await Promise.all([matching.pool.end(), stageA.pool.end(), challenge.pool.end(), pool.end()]);
});

test("Direct 17 plus deterministic Explore 42 reaches the existing Redis Stage B chain", async ({
  browser,
}) => {
  await resetMatchingGoldenDemo(pool, MATCHING_ENVIRONMENT);
  await drain(matching.worker, "playwright-matching-worker");

  const employerContext = await browser.newContext();
  const candidateContext = await browser.newContext();
  const employerPage = await employerContext.newPage();
  const candidatePage = await candidateContext.newPage();
  const externalRequests: string[] = [];
  for (const page of [employerPage, candidatePage]) {
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
        externalRequests.push(request.url());
      }
    });
  }

  await Promise.all([loginMatchingEmployer(employerPage), loginCandidate(candidatePage)]);
  await expect(employerPage.getByTestId("eligible-count")).toHaveText("20");
  await expect(employerPage.getByTestId("proofable-count")).toHaveText("8");
  await expect(employerPage.getByTestId("abstain-count")).toHaveText("12");
  await expect(employerPage.getByTestId("matching-state")).toHaveText("READY_FOR_DIRECT");
  await expect(candidatePage.getByTestId("candidate-matching-state")).toHaveText(
    "INTEREST_RECEIVED",
  );
  expect(
    await employerPage.evaluate(async () =>
      fetch("/api/v1/candidate/opportunities/opp-senior-backend-1").then(
        (response) => response.status,
      ),
    ),
  ).toBe(401);
  expect(
    await candidatePage.evaluate(async () =>
      fetch("/api/v1/employer/opportunities/opp-senior-backend-1/matching").then(
        (response) => response.status,
      ),
    ),
  ).toBe(401);
  await expect(candidatePage.locator("body")).not.toContainText("Direct");
  await expect(candidatePage.locator("body")).not.toContainText("Explore");
  await expect(candidatePage.locator("body")).not.toContainText("20 eligible");

  const candidate17Card = employerPage
    .locator("article.matching-card")
    .filter({ hasText: "Candidate 17" });
  await candidate17Card.getByRole("button", { name: "Choose as Direct" }).click();

  const reserveRequest: { current: Request | null } = { current: null };
  employerPage.on("request", (request) => {
    if (request.url().includes("/reserve-attention") && request.method() === "POST") {
      reserveRequest.current = request;
    }
  });
  await employerPage.getByRole("button", { name: "Reserve 2 attention slots" }).click();
  const allocationReceipt = employerPage.getByTestId("allocation-receipt");
  await expect(allocationReceipt).toContainText("candidate-17");
  await expect(allocationReceipt).toContainText("candidate-42");
  await expect(allocationReceipt).toContainText("onlyboth-explore-v1-00024");
  await expect(allocationReceipt).toContainText("review-window-17");
  await expect(allocationReceipt).toContainText("review-window-42");

  const capturedReserve = reserveRequest.current;
  if (capturedReserve === null)
    throw new Error("The browser did not issue ReserveMatchedAttention.");
  const reserveHeaders = await capturedReserve.allHeaders();
  const reserveBody = capturedReserve.postData();
  if (reserveBody === null) throw new Error("ReserveMatchedAttention did not contain JSON.");
  const duplicate = await employerPage.evaluate(
    async ({ body, csrfToken, idempotencyKey }) => {
      const response = await fetch("/api/v1/opportunities/opp-senior-backend-1/reserve-attention", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Idempotency-Key": idempotencyKey,
        },
        body,
      });
      return response.status;
    },
    {
      body: reserveBody,
      csrfToken: reserveHeaders["x-csrf-token"] ?? "",
      idempotencyKey: reserveHeaders["idempotency-key"] ?? "",
    },
  );
  expect(duplicate).toBe(200);
  const stale = await employerPage.evaluate(
    async ({ body, csrfToken }) => {
      const response = await fetch("/api/v1/opportunities/opp-senior-backend-1/reserve-attention", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Idempotency-Key": "matching-stale-tab",
        },
        body,
      });
      return { status: response.status, payload: await response.json() };
    },
    { body: reserveBody, csrfToken: reserveHeaders["x-csrf-token"] ?? "" },
  );
  expect(stale).toEqual({
    status: 409,
    payload: { error: { code: "STALE_MATCHING_CYCLE_VERSION" } },
  });

  await expect(candidatePage.getByTestId("candidate-matching-state")).toHaveText(
    "HUMAN_REVIEW_RESERVED",
    { timeout: 2_000 },
  );
  await expect(candidatePage.getByText("Sarah Chen")).toBeVisible();
  await expect(candidatePage.getByText("6 minutes")).toBeVisible();
  await expect(candidatePage.getByText("PROHIBITED")).toBeVisible();
  await expect(candidatePage.locator("body")).not.toContainText("candidate-17");
  await expect(candidatePage.locator("body")).not.toContainText("EXPLORE");

  await candidatePage.getByRole("button", { name: "Accept six-minute proof" }).click();
  await expect(candidatePage.getByTestId("candidate-matching-state")).toHaveText("STAGE_A_ACTIVE");
  await expect(stageA.worker.runOnce("playwright-stage-a-worker")).resolves.toBe("PROCESSED");
  await drain(challenge.worker, "playwright-recommendation-worker", 12);
  await expect(candidatePage.getByTestId("candidate-checkpoint-panel")).toContainText(
    "CHECKPOINT_PENDING",
    { timeout: 2_000 },
  );

  await employerPage.goto("/employer");
  await expect(employerPage.getByRole("button", { name: "Authorize this challenge" })).toHaveCount(
    3,
  );
  const redisCard = employerPage
    .locator("article.recommendation-card")
    .filter({ hasText: "payment-retry/redis-failover@1" });
  await redisCard.getByRole("button", { name: "Authorize this challenge" }).click();
  await expect(employerPage.locator(".authorization-receipt")).toContainText(
    "payment-retry/redis-failover@1",
  );
  await expect(challenge.worker.runOnce("playwright-redis-worker")).resolves.toBe("PROCESSED");
  await expect(candidatePage.locator(".selected-branch-card")).toContainText(
    "payment-retry/redis-failover@1",
    { timeout: 2_000 },
  );
  await expect(candidatePage.locator(".selected-branch-card")).toContainText(
    "verification-42-redis-failover",
  );
  expect(externalRequests).toEqual([]);
  await closeContexts([employerContext, candidateContext]);
});
