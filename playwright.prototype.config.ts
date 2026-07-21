import { defineConfig } from "@playwright/test";

const frontendOnlyEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined &&
      ![
        "DATABASE_URL",
        "TEST_DATABASE_URL",
        "OPENAI_API_KEY",
        "DEMO_SESSION_SECRET",
        "RUNTIME_MODE",
        "SANDBOX_ADAPTER",
      ].includes(entry[0]),
  ),
);

export default defineConfig({
  testDir: "./tests/e2e-prototype",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 3_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  reporter: [["line"], ["html", { open: "never", outputFolder: "playwright-report-prototype" }]],
  webServer: {
    command: "pnpm --filter @onlyboth/web exec next dev -H 127.0.0.1 -p 3100",
    url: "http://127.0.0.1:3100/prototype",
    reuseExistingServer: false,
    timeout: 120_000,
    env: frontendOnlyEnvironment,
  },
});
