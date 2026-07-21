import { expect, test, type BrowserContext, type Page, type Request } from "@playwright/test";

import {
  createChallengeWorkerComposition,
  type ChallengeWorkerComposition,
} from "../../apps/worker/src/challenge-composition";
import { createPostgresPool, resetCandidate42GoldenDemo } from "../../packages/db/src/index";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("BLOCKED: the E2E suite requires TEST_DATABASE_URL.");
}

const BRANCHES = [
  {
    challengeRef: "payment-retry/redis-failover@1",
    branchRef: "verification-42-redis-failover",
  },
  {
    challengeRef: "payment-retry/duplicate-webhook@1",
    branchRef: "verification-42-duplicate-webhook",
  },
  {
    challengeRef: "payment-retry/cross-region-retry@1",
    branchRef: "verification-42-cross-region-retry",
  },
] as const;
const DEMO_ENVIRONMENT = {
  DEMO_MODE: "true",
  RUNTIME_MODE: "GOLDEN_REPLAY",
  REPLAY_ID: "payment-retry-v1",
} as const;

const pool = createPostgresPool(databaseUrl);
let composition: ChallengeWorkerComposition;

async function drainWorker(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    if ((await composition.worker.runOnce("playwright-golden-worker")) === "IDLE") {
      return;
    }
  }
  throw new Error("The Golden Replay Worker did not become idle.");
}

async function logIn(page: Page, role: "Sarah" | "Candidate 42"): Promise<void> {
  await page.goto(role === "Sarah" ? "/employer" : "/candidate");
  await page.getByRole("button", { name: `Continue as ${role}` }).click();
  await expect(page).toHaveURL(role === "Sarah" ? /\/employer$/u : /\/candidate$/u);
}

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
  await Promise.all(contexts.map((context) => context.close()));
}

test.beforeAll(async () => {
  composition = createChallengeWorkerComposition({
    runtimeMode: "GOLDEN_REPLAY",
    databaseUrl,
    sandboxAdapter: "replay",
    replayId: "payment-retry-v1",
  });
});

test.afterAll(async () => {
  await composition?.pool.end();
  await pool.end();
});

test("Sarah's real authorization drives all three Candidate and Sandbox branches", async ({
  browser,
}) => {
  for (const [branchIndex, branch] of BRANCHES.entries()) {
    await resetCandidate42GoldenDemo(pool, DEMO_ENVIRONMENT);
    await drainWorker();

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

    await Promise.all([logIn(employerPage, "Sarah"), logIn(candidatePage, "Candidate 42")]);
    await expect(candidatePage.getByText("CHECKPOINT_PENDING")).toBeVisible();
    await expect(candidatePage.locator("body")).not.toContainText("redis-failover@1");
    expect(
      await employerPage.evaluate(async () =>
        fetch("/api/v1/candidate/review-windows/review-window-42").then(
          (response) => response.status,
        ),
      ),
    ).toBe(401);
    expect(
      await candidatePage.evaluate(async () =>
        fetch("/api/v1/employer/review-windows/review-window-42").then(
          (response) => response.status,
        ),
      ),
    ).toBe(401);
    expect(
      await employerPage.evaluate(async () =>
        fetch("/api/v1/review-windows/review-window-42/challenge/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }).then((response) => response.status),
      ),
    ).toBe(403);
    await expect(
      employerPage.getByRole("button", { name: "Authorize this challenge" }),
    ).toHaveCount(3);

    const selectionRequest: { current: Request | null } = { current: null };
    employerPage.on("request", (request) => {
      if (request.url().includes("/challenge/select") && request.method() === "POST") {
        selectionRequest.current = request;
      }
    });
    const card = employerPage
      .locator("article.recommendation-card")
      .filter({ hasText: branch.challengeRef });
    await card.getByRole("button", { name: "Authorize this challenge" }).click();
    await expect(employerPage.locator(".authorization-receipt")).toContainText(branch.challengeRef);

    const capturedRequest = selectionRequest.current;
    if (capturedRequest === null) {
      throw new Error("The browser did not issue SelectHumanChallenge.");
    }
    if (branchIndex === 0) {
      const headers = await capturedRequest.allHeaders();
      const originalBody = capturedRequest.postData();
      if (originalBody === null) {
        throw new Error("SelectHumanChallenge did not contain a JSON body.");
      }
      const replayed = await employerPage.evaluate(
        async ({ body, csrfToken, idempotencyKey }) => {
          const response = await fetch("/api/v1/review-windows/review-window-42/challenge/select", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken,
              "Idempotency-Key": idempotencyKey,
            },
            body,
          });
          return { status: response.status, payload: await response.json() };
        },
        {
          body: originalBody,
          csrfToken: headers["x-csrf-token"] ?? "",
          idempotencyKey: headers["idempotency-key"] ?? "",
        },
      );
      expect(replayed.status).toBe(200);
      const stale = await employerPage.evaluate(
        async ({ body, csrfToken }) => {
          const response = await fetch("/api/v1/review-windows/review-window-42/challenge/select", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken,
              "Idempotency-Key": "playwright-stale-tab",
            },
            body,
          });
          return { status: response.status, payload: await response.json() };
        },
        { body: originalBody, csrfToken: headers["x-csrf-token"] ?? "" },
      );
      expect(stale).toMatchObject({
        status: 409,
        payload: { error: { code: "STALE_AGGREGATE_VERSION" } },
      });
    }

    await expect(composition.worker.runOnce("playwright-selected-worker")).resolves.toBe(
      "PROCESSED",
    );
    await expect(candidatePage.locator(".selected-branch-card")).toContainText(
      branch.challengeRef,
      { timeout: 2_000 },
    );
    await expect(candidatePage.locator(".selected-branch-card")).toContainText(branch.branchRef);
    expect(externalRequests).toEqual([]);
    await closeContexts([employerContext, candidateContext]);
  }
});
