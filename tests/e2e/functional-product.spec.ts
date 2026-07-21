import { execFileSync } from "node:child_process";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { createFunctionalProductWorkerComposition } from "../../apps/worker/src/functional-product-composition";
import { createPostgresPool, runPostgresMigrations } from "../../packages/db/src/index";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("BLOCKED: the functional E2E suite requires TEST_DATABASE_URL.");
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
const functionalWorker = createFunctionalProductWorkerComposition(databaseUrl, objectEnvironment);

async function login(
  page: Page,
  role: "Candidate 42" | "Candidate 27" | "Recruiter",
): Promise<void> {
  const recruiter = role === "Recruiter";
  const actorRef =
    role === "Candidate 42"
      ? "candidate-42"
      : role === "Candidate 27"
        ? "candidate-27"
        : "reviewer-sarah-chen";
  const displayName =
    role === "Candidate 42" ? "Jordan Lee" : role === "Candidate 27" ? "Avery Stone" : "Sarah Chen";
  await page.goto(recruiter ? "/employer" : "/candidate");
  await page.getByLabel("Start as").selectOption(actorRef);
  await page
    .getByRole("button", {
      name: `Start as ${displayName}`,
    })
    .click();
  await expect(page).toHaveURL(recruiter ? /\/employer$/u : /\/candidate$/u);
}

async function close(contexts: readonly BrowserContext[]): Promise<void> {
  await Promise.all(contexts.map((context) => context.close()));
}

async function loginCandidateActor(
  page: Page,
  actorRef: string,
  displayName: string,
): Promise<void> {
  await page.goto("/candidate");
  await page.getByLabel("Start as").selectOption(actorRef);
  await page.getByRole("button", { name: `Start as ${displayName}` }).click();
  await expect(page).toHaveURL(/\/candidate$/u);
}

test.beforeAll(async () => {
  await runPostgresMigrations(pool);
  await pool.query(`
    TRUNCATE TABLE
      blind_review_command_receipts,
      inbox_messages,
      job_post_drafts,
      employer_attention_wallets,
      candidate_credit_accounts,
      opportunities,
      domain_events
    CASCADE
  `);
  execFileSync("pnpm", ["demo:reset:functional"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, DEMO_MODE: "true" },
    stdio: "pipe",
  });
});

test.afterAll(async () => {
  await Promise.all([functionalWorker.pool.end(), pool.end()]);
});

