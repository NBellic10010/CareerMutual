import {
  ActivateBlindReviewCommitmentCommandSchema,
  BlindReviewCommitmentReceiptSchema,
  EmployerBlindReviewProjectionSchema,
  type ActivateBlindReviewCommitmentCommand,
  type BlindReviewCommitmentReceipt,
} from "@onlyboth/contracts";
import {
  BlindAnswerInvariantError,
  activateBlindReviewCommitment,
  createRollingBlindReview,
  queueCandidateInterest,
  type RollingBlindReview,
} from "@onlyboth/domain";

import type { AuthenticatedEmployerActor } from "../ports/challenge-selection";
import type {
  BlindReviewApplicationIdFactory,
  BlindReviewUnitOfWork,
  SlotCreditReservationRecord,
} from "../ports/blind-review";

export type BlindReviewActivationErrorCode =
  | "OPPORTUNITY_NOT_FOUND"
  | "OPPORTUNITY_NOT_OPEN"
  | "REVIEWER_MISMATCH"
  | "STALE_OPPORTUNITY_VERSION"
  | "STALE_COMMITMENT_VERSION"
  | "IDEMPOTENCY_CONFLICT"
  | "CREDIT_CAPACITY_CONFLICT"
  | "COMMITMENT_CONFIGURATION_INVALID"
  | "QUEUE_POLICY_INVALID";

const STATUSES = {
  OPPORTUNITY_NOT_FOUND: 422,
  OPPORTUNITY_NOT_OPEN: 422,
  REVIEWER_MISMATCH: 403,
  STALE_OPPORTUNITY_VERSION: 409,
  STALE_COMMITMENT_VERSION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  CREDIT_CAPACITY_CONFLICT: 409,
  COMMITMENT_CONFIGURATION_INVALID: 422,
  QUEUE_POLICY_INVALID: 422,
} as const satisfies Record<BlindReviewActivationErrorCode, 403 | 409 | 422>;

export class BlindReviewActivationApplicationError extends Error {
  public override readonly name = "BlindReviewActivationApplicationError";

