import {
  HumanAuthorizationReceiptSchema,
  SelectHumanChallengeCommandSchema,
  type HumanAuthorizationReceipt,
  type SelectHumanChallengeCommand,
} from "@onlyboth/contracts";
import { ReviewWindowInvariantError, selectHumanChallenge } from "@onlyboth/domain";

import type {
  ApplicationIdFactory,
  AuthenticatedEmployerActor,
  ChallengeCatalogSelectionPort,
  ChallengeSelectionUnitOfWork,
  StoredChallengeRecommendationOutput,
} from "../ports/challenge-selection";

export type ChallengeSelectionErrorCode =
  | "REVIEW_WINDOW_NOT_FOUND"
  | "REVIEWER_MISMATCH"
  | "STALE_AGGREGATE_VERSION"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_RECOMMENDATION_OUTPUT"
  | "RECOMMENDATION_OUTPUT_ALREADY_CONSUMED"
  | "EVIDENCE_REFERENCE_INVALID"
  | "CATALOG_SELECTION_INVALID"
  | "ILLEGAL_REVIEW_WINDOW_STATE";

const CHALLENGE_SELECTION_ERROR_STATUSES = {
  REVIEW_WINDOW_NOT_FOUND: 422,
  REVIEWER_MISMATCH: 403,
  STALE_AGGREGATE_VERSION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_RECOMMENDATION_OUTPUT: 422,
  RECOMMENDATION_OUTPUT_ALREADY_CONSUMED: 409,
  EVIDENCE_REFERENCE_INVALID: 422,
  CATALOG_SELECTION_INVALID: 422,
  ILLEGAL_REVIEW_WINDOW_STATE: 422,
} as const satisfies Record<ChallengeSelectionErrorCode, 403 | 409 | 422>;

export class ChallengeSelectionApplicationError extends Error {
  public override readonly name = "ChallengeSelectionApplicationError";

