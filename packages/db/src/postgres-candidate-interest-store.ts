import type {
  CandidateInterestSubmissionSnapshot,
  CandidateInterestTransaction,
  CandidateInterestUnitOfWork,
  PersistCandidateInterestSubmission,
  StoredCandidateInterestCommandReceipt,
} from "@onlyboth/application";
import {
  CandidateInterestReceiptSchema,
  CandidateOpportunityProjectionV3Schema,
} from "@onlyboth/contracts";
import type { EligibilityPredicate } from "@onlyboth/domain";
import type { Pool, PoolClient } from "pg";

import { PostgresOptimisticConcurrencyError } from "./postgres-challenge-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseEligibilityPredicates(contract: unknown): readonly EligibilityPredicate[] {
  if (!isRecord(contract) || !Array.isArray(contract.hard_predicates)) {
    throw new Error("The sealed Capability Contract has no hard Eligibility predicates.");
  }
  return contract.hard_predicates.map((value): EligibilityPredicate => {
    if (
      !isRecord(value) ||
      typeof value.predicate_ref !== "string" ||
      typeof value.fact_type !== "string"
    ) {
      throw new Error("The sealed Capability Contract contains an invalid Eligibility predicate.");
    }
    if (
      value.operator === "EQUALS" &&
      (typeof value.expected === "boolean" ||
        typeof value.expected === "number" ||
        typeof value.expected === "string")
    ) {
      return {
        predicateRef: value.predicate_ref,
        factRef: value.fact_type,
        operator: "EQUALS",
        expected: value.expected,
      };
    }
    if (value.operator === "GTE" && typeof value.minimum === "number") {
      return {
        predicateRef: value.predicate_ref,
        factRef: value.fact_type,
        operator: "GTE",
        minimum: value.minimum,
      };
    }
    if (value.operator === "CONTAINS" && typeof value.member === "string") {
      return {
        predicateRef: value.predicate_ref,
        factRef: value.fact_type,
        operator: "CONTAINS",
        member: value.member,
      };
    }
    throw new Error("The sealed Capability Contract contains an unsupported predicate.");
  });
}

class PostgresCandidateInterestTransaction implements CandidateInterestTransaction {
  public constructor(
    private readonly client: PoolClient,
    public readonly databaseNow: Date,
  ) {}

