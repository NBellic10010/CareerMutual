import {
  AnswerInvitationDecisionCommandSchema,
  AnswerInvitationDecisionReceiptSchema,
  CandidateOpportunityProjectionV3Schema,
  EmployerBlindReviewProjectionSchema,
  type AnswerInvitationDecisionCommand,
  type AnswerInvitationDecisionReceipt,
  type CandidateOpportunityProjectionV3,
  type EmployerBlindReviewProjection,
} from "@onlyboth/contracts";
import {
  BlindAnswerInvariantError,
  acceptBackedAnswerOffer,
  releaseBackedAnswerOffer,
  type RollingBlindReview,
} from "@onlyboth/domain";

import type { AuthenticatedCandidateActor } from "../ports/proof-window-decision";
import type {
  AnswerInvitationDecisionIdFactory,
  AnswerInvitationDecisionSnapshot,
  AnswerInvitationDecisionUnitOfWork,
  BlindReviewOutboxRecord,
} from "../ports/blind-review";

export type AnswerInvitationDecisionErrorCode =
  | "CANDIDATE_AUTH_REQUIRED"
  | "INVITATION_NOT_FOUND"
  | "CANDIDATE_MISMATCH"
  | "STALE_OBLIGATION_VERSION"
  | "STALE_SLOT_VERSION"
  | "INVITATION_STATE_INVALID"
  | "INVITATION_EXPIRED"
  | "ATTENTION_BACKING_INVALID"
  | "IDEMPOTENCY_CONFLICT";

const STATUS = {
  CANDIDATE_AUTH_REQUIRED: 403,
  INVITATION_NOT_FOUND: 422,
  CANDIDATE_MISMATCH: 403,
  STALE_OBLIGATION_VERSION: 409,
  STALE_SLOT_VERSION: 409,
  INVITATION_STATE_INVALID: 422,
  INVITATION_EXPIRED: 409,
  ATTENTION_BACKING_INVALID: 409,
  IDEMPOTENCY_CONFLICT: 409,
} as const satisfies Record<AnswerInvitationDecisionErrorCode, 403 | 409 | 422>;

export class AnswerInvitationDecisionApplicationError extends Error {
  public override readonly name = "AnswerInvitationDecisionApplicationError";

