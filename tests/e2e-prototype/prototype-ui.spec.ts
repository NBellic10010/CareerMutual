import { expect, test, type Page } from "@playwright/test";

function rejectBackendTraffic(page: Page): string[] {
  const violations: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith("/api/") ||
      request.resourceType() === "fetch" ||
      request.resourceType() === "xhr"
    ) {
      violations.push(`${request.resourceType()}:${url.pathname}`);
    }
  });
  return violations;
}

async function settleForVisualSnapshot(page: Page, delay = 650) {
  await page.waitForTimeout(delay);
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
}

test("Candidate work causes Sarah's answer-only choice and Resume Reveal without backend traffic", async ({
  page,
}, testInfo) => {
  const backendTraffic = rejectBackendTraffic(page);
  await page.goto("/prototype");

  await expect(page.getByText("Local simulated state · no backend connected")).toBeVisible();
  await expect(page.getByTestId("candidate-opportunity")).toBeVisible();
  await page.getByTestId("register-interest").click();
  await expect(page.getByText("No work required yet.")).toBeVisible();

  await page.getByTestId("simulate-slot").click();
  await expect(page.getByTestId("candidate-backed-offer")).toContainText(
    "Sarah committed before asking you to work",
  );
  await page.getByTestId("accept-offer").click();
  await page.getByRole("button", { name: "Load synthetic answer" }).click();
  await page.getByTestId("run-visible-tests").click();
  await page.getByTestId("submit-answer").click();
  await expect(page.getByTestId("candidate-review-pending")).toContainText(
    "Sarah is completing the backed review",
  );

  await page.getByTestId("role-employer").click();
  await expect(page.getByTestId("employer-review-workspace")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Jordan Lee");
  await page.getByRole("radio", { name: /Advance eligible/ }).check();
  await page.getByRole("checkbox", { name: /event-E17/ }).check();
  await page.getByLabel("Still unknown").fill("Cross-region recovery remains untested.");
  await page.getByTestId("record-review").click();

  await expect(page.getByTestId("employer-advancement-board")).toContainText("Slot 08 released");
  await expect(page.getByTestId("employer-advancement-board")).toContainText("8 / 8");
  await expect(page.locator("body")).not.toContainText("Jordan Lee");
  await page.getByTestId("advance-answer-08").click();
  await expect(page.getByRole("dialog")).toContainText("before you see the Resume");
  await expect(page.getByRole("dialog")).not.toContainText("Jordan Lee");
  await page.getByTestId("confirm-advancement").click();

  const reveal = page.getByTestId("employer-resume-reveal");
  await expect(reveal).toContainText("Selection committed before reveal");
  await expect(reveal).toContainText("Evidence stays first");
  await expect(reveal).toContainText("Jordan Lee");
  await expect(reveal).toContainText("Riverside Community College");
  await expect(reveal).toContainText("Deep Proof attention held");
  await settleForVisualSnapshot(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("prototype-reveal-1440.png"),
  });

  await page.getByTestId("role-candidate").click();
  const candidateOutcome = page.getByTestId("candidate-advanced");
  await expect(candidateOutcome).toContainText("Your anonymous work earned the conversation");
  await expect(candidateOutcome).not.toContainText(/Direct|Explore|Cohort/);
  expect(backendTraffic).toEqual([]);
});

test("prototype remains usable at a 390px mobile viewport with no horizontal overflow", async ({
  page,
}, testInfo) => {
  const backendTraffic = rejectBackendTraffic(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/prototype");
  await page.getByTestId("register-interest").click();
  await page.getByTestId("simulate-slot").click();

  await expect(page.getByTestId("candidate-backed-offer")).toBeVisible();
  await expect(page.getByTestId("accept-offer")).toBeVisible();
  await settleForVisualSnapshot(page, 500);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("prototype-backed-offer-390.png"),
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(backendTraffic).toEqual([]);
});

test("role controls and reset remain keyboard operable at the 1024px layout", async ({ page }) => {
  const backendTraffic = rejectBackendTraffic(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/prototype");

  await page.getByTestId("role-employer").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("employer-commitment-dashboard")).toBeVisible();

  await page.getByTestId("role-candidate").focus();
  await page.keyboard.press("Space");
  await page.getByTestId("register-interest").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("No work required yet.")).toBeVisible();

  await page.getByTestId("prototype-reset").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("candidate-opportunity")).toBeVisible();
  expect(backendTraffic).toEqual([]);
});
