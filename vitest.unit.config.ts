import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    environment: "node",
    include: [
      "packages/**/src/**/*.{test,spec}.{ts,tsx}",
      "apps/**/src/**/*.{test,spec}.{ts,tsx}",
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "tests/security/**",
      "tests/integration/**",
      "tests/e2e/**",
      "tests/evals/**",
    ],
  },
});
