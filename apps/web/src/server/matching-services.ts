import { createHash, randomUUID } from "node:crypto";

import {
  DecideProofWindowHandler,
  ReserveMatchedAttentionHandler,
  type MatchingIdFactory,
  type ProofWindowDecisionIdFactory,
} from "@onlyboth/application";
import { PostgresMatchingStore } from "@onlyboth/db/postgres-matching-store";
import { createPostgresPool } from "@onlyboth/db/postgres-pool";
import { PostgresProofWindowDecisionStore } from "@onlyboth/db/postgres-proof-window-decision-store";

const matchingIds: MatchingIdFactory = {
  nextId: (kind) => `${kind}-${randomUUID()}`,
  boundId: (kind, candidateRef, matchingCycleRef) =>
    process.env.DEMO_MODE === "true"
      ? `${kind}-${candidateRef.slice("candidate-".length)}`
      : `${kind}-${matchingCycleRef}-${candidateRef}-${randomUUID()}`,
};

const proofDecisionIds: ProofWindowDecisionIdFactory = {
  nextId: (kind) => `${kind}-${randomUUID()}`,
};

interface MatchingServiceSingleton {
  readonly store: PostgresMatchingStore;
  readonly reserveAttention: ReserveMatchedAttentionHandler;
  readonly decideProofWindow: DecideProofWindowHandler;
}

const globalServices = globalThis as typeof globalThis & {
  onlyBothMatchingServices?: MatchingServiceSingleton;
};

export function getMatchingServices(): MatchingServiceSingleton {
  if (globalServices.onlyBothMatchingServices !== undefined) {
    return globalServices.onlyBothMatchingServices;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL is required for interactive Matching routes.");
  }
  const pool = createPostgresPool(databaseUrl);
  const matchingStore = new PostgresMatchingStore(pool);
  const services = {
    store: matchingStore,
    reserveAttention: new ReserveMatchedAttentionHandler(matchingStore, matchingIds, (value) =>
      createHash("sha256").update(value, "utf8").digest("hex"),
    ),
    decideProofWindow: new DecideProofWindowHandler(
      new PostgresProofWindowDecisionStore(pool),
      proofDecisionIds,
    ),
  };
  globalServices.onlyBothMatchingServices = services;
  return services;
}
