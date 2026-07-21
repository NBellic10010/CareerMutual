import {
  AiSha256Schema,
  CandidateInterestCommandSchema,
  CandidateInterestReceiptSchema,
  CandidateOpportunityProjectionV3Schema,
  type CandidateInterestCommand,
  type CandidateInterestReceipt,
} from "@onlyboth/contracts";
import { MatchingInvariantError, evaluateEligibility } from "@onlyboth/domain";

import type {
  CandidateInterestIdFactory,
  CandidateInterestUnitOfWork,
  StoredCandidateInterest,
} from "../ports/candidate-interest";
import type { AuthenticatedCandidateActor } from "../ports/proof-window-decision";

export type SubmitCandidateInterestErrorCode =
  | "CANDIDATE_AUTH_REQUIRED"
  | "OPPORTUNITY_NOT_FOUND"
  | "INTEREST_INTAKE_NOT_ACTIVE"
  | "STALE_OPPORTUNITY_VERSION"
  | "STALE_CONSENT_VERSION"
  | "IDEMPOTENCY_CONFLICT"
  | "INTEREST_ALREADY_EXISTS"
  | "HARD_FACTS_INVALID"
  | "ELIGIBILITY_CONFIGURATION_INVALID";

const STATUSES = {
  CANDIDATE_AUTH_REQUIRED: 403,
  OPPORTUNITY_NOT_FOUND: 404,
  INTEREST_INTAKE_NOT_ACTIVE: 422,
  STALE_OPPORTUNITY_VERSION: 409,
  STALE_CONSENT_VERSION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INTEREST_ALREADY_EXISTS: 409,
  HARD_FACTS_INVALID: 422,
  ELIGIBILITY_CONFIGURATION_INVALID: 422,
} as const satisfies Record<SubmitCandidateInterestErrorCode, 403 | 404 | 409 | 422>;

export class SubmitCandidateInterestApplicationError extends Error {
  public override readonly name = "SubmitCandidateInterestApplicationError";

  public constructor(
    public readonly code: SubmitCandidateInterestErrorCode,
    public readonly httpStatus: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export function submitCandidateInterestErrorDetails(error: unknown): {
  readonly code: SubmitCandidateInterestErrorCode;
  readonly httpStatus: 403 | 404 | 409 | 422;
} | null {
  if (
    error === null ||
    typeof error !== "object" ||
    !(error instanceof SubmitCandidateInterestApplicationError)
  ) {
    return null;
  }
  const httpStatus = STATUSES[error.code];
  return error.httpStatus === httpStatus ? { code: error.code, httpStatus } : null;
}

export interface SubmitCandidateInterestRequest {
  readonly opportunityRef: string;
  readonly actor: AuthenticatedCandidateActor;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly command: CandidateInterestCommand;
}

function requireTransportIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new SubmitCandidateInterestApplicationError(
      "IDEMPOTENCY_CONFLICT",
      409,
      `${field} is missing or invalid.`,
    );
  }
}

function requireCandidateActor(actor: AuthenticatedCandidateActor): void {
  const unsafeActor = actor as { readonly role?: unknown; readonly actorId?: unknown };
  if (
    unsafeActor.role !== "CANDIDATE" ||
    typeof unsafeActor.actorId !== "string" ||
    unsafeActor.actorId.trim().length === 0 ||
    unsafeActor.actorId.length > 200
  ) {
    throw new SubmitCandidateInterestApplicationError(
      "CANDIDATE_AUTH_REQUIRED",
      403,
      "Candidate authentication is required to submit Interest.",
    );
  }
}

function hardFactsByType(
  hardFacts: CandidateInterestCommand["hard_facts"],
): Readonly<Record<string, boolean | number | string>> {
  const factRefs = new Set<string>();
  const factTypes = new Set<string>();
  const result: Record<string, boolean | number | string> = {};
  for (const fact of hardFacts) {
    if (factRefs.has(fact.fact_ref) || factTypes.has(fact.fact_type)) {
      throw new SubmitCandidateInterestApplicationError(
        "HARD_FACTS_INVALID",
        422,
        "Hard fact references and types must be unique within an Interest.",
      );
    }
    factRefs.add(fact.fact_ref);
    factTypes.add(fact.fact_type);
    result[fact.fact_type] = fact.value;
  }
  return result;
}

