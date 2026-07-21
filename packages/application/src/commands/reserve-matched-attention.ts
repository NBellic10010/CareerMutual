import {
  AttentionAllocationReceiptSchema,
  ReserveMatchedAttentionCommandSchema,
  type AttentionAllocationReceipt,
  type ReserveMatchedAttentionCommand,
} from "@onlyboth/contracts";
import {
  MatchingInvariantError,
  assertAttentionAllocationCapacity,
  reserveReviewWindow,
  selectDirectAndExplore,
} from "@onlyboth/domain";

import type { AuthenticatedEmployerActor } from "../ports/challenge-selection";
import type { MatchingAllocationUnitOfWork, MatchingIdFactory } from "../ports/matching-allocation";

export type MatchingAllocationErrorCode =
  | "REVIEWER_MISMATCH"
  | "MATCHING_CYCLE_NOT_FOUND"
  | "STALE_MATCHING_CYCLE_VERSION"
  | "STALE_COMMITMENT_VERSION"
  | "MATCHING_CYCLE_NOT_READY"
  | "DIRECT_MATCH_EDGE_INVALID"
  | "EXPLORE_POOL_INSUFFICIENT"
  | "ATTENTION_CAPACITY_CONFLICT"
  | "IDEMPOTENCY_CONFLICT";

const STATUSES = {
  REVIEWER_MISMATCH: 403,
  MATCHING_CYCLE_NOT_FOUND: 422,
  STALE_MATCHING_CYCLE_VERSION: 409,
  STALE_COMMITMENT_VERSION: 409,
  MATCHING_CYCLE_NOT_READY: 422,
  DIRECT_MATCH_EDGE_INVALID: 422,
  EXPLORE_POOL_INSUFFICIENT: 422,
  ATTENTION_CAPACITY_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
} as const satisfies Record<MatchingAllocationErrorCode, 403 | 409 | 422>;

export class MatchingAllocationApplicationError extends Error {
  public override readonly name = "MatchingAllocationApplicationError";