test("CareerMutual branding and performance-first login remain intact on mobile", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(page).toHaveTitle("CareerMutual");
  await expect(page.getByRole("heading", { name: "Let performance talk first!" })).toBeVisible();
  await expect(page.locator(".career-mutual-trademark")).toHaveCount(3);
  await expect(page.locator(".career-mutual-hire-signal")).toHaveCount(3);
  await expect(page.locator('[data-login-role="candidate"]')).toHaveCSS(
    "background-image",
    /login-candidate-performance-v2\.webp/u,
  );
  await expect(page.locator('[data-login-role="recruiter"]')).toHaveCSS(
    "background-image",
    /login-recruiter-review-v2\.webp/u,
  );
  await expect(page.getByText("OnlyBoth", { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBrandLayout = await page.evaluate(() => {
    const marks = [...document.querySelectorAll<HTMLElement>(".career-mutual-trademark")];
    const portraits = [...document.querySelectorAll<HTMLElement>(".login-role-portrait")];
    const portraitLayer = document.querySelector<HTMLElement>(".login-role-portraits");
    const card = document.querySelector<HTMLElement>(".login-card");
    return {
      documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      marksFit: marks.every((mark) => {
        const rect = mark.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth + 1;
      }),
      portraitCount: portraits.length,
      portraitsBehindCard:
        portraitLayer !== null &&
        card !== null &&
        Number(getComputedStyle(portraitLayer).zIndex) < Number(getComputedStyle(card).zIndex) &&
        portraits.every((portrait) => Number(getComputedStyle(portrait).opacity) < 0.4),
    };
  });
  expect(mobileBrandLayout).toEqual({
    documentFits: true,
    marksFit: true,
    portraitCount: 2,
    portraitsBehindCard: true,
  });
});

test("Candidate Eligibility Feed differs by Passport evidence while OPEN_TO_ALL remains shared", async ({
  browser,
}) => {
  const backendContext = await browser.newContext();
  const illustrationContext = await browser.newContext();
  const backendPage = await backendContext.newPage();
  const illustrationPage = await illustrationContext.newPage();

  await Promise.all([login(backendPage, "Candidate 42"), login(illustrationPage, "Candidate 27")]);

  await expect(backendPage.locator("article.job-row")).toHaveCount(4);
  await expect(backendPage.getByText("Senior Backend Reliability Engineer")).toBeVisible();
  await expect(backendPage.getByText("Customer Success Lead")).toBeVisible();
  await expect(backendPage.getByText("Senior Brand Illustrator")).toHaveCount(0);
  await expect(backendPage.getByText(/RECORDED_LIVE/iu)).toBeVisible();

  await backendPage
    .locator("article.job-row")
    .filter({ hasText: "Customer Success Lead" })
    .getByRole("link", { name: "View role" })
    .click();
  const candidateRoleArtwork = backendPage.locator('[data-role-page-artwork="candidate-role"]');
  await expect(candidateRoleArtwork).toHaveCSS(
    "background-image",
    /candidate-roll-up-sleeves-v1\.webp/u,
  );
  await expect(backendPage.getByText("Declare legal and logistical requirements")).toBeVisible();
  const desktopRoleLayout = await backendPage.locator(".job-detail-grid").evaluate((grid) => {
    const primary = grid.querySelector<HTMLElement>(".job-detail-primary")!;
    const contract = grid.querySelector<HTMLElement>(".job-contract-card")!;
    const challenge = grid.querySelector<HTMLElement>(".critical-challenge")!;
    const action = grid.querySelector<HTMLElement>(".action-card")!;
    const primaryRect = primary.getBoundingClientRect();
    const contractRect = contract.getBoundingClientRect();
    const challengeRect = challenge.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    return {
      challengeDirectlyFollowsContract: Math.abs(challengeRect.top - contractRect.bottom - 20) <= 1,
      primaryColumnAligned:
        Math.abs(contractRect.left - challengeRect.left) <= 1 &&
        Math.abs(contractRect.right - challengeRect.right) <= 1,
      usesFormerBlankSpace: challengeRect.top < actionRect.bottom,
      columnsDoNotOverlap: primaryRect.right <= actionRect.left,
    };
  });
  expect(desktopRoleLayout).toEqual({
    challengeDirectlyFollowsContract: true,
    primaryColumnAligned: true,
    usesFormerBlankSpace: true,
    columnsDoNotOverlap: true,
  });
  await backendPage.setViewportSize({ width: 390, height: 844 });
  const declarationLayout = await backendPage
    .getByRole("group", { name: "Eligibility declarations" })
    .evaluate((fieldset) => {
      const fieldsetRect = fieldset.getBoundingClientRect();
      const textInputs = [
        ...fieldset.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])'),
      ];
      const artwork = document.querySelector<HTMLElement>(
        '[data-role-page-artwork="candidate-role"]',
      )!;
      const hero = document.querySelector<HTMLElement>(".job-detail-hero")!;
      const artworkRect = artwork.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      const artworkStyle = getComputedStyle(artwork);
      return {
        documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
        fieldsetFits: fieldsetRect.left >= 0 && fieldsetRect.right <= window.innerWidth + 1,
        artworkIsDecorative: artwork.getAttribute("aria-hidden") === "true",
        artworkOpacity: Number(artworkStyle.opacity) < 0.5,
        artworkFillsHero:
          artworkStyle.backgroundSize === "cover" &&
          artworkStyle.maskImage === "none" &&
          artworkRect.top <= heroRect.top + 1 &&
          artworkRect.right >= heroRect.right - 1 &&
          artworkRect.bottom >= heroRect.bottom - 1 &&
          artworkRect.left <= heroRect.left + 1,
        inputsFit: textInputs.every((input) => {
          const rect = input.getBoundingClientRect();
          return rect.left >= fieldsetRect.left && rect.right <= fieldsetRect.right;
        }),
      };
    });
  expect(declarationLayout).toEqual({
    documentFits: true,
    fieldsetFits: true,
    artworkIsDecorative: true,
    artworkOpacity: true,
    artworkFillsHero: true,
    inputsFit: true,
  });

  await expect(illustrationPage.locator("article.job-row")).toHaveCount(2);
  await expect(illustrationPage.getByText("Senior Brand Illustrator")).toBeVisible();
  await expect(illustrationPage.getByText("Customer Success Lead")).toBeVisible();
  await expect(illustrationPage.getByText("Senior Backend Reliability Engineer")).toHaveCount(0);
  const hiddenDetailStatus = await illustrationPage.evaluate(async () =>
    fetch("/api/v1/candidate/opportunities/functional-demo-job%3Aopportunity%3A1").then(
      (response) => response.status,
    ),
  );
  expect(hiddenDetailStatus).toBe(404);

  await close([backendContext, illustrationContext]);
});

