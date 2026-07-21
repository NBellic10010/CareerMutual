import {
  ProofWindowDecisionCommandSchema,
  ProofWindowDecisionReceiptSchema,
  type ProofWindowDecisionCommand,
  type ProofWindowDecisionReceipt,
} from "@onlyboth/contracts";
import {
  ReviewWindowInvariantError,
  acceptProofWindow,
  releaseProofWindow,
  type ReviewWindow,
} from "@onlyboth/domain";

import type {
  AuthenticatedCandidateActor,
  ProofSessionStartRecord,
  ProofWindowDecisionIdFactory,
  ProofWindowDecisionUnitOfWork,
} from "../ports/proof-window-decision";

export type ProofWindowDecisionErrorCode =
  | "REVIEW_WINDOW_NOT_FOUND"
  | "CANDIDATE_MISMATCH"
  | "STALE_AGGREGATE_VERSION"
  | "ILLEGAL_REVIEW_WINDOW_STATE"
  | "ACCEPT_DEADLINE_EXPIRED"
  | "IDEMPOTENCY_CONFLICT";

const STATUSES = {
  REVIEW_WINDOW_NOT_FOUND: 422,
  CANDIDATE_MISMATCH: 403,
  STALE_AGGREGATE_VERSION: 409,
  ILLEGAL_REVIEW_WINDOW_STATE: 422,
  ACCEPT_DEADLINE_EXPIRED: 409,
  IDEMPOTENCY_CONFLICT: 409,
} as const satisfies Record<ProofWindowDecisionErrorCode, 403 | 409 | 422>;

export class ProofWindowDecisionApplicationError extends Error {
  public override readonly name = "ProofWindowDecisionApplicationError";

