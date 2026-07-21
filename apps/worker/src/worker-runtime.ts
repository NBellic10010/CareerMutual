import type { WorkerConfig } from "./config.js";
import { GoldenReplaySmokeError, runGoldenReplaySmoke } from "./golden-replay-smoke.js";
import type { StructuredLogEntry } from "./structured-logger.js";
import type { WorkerCommand } from "./worker-command.js";

const BOOT_TRACE_ID = "worker-bootstrap";

export interface WorkerRuntimeDependencies {
  readonly now: () => Date;
  readonly emit: (entry: StructuredLogEntry) => void;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly wait?: (milliseconds: number) => Promise<void>;
}

function baseLog(
  config: WorkerConfig,
  dependencies: WorkerRuntimeDependencies,
): Omit<StructuredLogEntry, "level" | "outcome"> {
  return {
    timestamp: dependencies.now().toISOString(),
    service: "worker",
    runtime_mode: config.runtimeMode,
    trace_id: BOOT_TRACE_ID,
    correlation_id: BOOT_TRACE_ID,
    command_or_job: "bootstrap",
    actor_role: "SYSTEM",
    synthetic: config.runtimeMode === "GOLDEN_REPLAY",
  };
}

export async function executeWorkerCommand(
  config: WorkerConfig,
  command: WorkerCommand,
  dependencies: WorkerRuntimeDependencies,
): Promise<0 | 1> {
  if (config.runtimeMode === "GOLDEN_REPLAY" && command === "smoke") {
    try {
      const result = await runGoldenReplaySmoke(config.replayId);
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "info",
        command_or_job: "golden-replay-scaffold-smoke",
        outcome: "smoke_succeeded",
        fixture_ref: result.replayId,
        verification_ref: result.verificationRef,
      });
      return 0;
    } catch (error: unknown) {
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "error",
        command_or_job: "golden-replay-scaffold-smoke",
        outcome: "smoke_failed",
        error_code:
          error instanceof GoldenReplaySmokeError ? error.code : "GOLDEN_REPLAY_SMOKE_FAILED",
        fixture_ref: config.replayId,
      });
      return 1;
    }
  }

  if (command === "migrate") {
    const composition = createChallengeWorkerComposition(config);
    try {
      await runPostgresMigrations(composition.pool);
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "info",
        command_or_job: "postgres-migrate",
        outcome: "migrations_applied",
      });
      return 0;
    } catch {
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "error",
        command_or_job: "postgres-migrate",
        outcome: "migration_failed",
        error_code: "POSTGRES_MIGRATION_FAILED",
      });
      return 1;
    } finally {
      await composition.pool.end();
    }
  }

  if (command === "demo-reset") {
    if (config.runtimeMode !== "GOLDEN_REPLAY") {
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "error",
        command_or_job: "demo-reset",
        outcome: "refused_to_start",
        error_code: "DEMO_RESET_FORBIDDEN",
      });
      return 1;
    }
    const composition = createChallengeWorkerComposition(config);
    try {
      await resetCandidate42GoldenDemo(composition.pool, dependencies.environment ?? {});
      for (let index = 0; index < 10; index += 1) {
        if ((await composition.worker.runOnce("demo-reset-worker")) === "IDLE") {
          dependencies.emit({
            ...baseLog(config, dependencies),
            level: "info",
            command_or_job: "demo-reset",
            outcome: "candidate_42_ready",
            fixture_ref: config.replayId,
          });
          return 0;
        }
      }
      throw new Error("Demo reset did not drain the initial recommendation jobs.");
    } catch {
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "error",
        command_or_job: "demo-reset",
        outcome: "reset_failed",
        error_code: "DEMO_RESET_FAILED",
        fixture_ref: config.replayId,
      });
      return 1;
    } finally {
      await composition.pool.end();
    }
  }

  if (command === "demo-reset-matching") {
    if (config.runtimeMode !== "GOLDEN_REPLAY") {
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "error",
        command_or_job: "demo-reset-matching",
        outcome: "refused_to_start",
        error_code: "DEMO_RESET_FORBIDDEN",
      });
      return 1;
    }
    const composition = createMatchingWorkerComposition(config);
    try {
      await resetMatchingGoldenDemo(composition.pool, dependencies.environment ?? {});
      for (let index = 0; index < 30; index += 1) {
        if ((await composition.worker.runOnce("matching-reset-worker")) === "IDLE") break;
      }
      const finalOutcome = await composition.worker.runOnce("matching-reset-worker-final");
      if (finalOutcome !== "IDLE") {
        throw new Error("Matching reset did not drain all Candidate Interests.");
      }
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "info",
        command_or_job: "demo-reset-matching",
        outcome: "matching_facts_seeded",
        fixture_ref: config.replayId,
      });
      return 0;
    } catch {
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "error",
        command_or_job: "demo-reset-matching",
        outcome: "reset_failed",
        error_code: "DEMO_RESET_FAILED",
        fixture_ref: config.replayId,
      });
      return 1;
    } finally {
      await composition.pool.end();
    }
  }

  if (command === "once" || command === "run") {
    const composition = createChallengeWorkerComposition(config);
    const matchingComposition = createMatchingWorkerComposition(config);
    const stageAComposition = createStageAWorkerComposition(config);
    const interestQueueComposition = createInterestQueueWorkerComposition(config);
    const functionalComposition = createFunctionalProductWorkerComposition(
      config.databaseUrl,
      dependencies.environment ?? {},
    );
    try {
      if (command === "once") {
        const functionalOutcome = await functionalComposition.worker.runOnce(
          "functional-product-worker-once",
        );
        const expired = await stageAComposition.expiry.expireOne();
        const answerInvitationExpired = await interestQueueComposition.expiry.executeNext();
        const interestQueueOutcome = await interestQueueComposition.worker.runOnce(
          "interest-queue-worker-once",
        );
        const stageAOutcome = await stageAComposition.worker.runOnce("stage-a-worker-once");
        const matchingOutcome = await matchingComposition.worker.runOnce("matching-worker-once");
        const outcome =
          functionalOutcome !== "IDLE"
            ? functionalOutcome
            : interestQueueOutcome !== "IDLE"
              ? interestQueueOutcome
              : stageAOutcome !== "IDLE"
                ? stageAOutcome
                : matchingOutcome === "IDLE"
                  ? await composition.worker.runOnce("challenge-worker-once")
                  : matchingOutcome;
        dependencies.emit({
          ...baseLog(config, dependencies),
          level: "info",
          command_or_job: "challenge-worker-once",
          outcome:
            (expired || answerInvitationExpired) && outcome === "IDLE"
              ? answerInvitationExpired
                ? "expired_answer_invitation"
                : "expired_window"
              : outcome.toLowerCase(),
        });
        return 0;
      }
      const wait =
        dependencies.wait ??
        ((milliseconds: number) =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, milliseconds);
          }));
      while (true) {
        const expired = await stageAComposition.expiry.expireOne();
        const answerInvitationExpired = await interestQueueComposition.expiry.executeNext();
        const functionalOutcome = await functionalComposition.worker.runOnce(
          "functional-product-worker-continuous",
        );
        const interestQueueOutcome = await interestQueueComposition.worker.runOnce(
          "interest-queue-worker-continuous",
        );
        const matchingOutcome = await matchingComposition.worker.runOnce(
          "matching-worker-continuous",
        );
        const stageAOutcome = await stageAComposition.worker.runOnce("stage-a-worker-continuous");
        const challengeOutcome = await composition.worker.runOnce("challenge-worker-continuous");
        if (
          interestQueueOutcome === "IDLE" &&
          matchingOutcome === "IDLE" &&
          stageAOutcome === "IDLE" &&
          challengeOutcome === "IDLE" &&
          functionalOutcome === "IDLE" &&
          !expired &&
          !answerInvitationExpired
        ) {
          await wait(250);
        }
      }
    } catch {
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "error",
        command_or_job: command === "once" ? "challenge-worker-once" : "challenge-worker-run",
        outcome: "worker_failed",
        error_code: "CHALLENGE_WORKER_FAILED",
      });
      return 1;
    } finally {
      await Promise.all([
        composition.pool.end(),
        matchingComposition.pool.end(),
        stageAComposition.pool.end(),
        interestQueueComposition.pool.end(),
        functionalComposition.pool.end(),
      ]);
    }
  }

  if (command === "live-smoke" && config.runtimeMode === "LIVE") {
    try {
      const recommendationCount = await runLiveRecommendationSmoke(config);
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "info",
        command_or_job: "live-recommendation-smoke",
        outcome: recommendationCount > 0 ? "structured_output_validated" : "needs_human",
      });
      return 0;
    } catch {
      dependencies.emit({
        ...baseLog(config, dependencies),
        level: "error",
        command_or_job: "live-recommendation-smoke",
        outcome: "smoke_failed",
        error_code: "LIVE_RECOMMENDATION_SMOKE_FAILED",
      });
      return 1;
    }
  }

  dependencies.emit({
    ...baseLog(config, dependencies),
    level: "error",
    outcome: "refused_to_start",
    error_code: "WORKER_ADAPTERS_NOT_WIRED",
  });
  return 1;
}
import {
  resetCandidate42GoldenDemo,
  resetMatchingGoldenDemo,
  runPostgresMigrations,
} from "@onlyboth/db";

import {
  createChallengeWorkerComposition,
  runLiveRecommendationSmoke,
} from "./challenge-composition.js";
import { createMatchingWorkerComposition } from "./matching-composition.js";
import { createInterestQueueWorkerComposition } from "./interest-queue-composition.js";
import { createStageAWorkerComposition } from "./stage-a-composition.js";
import { createFunctionalProductWorkerComposition } from "./functional-product-composition.js";
