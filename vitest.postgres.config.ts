import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/postgres/**/*.{test,spec}.{ts,tsx}"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
