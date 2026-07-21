import {
  CandidateEligibilityProjectionSchema,
  RefreshCandidateEligibilityCommandSchema,
  type RefreshCandidateEligibilityCommand,
} from "@onlyboth/contracts";

import { FunctionalProductApplicationError } from "./functional-product";
import type { CandidateDiscoveryCommandContext } from "../ports/candidate-discovery";
import type {
  CandidateEligibilityIdFactory,
  CandidateEligibilityStore,
} from "../ports/candidate-eligibility";
import type { FunctionalActor } from "../ports/functional-product";

function requireCandidate(actor: FunctionalActor): void {
  if (actor.role !== "CANDIDATE" || actor.actorId.trim().length === 0) {
    throw new FunctionalProductApplicationError(
      actor.actorId.trim().length === 0 ? "AUTH_REQUIRED" : "ROLE_FORBIDDEN",
      "Candidate authentication is required.",
    );
  }
}

export class CandidateEligibilityService {
  public constructor(
    private readonly store: CandidateEligibilityStore,
    private readonly ids: CandidateEligibilityIdFactory,
  ) {}

  public async getProjection(actor: FunctionalActor) {
    requireCandidate(actor);
    return CandidateEligibilityProjectionSchema.parse(
      await this.store.getProjection(actor.actorId),
    );
  }

  public async refresh(
    context: CandidateDiscoveryCommandContext,
    commandInput: RefreshCandidateEligibilityCommand,
  ) {
    requireCandidate(context.actor);
    if (context.idempotencyKey.trim().length === 0 || context.correlationId.trim().length === 0) {
      throw new FunctionalProductApplicationError(
        "IDEMPOTENCY_CONFLICT",
        "The command envelope is invalid.",
      );
    }
    const command = RefreshCandidateEligibilityCommandSchema.parse(commandInput);
    return CandidateEligibilityProjectionSchema.parse(
      await this.store.refresh({ context, command, ids: this.ids }),
    );
  }
}