  public constructor(
    public readonly code: AnswerInvitationDecisionErrorCode,
    public readonly httpStatus: 403 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export function answerInvitationDecisionErrorDetails(error: unknown): {
  readonly code: AnswerInvitationDecisionErrorCode;
  readonly httpStatus: 403 | 409 | 422;
} | null {
  if (
    error === null ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "AnswerInvitationDecisionApplicationError" ||
    !("code" in error) ||
    typeof error.code !== "string" ||
    !(error.code in STATUS) ||
    !("httpStatus" in error) ||
    typeof error.httpStatus !== "number"
  ) {
    return null;
  }
  const code = error.code as AnswerInvitationDecisionErrorCode;
  const httpStatus = STATUS[code];
  return error.httpStatus === httpStatus ? { code, httpStatus } : null;
}

export interface DecideAnswerInvitationRequest {
  readonly invitationRef: string;
  readonly actor: AuthenticatedCandidateActor;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly command: AnswerInvitationDecisionCommand;
}

function assertTransportIdentifier(value: string, label: string): void {
  if (value.trim().length === 0 || value.length > 200) {
    throw new AnswerInvitationDecisionApplicationError(
      "IDEMPOTENCY_CONFLICT",
      409,
      `${label} is missing or invalid.`,
    );
  }
}

function assertCandidateActor(actor: AuthenticatedCandidateActor): void {
  const unsafeActor = actor as { readonly role?: unknown; readonly actorId?: unknown };
  if (
    unsafeActor.role !== "CANDIDATE" ||
    typeof unsafeActor.actorId !== "string" ||
    unsafeActor.actorId.trim().length === 0 ||
    unsafeActor.actorId.length > 200
  ) {
    throw new AnswerInvitationDecisionApplicationError(
      "CANDIDATE_AUTH_REQUIRED",
      403,
      "Candidate authentication is required to decide a backed Answer Invitation.",
    );
  }
}

function count(review: RollingBlindReview, state: string): number {
  return review.interests.filter((interest) => interest.state === state).length;
}

function employerProjection(
  snapshot: AnswerInvitationDecisionSnapshot,
  nextReview: RollingBlindReview,
): EmployerBlindReviewProjection {
  return EmployerBlindReviewProjectionSchema.parse({
    schema_version: "employer-blind-review-projection@2",
    view: "EMPLOYER",
    phase: "PRE_ANSWER",
    opportunity_ref: nextReview.commitment.opportunityRef,
    commitment_ref: nextReview.commitment.commitmentRef,
    commitment_version: nextReview.commitment.version,
    queue_policy_version: nextReview.commitment.queuePolicyVersion,
    eligible_interest_count: nextReview.interests.filter(
      ({ state }) => state !== "OPPORTUNITY_CLOSED",
    ).length,
    waiting_interest_count: count(nextReview, "WAITING_FOR_BACKED_SLOT"),
    answer_review_wip: nextReview.commitment.answerReviewWip,
    available_slot_count: nextReview.slots.filter(({ state }) => state === "AVAILABLE").length,
    outstanding_obligation_count: nextReview.obligations.filter(({ state }) => state !== "SETTLED")
      .length,
    disclosure:
      "Candidate identities and profile labels remain hidden before submitted blind answers are reviewed.",
    runtime_mode: snapshot.runtimeMode,
    synthetic: snapshot.synthetic,
  });
}

function assertBacking(
  snapshot: AnswerInvitationDecisionSnapshot,
  input: {
    readonly obligationRef: string;
    readonly slotRef: string;
    readonly candidateRef: string;
    readonly opportunityRef: string;
  },
): void {
  const reservation = snapshot.slotCreditReservation;
  const hold = snapshot.creditHold;
  const lease = snapshot.activityLease;
  if (
    reservation.state !== "BOUND" ||
    reservation.slotRef !== input.slotRef ||
    reservation.accountRef !== snapshot.creditAccount.accountRef ||
    hold.status !== "HELD" ||
    hold.purpose !== "ANSWER_REVIEW" ||
    hold.accountRef !== snapshot.creditAccount.accountRef ||
    hold.reservationRef !== reservation.reservationRef ||
    hold.obligationRef !== input.obligationRef ||
    hold.amount !== reservation.amount ||
    lease.state !== "ACTIVE" ||
    lease.candidateRef !== input.candidateRef ||
    lease.opportunityRef !== input.opportunityRef ||
    lease.bindingKind !== "ANSWER_REVIEW" ||
    lease.bindingRef !== input.obligationRef ||
    snapshot.creditAccount.heldCredits < hold.amount
  ) {
    throw new AnswerInvitationDecisionApplicationError(
      "ATTENTION_BACKING_INVALID",
      409,
      "The backed Invitation no longer has one active Hold, Reservation, and Candidate lease.",
    );
  }
}

export class DecideAnswerInvitationHandler {
  public constructor(
    private readonly unitOfWork: AnswerInvitationDecisionUnitOfWork,
    private readonly ids: AnswerInvitationDecisionIdFactory,
  ) {}

  public async execute(
    request: DecideAnswerInvitationRequest,
  ): Promise<AnswerInvitationDecisionReceipt> {
    assertCandidateActor(request.actor);
    assertTransportIdentifier(request.idempotencyKey, "Idempotency-Key");
    assertTransportIdentifier(request.correlationId, "correlationId");
    const command = AnswerInvitationDecisionCommandSchema.parse(request.command);
    const commandFingerprint = JSON.stringify({
      invitationRef: request.invitationRef,
      command,
    });

    return this.unitOfWork.runInTransaction(async (transaction) => {
      const existing = await transaction.findReceipt(request.actor.actorId, request.idempotencyKey);
      if (existing !== null) {
        if (existing.commandFingerprint !== commandFingerprint) {
          throw new AnswerInvitationDecisionApplicationError(
            "IDEMPOTENCY_CONFLICT",
            409,
            "The Idempotency-Key was already used for another Invitation decision.",
          );
        }
        return existing.receipt;
      }
      const snapshot = await transaction.loadInvitationForUpdate(request.invitationRef);
      if (snapshot === null) {
        throw new AnswerInvitationDecisionApplicationError(
          "INVITATION_NOT_FOUND",
          422,
          "The backed Answer Invitation does not exist.",
        );
      }
      const invitation = snapshot.review.invitations.find(
        ({ invitationRef }) =>
          invitationRef === request.invitationRef && invitationRef === snapshot.targetInvitationRef,
      );
      const obligation = snapshot.review.obligations.find(
        ({ obligationRef }) => obligationRef === invitation?.obligationRef,
      );
      const slot = snapshot.review.slots.find(({ slotRef }) => slotRef === obligation?.slotRef);
      if (invitation === undefined || obligation === undefined || slot === undefined) {
        throw new AnswerInvitationDecisionApplicationError(
          "INVITATION_STATE_INVALID",
          422,
          "The Invitation is missing its backed Obligation or Slot.",
        );
      }
      if (invitation.candidateRef !== request.actor.actorId) {
        throw new AnswerInvitationDecisionApplicationError(
          "CANDIDATE_MISMATCH",
          403,
          "This backed Answer Invitation belongs to another Candidate.",
        );
      }
      if (obligation.version !== command.expected_obligation_version) {
        throw new AnswerInvitationDecisionApplicationError(
          "STALE_OBLIGATION_VERSION",
          409,
          "The Answer Review Obligation changed; refresh before deciding.",
        );
      }
      if (slot.version !== command.expected_slot_version) {
        throw new AnswerInvitationDecisionApplicationError(
          "STALE_SLOT_VERSION",
          409,
          "The Answer Review Slot changed; refresh before deciding.",
        );
      }
      if (invitation.state !== "OFFERED" || obligation.state !== "INVITED") {
        throw new AnswerInvitationDecisionApplicationError(
          "INVITATION_STATE_INVALID",
          422,
          "Only one Offered Invitation backed by an Invited Obligation can be decided.",
        );
      }
      if (transaction.databaseNow.getTime() >= Date.parse(invitation.offerExpiresAt)) {
        throw new AnswerInvitationDecisionApplicationError(
          "INVITATION_EXPIRED",
          409,
          "The backed Answer Invitation reached its database-time deadline.",
        );
      }
      assertBacking(snapshot, {
        obligationRef: obligation.obligationRef,
        slotRef: slot.slotRef,
        candidateRef: invitation.candidateRef,
        opportunityRef: snapshot.review.commitment.opportunityRef,
      });

      let nextReview: RollingBlindReview;
      try {
        nextReview =
          command.decision === "ACCEPT"
            ? acceptBackedAnswerOffer(snapshot.review, {
                invitationRef: invitation.invitationRef,
                acceptedAt: transaction.databaseNow.toISOString(),
              })
            : releaseBackedAnswerOffer(snapshot.review, {
                invitationRef: invitation.invitationRef,
                reason: "CANDIDATE_DECLINED",
                releasedAt: transaction.databaseNow.toISOString(),
              }).state;
      } catch (error: unknown) {
        if (error instanceof BlindAnswerInvariantError) {
          throw new AnswerInvitationDecisionApplicationError(
            "INVITATION_STATE_INVALID",
            422,
            error.message,
          );
        }
        throw error;
      }
      const nextObligation = nextReview.obligations.find(
        ({ obligationRef }) => obligationRef === obligation.obligationRef,
      )!;
      const nextSlot = nextReview.slots.find(({ slotRef }) => slotRef === slot.slotRef)!;
      const occurredAt = transaction.databaseNow.toISOString();
      const eventId = this.ids.nextId("event");
      const commandId = this.ids.nextId("command");
      const answerSession =
        command.decision === "ACCEPT"
          ? {
              answerSessionRef: this.ids.nextId("answer-session"),
              invitationRef: invitation.invitationRef,
              obligationRef: obligation.obligationRef,
              startedAt: occurredAt,
              answerDueAt: new Date(
                transaction.databaseNow.getTime() + snapshot.effortLimitMinutes * 60_000,
              ).toISOString(),
              state: "ACTIVE" as const,
              version: 1 as const,
            }
          : null;
      const receipt = AnswerInvitationDecisionReceiptSchema.parse({
        schema_version: "answer-invitation-decision-receipt@1",
        command_id: commandId,
        event_id: eventId,
        invitation_ref: invitation.invitationRef,
        obligation_ref: obligation.obligationRef,
        slot_ref: slot.slotRef,
        decision: command.decision,
        obligation_state: command.decision === "ACCEPT" ? "ANSWER_ACTIVE" : "SETTLED",
        answer_session_ref: answerSession?.answerSessionRef ?? null,
        answer_due_at: answerSession?.answerDueAt ?? null,
        new_obligation_version: nextObligation.version,
        new_slot_version: nextSlot.version,
        occurred_at: occurredAt,
      });
      const candidateProjection = CandidateOpportunityProjectionV3Schema.parse({
        schema_version: "candidate-opportunity-projection@3",
        view: "CANDIDATE",
        state: command.decision === "ACCEPT" ? "ANSWER_ACTIVE" : "RELEASED",
        opportunity_ref: nextReview.commitment.opportunityRef,
        candidate_ref: invitation.candidateRef,
        queue_policy_version: nextReview.commitment.queuePolicyVersion,
        eligible_interests_ahead: null,
        commitment_status: nextReview.commitment.state,
        invitation_ref: invitation.invitationRef,
        obligation_ref: obligation.obligationRef,
        credit_hold_ref: snapshot.creditHold.creditHoldRef,
        answer_session_ref: answerSession?.answerSessionRef ?? null,
        answer_due_at: answerSession?.answerDueAt ?? null,
        reviewer:
          command.decision === "ACCEPT"
            ? {
                reviewer_ref: nextReview.commitment.reviewerRef,
                display_name: snapshot.reviewerDisplayName,
              }
            : null,
        message:
          command.decision === "ACCEPT"
            ? `Your ${snapshot.effortLimitMinutes}-minute blind Answer session is active and backed by named human review.`
            : "You declined this backed Answer opportunity. The release carries no capability or hiring inference.",
        runtime_mode: snapshot.runtimeMode,
        synthetic: snapshot.synthetic,
      });
      const event = {
        eventId,
        eventType:
          command.decision === "ACCEPT" ? "AnswerInvitationAccepted" : "AnswerInvitationDeclined",
        eventVersion: 1 as const,
        aggregateType: "AnswerReviewObligation",
        aggregateId: obligation.obligationRef,
        aggregateVersion: nextObligation.version,
        correlationId: request.correlationId,
        occurredAt: transaction.databaseNow,
        payload: {
          schema_version:
            command.decision === "ACCEPT"
              ? "answer-invitation-accepted@1"
              : "answer-invitation-declined@1",
          invitation_ref: invitation.invitationRef,
          obligation_ref: obligation.obligationRef,
          slot_ref: slot.slotRef,
          candidate_ref: invitation.candidateRef,
          answer_session_ref: answerSession?.answerSessionRef ?? null,
          reason_code: command.decision === "DECLINE" ? "CANDIDATE_DECLINED" : null,
        },
      };
      const outbox = this.outboxForDecision({
        snapshot,
        nextReview,
        nextSlotVersion: nextSlot.version,
        answerSessionRef: answerSession?.answerSessionRef ?? null,
        eventId,
        correlationId: request.correlationId,
        occurredAt: transaction.databaseNow,
        reason: command.decision,
      });
      const released = command.decision === "DECLINE";
      await transaction.persistDecision({
        actorRef: request.actor.actorId,
        idempotencyKey: request.idempotencyKey,
        commandFingerprint,
        previousReview: snapshot.review,
        nextReview,
        invitationRef: invitation.invitationRef,
        decidedAt: transaction.databaseNow,
        terminalStatus: released ? "DECLINED" : null,
        expectedCreditAccountVersion: snapshot.creditAccount.version,
        nextCreditAccount: released
          ? {
              ...snapshot.creditAccount,
              version: snapshot.creditAccount.version + 1,
              committedCredits:
                snapshot.creditAccount.committedCredits + snapshot.creditHold.amount,
              heldCredits: snapshot.creditAccount.heldCredits - snapshot.creditHold.amount,
            }
          : snapshot.creditAccount,
        previousCreditReservation: snapshot.slotCreditReservation,
        nextCreditReservation: released
          ? {
              ...snapshot.slotCreditReservation,
              state: "RESERVED",
              version: snapshot.slotCreditReservation.version + 1,
            }
          : snapshot.slotCreditReservation,
        previousCreditHold: snapshot.creditHold,
        nextCreditHold: released
          ? { ...snapshot.creditHold, status: "RETURNED", settledAt: occurredAt }
          : snapshot.creditHold,
        previousActivityLease: snapshot.activityLease,
        nextActivityLease: released
          ? {
              ...snapshot.activityLease,
              state: "RELEASED",
              version: snapshot.activityLease.version + 1,
              releasedAt: occurredAt,
            }
          : snapshot.activityLease,
        answerSession,
        event,
        outbox,
        employerProjection: employerProjection(snapshot, nextReview),
        candidateProjection,
        receipt,
      });
      return receipt;
    });
  }

  private outboxForDecision(input: {
    readonly snapshot: AnswerInvitationDecisionSnapshot;
    readonly nextReview: RollingBlindReview;
    readonly nextSlotVersion: number;
    readonly answerSessionRef: string | null;
    readonly eventId: string;
    readonly correlationId: string;
    readonly occurredAt: Date;
    readonly reason: "ACCEPT" | "DECLINE";
  }): readonly BlindReviewOutboxRecord[] {
    const messageId = this.ids.nextId("outbox");
    return [
      input.reason === "ACCEPT"
        ? {
            messageId,
            messageType: "AnswerSessionStarted",
            messageVersion: 1,
            eventId: input.eventId,
            idempotencyKey: `AnswerSessionStarted:${input.answerSessionRef}`,
            correlationId: input.correlationId,
            availableAt: input.occurredAt,
            payload: {
              schema_version: "answer-session-started@1",
              answer_session_ref: input.answerSessionRef,
            },
          }
        : {
            messageId,
            messageType: "OfferNextQueuedInterestRequested",
            messageVersion: 1,
            eventId: input.eventId,
            idempotencyKey: `OfferNextQueuedInterestRequested:${input.nextReview.commitment.commitmentRef}:${input.snapshot.slotCreditReservation.slotRef}:${input.nextSlotVersion}`,
            correlationId: input.correlationId,
            availableAt: input.occurredAt,
            payload: {
              schema_version: "offer-next-queued-interest-requested@1",
              opportunity_ref: input.nextReview.commitment.opportunityRef,
              commitment_ref: input.nextReview.commitment.commitmentRef,
              expected_commitment_version: input.nextReview.commitment.version,
              slot_ref: input.snapshot.slotCreditReservation.slotRef,
              expected_slot_version: input.nextSlotVersion,
              queue_policy_version: input.nextReview.commitment.queuePolicyVersion,
              public_seed: input.snapshot.publicSeed,
            },
          },
    ];
  }
}

export class ExpireAnswerInvitationHandler {
  public constructor(
    private readonly unitOfWork: AnswerInvitationDecisionUnitOfWork,
    private readonly ids: AnswerInvitationDecisionIdFactory,
  ) {}

  public async executeNext(): Promise<boolean> {
    return this.unitOfWork.runInTransaction(async (transaction) => {
      const snapshot = await transaction.findExpiredInvitationForUpdate();
      if (snapshot === null) return false;
      const invitation = snapshot.review.invitations.find(
        ({ invitationRef }) => invitationRef === snapshot.targetInvitationRef,
      );
      if (
        invitation === undefined ||
        Date.parse(invitation.offerExpiresAt) > transaction.databaseNow.getTime()
      ) {
        throw new AnswerInvitationDecisionApplicationError(
          "INVITATION_STATE_INVALID",
          422,
          "The expiry scan returned a non-expired Invitation.",
        );
      }
      const obligation = snapshot.review.obligations.find(
        ({ obligationRef }) => obligationRef === invitation.obligationRef,
      );
      const slot = snapshot.review.slots.find(({ slotRef }) => slotRef === obligation?.slotRef);
      if (obligation === undefined || slot === undefined) {
        throw new AnswerInvitationDecisionApplicationError(
          "INVITATION_STATE_INVALID",
          422,
          "The expired Invitation is missing its Obligation or Slot.",
        );
      }
      assertBacking(snapshot, {
        obligationRef: obligation.obligationRef,
        slotRef: slot.slotRef,
        candidateRef: invitation.candidateRef,
        opportunityRef: snapshot.review.commitment.opportunityRef,
      });
      const nextReview = releaseBackedAnswerOffer(snapshot.review, {
        invitationRef: invitation.invitationRef,
        reason: "OFFER_EXPIRED",
        releasedAt: transaction.databaseNow.toISOString(),
      }).state;
      const nextObligation = nextReview.obligations.find(
        ({ obligationRef }) => obligationRef === obligation.obligationRef,
      )!;
      const nextSlot = nextReview.slots.find(({ slotRef }) => slotRef === slot.slotRef)!;
      const eventId = this.ids.nextId("event");
      const occurredAt = transaction.databaseNow.toISOString();
      const event = {
        eventId,
        eventType: "AnswerInvitationExpired",
        eventVersion: 1 as const,
        aggregateType: "AnswerReviewObligation",
        aggregateId: obligation.obligationRef,
        aggregateVersion: nextObligation.version,
        correlationId: `expiry:${invitation.invitationRef}`,
        occurredAt: transaction.databaseNow,
        payload: {
          schema_version: "answer-invitation-expired@1",
          invitation_ref: invitation.invitationRef,
          obligation_ref: obligation.obligationRef,
          slot_ref: slot.slotRef,
          reason_code: "OFFER_EXPIRED",
        },
      };
      const outboxId = this.ids.nextId("outbox");
      await transaction.persistDecision({
        actorRef: null,
        idempotencyKey: null,
        commandFingerprint: null,
        previousReview: snapshot.review,
        nextReview,
        invitationRef: invitation.invitationRef,
        decidedAt: transaction.databaseNow,
        terminalStatus: "EXPIRED",
        expectedCreditAccountVersion: snapshot.creditAccount.version,
        nextCreditAccount: {
          ...snapshot.creditAccount,
          version: snapshot.creditAccount.version + 1,
          committedCredits: snapshot.creditAccount.committedCredits + snapshot.creditHold.amount,
          heldCredits: snapshot.creditAccount.heldCredits - snapshot.creditHold.amount,
        },
        previousCreditReservation: snapshot.slotCreditReservation,
        nextCreditReservation: {
          ...snapshot.slotCreditReservation,
          state: "RESERVED",
          version: snapshot.slotCreditReservation.version + 1,
        },
        previousCreditHold: snapshot.creditHold,
        nextCreditHold: { ...snapshot.creditHold, status: "RETURNED", settledAt: occurredAt },
        previousActivityLease: snapshot.activityLease,
        nextActivityLease: {
          ...snapshot.activityLease,
          state: "RELEASED",
          version: snapshot.activityLease.version + 1,
          releasedAt: occurredAt,
        },
        answerSession: null,
        event,
        outbox: [
          {
            messageId: outboxId,
            messageType: "OfferNextQueuedInterestRequested",
            messageVersion: 1,
            eventId,
            idempotencyKey: `OfferNextQueuedInterestRequested:${nextReview.commitment.commitmentRef}:${slot.slotRef}:${nextSlot.version}`,
            correlationId: event.correlationId,
            availableAt: transaction.databaseNow,
            payload: {
              schema_version: "offer-next-queued-interest-requested@1",
              opportunity_ref: nextReview.commitment.opportunityRef,
              commitment_ref: nextReview.commitment.commitmentRef,
              expected_commitment_version: nextReview.commitment.version,
              slot_ref: slot.slotRef,
              expected_slot_version: nextSlot.version,
              queue_policy_version: nextReview.commitment.queuePolicyVersion,
              public_seed: snapshot.publicSeed,
            },
          },
        ],
        employerProjection: employerProjection(snapshot, nextReview),
        candidateProjection: CandidateOpportunityProjectionV3Schema.parse({
          schema_version: "candidate-opportunity-projection@3",
          view: "CANDIDATE",
          state: "RELEASED",
          opportunity_ref: nextReview.commitment.opportunityRef,
          candidate_ref: invitation.candidateRef,
          queue_policy_version: nextReview.commitment.queuePolicyVersion,
          eligible_interests_ahead: null,
          commitment_status: nextReview.commitment.state,
          invitation_ref: invitation.invitationRef,
          obligation_ref: obligation.obligationRef,
          credit_hold_ref: snapshot.creditHold.creditHoldRef,
          answer_session_ref: null,
          answer_due_at: null,
          reviewer: null,
          message:
            "This backed Answer offer expired before acceptance. The release carries no capability or hiring inference.",
          runtime_mode: snapshot.runtimeMode,
          synthetic: snapshot.synthetic,
        }) as CandidateOpportunityProjectionV3,
        receipt: null,
      });
      return true;
    });
  }
}
