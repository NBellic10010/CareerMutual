import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CatalogSelectionError, ChallengeCatalogRegistry } from "./registry";

const manifestJson = readFileSync(
  new URL("../../../challenges/payment-retry/v1/manifest.json", import.meta.url),
  "utf8",
);
const lockJson = readFileSync(new URL("./catalog.lock.json", import.meta.url), "utf8");

function createRegistry(): ChallengeCatalogRegistry {
  return ChallengeCatalogRegistry.fromJson(manifestJson, lockJson);
}

describe("ChallengeCatalogRegistry", () => {
  it("returns only public allowlisted recommendation metadata", () => {
    const registry = createRegistry();
    const options = registry.listRecommendationOptions(["revise_under_failover"]);

    expect(options.map((option) => `${option.challenge_id}@${option.version}`)).toEqual([
      "payment-retry/redis-failover@1",
      "payment-retry/cross-region-retry@1",
    ]);
    expect(options.every((option) => !("hidden_test_bundle" in option))).toBe(true);
    expect(options.every((option) => !("scenario_fixture" in option))).toBe(true);
  });

  it("resolves only IDs contained in the exact pinned catalog", () => {
    const registry = createRegistry();
    const pin = registry.getVersionPin();

    expect(
      registry.resolveExecutableChallenge("payment-retry/redis-failover@1", pin).hidden_test_bundle,
    ).toBe("hidden-tests/redis-failover/bundle.json");
    expect(() =>
      registry.resolveExecutableChallenge("payment-retry/model-generated@1", pin),
    ).toThrowError(CatalogSelectionError);
    expect(() =>
      registry.resolveExecutableChallenge("payment-retry/redis-failover@1", {
        ...pin,
        manifest_hash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      }),
    ).toThrowError(/pin does not match/u);
  });

  it("rejects duplicate or oversized recommendation sets", () => {
    const registry = createRegistry();
    const pin = registry.getVersionPin();

    expect(() =>
      registry.validateRecommendations(
        ["payment-retry/redis-failover@1", "payment-retry/redis-failover@1"],
        pin,
      ),
    ).toThrowError(/unique/u);
    expect(() =>
      registry.validateRecommendations(
        [
          "payment-retry/redis-failover@1",
          "payment-retry/duplicate-webhook@1",
          "payment-retry/cross-region-retry@1",
          "payment-retry/model-generated@1",
        ],
        pin,
      ),
    ).toThrowError(/between one and three/u);
  });

  it("rejects manifest path traversal before registry construction", () => {
    const manifest = JSON.parse(manifestJson) as {
      challenges: Array<{ scenario_fixture: string }>;
    };
    const firstChallenge = manifest.challenges[0];
    if (firstChallenge === undefined) {
      throw new Error("Expected payment retry challenge fixture.");
    }
    firstChallenge.scenario_fixture = "../outside.json";

    expect(() =>
      ChallengeCatalogRegistry.fromUnknown(manifest, JSON.parse(lockJson) as unknown),
    ).toThrowError(/normalized relative path/u);
  });
});
