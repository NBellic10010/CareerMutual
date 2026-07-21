import { readFileSync } from "node:fs";

import {
  SelectHumanChallengeHandler,
  type ApplicationIdFactory,
  type ChallengeCatalogSelectionPort,
  type ChallengeSelectionApplicationError,
} from "../../packages/application/src/index";
import { ChallengeCatalogRegistry } from "../../packages/challenge-catalog/src/index";
import {
  PostgresChallengeStore,
  createPostgresPool,
  resetCandidate42GoldenDemo,
  rollbackLatestPostgresMigration,
  runPostgresMigrations,
} from "../../packages/db/src/index";
import {
  createChallengeWorkerComposition,
  type ChallengeWorkerComposition,
} from "../../apps/worker/src/challenge-composition";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error(
    "BLOCKED: test:postgres requires an accessible PostgreSQL 16 TEST_DATABASE_URL. No in-memory store was substituted.",
  );
}

const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)).toLowerCase();
if (!/(?:^|[_-])test(?:$|[_-])/u.test(databaseName)) {
  throw new Error(
    "REFUSED: TEST_DATABASE_URL must name a dedicated database containing a 'test' segment because this suite truncates its schema.",
  );
}

const manifestJson = readFileSync(
  new URL("../../challenges/payment-retry/v1/manifest.json", import.meta.url),
  "utf8",
);
const lockJson = readFileSync(
  new URL("../../packages/challenge-catalog/src/catalog.lock.json", import.meta.url),
  "utf8",
);
const DEMO_ENVIRONMENT = {
  DEMO_MODE: "true",
  RUNTIME_MODE: "GOLDEN_REPLAY",
  REPLAY_ID: "payment-retry-v1",
} as const;
const CHALLENGE_BRANCHES = [
  {
    challengeRef: "payment-retry/redis-failover@1",
    branchRef: "verification-42-redis-failover",
  },
  {
    challengeRef: "payment-retry/duplicate-webhook@1",
    branchRef: "verification-42-duplicate-webhook",
  },
  {
    challengeRef: "payment-retry/cross-region-retry@1",
    branchRef: "verification-42-cross-region-retry",
  },
] as const;

function createCatalogPort(registry: ChallengeCatalogRegistry): ChallengeCatalogSelectionPort {
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
        capabilityRefs: challenge.capability_refs,
        candidateNotice: challenge.candidate_notice,
      };
    },
  };
}

let idSequence = 0;
const ids: ApplicationIdFactory = {
  nextId: (kind) => `${kind}-postgres-${++idSequence}`,
};
const pool = createPostgresPool(databaseUrl);
let composition: ChallengeWorkerComposition;
let initialMigrationResult: readonly string[] = [];

async function drainWorker(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    if ((await composition.worker.runOnce("postgres-acceptance-worker")) === "IDLE") {
      return;
    }
  }
  throw new Error("The PostgreSQL acceptance Worker did not become idle.");
}

async function prepareReadyCandidate42(): Promise<PostgresChallengeStore> {
  await resetCandidate42GoldenDemo(pool, DEMO_ENVIRONMENT);
  await drainWorker();
  const store = new PostgresChallengeStore(pool);
  const employer = await store.getEmployerProjection("review-window-42");
  const candidate = await store.getCandidateProjection("review-window-42");
  expect(employer?.recommendation.status).toBe("READY");
  expect(employer?.recommendation.options).toHaveLength(3);
  expect(candidate).toMatchObject({ state: "CHECKPOINT_PENDING", selected_challenge: null });
  return store;
}