test("six Candidate Passports produce distinct many-to-many Match Lab feeds", async ({
  browser,
}) => {
  const scenarios = [
    {
      actorRef: "candidate-42",
      displayName: "Jordan Lee",
      visible: [
        "Senior Backend Reliability Engineer",
        "Payment Workflow Backend Engineer",
        "Payments Reliability Incident Lead",
      ],
      hidden: "Cloud Recovery Platform Engineer",
    },
    {
      actorRef: "candidate-17",
      displayName: "Maya Patel",
      visible: [
        "Senior Backend Reliability Engineer",
        "Payment Workflow Backend Engineer",
        "Payments Reliability Incident Lead",
      ],
      hidden: "Financial Data Reconciliation Engineer",
    },
    {
      actorRef: "candidate-03",
      displayName: "Theo Brooks",
      visible: ["Payment Workflow Backend Engineer", "Partner Event Integration Engineer"],
      hidden: "Distributed Systems Verification Engineer",
    },
    {
      actorRef: "candidate-08",
      displayName: "Elena Garcia",
      visible: ["Payments Reliability Incident Lead", "Cloud Recovery Platform Engineer"],
      hidden: "Partner Event Integration Engineer",
    },
    {
      actorRef: "candidate-11",
      displayName: "Sam Okafor",
      visible: ["Financial Data Reconciliation Engineer"],
      hidden: "Payment Workflow Backend Engineer",
    },
    {
      actorRef: "candidate-19",
      displayName: "Priya Shah",
      visible: ["Senior Backend Reliability Engineer", "Distributed Systems Verification Engineer"],
      hidden: "Cloud Recovery Platform Engineer",
    },
  ] as const;

  for (const scenario of scenarios) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginCandidateActor(page, scenario.actorRef, scenario.displayName);
    await expect(page.getByText("Customer Success Lead")).toBeVisible();
    for (const title of scenario.visible) await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(scenario.hidden)).toHaveCount(0);
    await context.close();
  }
});

