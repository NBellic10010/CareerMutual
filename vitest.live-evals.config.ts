import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/evals/**/*.live.eval.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 600_000,
  },
});
