import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import nextConfig from "../../apps/web/next.config";
import {
  ADDITIONAL_SYNTHETIC_JOB_POSTS,
  resolveFunctionalDemoEmployerReviewPolicy,
} from "../../scripts/functional-demo-job-fixtures";

const root = process.cwd();

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as Record<string, unknown>;
}

describe("workspace scaffold", () => {
  it("keeps the demo analyst OFF by default and permits explicit consent-gated process analysis", () => {
    expect(resolveFunctionalDemoEmployerReviewPolicy({})).toEqual({
      policy: "OFF",
      disclosureVersion: "employer-ai-review-disclosure@1",
    });
    expect(
      resolveFunctionalDemoEmployerReviewPolicy({
        DEMO_EMPLOYER_AI_REVIEW_POLICY: "ANSWER_PLUS_PROCESS",
      }),
    ).toEqual({
      policy: "ANSWER_PLUS_PROCESS",
      disclosureVersion: "employer-ai-review-disclosure@2",
    });
    expect(() =>
      resolveFunctionalDemoEmployerReviewPolicy({
        DEMO_EMPLOYER_AI_REVIEW_POLICY: "UNBOUNDED",
      }),
    ).toThrow(/DEMO_EMPLOYER_AI_REVIEW_POLICY/u);
  });

  it("seeds twenty cross-domain JobPosts with complete multimodal Critical Challenges", () => {
    expect(ADDITIONAL_SYNTHETIC_JOB_POSTS).toHaveLength(20);
    expect(new Set(ADDITIONAL_SYNTHETIC_JOB_POSTS.map(({ title }) => title)).size).toBe(20);
    expect(
      new Set(ADDITIONAL_SYNTHETIC_JOB_POSTS.map(({ role_category }) => role_category)).size,
    ).toBeGreaterThanOrEqual(10);
    const partKinds = new Set(
      ADDITIONAL_SYNTHETIC_JOB_POSTS.flatMap(({ critical_challenge }) =>
        critical_challenge.parts.map(({ kind }) => kind),
      ),
    );
    expect(partKinds).toEqual(new Set(["TEXT", "AUDIO", "IMAGE", "FILE"]));
    for (const job of ADDITIONAL_SYNTHETIC_JOB_POSTS) {
      expect(job.critical_challenge.parts.length, job.title).toBeGreaterThan(0);
      expect(job.critical_question, job.title).toBe(job.critical_challenge.objective);
    }
    const illustrationRole = ADDITIONAL_SYNTHETIC_JOB_POSTS.find(
      ({ title }) => title === "Senior Brand Illustrator",
    );
    expect(illustrationRole?.review_criteria.map(({ criterion_ref }) => criterion_ref)).toEqual([
      "criterion:brand-direction-choice",
      "criterion:brand-system-adaptation",
      "criterion:creative-rationale",
    ]);
  });

  it("declares the two runtime processes and expected package boundaries", () => {
    const expectedPackages = new Map([
      ["apps/web/package.json", "@onlyboth/web"],
      ["apps/worker/package.json", "@onlyboth/worker"],
      ["packages/ai/package.json", "@onlyboth/ai"],
      ["packages/application/package.json", "@onlyboth/application"],
      ["packages/challenge-catalog/package.json", "@onlyboth/challenge-catalog"],
      ["packages/contracts/package.json", "@onlyboth/contracts"],
      ["packages/db/package.json", "@onlyboth/db"],
      ["packages/demo-replay/package.json", "@onlyboth/demo-replay"],
      ["packages/domain/package.json", "@onlyboth/domain"],
      ["packages/projections/package.json", "@onlyboth/projections"],
      ["packages/sandbox/package.json", "@onlyboth/sandbox"],
      ["packages/testkit/package.json", "@onlyboth/testkit"],
    ]);

    for (const [manifestPath, expectedName] of expectedPackages) {
      expect(readJson(manifestPath).name, manifestPath).toBe(expectedName);
    }
  });

  it("exposes every required stable verification command", () => {
    const rootPackage = readJson("package.json");
    const scripts = rootPackage.scripts as Record<string, string>;

    expect(Object.keys(scripts)).toEqual(
      expect.arrayContaining([
        "format:check",
        "lint",
        "typecheck",
        "test:unit",
        "test:integration",
        "test:security",
        "test:e2e",
        "test:evals",
        "replay:verify",
        "demo:offline",
        "check",
      ]),
    );
  });

  it("keeps Golden Replay as the keyless default runtime", () => {
    const environmentExample = readFileSync(join(root, ".env.example"), "utf8");

    expect(environmentExample).toContain("RUNTIME_MODE=GOLDEN_REPLAY");
    expect(environmentExample).toContain("SANDBOX_ADAPTER=replay");
    expect(environmentExample).toContain("# OPENAI_API_KEY=");
    expect(environmentExample).not.toMatch(/^OPENAI_API_KEY=/mu);
  });

  it("keeps credentials, local auth state, and infrastructure data outside Git", () => {
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");

    expect(ignore).toContain(".env.*");
    expect(ignore).toContain("!.env.example");
    expect(ignore).toContain(".secrets/");
    expect(ignore).toContain("*.pem");
    expect(ignore).toContain("*.key");
    expect(ignore).toContain("**/storage-state*.json");
    expect(ignore).toContain("cookies*.json");
    expect(ignore).toContain("infra/data/");
    expect(ignore).toContain("*.dump");
    expect(ignore).toContain("*.sqlite");
  });

  it("pins Turbopack to this monorepo instead of an unrelated parent lockfile", () => {
    expect(nextConfig.turbopack?.root).toBe(root);
  });
});