  public constructor(
    public readonly code: ProofWindowDecisionErrorCode,
    public readonly httpStatus: 403 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export function proofWindowDecisionErrorDetails(
  error: unknown,
): { readonly code: ProofWindowDecisionErrorCode; readonly httpStatus: 403 | 409 | 422 } | null {
  if (
    error === null ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "ProofWindowDecisionApplicationError" ||
    !("code" in error) ||
    typeof error.code !== "string" ||
    !(error.code in STATUSES) ||
    !("httpStatus" in error) ||
    typeof error.httpStatus !== "number"
  ) {
    return null;
  }
  const code = error.code as ProofWindowDecisionErrorCode;
  const httpStatus = STATUSES[code];
  return error.httpStatus === httpStatus ? { code, httpStatus } : null;
}

function proofSession(window: ReviewWindow): ProofSessionStartRecord {
  const token = window.candidateId.slice("candidate-".length);
  return {
    proofSessionRef: `proof-${Number(token)}`,
    runtimeMode: "GOLDEN_REPLAY",
    replayId: "payment-retry-v1",
    sandboxSessionRef: `sandbox-pending-${token}`,
    replaySessionKey: window.candidateId,
    recommendationRequestRef: `ai-request-${window.candidateId}-challenges`,
    capabilityRefs: [
      "clarify_ambiguous_failure",
      "inspect_state_transition",
      "design_verification",
      "revise_under_failover",
    ],
    baseSnapshotVersion: window.versionPins.proofTemplateVersionId,
    stageAPatchRef: `patch-${Number(token)}-stage-a`,
    stageAArtifactRef: `artifact-${Number(token)}-stage-a`,
    stageASnapshotRef: `snapshot-${Number(token)}-stage-a`,
    remainingTimeSeconds: 180,
  };
}

export interface DecideProofWindowRequest {
  readonly action: "ACCEPT" | "DECLINE";
  readonly reviewWindowRef: string;
  readonly actor: AuthenticatedCandidateActor;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly command: ProofWindowDecisionCommand;
}

export class DecideProofWindowHandler {
  public constructor(
    private readonly unitOfWork: ProofWindowDecisionUnitOfWork,
    private readonly ids: ProofWindowDecisionIdFactory,
  ) {}

  public async execute(request: DecideProofWindowRequest): Promise<ProofWindowDecisionReceipt> {
    const command = ProofWindowDecisionCommandSchema.parse(request.command);
    const commandFingerprint = JSON.stringify({ action: request.action, command });
    try {
      return await this.unitOfWork.runInTransaction(async (transaction) => {
        const existing = await transaction.findReceipt(
          request.actor.actorId,
          request.idempotencyKey,
        );
        if (existing !== null) {
          if (existing.commandFingerprint !== commandFingerprint) {
            throw new ProofWindowDecisionApplicationError(
              "IDEMPOTENCY_CONFLICT",
              409,
              "The Idempotency-Key was already used for another decision.",
            );
          }
          return existing.receipt;
        }
        const window = await transaction.loadWindowForUpdate(request.reviewWindowRef);
        if (window === null) {
          throw new ProofWindowDecisionApplicationError(
            "REVIEW_WINDOW_NOT_FOUND",
            422,
            "The Review Window does not exist.",
          );
        }
        if (window.candidateId !== request.actor.actorId) {
          throw new ProofWindowDecisionApplicationError(
            "CANDIDATE_MISMATCH",
            403,
            "This Review Window belongs to another candidate.",
          );
        }
        if (window.version !== command.expected_version) {
          throw new ProofWindowDecisionApplicationError(
            "STALE_AGGREGATE_VERSION",
            409,
            "The Review Window changed; refresh before deciding.",
          );
        }
        if (
          request.action === "ACCEPT" &&
          window.acceptBy !== undefined &&
          transaction.databaseNow.getTime() >= Date.parse(window.acceptBy)
        ) {
          throw new ProofWindowDecisionApplicationError(
            "ACCEPT_DEADLINE_EXPIRED",
            409,
            "The backed Review Window expired before acceptance.",
          );
        }
        const transition =
          request.action === "ACCEPT"
            ? acceptProofWindow(window)
            : releaseProofWindow(window, "CANDIDATE_DECLINED");
        const event = transition.events[0];
        if (event === undefined) throw new Error("Proof Window decision emitted no event.");
        const commandId = this.ids.nextId("command");
        const eventId = this.ids.nextId("event");
        const session = request.action === "ACCEPT" ? proofSession(window) : null;
        const receipt = ProofWindowDecisionReceiptSchema.parse({
          schema_version: "proof-window-decision-receipt@1",
          command_id: commandId,
          event_id: eventId,
          review_window_ref: window.id,
          new_version: transition.window.version,
          state: transition.window.state,
          proof_session_ref: session?.proofSessionRef ?? null,
          occurred_at: transaction.databaseNow.toISOString(),
        });
        await transaction.persistDecision({
          actorRef: request.actor.actorId,
          idempotencyKey: request.idempotencyKey,
          commandFingerprint,
          commandId,
          eventId,
          outboxId: this.ids.nextId("outbox"),
          correlationId: request.correlationId,
          previousWindow: window,
          nextWindow: transition.window,
          proofSession: session,
          receipt,
        });
        return receipt;
      });
    } catch (error: unknown) {
      if (error instanceof ProofWindowDecisionApplicationError) throw error;
      if (error instanceof ReviewWindowInvariantError) {
        throw new ProofWindowDecisionApplicationError(
          "ILLEGAL_REVIEW_WINDOW_STATE",
          422,
          error.message,
        );
      }
      throw error;
    }
  }
}

export class ExpireProofWindowHandler {
  public constructor(
    private readonly unitOfWork: ProofWindowDecisionUnitOfWork,
    private readonly ids: ProofWindowDecisionIdFactory,
  ) {}

  public async expireOne(): Promise<boolean> {
    return this.unitOfWork.runInTransaction(async (transaction) => {
      const window = await transaction.findExpiredWindowForUpdate();
      if (window === null) return false;
      const transition = releaseProofWindow(window, "PRESTART_EXPIRED");
      const commandId = this.ids.nextId("command");
      const eventId = this.ids.nextId("event");
      const receipt = ProofWindowDecisionReceiptSchema.parse({
        schema_version: "proof-window-decision-receipt@1",
        command_id: commandId,
        event_id: eventId,
        review_window_ref: window.id,
        new_version: transition.window.version,
        state: "RELEASED",
        proof_session_ref: null,
        occurred_at: transaction.databaseNow.toISOString(),
      });
      await transaction.persistDecision({
        actorRef: "system-expiry",
        idempotencyKey: `expire:${window.id}:${window.version}`,
        commandFingerprint: JSON.stringify({ action: "EXPIRE", expectedVersion: window.version }),
        commandId,
        eventId,
        outboxId: this.ids.nextId("outbox"),
        correlationId: `expiry:${window.id}`,
        previousWindow: window,
        nextWindow: transition.window,
        proofSession: null,
        receipt,
      });
      return true;
    });
  }
}