  public constructor(
    public readonly code: BlindReviewActivationErrorCode,
    public readonly httpStatus: 403 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export function blindReviewActivationErrorDetails(
  error: unknown,
): { readonly code: BlindReviewActivationErrorCode; readonly httpStatus: 403 | 409 | 422 } | null {
  if (
    error === null ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "BlindReviewActivationApplicationError" ||
    !("code" in error) ||
    typeof error.code !== "string" ||
    !(error.code in STATUSES) ||
    !("httpStatus" in error) ||
    typeof error.httpStatus !== "number"
  ) {
    return null;
  }
  const code = error.code as BlindReviewActivationErrorCode;
  const httpStatus = STATUSES[code];
  return error.httpStatus === httpStatus ? { code, httpStatus } : null;
}

export interface ActivateBlindReviewCommitmentRequest {
  readonly opportunityRef: string;
  readonly actor: AuthenticatedEmployerActor;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly command: ActivateBlindReviewCommitmentCommand;
}

function requireTransportIdentifier(value: string, field: string): void {
  if (value.trim().length === 0 || value.length > 200) {
    throw new BlindReviewActivationApplicationError(
      "IDEMPOTENCY_CONFLICT",
      409,
      `${field} is missing or invalid.`,
    );
  }
}

function assertDraftConfiguration(
  review: RollingBlindReview,
  command: ReturnType<typeof ActivateBlindReviewCommitmentCommandSchema.parse>,
): void {
  const commitment = review.commitment;
  if (
    commitment.answerReviewWip !== command.answer_review_wip ||
    commitment.answerReviewSlaHours !== command.answer_review_sla_hours ||
    commitment.advancementCohortSize !== command.advancement_cohort_size ||
    commitment.queuePolicyVersion !== command.queue_policy_version ||
    commitment.creditPerAnswerReview !== command.credit_per_answer_review
  ) {
    throw new BlindReviewActivationApplicationError(
      "COMMITMENT_CONFIGURATION_INVALID",
      422,
      "The activation command does not match the existing Draft Commitment.",
    );
  }
}

function mapDomainError(error: BlindAnswerInvariantError): BlindReviewActivationApplicationError {
  return new BlindReviewActivationApplicationError(
    error.code === "QUEUE_POLICY_INVALID"
      ? "QUEUE_POLICY_INVALID"
      : "COMMITMENT_CONFIGURATION_INVALID",
    422,
    error.message,
  );
}

export class ActivateBlindReviewCommitmentHandler {
  public constructor(
    private readonly unitOfWork: BlindReviewUnitOfWork,
    private readonly ids: BlindReviewApplicationIdFactory,
  ) {}

  public async execute(
    request: ActivateBlindReviewCommitmentRequest,
  ): Promise<BlindReviewCommitmentReceipt> {
    requireTransportIdentifier(request.idempotencyKey, "Idempotency-Key");
    requireTransportIdentifier(request.correlationId, "correlationId");
    const command = ActivateBlindReviewCommitmentCommandSchema.parse(request.command);
    const commandFingerprint = JSON.stringify({
      opportunityRef: request.opportunityRef,
      command,
    });

    try {
      return await this.unitOfWork.runInTransaction(async (transaction) => {
        const existing = await transaction.findCommandReceipt(
          request.actor.actorId,
          request.idempotencyKey,
        );
        if (existing !== null) {
          if (existing.commandFingerprint !== commandFingerprint) {
            throw new BlindReviewActivationApplicationError(
              "IDEMPOTENCY_CONFLICT",
              409,
              "The Idempotency-Key was already used for another Blind Review command.",
            );
          }
          return existing.receipt;
        }

        const snapshot = await transaction.loadActivationForUpdate(request.opportunityRef);
        if (snapshot === null) {
          throw new BlindReviewActivationApplicationError(
            "OPPORTUNITY_NOT_FOUND",
            422,
            "The Opportunity does not exist.",
          );
        }
        if (snapshot.reviewerRef !== request.actor.actorId) {
          throw new BlindReviewActivationApplicationError(
            "REVIEWER_MISMATCH",
            403,
            "Only the named Reviewer can activate Blind Review attention.",
          );
        }
        if (snapshot.opportunityState !== "OPEN") {
          throw new BlindReviewActivationApplicationError(
            "OPPORTUNITY_NOT_OPEN",
            422,
            "Blind Review attention requires an open Opportunity.",
          );
        }
        if (snapshot.opportunityVersion !== command.expected_opportunity_version) {
          throw new BlindReviewActivationApplicationError(
            "STALE_OPPORTUNITY_VERSION",
            409,
            "The Opportunity changed; refresh before activating Blind Review.",
          );
        }
        const currentCommitmentVersion = snapshot.review?.commitment.version ?? 0;
        if (currentCommitmentVersion !== command.expected_commitment_version) {
          throw new BlindReviewActivationApplicationError(
            "STALE_COMMITMENT_VERSION",
            409,
            "The Blind Review Commitment changed; refresh before activating.",
          );
        }

        let draft = snapshot.review;
        if (draft === null) {
          draft = createRollingBlindReview({
            commitmentRef: this.ids.nextId("blind-review-commitment"),
            opportunityRef: snapshot.opportunityRef,
            reviewerRef: snapshot.reviewerRef,
            answerReviewWip: command.answer_review_wip,
            answerReviewSlaHours: command.answer_review_sla_hours,
            advancementCohortSize: command.advancement_cohort_size,
            queuePolicyVersion: command.queue_policy_version,
            creditPerAnswerReview: command.credit_per_answer_review,
          });
          for (const interest of snapshot.queuedInterests) {
            draft = queueCandidateInterest(draft, interest);
          }
        } else {
          assertDraftConfiguration(draft, command);
        }

        const totalCredit = command.answer_review_wip * command.credit_per_answer_review;
        if (snapshot.creditAccount.availableCredits < totalCredit) {
          throw new BlindReviewActivationApplicationError(
            "CREDIT_CAPACITY_CONFLICT",
            409,
            "The Credit Account cannot fund every configured Answer Review Slot.",
          );
        }
        const slotRefs = Array.from({ length: command.answer_review_wip }, () =>
          this.ids.nextId("answer-review-slot"),
        );
        const activatedAt = transaction.databaseNow.toISOString();
        const nextReview = activateBlindReviewCommitment(draft, { slotRefs, activatedAt });
        const eventId = this.ids.nextId("event");
        const commandId = this.ids.nextId("command");
        const receipt = BlindReviewCommitmentReceiptSchema.parse({
          schema_version: "blind-review-commitment-receipt@1",
          command_id: commandId,
          event_id: eventId,
          commitment_ref: nextReview.commitment.commitmentRef,
          new_commitment_version: nextReview.commitment.version,
          slot_refs: slotRefs,
          state: "ACTIVE",
          activated_at: activatedAt,
        });
        const creditReservations: readonly SlotCreditReservationRecord[] = slotRefs.map(
          (slotRef) => ({
            reservationRef: this.ids.nextId("slot-credit-reservation"),
            slotRef,
            accountRef: snapshot.creditAccount.accountRef,
            amount: command.credit_per_answer_review,
            state: "RESERVED",
            version: 1,
          }),
        );
        const event = {
          eventId,
          eventType: "BlindReviewCommitmentActivated",
          eventVersion: 1 as const,
          aggregateType: "BlindReviewCommitment",
          aggregateId: nextReview.commitment.commitmentRef,
          aggregateVersion: nextReview.commitment.version,
          correlationId: request.correlationId,
          occurredAt: transaction.databaseNow,
          payload: {
            schema_version: "blind-review-commitment-activated@1",
            opportunity_ref: snapshot.opportunityRef,
            reviewer_ref: snapshot.reviewerRef,
            answer_review_wip: command.answer_review_wip,
            answer_review_sla_hours: command.answer_review_sla_hours,
            advancement_cohort_size: command.advancement_cohort_size,
            queue_policy_version: command.queue_policy_version,
            credit_per_answer_review: command.credit_per_answer_review,
            slot_refs: slotRefs,
          },
        };
        const outbox = nextReview.slots.map((slot) => {
          const messageId = this.ids.nextId("outbox");
          return {
            messageId,
            messageType: "OfferNextQueuedInterestRequested",
            messageVersion: 1 as const,
            eventId,
            // Each dispatch attempt owns its key. A later Interest can schedule this unchanged
            // AVAILABLE Slot after an earlier NO_WAITING_INTEREST result without replaying it.
            idempotencyKey: [
              "OfferNextQueuedInterestRequested",
              nextReview.commitment.commitmentRef,
              slot.slotRef,
              messageId,
            ].join(":"),
            correlationId: request.correlationId,
            availableAt: transaction.databaseNow,
            payload: {
              schema_version: "offer-next-queued-interest-requested@1",
              opportunity_ref: snapshot.opportunityRef,
              commitment_ref: nextReview.commitment.commitmentRef,
              expected_commitment_version: nextReview.commitment.version,
              slot_ref: slot.slotRef,
              expected_slot_version: slot.version,
              queue_policy_version: nextReview.commitment.queuePolicyVersion,
              public_seed: snapshot.publicSeed,
            },
          };
        });
        const employerProjection = EmployerBlindReviewProjectionSchema.parse({
          schema_version: "employer-blind-review-projection@2",
          view: "EMPLOYER",
          opportunity_ref: snapshot.opportunityRef,
          commitment_ref: nextReview.commitment.commitmentRef,
          commitment_version: nextReview.commitment.version,
          queue_policy_version: nextReview.commitment.queuePolicyVersion,
          eligible_interest_count: nextReview.interests.length,
          waiting_interest_count: nextReview.interests.length,
          answer_review_wip: nextReview.commitment.answerReviewWip,
          available_slot_count: nextReview.slots.length,
          outstanding_obligation_count: 0,
          disclosure: "Candidate profiles and claims are sealed before recorded answers exist.",
          runtime_mode: snapshot.runtimeMode,
          synthetic: snapshot.synthetic,
          phase: "PRE_ANSWER",
        });

        await transaction.persistActivation({
          actorRef: request.actor.actorId,
          idempotencyKey: request.idempotencyKey,
          commandFingerprint,
          expectedOpportunityVersion: command.expected_opportunity_version,
          expectedCommitmentVersion: command.expected_commitment_version,
          expectedCreditAccountVersion: snapshot.creditAccount.version,
          previousReview: snapshot.review,
          nextReview,
          creditReservations,
          event,
          outbox,
          employerProjection,
          receipt,
        });
        return receipt;
      });
    } catch (error: unknown) {
      if (error instanceof BlindReviewActivationApplicationError) throw error;
      if (error instanceof BlindAnswerInvariantError) throw mapDomainError(error);
      throw error;
    }
  }
}
