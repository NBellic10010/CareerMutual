import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.{test,spec}.{ts,tsx}"],
    passWithNoTests: true,
  },
});
