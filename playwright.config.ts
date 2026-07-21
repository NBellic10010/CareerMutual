import { defineConfig } from "@playwright/test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  throw new Error(
    "BLOCKED: Playwright requires an accessible PostgreSQL 16 TEST_DATABASE_URL. No in-memory Web state is permitted.",
  );
}
const testDatabaseName = decodeURIComponent(
  new URL(testDatabaseUrl).pathname.slice(1),
).toLowerCase();
if (!/(?:^|[_-])test(?:$|[_-])/u.test(testDatabaseName)) {
  throw new Error(
    "REFUSED: Playwright TEST_DATABASE_URL must name a dedicated database containing a 'test' segment because the suite resets its data.",
  );
}

const childEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "OPENAI_API_KEY",
  ),
);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "functional-product.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 2_000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  reporter: [["line"], ["html", { open: "never" }]],
  webServer: {
    command: "pnpm --filter @onlyboth/web start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...childEnvironment,
      DATABASE_URL: testDatabaseUrl,
      DEMO_MODE: "true",
      DEMO_SESSION_SECRET: "playwright-only-synthetic-secret-at-least-32-characters",
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
