import { createHash, randomUUID } from "node:crypto";

import {
  CandidateEvidencePassportService,
  FunctionalProductService,
  DecideAnswerInvitationHandler,
  SubmitCandidateInterestHandler,
  type CandidateDiscoveryIdFactory,
  type CandidateInterestIdFactory,
  type FunctionalProductIdFactory,
} from "@onlyboth/application";
import { PostgresAnswerInvitationDecisionStore } from "@onlyboth/db/postgres-answer-invitation-decision-store";
import { PostgresCandidateInterestStore } from "@onlyboth/db/postgres-candidate-interest-store";
import { PostgresCandidateDiscoveryStore } from "@onlyboth/db/postgres-candidate-discovery-store";
import { PostgresFunctionalProductStore } from "@onlyboth/db/postgres-functional-product-store";
import { createPostgresPool } from "@onlyboth/db/postgres-pool";
import { S3ObjectStore } from "@onlyboth/storage";

const ids: FunctionalProductIdFactory = {
  nextId: (kind) => `${kind}:${randomUUID()}`,
};

const interestIds: CandidateInterestIdFactory = {
  nextId: (kind) => `${kind}:${randomUUID()}`,
};

const discoveryIds: CandidateDiscoveryIdFactory = {
  nextId: (kind) => `${kind}:${randomUUID()}`,
};

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

interface FunctionalServiceSingleton {
  readonly store: PostgresFunctionalProductStore;
  readonly candidateDiscoveryStore: PostgresCandidateDiscoveryStore;
  readonly candidateEvidencePassport: CandidateEvidencePassportService;
  readonly service: FunctionalProductService;
  readonly submitInterest: SubmitCandidateInterestHandler;
  readonly decideInvitation: DecideAnswerInvitationHandler;
}

const globalServices = globalThis as typeof globalThis & {
  onlyBothFunctionalServices?: FunctionalServiceSingleton;
};

export function getFunctionalServices(): FunctionalServiceSingleton {
  if (globalServices.onlyBothFunctionalServices !== undefined) {
    return globalServices.onlyBothFunctionalServices;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL is required for the functional product routes.");
  }
  const objectStore = new S3ObjectStore({
    endpoint: process.env.OBJECT_STORE_ENDPOINT ?? "http://127.0.0.1:9000",
    region: process.env.OBJECT_STORE_REGION ?? "us-east-1",
    bucket: process.env.OBJECT_STORE_BUCKET ?? "onlyboth-private",
    accessKeyId: process.env.OBJECT_STORE_ACCESS_KEY_ID ?? "onlyboth-local",
    secretAccessKey:
      process.env.OBJECT_STORE_SECRET_ACCESS_KEY ?? "onlyboth-local-development-secret",
    forcePathStyle: true,
  });
  const pool = createPostgresPool(databaseUrl);
  const store = new PostgresFunctionalProductStore(pool, objectStore);
  const candidateDiscoveryStore = new PostgresCandidateDiscoveryStore(pool, store);
  const services = {
    store,
    candidateDiscoveryStore,
    candidateEvidencePassport: new CandidateEvidencePassportService(
      candidateDiscoveryStore,
      discoveryIds,
    ),
    service: new FunctionalProductService(store, objectStore, ids),
    submitInterest: new SubmitCandidateInterestHandler(
      new PostgresCandidateInterestStore(pool),
      interestIds,
      sha256,
    ),
    decideInvitation: new DecideAnswerInvitationHandler(
      new PostgresAnswerInvitationDecisionStore(pool),
      { nextId: (kind) => `${kind}:${randomUUID()}` },
    ),
  };
  globalServices.onlyBothFunctionalServices = services;
  return services;
}