export class SubmitCandidateInterestHandler {
  public constructor(
    private readonly unitOfWork: CandidateInterestUnitOfWork,
    private readonly ids: CandidateInterestIdFactory,
    private readonly hash: (value: string) => string,
  ) {}

  public async execute(request: SubmitCandidateInterestRequest): Promise<CandidateInterestReceipt> {
    requireCandidateActor(request.actor);
    requireTransportIdentifier(request.opportunityRef, "opportunityRef");
    requireTransportIdentifier(request.idempotencyKey, "Idempotency-Key");
    requireTransportIdentifier(request.correlationId, "correlationId");
    const command = CandidateInterestCommandSchema.parse(request.command);
    const commandFingerprint = JSON.stringify({
      opportunityRef: request.opportunityRef,
      command,
    });

    try {
      return await this.unitOfWork.runInTransaction(async (transaction) => {
        const existingReceipt = await transaction.findReceipt(
          request.actor.actorId,
          request.idempotencyKey,
        );
        if (existingReceipt !== null) {
          if (existingReceipt.commandFingerprint !== commandFingerprint) {
            throw new SubmitCandidateInterestApplicationError(
              "IDEMPOTENCY_CONFLICT",
              409,
              "The Idempotency-Key was already used for another Candidate Interest command.",
            );
          }
          return existingReceipt.receipt;
        }

        const snapshot = await transaction.loadForUpdate(
          request.opportunityRef,
          request.actor.actorId,
        );
        if (snapshot === null) {
          throw new SubmitCandidateInterestApplicationError(
            "OPPORTUNITY_NOT_FOUND",
            404,
            "The Opportunity is not available to this Candidate.",
          );
        }
        if (snapshot.opportunityState !== "OPEN" || snapshot.commitmentState !== "ACTIVE") {
          throw new SubmitCandidateInterestApplicationError(
            "INTEREST_INTAKE_NOT_ACTIVE",
            422,
            "The Opportunity is not accepting Interests backed by active review attention.",
          );
        }
        if (snapshot.opportunityVersion !== command.expected_opportunity_version) {
          throw new SubmitCandidateInterestApplicationError(
            "STALE_OPPORTUNITY_VERSION",
            409,
            "The Opportunity changed; refresh before submitting Interest.",
          );
        }
        if (snapshot.requiredConsentVersion !== command.consent_version) {
          throw new SubmitCandidateInterestApplicationError(
            "STALE_CONSENT_VERSION",
            409,
            "The Candidate Interest consent changed; refresh before submitting Interest.",
          );
        }
        if (snapshot.existingInterest !== null) {
          throw new SubmitCandidateInterestApplicationError(
            "INTEREST_ALREADY_EXISTS",
            409,
            "This Candidate has already submitted Interest for the Opportunity.",
          );
        }
        if (
          command.background_access_basis !== snapshot.backgroundAccess.basis ||
          (snapshot.backgroundAccess.basis === "AI_POSITIVE_EVIDENCE" &&
            (command.eligibility_match_ref !== snapshot.backgroundAccess.eligibilityMatchRef ||
              command.eligibility_match_version !==
                snapshot.backgroundAccess.eligibilityMatchVersion))
        ) {
          throw new SubmitCandidateInterestApplicationError(
            "STALE_OPPORTUNITY_VERSION",
            409,
            "The Candidate Eligibility Match changed; refresh before registering Interest.",
          );
        }

        const hardFacts = hardFactsByType(command.hard_facts);
        const interestRef = this.ids.nextId("candidate-interest");
        const eligibilityEdgeRef = this.ids.nextId("eligibility-edge");
        let eligibility;
        try {
          eligibility = evaluateEligibility({
            eligibilityEdgeRef,
            opportunityRef: snapshot.opportunityRef,
            candidateRef: request.actor.actorId,
            contractVersionRef: snapshot.contractVersionRef,
            predicates: snapshot.eligibilityPredicates,
            hardFacts,
            backgroundAccess: snapshot.backgroundAccess,
          });
        } catch (error) {
          if (error instanceof MatchingInvariantError) {
            throw new SubmitCandidateInterestApplicationError(
              "ELIGIBILITY_CONFIGURATION_INVALID",
              422,
              error.message,
            );
          }
          throw error;
        }

        const occurredAt = transaction.databaseNow.toISOString();
        const finalState = eligibility.eligible
          ? "WAITING_FOR_BACKED_SLOT"
          : "INELIGIBLE_HARD_REQUIREMENT";
        const queueTieBreak = AiSha256Schema.parse(
          this.hash(`${snapshot.publicSeed}|${snapshot.opportunityRef}|${request.actor.actorId}`),
        );
        const interest: StoredCandidateInterest = {
          interestRef,
          opportunityRef: snapshot.opportunityRef,
          candidateRef: request.actor.actorId,
          status: finalState,
          queuePolicyVersion: snapshot.queuePolicyVersion,
          queueTieBreak,
          consentVersion: command.consent_version,
          interestCreatedAt: occurredAt,
          eligibleAt: eligibility.eligible ? occurredAt : null,
          version: 2,
        };
        const commandId = this.ids.nextId("command");
        const receivedEventId = this.ids.nextId("event");
        const determinedEventId = this.ids.nextId("event");
        const outboxId = this.ids.nextId("outbox");
        const receipt = CandidateInterestReceiptSchema.parse({
          schema_version: "candidate-interest-receipt@1",
          command_id: commandId,
          event_id: receivedEventId,
          interest_ref: interestRef,
          opportunity_ref: snapshot.opportunityRef,
          state: "INTEREST_RECEIVED",
          new_opportunity_version: snapshot.opportunityVersion,
          occurred_at: occurredAt,
        });
        const candidateProjection = CandidateOpportunityProjectionV3Schema.parse({
          schema_version: "candidate-opportunity-projection@3",
          view: "CANDIDATE",
          state: finalState,
          opportunity_ref: snapshot.opportunityRef,
          candidate_ref: request.actor.actorId,
          queue_policy_version: snapshot.queuePolicyVersion,
          eligible_interests_ahead: null,
          commitment_status: snapshot.commitmentState,
          message: eligibility.eligible
            ? "Your Interest passed the sealed hard requirements and is waiting for a backed review Slot."
            : "Your Interest did not satisfy at least one sealed hard requirement; this is not a conclusion about your ability.",
          runtime_mode: snapshot.runtimeMode,
          synthetic: snapshot.synthetic,
        });
        const events = [
          {
            eventId: receivedEventId,
            eventType: "CandidateInterestReceived",
            eventVersion: 1 as const,
            aggregateType: "CandidateInterest",
            aggregateId: interestRef,
            aggregateVersion: 1,
            correlationId: request.correlationId,
            occurredAt: transaction.databaseNow,
            payload: {
              opportunity_ref: snapshot.opportunityRef,
              candidate_ref: request.actor.actorId,
              consent_version: command.consent_version,
            },
          },
          {
            eventId: determinedEventId,
            eventType: "CandidateInterestEligibilityDetermined",
            eventVersion: 1 as const,
            aggregateType: "CandidateInterest",
            aggregateId: interestRef,
            aggregateVersion: 2,
            correlationId: request.correlationId,
            occurredAt: transaction.databaseNow,
            payload: {
              eligibility_edge_ref: eligibilityEdgeRef,
              background_access_basis: eligibility.backgroundAccessBasis,
              eligibility_match_ref: eligibility.eligibilityMatchRef,
              eligible: eligibility.eligible,
              final_state: finalState,
            },
          },
        ] as const;
        const outbox = {
          messageId: outboxId,
          messageType: "CandidateInterestEligibilityDetermined",
          messageVersion: 1 as const,
          eventId: determinedEventId,
          idempotencyKey: `candidate-interest-eligibility:${interestRef}:2`,
          correlationId: request.correlationId,
          availableAt: transaction.databaseNow,
          payload: {
            schema_version: "candidate-interest-eligibility-determined@1",
            opportunity_ref: snapshot.opportunityRef,
            interest_ref: interestRef,
            eligibility_edge_ref: eligibilityEdgeRef,
            eligible: eligibility.eligible,
            final_state: finalState,
            queue_reconcile_requested: eligibility.eligible,
          },
        } as const;

        await transaction.persist({
          actorRef: request.actor.actorId,
          idempotencyKey: request.idempotencyKey,
          commandFingerprint,
          expectedOpportunityVersion: command.expected_opportunity_version,
          interest,
          hardFacts: command.hard_facts,
          eligibility,
          events,
          outbox,
          candidateProjection,
          receipt,
        });
        return receipt;
      });
    } catch (error) {
      if (error instanceof SubmitCandidateInterestApplicationError) throw error;
      throw error;
    }
  }
}
