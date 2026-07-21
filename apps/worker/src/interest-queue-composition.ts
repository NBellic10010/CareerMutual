import { createHash, randomUUID } from "node:crypto";

import {
  ExpireAnswerInvitationHandler,
  InterestQueueWorker,
  OfferNextQueuedInterestHandler,
  type AnswerInvitationDecisionIdFactory,
  type BlindReviewApplicationIdFactory,
} from "@onlyboth/application";
import {
  PostgresAnswerInvitationDecisionStore,
  PostgresInterestQueueStore,
  createPostgresPool,
} from "@onlyboth/db";
import type { Pool } from "pg";

import type { WorkerConfig } from "./config.js";

const ids: BlindReviewApplicationIdFactory = {
  nextId: (kind) => `${kind}-${randomUUID()}`,
};

const decisionIds: AnswerInvitationDecisionIdFactory = {
  nextId: (kind) => `${kind}-${randomUUID()}`,
};

function hashQueueValue(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export interface InterestQueueWorkerComposition {
  readonly pool: Pool;
  readonly worker: InterestQueueWorker;
  readonly expiry: ExpireAnswerInvitationHandler;
}

export function createInterestQueueWorkerComposition(
  config: WorkerConfig,
): InterestQueueWorkerComposition {
  const pool = createPostgresPool(config.databaseUrl);
  const store = new PostgresInterestQueueStore(pool);
  const decisionStore = new PostgresAnswerInvitationDecisionStore(pool);
  const command = new OfferNextQueuedInterestHandler(store, ids, hashQueueValue);
  return {
    pool,
    worker: new InterestQueueWorker(store, command),
    expiry: new ExpireAnswerInvitationHandler(decisionStore, decisionIds),
  };
}
