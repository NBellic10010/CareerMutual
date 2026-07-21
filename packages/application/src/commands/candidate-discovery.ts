import {
  CandidateEvidencePassportProjectionSchema,
  CandidateEvidencePassportReceiptSchema,
  PublishCandidateEvidencePassportCommandSchema,
  RefreshCandidateDiscoveryCommandSchema,
  SaveCandidateEvidencePassportDraftCommandSchema,
  type PublishCandidateEvidencePassportCommand,
  type RefreshCandidateDiscoveryCommand,
  type SaveCandidateEvidencePassportDraftCommand,
} from "@onlyboth/contracts";

import { FunctionalProductApplicationError } from "./functional-product";
import type {
  CandidateDiscoveryCommandContext,
  CandidateDiscoveryIdFactory,
  CandidateEvidencePassportStore,
} from "../ports/candidate-discovery";
import type { FunctionalActor } from "../ports/functional-product";

function requireCandidate(actor: FunctionalActor): void {
  if (actor.role !== "CANDIDATE" || actor.actorId.trim().length === 0) {
    throw new FunctionalProductApplicationError(
      actor.actorId.trim().length === 0 ? "AUTH_REQUIRED" : "ROLE_FORBIDDEN",
      "Candidate authentication is required.",
    );
  }
}

function requireEnvelope(context: CandidateDiscoveryCommandContext): void {
  if (
    context.idempotencyKey.trim().length === 0 ||
    context.idempotencyKey.length > 200 ||
    context.correlationId.trim().length === 0 ||
    context.correlationId.length > 200
  ) {
    throw new FunctionalProductApplicationError(
      "IDEMPOTENCY_CONFLICT",
      "The command envelope is missing or invalid.",
    );
  }
}

export class CandidateEvidencePassportService {
  public constructor(
    private readonly store: CandidateEvidencePassportStore,
    private readonly ids: CandidateDiscoveryIdFactory,
  ) {}

  public async getProjection(actor: FunctionalActor) {
    requireCandidate(actor);
    return CandidateEvidencePassportProjectionSchema.parse(
      await this.store.getPassportProjection(actor.actorId),
    );
  }

  public async saveDraft(
    context: CandidateDiscoveryCommandContext,
    commandInput: SaveCandidateEvidencePassportDraftCommand,
  ) {
    requireCandidate(context.actor);
    requireEnvelope(context);
    const command = SaveCandidateEvidencePassportDraftCommandSchema.parse(commandInput);
    return CandidateEvidencePassportReceiptSchema.parse(
      await this.store.saveDraft({
        context,
        expectedDraftVersion: command.expected_draft_version,
        education: command.education,
        evidenceItems: command.evidence_items,
        ids: this.ids,
      }),
    );
  }

  public async publish(
    context: CandidateDiscoveryCommandContext,
    commandInput: PublishCandidateEvidencePassportCommand,
  ) {
    requireCandidate(context.actor);
    requireEnvelope(context);
    const command = PublishCandidateEvidencePassportCommandSchema.parse(commandInput);
    return CandidateEvidencePassportReceiptSchema.parse(
      await this.store.publishPassport({
        context,
        expectedDraftVersion: command.expected_draft_version,
        discoveryConsentVersion: command.discovery_consent_version,
        ids: this.ids,
      }),
    );
  }

  public async refresh(
    context: CandidateDiscoveryCommandContext,
    commandInput: RefreshCandidateDiscoveryCommand,
  ) {
    requireCandidate(context.actor);
    requireEnvelope(context);
    const command = RefreshCandidateDiscoveryCommandSchema.parse(commandInput);
    return CandidateEvidencePassportReceiptSchema.parse(
      await this.store.refreshDiscovery({
        context,
        expectedProjectionVersion: command.expected_projection_version,
        ids: this.ids,
      }),
    );
  }
}