test("persistent roles complete the backed application and sequential human-review loop", async ({
  browser,
}) => {
  const employerContext = await browser.newContext();
  const candidateContext = await browser.newContext();
  const employerPage = await employerContext.newPage();
  const candidatePage = await candidateContext.newPage();
  const externalRequests: string[] = [];
  for (const page of [employerPage, candidatePage]) {
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (!["127.0.0.1", "localhost"].includes(url.hostname)) externalRequests.push(request.url());
    });
  }

  await login(employerPage, "Recruiter");
  await expect(employerPage.locator(".role-breadcrumb")).toContainText("Recruiter");
  await expect(employerPage.getByRole("link", { name: "Evidence Passport" })).toHaveCount(0);
  await expect(
    employerPage.getByRole("heading", { name: "Commit attention. See the work." }),
  ).toBeVisible();
  await expect(employerPage.locator("main")).toContainText(
    "Every opened answer creates a named review debt",
  );
  await employerPage.getByRole("link", { name: "Revealed Candidates" }).first().click();
  await expect(employerPage.getByText("No Candidate Resume is available yet.")).toBeVisible();
  await expect(employerPage.locator("body")).not.toContainText("Jordan Lee");
  await employerPage.goto("/employer");
  await expect(employerPage.locator("article.operation-row")).toHaveCount(27);
  await expect(employerPage.getByText("Senior Financial Reporting Accountant")).toBeVisible();
  await expect(
    employerPage.getByText("Business Development Manager", { exact: true }),
  ).toBeVisible();
  await expect(employerPage.getByText("Senior Brand Illustrator")).toBeVisible();
  await expect(employerPage.getByText("Regional Sales Director")).toBeVisible();

  await employerPage.setViewportSize({ width: 1440, height: 900 });
  await employerPage.getByRole("button", { name: "Create JobPost" }).click();
  const composer = employerPage.getByRole("dialog", { name: "New JobPost" });
  const desktopComposerLayout = await composer.evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    const tagCheckboxes = [
      ...dialog.querySelectorAll<HTMLInputElement>(
        ".eligibility-tag-selector input[type=checkbox]",
      ),
    ];
    return {
      dialogFits:
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth + 1 &&
        rect.bottom <= window.innerHeight + 1,
      scrollIsContained: dialog.scrollHeight > dialog.clientHeight,
      tagCheckboxesBounded: tagCheckboxes.every(
        (checkbox) => checkbox.getBoundingClientRect().width <= 24,
      ),
      documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });
  expect(desktopComposerLayout).toEqual({
    dialogFits: true,
    scrollIsContained: true,
    tagCheckboxesBounded: true,
    documentFits: true,
  });
  await expect(employerPage.getByLabel("Access mode")).toHaveValue("EVIDENCE_MATCH_REQUIRED");
  await expect(employerPage.getByLabel("Search 100 sealed background tags")).toBeVisible();
  await expect(employerPage.getByRole("button", { name: "Add custom tag" })).toBeVisible();
  await employerPage.setViewportSize({ width: 390, height: 844 });
  const mobileComposerLayout = await composer.evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>(
        "input:not([type=checkbox]), select, textarea, button",
      ),
    ];
    return {
      dialogFits:
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth + 1 &&
        rect.bottom <= window.innerHeight + 1,
      controlsFit: controls.every((control) => {
        const controlRect = control.getBoundingClientRect();
        return controlRect.left >= rect.left && controlRect.right <= rect.right + 1;
      }),
      documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });
  expect(mobileComposerLayout).toEqual({
    dialogFits: true,
    controlsFit: true,
    documentFits: true,
  });
  await employerPage.setViewportSize({ width: 1280, height: 720 });
  await expect(composer.getByRole("button", { name: "Video · later" })).toBeDisabled();
  await composer.getByRole("button", { name: "+ image" }).click();
  await composer
    .getByLabel("Accessible alt text")
    .fill("A synthetic one-pixel coral source used to verify the sealed image upload path.");
  await composer.locator('input[type="file"]').setInputFiles({
    name: "synthetic-direction-board.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n9sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  const challengeAssetComplete = employerPage.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/employer/challenge-assets/complete") &&
      response.request().method() === "POST",
  );
  await composer.getByRole("button", { name: "Validate & upload" }).click();
  expect((await challengeAssetComplete).status()).toBe(200);
  await expect(composer.getByText("Upload verified")).toBeVisible();
  await expect(composer.getByText("1/1 uploaded Parts verified.")).toBeVisible();
  await employerPage.getByLabel("Access mode").selectOption("OPEN_TO_ALL");
  await expect(employerPage.getByText("No Passport is required.")).toBeVisible();
  await employerPage.getByLabel("Access mode").selectOption("EVIDENCE_MATCH_REQUIRED");
  await employerPage.getByLabel("Public role title").fill("Platform Integrity Engineer");
  await employerPage.getByRole("button", { name: "Save Draft" }).click();
  const draft = employerPage.locator("article.draft-row").filter({
    hasText: "Platform Integrity Engineer",
  });
  await expect(draft).toBeVisible();
  await draft.getByRole("button", { name: /Credits & publish/u }).click();
  await expect(
    employerPage.locator("article.operation-row").filter({
      hasText: "Platform Integrity Engineer",
    }),
  ).toBeVisible();

  await login(candidatePage, "Candidate 42");
  await expect(candidatePage.locator(".role-breadcrumb")).toContainText("Candidate");
  await expect(candidatePage.getByRole("link", { name: "Revealed Candidates" })).toHaveCount(0);
  await expect(candidatePage.getByLabel("Candidate Credit balance")).toContainText("3");
  await expect(candidatePage.locator("article.job-row")).toHaveCount(4);
  await expect(candidatePage.getByText("Senior Brand Illustrator")).toHaveCount(0);
  await expect(candidatePage.getByRole("link", { name: "Open Evidence Passport" })).toBeVisible();
  await candidatePage.getByRole("link", { name: "Open Evidence Passport" }).click();
  await expect(candidatePage.getByRole("heading", { name: "Bounded sources" })).toBeVisible();
  await expect(candidatePage.locator("article.evidence-ledger-row")).toHaveCount(4);
  await expect(candidatePage.getByText("Candidate only", { exact: true })).toBeVisible();
  await expect(candidatePage.getByRole("heading", { name: "Highest education" })).toBeVisible();
  await expect(candidatePage.getByLabel("Education level")).toHaveValue("BACHELOR");
  await expect(candidatePage.getByText("Synthetic preloaded snapshot")).toBeVisible();
  await expect(
    candidatePage.locator("article.evidence-ledger-row").nth(3).getByLabel("Display title"),
  ).toHaveValue("Employment verification — redacted synthetic mock");
  await candidatePage.goto("/candidate");
  await expect(candidatePage.getByText("Why this role reached you").first()).toBeVisible();
  await expect(candidatePage.getByText("evidence:github-payment-retry")).toBeVisible();
  const backedJob = candidatePage.locator("article.job-row").filter({
    hasText: "Senior Backend Reliability Engineer",
  });
  await expect(backedJob).toContainText("BACKED OFFERED");
  await backedJob.getByRole("link", { name: "Open backed offer" }).click();
  await candidatePage.getByRole("button", { name: "Apply with 1 Credit" }).click();
  const consent = candidatePage.getByRole("dialog", {
    name: "Confirm this is a real application.",
  });
  await expect(consent).toContainText("all platform GPT turns are disclosed");
  await expect(consent).toContainText("browser records page visibility and window focus");
  for (const checkbox of await consent.getByRole("checkbox").all()) await checkbox.check();
  const acceptResponsePromise = candidatePage.waitForResponse(
    (response) =>
      response.url().includes("/answer-invitations/") &&
      response.url().endsWith("/accept") &&
      response.request().method() === "POST",
  );
  await consent.getByRole("button", { name: "Consume 1 Credit & start" }).click();
  const acceptResponse = await acceptResponsePromise;
  expect(acceptResponse.status()).toBe(201);
  const acceptReceipt = (await acceptResponse.json()) as { answer_session_ref: string };
  const sessionRef = acceptReceipt.answer_session_ref;
  await expect(
    candidatePage.getByRole("dialog", { name: /Senior Backend Reliability Engineer/u }),
  ).toBeVisible();
  await expect(candidatePage).toHaveURL(/\/candidate\/jobs\//u);

  await expect(candidatePage.getByText("Server deadline")).toBeVisible();
  const draftResponsePromise = candidatePage.waitForResponse(
    (response) =>
      response.url().includes(`/answer-sessions/${sessionRef}/drafts`) &&
      response.request().method() === "POST",
  );
  await candidatePage
    .locator('[contenteditable="true"]')
    .fill(
      "Persist a durable payment-attempt ledger, reuse one provider idempotency key, and falsify the invariant with crash-boundary tests.",
    );
  await candidatePage
    .getByRole("dialog", { name: /Senior Backend Reliability Engineer/u })
    .getByRole("heading", { name: "Senior Backend Reliability Engineer", exact: true })
    .click();
  const draftResponse = await draftResponsePromise;
  expect(draftResponse.status()).toBe(200);
  const draftHeaders = await draftResponse.request().allHeaders();
  const csrfToken = draftHeaders["x-csrf-token"] ?? "";
  expect(csrfToken.length).toBeGreaterThan(10);
  await expect(
    candidatePage
      .getByRole("dialog", { name: /Senior Backend Reliability Engineer/u })
      .locator(".save-indicator"),
  ).toHaveText("SAVED");

  const voiceResult = await candidatePage.evaluate(
    async ({ csrf, session }) => {
      const state = (await fetch(`/api/v1/candidate/answer-sessions/${session}`).then((response) =>
        response.json(),
      )) as { version: number };
      const bytes = new TextEncoder().encode("synthetic voice memo bytes");
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = `sha256:${Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("")}`;
      const headers = (key: string) => ({
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        "Idempotency-Key": key,
      });
      const presignResponse = await fetch(
        `/api/v1/candidate/answer-sessions/${session}/artifacts/presign`,
        {
          method: "POST",
          headers: headers("e2e:voice:presign"),
          body: JSON.stringify({
            schema_version: "create-answer-artifact-upload-command@1",
            kind: "VOICE_MEMO",
            content_type: "audio/webm",
            content_length: bytes.byteLength,
            expected_session_version: state.version,
          }),
        },
      );
      const presign = (await presignResponse.json()) as {
        artifact_ref: string;
        upload_url: string;
        required_upload_headers: { "If-None-Match": "*" };
        error?: { code?: string; message?: string };
      };
      if (!presignResponse.ok) {
        return {
          presignStatus: presignResponse.status,
          uploadStatus: null,
          completeStatus: null,
          artifactRef: presign.artifact_ref,
          presignError: presign.error,
          stateVersion: state.version,
        };
      }
      const uploadResponse = await fetch(presign.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": "audio/webm",
          ...presign.required_upload_headers,
        },
        body: bytes,
      });
      const completeResponse = await fetch(
        `/api/v1/candidate/answer-sessions/${session}/artifacts/complete`,
        {
          method: "POST",
          headers: headers("e2e:voice:complete"),
          body: JSON.stringify({
            schema_version: "complete-answer-artifact-upload-command@1",
            artifact_ref: presign.artifact_ref,
            sha256,
            expected_session_version: state.version,
          }),
        },
      );
      return {
        presignStatus: presignResponse.status,
        uploadStatus: uploadResponse.status,
        completeStatus: completeResponse.status,
        artifactRef: presign.artifact_ref,
        presignError: presign.error,
        stateVersion: state.version,
      };
    },
    { csrf: csrfToken, session: sessionRef },
  );
  if (voiceResult.presignStatus !== 201) {
    throw new Error(`Voice presign failed: ${JSON.stringify(voiceResult)}`);
  }
  expect(voiceResult).toMatchObject({ presignStatus: 201, uploadStatus: 200, completeStatus: 200 });

  await candidatePage.goto(`/candidate/answer-sessions/${encodeURIComponent(sessionRef)}`);
  await candidatePage
    .getByPlaceholder("Ask for critique, alternatives, or a clearer structure…")
    .fill("What failure boundary is still underspecified?");
  await candidatePage.getByRole("button", { name: "Ask disclosed GPT" }).click();
  const workerOutcomes: string[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const outcome = await functionalWorker.worker.runOnce("playwright-functional-worker");
    workerOutcomes.push(outcome);
    if (outcome === "IDLE") break;
  }
  expect(workerOutcomes).toContain("ASSISTANT_FAILED");
  expect(workerOutcomes).toContain("VOICE_TRANSCRIPTION_FAILED");
  await candidatePage.reload();
  await expect(
    candidatePage.getByText("Unavailable: OPENAI_KEY_UNAVAILABLE", { exact: true }),
  ).toBeVisible();
  await expect(candidatePage.getByText(/Transcript FAILED/u)).toBeVisible();
  await candidatePage.getByRole("button", { name: "Submit immutable answer" }).click();
  await expect(candidatePage.getByText("Your answer is immutable.")).toBeVisible();
  await candidatePage.reload();
  await expect(candidatePage.getByText("Your answer is immutable.")).toBeVisible();
  await expect(candidatePage.getByText("Process summary", { exact: true })).toBeVisible();
  await expect(candidatePage.getByText("Longest no server-recorded revision")).toBeVisible();

  await employerPage.reload();
  const reviewJob = employerPage.locator("article.operation-row").filter({
    hasText: "Senior Backend Reliability Engineer",
  });
  await expect(reviewJob).toContainText("Review debt");
  await reviewJob.getByRole("link", { name: "Review current answer" }).click();
  await expect(employerPage.locator('[data-role-page-artwork="recruiter-operations"]')).toHaveCSS(
    "background-image",
    /recruiter-glasses-review-v1\.webp/u,
  );
  await expect(employerPage.locator('[data-role-page-artwork="recruiter-operations"]')).toHaveCSS(
    "background-size",
    "cover",
  );
  const recruiterArtworkFillsHeader = await employerPage
    .locator('[data-role-page-artwork="recruiter-operations"]')
    .evaluate((artwork) => {
      const header = document.querySelector<HTMLElement>(".review-header")!;
      const artworkRect = artwork.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const artworkStyle = getComputedStyle(artwork);
      return (
        artworkStyle.maskImage === "none" &&
        artworkRect.top <= headerRect.top + 1 &&
        artworkRect.right >= headerRect.right - 1 &&
        artworkRect.bottom >= headerRect.bottom - 1 &&
        artworkRect.left <= headerRect.left + 1
      );
    });
  expect(recruiterArtworkFillsHeader).toBe(true);
  await expect(
    employerPage.getByText("Your next answer stays locked until this commits."),
  ).toBeVisible();
  await expect(employerPage.locator("body")).not.toContainText("Candidate 42");
  await expect(employerPage.locator("body")).not.toContainText("Résumé");
  await expect(employerPage.getByText("VOICE_MEMO")).toBeVisible();
  await expect(employerPage.getByText("GPT_TRACE")).toBeVisible();
  await employerPage.getByText(/Disclosed platform GPT trace/u).click();
  await expect(employerPage.getByText("OPENAI_KEY_UNAVAILABLE")).toBeVisible();
  await employerPage.getByText("AI Evidence Analyst · DISABLED").click();
  await expect(employerPage.getByText("This sealed JobPost uses human review only.")).toBeVisible();
  await employerPage.getByRole("radio", { name: "ADVANCE ELIGIBLE" }).check();
  await employerPage
    .getByLabel("Evidence-linked review comment")
    .fill(
      "The answer establishes one durable idempotency invariant and names a concrete crash test.",
    );
  await employerPage
    .getByLabel("Still unknown")
    .fill("Cross-region provider reconciliation remains outside this bounded answer.");
  await employerPage.getByRole("button", { name: "Record review & release Slot" }).click();
  await expect(employerPage.getByText("Review receipt recorded.")).toBeVisible();
  await expect(employerPage.getByText(/Slot released/u)).toBeVisible();
  await employerPage.getByRole("button", { name: "Next answer" }).click();
  await expect(employerPage.getByText("No submitted answer is waiting.")).toBeVisible();
  await employerPage.goto("/employer/candidates");
  await expect(employerPage.getByText("Answer passed before identity reveal")).toBeVisible();
  await expect(employerPage.getByRole("heading", { name: "Jordan Lee" })).toBeVisible();
  await expect(employerPage.getByText("Lakeview State University")).toBeVisible();
  await expect(employerPage.getByText("1 / 1")).toBeVisible();

  await candidatePage.goto("/candidate");
  await expect(candidatePage.getByLabel("Candidate Credit balance")).toContainText("2");
  await expect(candidatePage.locator("body")).not.toContainText("Continue as Candidate 42");
  await expect(candidatePage.getByText("Direct", { exact: true })).toHaveCount(0);
  await expect(candidatePage.getByText("Explore", { exact: true })).toHaveCount(0);
  await employerPage.goto("/demo");
  await expect(employerPage.getByText("Synthetic — Pre-recorded external inputs")).toBeVisible();
  await expect(employerPage.getByText("Offline · no external requests")).toBeVisible();
  expect(externalRequests).toEqual([]);
  await candidatePage.getByRole("button", { name: "Sign out" }).click();
  await expect(candidatePage.getByLabel("Start as")).toBeVisible();
  await close([employerContext, candidateContext]);
});

