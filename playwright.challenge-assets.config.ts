import { defineConfig } from "@playwright/test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  throw new Error("BLOCKED: Challenge Asset E2E requires TEST_DATABASE_URL.");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1)).toLowerCase();
if (!/(?:^|[_-])test(?:$|[_-])/u.test(databaseName)) {
  throw new Error("REFUSED: Challenge Asset E2E requires a dedicated test database.");
}

const childEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "OPENAI_API_KEY",
  ),
);
const webPort = Number(process.env.PLAYWRIGHT_PORT ?? "3100");
const baseURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "challenge-asset-upload.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 4_000 },
  use: { baseURL, trace: "retain-on-failure" },
  reporter: [["line"]],
  webServer: {
    command: `pnpm --filter @onlyboth/web exec next start --hostname 127.0.0.1 --port ${webPort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...childEnvironment,
      DATABASE_URL: testDatabaseUrl,
      DEMO_MODE: "true",
      DEMO_SESSION_SECRET: "challenge-assets-playwright-secret-at-least-32-characters",
      RUNTIME_MODE: "GOLDEN_REPLAY",
      SANDBOX_ADAPTER: "replay",
      REPLAY_ID: "payment-retry-v1",
      OBJECT_STORE_ENDPOINT: process.env.OBJECT_STORE_ENDPOINT ?? "http://127.0.0.1:9000",
      OBJECT_STORE_REGION: process.env.OBJECT_STORE_REGION ?? "us-east-1",
      OBJECT_STORE_BUCKET: process.env.OBJECT_STORE_BUCKET ?? "onlyboth-private",
      OBJECT_STORE_ACCESS_KEY_ID: process.env.OBJECT_STORE_ACCESS_KEY_ID ?? "onlyboth-local",
      OBJECT_STORE_SECRET_ACCESS_KEY:
        process.env.OBJECT_STORE_SECRET_ACCESS_KEY ?? "onlyboth-local-development-secret",
    },
  },
});