  public constructor(
    public readonly code: ChallengeSelectionErrorCode,
    public readonly httpStatus: 403 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export function challengeSelectionErrorDetails(
  error: unknown,
): { readonly code: ChallengeSelectionErrorCode; readonly httpStatus: 403 | 409 | 422 } | null {
  if (
    error === null ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "ChallengeSelectionApplicationError" ||
    !("code" in error) ||
    typeof error.code !== "string" ||
    !(error.code in CHALLENGE_SELECTION_ERROR_STATUSES) ||
    !("httpStatus" in error) ||
    typeof error.httpStatus !== "number"
  ) {
    return null;
  }
  const code = error.code as ChallengeSelectionErrorCode;
  const httpStatus = CHALLENGE_SELECTION_ERROR_STATUSES[code];
  return error.httpStatus === httpStatus ? { code, httpStatus } : null;
}

export interface SelectHumanChallengeRequest {
  readonly reviewWindowId: string;
  readonly actor: AuthenticatedEmployerActor;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly command: SelectHumanChallengeCommand;
}

function requireTransportIdentifier(value: string, field: string): void {
  if (value.trim().length === 0 || value.length > 200) {
    throw new ChallengeSelectionApplicationError(
      "IDEMPOTENCY_CONFLICT",
      409,
      `${field} is missing or invalid.`,
    );
  }
}

function exactRecommendation(
  output: StoredChallengeRecommendationOutput,
  challengeRef: string,
): { readonly evidenceRefs: readonly string[] } {
  if (output.output.decision !== "recommend") {
    throw new ChallengeSelectionApplicationError(
      "INVALID_RECOMMENDATION_OUTPUT",
      422,
      "A needs-human result cannot authorize an AI recommendation.",
    );
  }
  const item = output.output.recommendations.find(
    (candidate) => `${candidate.challenge_id}@${candidate.version}` === challengeRef,
  );
  if (item === undefined) {
    throw new ChallengeSelectionApplicationError(
      "INVALID_RECOMMENDATION_OUTPUT",
      422,
      "The selected challenge is not present in the validated recommendation output.",
    );
  }
  return { evidenceRefs: item.evidence_refs };
}

function mapDomainError(error: ReviewWindowInvariantError): ChallengeSelectionApplicationError {
  if (error.code === "REVIEWER_MISMATCH") {
    return new ChallengeSelectionApplicationError("REVIEWER_MISMATCH", 403, error.message);
  }
  if (error.code === "EVIDENCE_REFERENCE_INVALID") {
    return new ChallengeSelectionApplicationError("EVIDENCE_REFERENCE_INVALID", 422, error.message);
  }
  return new ChallengeSelectionApplicationError("ILLEGAL_REVIEW_WINDOW_STATE", 422, error.message);
}

export class SelectHumanChallengeHandler {
  public constructor(
    private readonly unitOfWork: ChallengeSelectionUnitOfWork,
    private readonly catalog: ChallengeCatalogSelectionPort,
    private readonly ids: ApplicationIdFactory,
  ) {}

  public async execute(request: SelectHumanChallengeRequest): Promise<HumanAuthorizationReceipt> {
    requireTransportIdentifier(request.idempotencyKey, "Idempotency-Key");
    requireTransportIdentifier(request.correlationId, "correlationId");
    const command = SelectHumanChallengeCommandSchema.parse(request.command);
    const commandFingerprint = JSON.stringify(command);

    try {
      return await this.unitOfWork.runInTransaction(async (transaction) => {
        const existing = await transaction.findCommandReceipt(
          request.actor.actorId,
          request.idempotencyKey,
        );
        if (existing !== null) {
          if (existing.commandFingerprint !== commandFingerprint) {
            throw new ChallengeSelectionApplicationError(
              "IDEMPOTENCY_CONFLICT",
              409,
              "The Idempotency-Key was already used for a different command.",
            );
          }
          return existing.receipt;
        }

        const window = await transaction.loadReviewWindow(request.reviewWindowId);
        if (window === undefined) {
          throw new ChallengeSelectionApplicationError(
            "REVIEW_WINDOW_NOT_FOUND",
            422,
            "The Review Window does not exist.",
          );
        }
        if (window.reviewerId !== request.actor.actorId) {
          throw new ChallengeSelectionApplicationError(
            "REVIEWER_MISMATCH",
            403,
            "Only the reserved reviewer may authorize this challenge.",
          );
        }
        if (window.version !== command.expected_version) {
          throw new ChallengeSelectionApplicationError(
            "STALE_AGGREGATE_VERSION",
            409,
            "The Review Window has changed; refresh before authorizing.",
          );
        }
        if (window.versionPins.challengeCatalogVersionId !== this.catalog.catalogRef) {
          throw new ChallengeSelectionApplicationError(
            "CATALOG_SELECTION_INVALID",
            422,
            "The Review Window does not pin the active Catalog version.",
          );
        }

        let evidenceRefs: readonly string[];
        let recommendationOutput: StoredChallengeRecommendationOutput | null = null;
        if (command.selection_source === "AI_RECOMMENDATION") {
          recommendationOutput = await transaction.loadRecommendationOutput(
            command.recommendation_output_ref,
          );
          if (
            recommendationOutput === null ||
            recommendationOutput.reviewWindowId !== window.id ||
            recommendationOutput.aggregateVersion !== window.version ||
            recommendationOutput.catalogRef !== this.catalog.catalogRef ||
            recommendationOutput.catalogHash !== this.catalog.catalogHash
          ) {
            throw new ChallengeSelectionApplicationError(
              "INVALID_RECOMMENDATION_OUTPUT",
              422,
              "The recommendation output is missing, stale, or pinned to another Catalog.",
            );
          }
          if (recommendationOutput.consumedByCommandId !== null) {
            throw new ChallengeSelectionApplicationError(
              "RECOMMENDATION_OUTPUT_ALREADY_CONSUMED",
              409,
              "The recommendation output was already consumed by another command.",
            );
          }
          evidenceRefs = exactRecommendation(
            recommendationOutput,
            command.challenge_ref,
          ).evidenceRefs;
        } else {
          const currentEvidenceRefs = new Set(await transaction.listStageAEvidenceRefs(window.id));
          if (command.evidence_refs.some((reference) => !currentEvidenceRefs.has(reference))) {
            throw new ChallengeSelectionApplicationError(
              "EVIDENCE_REFERENCE_INVALID",
              422,
              "Manual selection must reference current Stage A Evidence.",
            );
          }
          evidenceRefs = command.evidence_refs;
        }

        let challenge;
        try {
          challenge = this.catalog.resolveChallenge(command.challenge_ref);
        } catch {
          throw new ChallengeSelectionApplicationError(
            "CATALOG_SELECTION_INVALID",
            422,
            "The selected Challenge is not in the pinned Catalog.",
          );
        }

        const selectedAt = transaction.databaseNow.toISOString();
        let transition;
        try {
          transition = selectHumanChallenge(window, {
            reviewerId: request.actor.actorId,
            challengeId: command.challenge_ref,
            catalogHash: this.catalog.catalogHash,
            evidenceRefs,
            selectionSource: command.selection_source,
            ...(command.selection_source === "AI_RECOMMENDATION"
              ? { recommendationOutputRef: command.recommendation_output_ref }
              : {}),
            selectedAt,
          });
        } catch (error: unknown) {
          if (error instanceof ReviewWindowInvariantError) {
            throw mapDomainError(error);
          }
          throw error;
        }

        const event = transition.events[0];
        if (event?.type !== "HumanChallengeSelected") {
          throw new Error("SelectHumanChallenge did not emit HumanChallengeSelected.");
        }
        const commandId = this.ids.nextId("command");
        const eventId = this.ids.nextId("event");
        const outboxId = this.ids.nextId("outbox");
        const receipt = HumanAuthorizationReceiptSchema.parse({
          schema_version: "human-authorization-receipt@1",
          command_id: commandId,
          event_id: eventId,
          challenge_ref: command.challenge_ref,
          aggregate_version: transition.window.version,
          selected_at: selectedAt,
        });

        await transaction.saveReviewWindow(transition.window, window.version);
        await transaction.appendDomainEvent({
          eventId,
          eventType: event.type,
          eventVersion: 1,
          aggregateType: "ReviewWindow",
          aggregateId: window.id,
          aggregateVersion: transition.window.version,
          correlationId: request.correlationId,
          occurredAt: transaction.databaseNow,
          payload: event,
        });
        await transaction.enqueueOutbox({
          messageId: outboxId,
          messageType: "HumanChallengeSelected",
          messageVersion: 1,
          eventId,
          idempotencyKey: `HumanChallengeSelected:${window.id}:${transition.window.version}`,
          correlationId: request.correlationId,
          availableAt: transaction.databaseNow,
          payload: {
            reviewWindowId: window.id,
            challengeRef: command.challenge_ref,
            candidateNotice: challenge.candidateNotice,
          },
        });
        if (recommendationOutput !== null) {
          await transaction.consumeRecommendationOutput(recommendationOutput.outputRef, commandId);
        }
        await transaction.saveCommandReceipt({
          actorId: request.actor.actorId,
          idempotencyKey: request.idempotencyKey,
          commandFingerprint,
          receipt,
        });

        return receipt;
      });
    } catch (error: unknown) {
      if (error instanceof ChallengeSelectionApplicationError) {
        throw error;
      }
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "OPTIMISTIC_CONCURRENCY_CONFLICT"
      ) {
        throw new ChallengeSelectionApplicationError(
          "STALE_AGGREGATE_VERSION",
          409,
          "The Review Window changed while the authorization was committing.",
        );
      }
      throw error;
    }
  }
}