test("Candidate Evidence Passport remains operable at a 390px viewport", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await login(page, "Candidate 42");
  await page.goto("/candidate/evidence-passport");
  await expect(page.getByRole("heading", { name: "Bounded sources" })).toBeVisible();
  await expect(page.locator("article.evidence-ledger-row")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await context.close();
});

test("full-screen Sandbox records browser focus and seals persisted work on the second departure", async ({
  browser,
}) => {
  await pool.query(`
    TRUNCATE TABLE
      candidate_discovery_projections,
      candidate_job_discovery_signals,
      candidate_discovery_signal_sets,
      candidate_evidence_passport_snapshots,
      candidate_evidence_passport_drafts,
      blind_review_command_receipts,
      inbox_messages,
      job_post_drafts,
      employer_attention_wallets,
      candidate_credit_accounts,
      opportunities,
      domain_events
    CASCADE
  `);
  execFileSync("pnpm", ["demo:reset:functional"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, DEMO_MODE: "true" },
    stdio: "pipe",
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const candidatePage = await context.newPage();
  const awayPage = await context.newPage();
  await awayPage.goto("about:blank");
  await login(candidatePage, "Candidate 42");
  const backedJob = candidatePage.locator("article.job-row").filter({
    hasText: "Senior Backend Reliability Engineer",
  });
  await backedJob.getByRole("link", { name: "Open backed offer" }).click();
  await candidatePage.getByRole("button", { name: "Apply with 1 Credit" }).click();
  const consent = candidatePage.getByRole("dialog", {
    name: "Confirm this is a real application.",
  });
  for (const checkbox of await consent.getByRole("checkbox").all()) await checkbox.check();
  const acceptResponsePromise = candidatePage.waitForResponse(
    (response) => response.url().endsWith("/accept") && response.request().method() === "POST",
  );
  await consent.getByRole("button", { name: "Consume 1 Credit & start" }).click();
  const receipt = (await (await acceptResponsePromise).json()) as { answer_session_ref: string };
  await expect(
    candidatePage.getByRole("dialog", { name: /Senior Backend Reliability Engineer/u }),
  ).toBeVisible();
  await candidatePage.keyboard.press("Escape");
  await expect(
    candidatePage.getByRole("dialog", { name: /Senior Backend Reliability Engineer/u }),
  ).toBeVisible();
  await expect(candidatePage.getByText(/0\/2 away/iu)).toBeVisible();

  const draftResponse = candidatePage.waitForResponse(
    (response) => response.url().includes("/drafts") && response.request().method() === "POST",
  );
  await candidatePage
    .locator('[contenteditable="true"]')
    .fill("Persist this answer before the disclosed Focus Policy seals the workspace.");
  await candidatePage.getByRole("heading", { name: "Think with the trace visible." }).click();
  expect((await draftResponse).status()).toBe(200);
  await expect(candidatePage.getByText(/0\/2 away/iu)).toBeVisible();
  await candidatePage.setViewportSize({ width: 390, height: 844 });
  await expect(
    candidatePage.getByRole("dialog", { name: /Senior Backend Reliability Engineer/u }),
  ).toBeVisible();
  expect(
    await candidatePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await candidatePage.setViewportSize({ width: 1440, height: 1000 });

  const leaveAndReturn = async () => {
    const awaySignal = candidatePage.waitForResponse(
      (response) =>
        response.url().includes("/activity-events") &&
        response.request().method() === "POST" &&
        ["WINDOW_BLURRED", "VISIBILITY_HIDDEN"].includes(
          String((response.request().postDataJSON() as { event_type?: string }).event_type),
        ),
    );
    await awayPage.bringToFront();
    await candidatePage.evaluate(() => window.dispatchEvent(new Event("blur")));
    await awaySignal;
    await pool.query(
      `UPDATE answer_session_focus_projections
          SET away_started_at = clock_timestamp() - interval '3 seconds'
        WHERE answer_session_ref = $1 AND away_started_at IS NOT NULL`,
      [receipt.answer_session_ref],
    );
    const returnSignal = candidatePage.waitForResponse(
      (response) =>
        response.url().includes("/activity-events") &&
        response.request().method() === "POST" &&
        response.request().postDataJSON().event_type === "WINDOW_FOCUSED",
    );
    await candidatePage.bringToFront();
    await candidatePage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await returnSignal;
  };

  await leaveAndReturn();
  await expect(candidatePage.getByText("FOCUS NOTICE 01 / 02")).toBeVisible();
  await candidatePage
    .getByRole("button", { name: "I understand — return to the challenge" })
    .click();
  await leaveAndReturn();
  await expect(candidatePage.getByText("AUTO-SUBMIT REQUESTED")).toBeVisible();

  const outcomes: string[] = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const outcome = await functionalWorker.worker.runOnce("playwright-focus-worker");
    outcomes.push(outcome);
    if (outcome === "FOCUS_POLICY_PROGRESS") break;
  }
  expect(outcomes).toContain("FOCUS_POLICY_PROGRESS");
  await expect(candidatePage.getByText("Your answer is immutable.")).toBeVisible({
    timeout: 5_000,
  });
  const submission = await pool.query<{ submission_source: string }>(
    "SELECT submission_source FROM answer_submissions WHERE answer_session_ref = $1",
    [receipt.answer_session_ref],
  );
  expect(submission.rows[0]?.submission_source).toBe("FOCUS_POLICY_AUTO");
  await context.close();
});
