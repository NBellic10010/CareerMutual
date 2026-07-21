import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import nextConfig from "../../apps/web/next.config";
import {
  ADDITIONAL_SYNTHETIC_JOB_POSTS,
  MATCHING_LAB_SYNTHETIC_JOB_POSTS,
  SIX_CANDIDATE_MATCH_LAB_REFS,
  SYNTHETIC_ELIGIBILITY_DEMO_TARGETS,
  resolveFunctionalDemoEmployerReviewPolicy,
} from "../../scripts/functional-demo-job-fixtures";

const root = process.cwd();

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as Record<string, unknown>;
}

describe("workspace scaffold", () => {
  it("uses the CareerMutual hired-mark brand across every user-visible shell", () => {
    const brandedSurfaces = [
      "apps/web/app/layout.tsx",
      "apps/web/app/prototype/page.tsx",
      "apps/web/src/components/app-shell.tsx",
      "apps/web/src/components/functional/login-chooser.tsx",
      "apps/web/src/components/prototype/prototype-experience.tsx",
    ];

    for (const surface of brandedSurfaces) {
      const source = readFileSync(join(root, surface), "utf8");
      expect(source, surface).toContain("CareerMutual");
      expect(source, surface).not.toContain("OnlyBoth");
    }

    const trademark = readFileSync(
      join(root, "apps/web/src/components/career-mutual-trademark.tsx"),
      "utf8",
    );
    expect(trademark).toContain('aria-label="Hired"');
    expect(trademark).toContain("career-mutual-hire-check");
  });

  it("documents distinct development-time Codex and bounded runtime GPT-5.6 roles", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");

    expect(readme).toContain("## How Codex and GPT-5.6 are used");
    expect(readme).toContain("It is not a runtime hiring agent");
    expect(readme).toContain("Candidate Eligibility Match");
    expect(readme).toContain("Employer Evidence Analyst");
    expect(readme).toContain("### Role in making and running the demo");
    expect(readme).toContain("`RECORDED_LIVE`");
    expect(readme).toContain("`SYNTHETIC_PRELOADED`");
    expect(readme).toContain("never silently replaced");
  });

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

  it("adds six technology Match Lab JobPosts with a source-compatible many-to-many target matrix", () => {
    expect(MATCHING_LAB_SYNTHETIC_JOB_POSTS).toHaveLength(6);
    expect(new Set(MATCHING_LAB_SYNTHETIC_JOB_POSTS.map(({ title }) => title)).size).toBe(6);
    expect(
      MATCHING_LAB_SYNTHETIC_JOB_POSTS.every(({ role_category }) => role_category === "TECHNOLOGY"),
    ).toBe(true);

    const publishedTitles = new Set([
      "Senior Backend Reliability Engineer",
      ...ADDITIONAL_SYNTHETIC_JOB_POSTS.map(({ title }) => title),
      ...MATCHING_LAB_SYNTHETIC_JOB_POSTS.map(({ title }) => title),
    ]);
    for (const candidateRef of SIX_CANDIDATE_MATCH_LAB_REFS) {
      const targets = SYNTHETIC_ELIGIBILITY_DEMO_TARGETS[candidateRef];
      expect(targets, candidateRef).toBeDefined();
      expect(targets!.length, candidateRef).toBeGreaterThan(0);
      for (const target of targets!) {
        expect(publishedTitles.has(target.title), `${candidateRef}:${target.title}`).toBe(true);
      }
    }

    for (const job of MATCHING_LAB_SYNTHETIC_JOB_POSTS) {
      expect(job.critical_challenge.parts.length, job.title).toBeGreaterThan(0);
      expect(job.critical_question, job.title).toBe(job.critical_challenge.objective);
      expect(job.eligibility_match_policy.access_mode, job.title).toBe("EVIDENCE_MATCH_REQUIRED");
      if (job.eligibility_match_policy.access_mode === "EVIDENCE_MATCH_REQUIRED") {
        const acceptedNames = new Set(
          job.eligibility_match_policy.accepted_tags.map(({ public_name }) => public_name),
        );
        for (const targets of Object.values(SYNTHETIC_ELIGIBILITY_DEMO_TARGETS)) {
          for (const target of targets.filter(({ title }) => title === job.title)) {
            expect(acceptedNames.has(target.tag), `${job.title}:${target.tag}`).toBe(true);
          }
        }
      }
    }
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
    expect(ignore).toContain(".railway/");
  });

  it("declares one fail-closed Railway entrypoint for the Web and Worker services", () => {
    const railway = readJson("railway.json") as {
      build: { builder: string; buildCommand: string };
      deploy: { startCommand: string; restartPolicyType: string };
    };
    const rootPackage = readJson("package.json");
    const scripts = rootPackage.scripts as Record<string, string>;
    const applicationPackage = readJson("packages/application/package.json");
    const workerPackage = readJson("apps/worker/package.json");
    const applicationDependencies = applicationPackage.dependencies as Record<string, string>;
    const workerDependencies = workerPackage.dependencies as Record<string, string>;
    const entrypoint = readFileSync(join(root, "scripts/start-railway.mjs"), "utf8");
    const environmentExample = readFileSync(join(root, ".env.example"), "utf8");

    expect(railway.build.builder).toBe("RAILPACK");
    expect(railway.build.buildCommand).toContain("pnpm build");
    expect(railway.deploy.startCommand).toBe("pnpm start:railway");
    expect(railway.deploy.restartPolicyType).toBe("ON_FAILURE");
    expect(scripts["start:railway"]).toBe("node scripts/start-railway.mjs");
    expect(entrypoint).toContain('serviceRole === "web"');
    expect(entrypoint).toContain('serviceRole === "worker"');
    expect(entrypoint).toContain('runPnpm(["db:migrate"])');
    expect(applicationDependencies.zod).toBe("catalog:");
    expect(workerDependencies.tsx).toBe("4.23.1");
    expect(environmentExample).toContain("OBJECT_STORE_FORCE_PATH_STYLE=true");
    expect(environmentExample).toContain("OBJECT_STORE_ALLOWED_ORIGINS=");
  });

  it("pins Turbopack to this monorepo instead of an unrelated parent lockfile", () => {
    expect(nextConfig.turbopack?.root).toBe(root);
  });
});