describe.sequential("Candidate 42 PostgreSQL vertical acceptance", () => {
  beforeAll(async () => {
    await pool.query("SELECT current_setting('server_version_num')::integer AS version_num");
    await runPostgresMigrations(pool);
    await pool.query(`
      TRUNCATE TABLE
        blind_review_command_receipts,
        inbox_messages,
        review_windows,
        opportunities,
        domain_events
      CASCADE
    `);
    while ((await rollbackLatestPostgresMigration(pool)) !== null) {
      // Roll back every repository-owned migration to prove a fresh migration path.
    }
    initialMigrationResult = await runPostgresMigrations(pool);
    composition = createChallengeWorkerComposition({
      runtimeMode: "GOLDEN_REPLAY",
      databaseUrl,
      sandboxAdapter: "replay",
      replayId: "payment-retry-v1",
    });
  });

  afterAll(async () => {
    await composition?.pool.end();
    await pool.end();
  });

  it("applies the pure SQL migration fresh, idempotently, and against PostgreSQL 16+", async () => {
    const version = await pool.query<{ version_num: number }>(
      "SELECT current_setting('server_version_num')::integer AS version_num",
    );
    expect(version.rows[0]?.version_num).toBeGreaterThanOrEqual(160_000);
    expect(initialMigrationResult).toEqual([
      "0001_challenge_recommendation_vertical",
      "0002_matching_vertical",
      "0003_blind_answer_first",
      "0004_blind_review_runtime_pins",
      "0005_candidate_interest_and_answer_invitation_decisions",
      "0006_functional_product_vertical",
      "0007_review_sla_breach_settlement",
      "0008_candidate_evidence_passport",
      "0009_candidate_answer_focus_policy",
      "0010_employer_ai_review_analyst",
      "0011_answer_behavior_profile",
      "0012_candidate_education_and_review_reveal",
      "0013_ai_backed_eligibility_match",
      "0014_eligibility_policy_hash_scope",
      "0015_employer_challenge_assets",
    ]);
    await expect(runPostgresMigrations(pool)).resolves.toEqual([]);

    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name`,
      [
        [
          "review_windows",
          "proof_sessions",
          "stage_a_evidence",
          "hiring_intelligence_requests",
          "ai_model_runs",
          "ai_source_refs",
          "ai_outputs",
          "domain_events",
          "outbox_messages",
          "inbox_messages",
          "employer_review_window_projections",
          "candidate_review_window_projections",
        ],
      ],
    );
    expect(tables.rows).toHaveLength(12);
  });

  it("rolls back event writes and rejects a stale compare-and-swap", async () => {
    const store = await prepareReadyCandidate42();
    await expect(
      store.runInTransaction(async (transaction) => {
        await transaction.appendDomainEvent({
          eventId: "event-rollback-probe",
          eventType: "StageASubmitted",
          eventVersion: 1,
          aggregateType: "ReviewWindow",
          aggregateId: "rollback-probe",
          aggregateVersion: 1,
          correlationId: "postgres-acceptance",
          occurredAt: transaction.databaseNow,
          payload: {
            type: "StageASubmitted",
            reviewWindowId: "rollback-probe",
            snapshotId: "rollback-probe-snapshot",
          },
        });
        throw new Error("Injected transaction rollback.");
      }),
    ).rejects.toThrow("Injected transaction rollback");
    const rolledBack = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM domain_events WHERE event_id = 'event-rollback-probe'",
    );
    expect(rolledBack.rows[0]?.count).toBe("0");

    await expect(
      store.runInTransaction(async (transaction) => {
        const window = await transaction.loadReviewWindow("review-window-42");
        if (window === undefined) {
          throw new Error("Candidate 42 was not seeded.");
        }
        await transaction.saveReviewWindow(
          { ...window, version: window.version + 1 },
          window.version - 1,
        );
      }),
    ).rejects.toMatchObject({ code: "OPTIMISTIC_CONCURRENCY_CONFLICT" });
  });

  it("keeps validated AI output immutable and source refs veiled", async () => {
    const store = await prepareReadyCandidate42();
    const employer = await store.getEmployerProjection("review-window-42");
    const outputRef = employer?.recommendation.output_ref;
    expect(outputRef).toBeTruthy();
    await expect(
      pool.query("UPDATE ai_outputs SET output_hash = output_hash WHERE id = $1", [outputRef]),
    ).rejects.toThrow(/immutable/iu);

    const persisted = await pool.query<{ combined: string }>(
      `SELECT concat_ws(' ', request.input_json::text, output.validated_json::text) AS combined
         FROM hiring_intelligence_requests AS request
         JOIN ai_outputs AS output ON output.request_id = request.id
        WHERE output.id = $1`,
      [outputRef],
    );
    expect(persisted.rows[0]?.combined).not.toMatch(
      /school_name|previous_employer|referral_source|legal_name|candidate_photo/iu,
    );
  });

  it("deduplicates a repeated Stage A job without regressing the READY projection", async () => {
    const store = await prepareReadyCandidate42();
    await pool.query(
      `INSERT INTO outbox_messages (
         message_id, message_type, message_version, event_id, idempotency_key,
         correlation_id, payload, available_at
       ) VALUES (
         'outbox-stage-a-duplicate', 'StageASubmitted', 1,
         'event-stage-a-submitted-42', 'StageASubmitted:review-window-42:3:duplicate-probe',
         'postgres-duplicate-probe', '{"reviewWindowId":"review-window-42"}'::jsonb,
         clock_timestamp()
       )`,
    );
    await expect(composition.worker.runOnce("postgres-duplicate-worker")).resolves.toBe(
      "PROCESSED",
    );
    const employer = await store.getEmployerProjection("review-window-42");
    expect(employer?.recommendation).toMatchObject({ status: "READY" });
    expect(employer?.recommendation.options).toHaveLength(3);
    const counts = await pool.query<{ request_count: string; job_count: string }>(
      `SELECT
         (SELECT count(*)::text FROM hiring_intelligence_requests) AS request_count,
         (SELECT count(*)::text FROM outbox_messages
           WHERE message_type = 'RecommendChallengesRequested') AS job_count`,
    );
    expect(counts.rows[0]).toEqual({ request_count: "1", job_count: "1" });
  });

  it.each(CHALLENGE_BRANCHES)(
    "commits Sarah's $challengeRef authorization once and projects $branchRef",
    async ({ challengeRef, branchRef }) => {
      const store = await prepareReadyCandidate42();
      const registry = ChallengeCatalogRegistry.fromJson(manifestJson, lockJson);
      const handler = new SelectHumanChallengeHandler(store, createCatalogPort(registry), ids);
      const employer = await store.getEmployerProjection("review-window-42");
      const outputRef = employer?.recommendation.output_ref;
      if (outputRef === null || outputRef === undefined) {
        throw new Error("The Golden recommendation output was not projected.");
      }
      const request = {
        reviewWindowId: "review-window-42",
        actor: { role: "EMPLOYER" as const, actorId: "reviewer-sarah-chen" },
        idempotencyKey: `postgres-selection-${challengeRef}`,
        correlationId: `postgres-correlation-${challengeRef}`,
        command: {
          schema_version: "select-human-challenge-command@1" as const,
          selection_source: "AI_RECOMMENDATION" as const,
          recommendation_output_ref: outputRef,
          challenge_ref: challengeRef,
          expected_version: 3,
        },
      };
      const [firstReceipt, duplicateReceipt] = await Promise.all([
        handler.execute(request),
        handler.execute(request),
      ]);
      expect(duplicateReceipt).toEqual(firstReceipt);

      await expect(
        handler.execute({
          ...request,
          idempotencyKey: `${request.idempotencyKey}-stale-tab`,
        }),
      ).rejects.toEqual(
        expect.objectContaining<Partial<ChallengeSelectionApplicationError>>({
          code: "STALE_AGGREGATE_VERSION",
          httpStatus: 409,
        }),
      );

      const atomicRows = await pool.query<{
        aggregate_version: number;
        event_count: string;
        outbox_count: string;
        consumption_count: string;
      }>(
        `SELECT review_window.version AS aggregate_version,
                (SELECT count(*)::text FROM domain_events WHERE event_type = 'HumanChallengeSelected') AS event_count,
                (SELECT count(*)::text FROM outbox_messages WHERE message_type = 'HumanChallengeSelected') AS outbox_count,
                (SELECT count(*)::text FROM ai_output_consumptions) AS consumption_count
           FROM review_windows AS review_window
          WHERE review_window.id = 'review-window-42'`,
      );
      expect(atomicRows.rows[0]).toEqual({
        aggregate_version: 4,
        event_count: "1",
        outbox_count: "1",
        consumption_count: "1",
      });

      await expect(composition.worker.runOnce("postgres-selected-branch-worker")).resolves.toBe(
        "PROCESSED",
      );
      const candidate = await store.getCandidateProjection("review-window-42");
      expect(candidate).toMatchObject({
        aggregate_version: 4,
        state: "STAGE_B_ACTIVE",
        selected_challenge: {
          challenge_ref: challengeRef,
          sandbox_branch_ref: branchRef,
        },
      });
      const proof = await pool.query<{
        selected_challenge_ref: string;
        sandbox_branch_ref: string;
      }>(
        `SELECT selected_challenge_ref, sandbox_branch_ref
           FROM proof_sessions
          WHERE review_window_id = 'review-window-42'`,
      );
      expect(proof.rows[0]).toEqual({
        selected_challenge_ref: challengeRef,
        sandbox_branch_ref: branchRef,
      });
      const breach = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM domain_events
          WHERE event_type = 'EmployerBreachRecorded'`,
      );
      expect(breach.rows[0]?.count).toBe("0");
    },
  );
});