  public constructor(
    public readonly code: MatchingAllocationErrorCode,
    public readonly httpStatus: 403 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export function matchingAllocationErrorDetails(
  error: unknown,
): { readonly code: MatchingAllocationErrorCode; readonly httpStatus: 403 | 409 | 422 } | null {
  if (
    error === null ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "MatchingAllocationApplicationError" ||
    !("code" in error) ||
    typeof error.code !== "string" ||
    !(error.code in STATUSES) ||
    !("httpStatus" in error) ||
    typeof error.httpStatus !== "number"
  ) {
    return null;
  }
  const code = error.code as MatchingAllocationErrorCode;
  const httpStatus = STATUSES[code];
  return error.httpStatus === httpStatus ? { code, httpStatus } : null;
}

function mapDomainError(error: MatchingInvariantError): MatchingAllocationApplicationError {
  if (error.code === "MATCHING_CYCLE_NOT_READY") {
    return new MatchingAllocationApplicationError(error.code, 422, error.message);
  }
  if (error.code === "DIRECT_MATCH_EDGE_INVALID") {
    return new MatchingAllocationApplicationError(error.code, 422, error.message);
  }
  if (error.code === "EXPLORE_POOL_INSUFFICIENT") {
    return new MatchingAllocationApplicationError(error.code, 422, error.message);
  }
  return new MatchingAllocationApplicationError("ATTENTION_CAPACITY_CONFLICT", 409, error.message);
}

export interface ReserveMatchedAttentionRequest {
  readonly opportunityRef: string;
  readonly actor: AuthenticatedEmployerActor;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly command: ReserveMatchedAttentionCommand;
}

export class ReserveMatchedAttentionHandler {
  public constructor(
    private readonly unitOfWork: MatchingAllocationUnitOfWork,
    private readonly ids: MatchingIdFactory,
    private readonly hash: (value: string) => string,
  ) {}

  public async execute(
    request: ReserveMatchedAttentionRequest,
  ): Promise<AttentionAllocationReceipt> {
    const command = ReserveMatchedAttentionCommandSchema.parse(request.command);
    const commandFingerprint = JSON.stringify(command);
    try {
      return await this.unitOfWork.runInTransaction(async (transaction) => {
        const existing = await transaction.findReceipt(
          request.actor.actorId,
          request.idempotencyKey,
        );
        if (existing !== null) {
          if (existing.commandFingerprint !== commandFingerprint) {
            throw new MatchingAllocationApplicationError(
              "IDEMPOTENCY_CONFLICT",
              409,
              "The Idempotency-Key was already used for another command.",
            );
          }
          return existing.receipt;
        }
        const snapshot = await transaction.loadForUpdate(request.opportunityRef);
        if (snapshot === null) {
          throw new MatchingAllocationApplicationError(
            "MATCHING_CYCLE_NOT_FOUND",
            422,
            "No Matching Cycle exists for this opportunity.",
          );
        }
        if (snapshot.commitment.reviewerRef !== request.actor.actorId) {
          throw new MatchingAllocationApplicationError(
            "REVIEWER_MISMATCH",
            403,
            "Only the named reviewer can reserve this attention.",
          );
        }
        if (snapshot.matchingCycle.version !== command.expected_matching_cycle_version) {
          throw new MatchingAllocationApplicationError(
            "STALE_MATCHING_CYCLE_VERSION",
            409,
            "The Matching Cycle changed; refresh before reserving.",
          );
        }
        if (snapshot.commitment.version !== command.expected_commitment_version) {
          throw new MatchingAllocationApplicationError(
            "STALE_COMMITMENT_VERSION",
            409,
            "The Attention Commitment changed; refresh before reserving.",
          );
        }
        assertAttentionAllocationCapacity({
          commitment: snapshot.commitment,
          slots: snapshot.slots,
          creditAccount: snapshot.creditAccount,
          activeWindowCount: snapshot.activeWindowCount,
          candidateActiveWindowCounts: snapshot.candidateActiveWindowCounts,
          candidateRefs: snapshot.candidates.map((candidate) => candidate.candidateRef),
        });
        const decisions = selectDirectAndExplore({
          cycle: {
            ...snapshot.matchingCycle,
            expectedInterestCount: snapshot.employerProjection.eligible_count,
            proposeCount: snapshot.employerProjection.proofable_count,
            abstainCount: snapshot.employerProjection.abstain_count,
            needsHumanCount: snapshot.employerProjection.needs_human_count,
          },
          directMatchEdgeRef: command.direct_match_edge_ref,
          candidates: snapshot.candidates,
          activeCandidateRefs: snapshot.activeCandidateRefs,
          publicSeed: snapshot.matchingCycle.publicSeed,
          hash: this.hash,
        });
        if (decisions[1].publicHash === null) {
          throw new MatchingAllocationApplicationError(
            "EXPLORE_POOL_INSUFFICIENT",
            422,
            "Explore selection did not produce a public hash.",
          );
        }
        const directSlot = snapshot.slots.find((slot) => slot.slotKind === "DIRECT");
        const exploreSlot = snapshot.slots.find((slot) => slot.slotKind === "EXPLORE");
        if (directSlot === undefined || exploreSlot === undefined) {
          throw new MatchingAllocationApplicationError(
            "ATTENTION_CAPACITY_CONFLICT",
            409,
            "The Direct and Explore slots are unavailable.",
          );
        }
        const acceptBy = new Date(
          transaction.databaseNow.getTime() + snapshot.commitment.acceptSlaHours * 3_600_000,
        ).toISOString();
        const directHoldRef = this.ids.boundId(
          "credit-hold",
          decisions[0].candidateRef,
          snapshot.matchingCycle.matchingCycleRef,
        );
        const exploreHoldRef = this.ids.boundId(
          "credit-hold",
          decisions[1].candidateRef,
          snapshot.matchingCycle.matchingCycleRef,
        );
        const directWindowRef = this.ids.boundId(
          "review-window",
          decisions[0].candidateRef,
          snapshot.matchingCycle.matchingCycleRef,
        );
        const exploreWindowRef = this.ids.boundId(
          "review-window",
          decisions[1].candidateRef,
          snapshot.matchingCycle.matchingCycleRef,
        );
        const directWindow = reserveReviewWindow({
          id: directWindowRef,
          candidateId: decisions[0].candidateRef,
          opportunityId: snapshot.matchingCycle.opportunityRef,
          reviewerId: snapshot.commitment.reviewerRef,
          attentionSlotId: directSlot.slotRef,
          attentionSlotAvailable: directSlot.available,
          creditHoldId: directHoldRef,
          creditHoldStatus: "HELD",
          matchEdgeId: decisions[0].matchEdgeRef,
          versionPins: snapshot.versionPins,
          acceptBy,
        }).window;
        const exploreWindow = reserveReviewWindow({
          id: exploreWindowRef,
          candidateId: decisions[1].candidateRef,
          opportunityId: snapshot.matchingCycle.opportunityRef,
          reviewerId: snapshot.commitment.reviewerRef,
          attentionSlotId: exploreSlot.slotRef,
          attentionSlotAvailable: exploreSlot.available,
          creditHoldId: exploreHoldRef,
          creditHoldStatus: "HELD",
          matchEdgeId: decisions[1].matchEdgeRef,
          versionPins: snapshot.versionPins,
          acceptBy,
        }).window;
        const commandId = this.ids.nextId("command");
        const eventId = this.ids.nextId("event");
        const allocationRunRef = this.ids.nextId("allocation-run");
        const direct = {
          allocation_kind: "DIRECT" as const,
          candidate_ref: decisions[0].candidateRef,
          match_edge_ref: decisions[0].matchEdgeRef,
          review_window_ref: directWindowRef,
          attention_slot_ref: directSlot.slotRef,
          credit_hold_ref: directHoldRef,
          credits: snapshot.commitment.creditPerWindow,
          public_hash: null,
        };
        const explore = {
          allocation_kind: "EXPLORE" as const,
          candidate_ref: decisions[1].candidateRef,
          match_edge_ref: decisions[1].matchEdgeRef,
          review_window_ref: exploreWindowRef,
          attention_slot_ref: exploreSlot.slotRef,
          credit_hold_ref: exploreHoldRef,
          credits: snapshot.commitment.creditPerWindow,
          public_hash: decisions[1].publicHash,
        };
        const receipt = AttentionAllocationReceiptSchema.parse({
          schema_version: "attention-allocation-receipt@1",
          command_id: commandId,
          event_id: eventId,
          allocation_run_ref: allocationRunRef,
          matching_cycle_ref: snapshot.matchingCycle.matchingCycleRef,
          new_matching_cycle_version: snapshot.matchingCycle.version + 1,
          new_commitment_version: snapshot.commitment.version + 1,
          public_seed: snapshot.matchingCycle.publicSeed,
          allocator_version: snapshot.matchingCycle.allocatorVersion,
          direct,
          explore,
          occurred_at: transaction.databaseNow.toISOString(),
        });
        await transaction.persist({
          actorRef: request.actor.actorId,
          idempotencyKey: request.idempotencyKey,
          commandFingerprint,
          commandId,
          eventId,
          outboxIds: [this.ids.nextId("outbox"), this.ids.nextId("outbox")],
          allocationRunRef,
          commitmentRef: snapshot.commitment.commitmentRef,
          creditAccountRef: snapshot.creditAccount.accountRef,
          expectedMatchingCycleVersion: snapshot.matchingCycle.version,
          expectedCommitmentVersion: snapshot.commitment.version,
          windows: [directWindow, exploreWindow],
          allocations: [
            {
              allocationKind: "DIRECT",
              candidateRef: direct.candidate_ref,
              matchEdgeRef: direct.match_edge_ref,
              publicHash: null,
              attentionSlotRef: direct.attention_slot_ref,
              creditHoldRef: direct.credit_hold_ref,
            },
            {
              allocationKind: "EXPLORE",
              candidateRef: explore.candidate_ref,
              matchEdgeRef: explore.match_edge_ref,
              publicHash: explore.public_hash,
              attentionSlotRef: explore.attention_slot_ref,
              creditHoldRef: explore.credit_hold_ref,
            },
          ],
          receipt,
          correlationId: request.correlationId,
        });
        return receipt;
      });
    } catch (error: unknown) {
      if (error instanceof MatchingAllocationApplicationError) throw error;
      if (error instanceof MatchingInvariantError) throw mapDomainError(error);
      throw error;
    }
  }
}
