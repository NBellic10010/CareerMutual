import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { ChallengeCatalogRegistry } from "@onlyboth/challenge-catalog";
import { buildGoldenReplayViews, loadGoldenReplay } from "@onlyboth/demo-replay";

const root = process.cwd();
const webRoot = join(root, "apps/web");

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry === ".next" || entry === "node_modules") return [];
      return listSourceFiles(path);
    }
    if (/\.d\.ts$/u.test(entry)) return [];
    return /\.(?:css|ts|tsx)$/u.test(entry) ? [path] : [];
  });
}

const forbiddenWebPatterns = [
  {
    label: "remote HTTP asset",
    pattern: /https?:\/\/(?!(?:127\.0\.0\.1|localhost)(?::|\/))/u,
  },
  { label: "Google-hosted Next font", pattern: /next\/font\/google/u },
  { label: "OpenAI credential", pattern: /OPENAI_API_KEY/u },
] as const;

const violations: string[] = [];
for (const path of listSourceFiles(webRoot)) {
  const source = readFileSync(path, "utf8");
  for (const rule of forbiddenWebPatterns) {
    if (rule.pattern.test(source)) {
      violations.push(`${rule.label}: ${path.replace(`${root}/`, "")}`);
    }
  }
}

const replay = loadGoldenReplay();
const views = buildGoldenReplayViews(replay);
const catalog = ChallengeCatalogRegistry.fromJson(
  readFileSync(join(root, "challenges/payment-retry/v1/manifest.json"), "utf8"),
  readFileSync(join(root, "packages/challenge-catalog/src/catalog.lock.json"), "utf8"),
);
const pin = catalog.getVersionPin();

for (const candidate of replay.candidates) {
  catalog.resolveExecutableChallenge(candidate.proof.selectedChallengeId, pin);
}

if (violations.length > 0) {
  throw new Error(`Offline demo source check failed:\n${violations.join("\n")}`);
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: "ok",
      runtimeMode: "GOLDEN_REPLAY",
      externalWebDependencies: 0,
      replayId: replay.replayId,
      candidates: replay.candidates.length,
      projections: [views.employer.view, "CANDIDATE", views.judge.view],
      catalogRef: pin.catalog_ref,
    },
    null,
    2,
  )}\n`,
);