  public async findReceipt(
    actorRef: string,
    idempotencyKey: string,
  ): Promise<StoredCandidateInterestCommandReceipt | null> {
    await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `blind-review-command:${actorRef}:${idempotencyKey}`,
    ]);
    const result = await this.client.query<{
      command_fingerprint: string;
      command_type: string;
      receipt_json: unknown;
    }>(
      `SELECT command_fingerprint, command_type, receipt_json
         FROM blind_review_command_receipts
        WHERE actor_ref = $1 AND idempotency_key = $2`,
      [actorRef, idempotencyKey],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    if (row.command_type !== "SubmitCandidateInterest") {
      throw new PostgresOptimisticConcurrencyError(
        "The Candidate Interest Idempotency-Key belongs to another command type.",
      );
    }
    return {
      actorRef,
      idempotencyKey,
      commandFingerprint: row.command_fingerprint,
      receipt: CandidateInterestReceiptSchema.parse(row.receipt_json),
    };
  }

  public async loadForUpdate(
    opportunityRef: string,
    candidateRef: string,
  ): Promise<CandidateInterestSubmissionSnapshot | null> {
    const opportunityResult = await this.client.query<{
      opportunity_ref: string;
      opportunity_version: number;
      opportunity_state: "OPEN" | "CLOSED";
      required_interest_consent_version: string;
      contract_version_ref: string;
      contract_json: unknown;
      runtime_mode: "LIVE" | "CACHED_AI" | "GOLDEN_REPLAY";
      synthetic: boolean;
      eligibility_policy_ref: string;
      eligibility_access_mode: "OPEN_TO_ALL" | "EVIDENCE_MATCH_REQUIRED";
      eligibility_match_ref: string | null;
      eligibility_match_version: number | null;
      passport_snapshot_ref: string | null;
      eligibility_match_state: string | null;
    }>(
      `SELECT opportunity.id AS opportunity_ref,
              opportunity.version AS opportunity_version,
              opportunity.status AS opportunity_state,
              opportunity.required_interest_consent_version,
              contract.contract_version_ref,
              contract.contract_json,
              opportunity.runtime_mode,
              opportunity.synthetic,
              policy.policy_ref AS eligibility_policy_ref,
              policy.access_mode AS eligibility_access_mode,
              eligibility_match.match_ref AS eligibility_match_ref,
              eligibility_match.match_version AS eligibility_match_version,
              eligibility_match.passport_snapshot_ref,
              eligibility_match.state AS eligibility_match_state
         FROM opportunities AS opportunity
         JOIN sealed_capability_contracts AS contract
           ON contract.contract_version_ref = opportunity.current_contract_version_ref
         JOIN job_eligibility_match_policies AS policy
           ON policy.opportunity_ref = opportunity.id
         LEFT JOIN LATERAL (
           SELECT candidate_match.match_ref, candidate_match.match_version,
                  candidate_match.passport_snapshot_ref, candidate_match.state
             FROM candidate_job_eligibility_matches AS candidate_match
             JOIN candidate_evidence_passport_snapshots AS passport
               ON passport.snapshot_ref = candidate_match.passport_snapshot_ref
            WHERE candidate_match.candidate_ref = $2
              AND candidate_match.opportunity_ref = opportunity.id
              AND candidate_match.opportunity_version = opportunity.version
              AND candidate_match.contract_version_ref = opportunity.current_contract_version_ref
              AND passport.snapshot_version = (
                SELECT MAX(latest.snapshot_version)
                  FROM candidate_evidence_passport_snapshots AS latest
                 WHERE latest.candidate_ref = $2
              )
            ORDER BY candidate_match.created_at DESC, candidate_match.match_ref DESC
            LIMIT 1
         ) AS eligibility_match ON true
        WHERE opportunity.id = $1
        FOR UPDATE OF opportunity`,
      [opportunityRef, candidateRef],
    );
    const opportunity = opportunityResult.rows[0];
    if (opportunity === undefined) return null;
    if (
      opportunity.eligibility_access_mode === "EVIDENCE_MATCH_REQUIRED" &&
      (opportunity.eligibility_match_state !== "POSITIVE_EVIDENCE" ||
        opportunity.eligibility_match_ref === null ||
        opportunity.eligibility_match_version === null ||
        opportunity.passport_snapshot_ref === null)
    ) {
      return null;
    }

    const commitmentResult = await this.client.query<{
      state: string;
      queue_policy_version: "onlyboth.interest-queue@1";
      queue_public_seed: string;
    }>(
      `SELECT state, queue_policy_version, queue_public_seed
         FROM blind_review_commitments
        WHERE opportunity_ref = $1
        FOR UPDATE`,
      [opportunityRef],
    );
    const commitment = commitmentResult.rows[0];
    const existingResult = await this.client.query<{
      interest_ref: string;
      status: string;
      queue_policy_version: string | null;
      queue_tie_break: string | null;
      consent_version: string | null;
      interest_created_at: Date;
      eligible_at: Date | null;
      version: number;
    }>(
      `SELECT interest_ref, status, queue_policy_version, queue_tie_break,
              consent_version, interest_created_at, eligible_at, version
         FROM candidate_interests
        WHERE opportunity_ref = $1 AND candidate_ref = $2
        FOR UPDATE`,
      [opportunityRef, candidateRef],
    );
    const existing = existingResult.rows[0];
    const commitmentState =
      commitment?.state === "ACTIVE"
        ? ("ACTIVE" as const)
        : commitment?.state === "CLOSED" || commitment?.state === "CLOSING"
          ? ("CLOSED" as const)
          : ("PAUSED" as const);
    return {
      opportunityRef: opportunity.opportunity_ref,
      opportunityVersion: opportunity.opportunity_version,
      opportunityState: opportunity.opportunity_state,
      commitmentState,
      contractVersionRef: opportunity.contract_version_ref,
      requiredConsentVersion: opportunity.required_interest_consent_version,
      queuePolicyVersion: commitment?.queue_policy_version ?? "onlyboth.interest-queue@1",
      publicSeed: commitment?.queue_public_seed ?? `inactive:${opportunity.opportunity_ref}`,
      runtimeMode: opportunity.runtime_mode,
      synthetic: opportunity.synthetic,
      eligibilityPredicates: parseEligibilityPredicates(opportunity.contract_json),
      backgroundAccess:
        opportunity.eligibility_access_mode === "OPEN_TO_ALL"
          ? {
              basis: "OPEN_TO_ALL",
              eligibilityPolicyRef: opportunity.eligibility_policy_ref,
            }
          : {
              basis: "AI_POSITIVE_EVIDENCE",
              eligibilityPolicyRef: opportunity.eligibility_policy_ref,
              passportSnapshotRef: opportunity.passport_snapshot_ref!,
              eligibilityMatchRef: opportunity.eligibility_match_ref!,
              eligibilityMatchVersion: opportunity.eligibility_match_version!,
            },
      existingInterest:
        existing === undefined
          ? null
          : {
              interestRef: existing.interest_ref,
              opportunityRef,
              candidateRef,
              status:
                existing.status === "INELIGIBLE_HARD_REQUIREMENT"
                  ? "INELIGIBLE_HARD_REQUIREMENT"
                  : "WAITING_FOR_BACKED_SLOT",
              queuePolicyVersion: "onlyboth.interest-queue@1",
              queueTieBreak: existing.queue_tie_break ?? "sha256:" + "0".repeat(64),
              consentVersion: existing.consent_version ?? "legacy-consent",
              interestCreatedAt: existing.interest_created_at.toISOString(),
              eligibleAt: existing.eligible_at?.toISOString() ?? null,
              version: 2,
            },
    };
  }

  public async persist(input: PersistCandidateInterestSubmission): Promise<void> {
    const source = await this.client.query(
      `SELECT 1
         FROM opportunities AS opportunity
         JOIN blind_review_commitments AS commitment
           ON commitment.opportunity_ref = opportunity.id
        WHERE opportunity.id = $1
          AND opportunity.version = $2
          AND opportunity.status = 'OPEN'
          AND opportunity.current_contract_version_ref = $3
          AND commitment.state = 'ACTIVE'
          AND commitment.queue_policy_version = $4`,
      [
        input.interest.opportunityRef,
        input.expectedOpportunityVersion,
        input.eligibility.contractVersionRef,
        input.interest.queuePolicyVersion,
      ],
    );
    if (source.rowCount !== 1) {
      throw new PostgresOptimisticConcurrencyError(
        "The Opportunity, Contract, or Blind Review Commitment changed before Interest persistence.",
      );
    }

    await this.client.query(
      `INSERT INTO candidate_interests (
         interest_ref, opportunity_ref, candidate_ref, claim_snapshot_ref, status,
         submitted_at, interest_schema_version, consent_version, hard_facts_json,
         eligibility_edge_ref, eligible_at, interest_created_at, queue_policy_version,
         queue_tie_break, version, updated_at, contract_version_ref,
         background_access_basis, passport_snapshot_ref, eligibility_match_ref
       ) VALUES ($1, $2, $3, NULL, $4, $5, 'candidate-interest@2', $6, $7::jsonb,
                 $8, $9, $5, $10, $11, $12, $5, $13, $14, $15, $16)`,
      [
        input.interest.interestRef,
        input.interest.opportunityRef,
        input.interest.candidateRef,
        input.interest.status,
        this.databaseNow,
        input.interest.consentVersion,
        JSON.stringify(input.hardFacts),
        input.eligibility.eligibilityEdgeRef,
        input.interest.eligibleAt === null ? null : new Date(input.interest.eligibleAt),
        input.interest.queuePolicyVersion,
        input.interest.queueTieBreak,
        input.interest.version,
        input.eligibility.contractVersionRef,
        input.eligibility.backgroundAccessBasis,
        input.eligibility.passportSnapshotRef,
        input.eligibility.eligibilityMatchRef,
      ],
    );
    await this.client.query(
      `INSERT INTO eligibility_edges (
         eligibility_edge_ref, matching_cycle_ref, candidate_ref, claim_snapshot_ref,
         contract_version_ref, eligible, predicate_results_json, created_at,
         opportunity_ref, interest_ref, edge_schema_version, background_access_basis,
         eligibility_policy_ref, passport_snapshot_ref, eligibility_match_ref
       ) VALUES ($1, NULL, $2, NULL, $3, $4, $5::jsonb, $6, $7, $8,
                 $9, $10, $11, $12, $13)`,
      [
        input.eligibility.eligibilityEdgeRef,
        input.interest.candidateRef,
        input.eligibility.contractVersionRef,
        input.eligibility.eligible,
        JSON.stringify(input.eligibility.predicateResults),
        this.databaseNow,
        input.interest.opportunityRef,
        input.interest.interestRef,
        input.eligibility.schemaVersion,
        input.eligibility.backgroundAccessBasis,
        input.eligibility.eligibilityPolicyRef,
        input.eligibility.passportSnapshotRef,
        input.eligibility.eligibilityMatchRef,
      ],
    );
    for (const event of input.events) {
      await this.client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          event.eventId,
          event.eventType,
          event.eventVersion,
          event.aggregateType,
          event.aggregateId,
          event.aggregateVersion,
          event.correlationId,
          event.occurredAt,
          JSON.stringify(event.payload),
        ],
      );
    }
    await this.client.query(
      `INSERT INTO outbox_messages (
         message_id, message_type, message_version, event_id, idempotency_key,
         correlation_id, payload, available_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        input.outbox.messageId,
        input.outbox.messageType,
        input.outbox.messageVersion,
        input.outbox.eventId,
        input.outbox.idempotencyKey,
        input.outbox.correlationId,
        JSON.stringify(input.outbox.payload),
        input.outbox.availableAt,
      ],
    );
    await this.client.query(
      `INSERT INTO candidate_answer_projections (
         opportunity_ref, candidate_ref, projection_version, projection_json, updated_at
       ) VALUES ($1, $2, 1, $3::jsonb, $4)
       ON CONFLICT (opportunity_ref, candidate_ref) DO UPDATE
         SET projection_version = candidate_answer_projections.projection_version + 1,
             projection_json = EXCLUDED.projection_json,
             updated_at = EXCLUDED.updated_at`,
      [
        input.interest.opportunityRef,
        input.interest.candidateRef,
        JSON.stringify(CandidateOpportunityProjectionV3Schema.parse(input.candidateProjection)),
        this.databaseNow,
      ],
    );
    await this.client.query(
      `INSERT INTO blind_review_command_receipts (
         actor_ref, idempotency_key, command_id, command_fingerprint,
         command_type, receipt_json, created_at
       ) VALUES ($1, $2, $3, $4, 'SubmitCandidateInterest', $5::jsonb, $6)`,
      [
        input.actorRef,
        input.idempotencyKey,
        input.receipt.command_id,
        input.commandFingerprint,
        JSON.stringify(CandidateInterestReceiptSchema.parse(input.receipt)),
        this.databaseNow,
      ],
    );
  }
}

export class PostgresCandidateInterestStore implements CandidateInterestUnitOfWork {
  public constructor(private readonly pool: Pool) {}

  public async runInTransaction<TResult>(
    work: (transaction: CandidateInterestTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const nowResult = await client.query<{ database_now: Date }>(
        "SELECT clock_timestamp() AS database_now",
      );
      const databaseNow = nowResult.rows[0]?.database_now;
      if (databaseNow === undefined) throw new Error("PostgreSQL did not return database time.");
      const result = await work(new PostgresCandidateInterestTransaction(client, databaseNow));
      await client.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
