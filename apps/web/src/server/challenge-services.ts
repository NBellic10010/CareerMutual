import { randomUUID } from "node:crypto";

import {
  SelectHumanChallengeHandler,
  type ApplicationIdFactory,
  type ChallengeCatalogSelectionPort,
} from "@onlyboth/application";
import { ChallengeCatalogRegistry } from "@onlyboth/challenge-catalog";
import { PostgresChallengeStore } from "@onlyboth/db/postgres-challenge-store";
import { createPostgresPool } from "@onlyboth/db/postgres-pool";
import catalogLock from "../../../../packages/challenge-catalog/src/catalog.lock.json";
import challengeManifest from "../../../../challenges/payment-retry/v1/manifest.json";

function catalogPort(registry: ChallengeCatalogRegistry): ChallengeCatalogSelectionPort {
  const pin = registry.getVersionPin();
  return {
    catalogRef: registry.catalogRef,
    catalogHash: registry.manifestHash,
    listRecommendationOptions(capabilityRefs) {
      return registry.listRecommendationOptions(capabilityRefs).map((option) => ({
        challengeId: option.challenge_id,
        version: option.version,
        capabilityRefs: option.capability_refs,
        candidateNotice: option.candidate_notice,
      }));
    },
    resolveChallenge(challengeRef) {
      const challenge = registry.resolveExecutableChallenge(challengeRef, pin);
      return {
        challengeRef,
        candidateNotice: challenge.candidate_notice,
        capabilityRefs: challenge.capability_refs,
      };
    },
  };
}

const ids: ApplicationIdFactory = {
  nextId: (kind) => `${kind}-${randomUUID()}`,
};

interface ServiceSingleton {
  readonly store: PostgresChallengeStore;
  readonly selectChallenge: SelectHumanChallengeHandler;
}

const globalServices = globalThis as typeof globalThis & {
  onlyBothChallengeServices?: ServiceSingleton;
};

export function getChallengeServices(): ServiceSingleton {
  if (globalServices.onlyBothChallengeServices !== undefined) {
    return globalServices.onlyBothChallengeServices;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL is required for interactive Review Window routes.");
  }
  const pool = createPostgresPool(databaseUrl);
  const store = new PostgresChallengeStore(pool);
  const registry = ChallengeCatalogRegistry.fromUnknown(challengeManifest, catalogLock);
  const services = {
    store,
    selectChallenge: new SelectHumanChallengeHandler(store, catalogPort(registry), ids),
  };
  globalServices.onlyBothChallengeServices = services;
  return services;
}
