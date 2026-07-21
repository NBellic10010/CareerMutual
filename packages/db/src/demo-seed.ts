import {
  CandidateOpportunityProjectionSchema,
  CandidateReviewWindowProjectionSchema,
  EmployerMatchingProjectionSchema,
  EmployerReviewWindowProjectionSchema,
} from "@onlyboth/contracts";
import {
  MATCHING_ALGORITHM_VERSION,
  MATCHING_CANDIDATE_REFS,
  MATCHING_CHALLENGE_CATALOG_REF,
  MATCHING_CONTRACT_HASH,
  MATCHING_CONTRACT_VERSION_REF,
  MATCHING_CYCLE_REF,
  MATCHING_LABEL_POLICY_REF,
  MATCHING_OPPORTUNITY_REF,
  MATCHING_PROOF_TEMPLATE_REF,
  MATCHING_PUBLIC_SEED,
  MATCHING_REPLAY_ID,
  MATCHING_REVIEWER_REF,
  candidateDisplayRef,
  syntheticBuildMatchEdgeInput,
} from "@onlyboth/demo-replay";
import { acceptProofWindow, reserveReviewWindow, submitStageA } from "@onlyboth/domain";
import type { Pool } from "pg";

import { runPostgresMigrations } from "./migrate";

export interface DemoSeedEnvironment {
  readonly DEMO_MODE?: string;
  readonly RUNTIME_MODE?: string;
  readonly REPLAY_ID?: string;
}

export class DemoSeedConfigurationError extends Error {
  public override readonly name = "DemoSeedConfigurationError";
  public readonly code = "DEMO_SEED_FORBIDDEN";
}

function assertDemoSeedEnvironment(environment: DemoSeedEnvironment): void {
  if (
    environment.DEMO_MODE !== "true" ||
    environment.RUNTIME_MODE !== "GOLDEN_REPLAY" ||
    environment.REPLAY_ID !== "payment-retry-v1"
  ) {
    throw new DemoSeedConfigurationError(
      "Synthetic reset requires DEMO_MODE=true, RUNTIME_MODE=GOLDEN_REPLAY, and REPLAY_ID=payment-retry-v1.",
    );
  }
}

function assertMatchingDemoSeedEnvironment(environment: DemoSeedEnvironment): void {
  if (
    environment.DEMO_MODE !== "true" ||
    environment.RUNTIME_MODE !== "GOLDEN_REPLAY" ||
    environment.REPLAY_ID !== MATCHING_REPLAY_ID
  ) {
    throw new DemoSeedConfigurationError(
      "Synthetic matching reset requires DEMO_MODE=true, RUNTIME_MODE=GOLDEN_REPLAY, and REPLAY_ID=matching-v1.",
    );
  }
}

export async function resetMatchingGoldenDemo(
  pool: Pool,
  environment: DemoSeedEnvironment,
): Promise<void> {
  assertMatchingDemoSeedEnvironment(environment);
  await runPostgresMigrations(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const nowResult = await client.query<{ database_now: Date }>(
      "SELECT clock_timestamp() AS database_now",
    );
    const now = nowResult.rows[0]?.database_now;
    if (now === undefined) throw new Error("PostgreSQL did not return database time.");

    await client.query(`
      TRUNCATE TABLE
        opportunities,
        candidate_claim_snapshots,
        candidate_private_labels,
        matching_command_receipts,
        inbox_messages,
        review_windows,
        domain_events
      CASCADE
    `);

    await client.query(
      `INSERT INTO opportunities (
         id, title, status, reviewer_id, current_contract_version_ref,
         current_label_policy_version_ref, created_at
       ) VALUES ($1, 'Senior Backend Engineer', 'OPEN', $2, $3, $4, $5)`,
      [
        MATCHING_OPPORTUNITY_REF,
        MATCHING_REVIEWER_REF,
        MATCHING_CONTRACT_VERSION_REF,
        MATCHING_LABEL_POLICY_REF,
        now,
      ],
    );
    await client.query(
      `INSERT INTO sealed_capability_contracts (
         contract_version_ref, opportunity_ref, contract_hash, contract_json, sealed_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        MATCHING_CONTRACT_VERSION_REF,
        MATCHING_OPPORTUNITY_REF,
        MATCHING_CONTRACT_HASH,
        JSON.stringify({
          uncertainties: [
            {
              uncertainty_ref: "uncertainty:atomicity-and-failure-boundaries",
              capability_refs: ["capability:inspect-state-transition"],
              source_refs: ["source:contract:atomicity-risk"],
            },
          ],
          allowed_proof_templates: [
            {
              proof_template_ref: "proof-template:payment-retry@1",
              version: 1,
              capability_refs: ["capability:inspect-state-transition"],
            },
          ],
          hard_predicates: [
            {
              predicate_ref: "predicate:work-authorization",
              fact_type: "work_authorization",
              operator: "EQUALS",
              expected: "US",
            },
            {
              predicate_ref: "predicate:timezone-overlap",
              fact_type: "timezone_overlap",
              operator: "GTE",
              minimum: 6,
            },
            {
              predicate_ref: "predicate:required-language",
              fact_type: "required_language",
              operator: "CONTAINS",
              member: "TypeScript",
            },
          ],
          candidate_effort_limit_minutes: 6,
          candidate_ai_policy: "PROHIBITED",
          proof_template_version_id: MATCHING_PROOF_TEMPLATE_REF,
          challenge_catalog_version_id: MATCHING_CHALLENGE_CATALOG_REF,
        }),
        now,
      ],
    );
    await client.query(
      `INSERT INTO label_policy_versions (
         label_policy_version_ref, opportunity_ref, policy_hash, policy_json, sealed_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        MATCHING_LABEL_POLICY_REF,
        MATCHING_OPPORTUNITY_REF,
        `sha256:${"3".repeat(64)}`,
        JSON.stringify({
          sealed_fields: [
            "name",
            "photo",
            "school_name",
            "previous_employer_name",
            "referral_source",
          ],
          reveal_condition: "evidence_linked_outcome_and_mutual_advance",
        }),
        now,
      ],
    );
    await client.query(
      `INSERT INTO matching_cycles (
         matching_cycle_ref, opportunity_ref, contract_version_ref, contract_hash,
         expected_interest_count, state, version, public_seed, allocator_version,
         runtime_mode, replay_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 20, 'EVALUATING', 1, $5, $6,
                 'GOLDEN_REPLAY', $7, $8, $8)`,
      [
        MATCHING_CYCLE_REF,
        MATCHING_OPPORTUNITY_REF,
        MATCHING_CONTRACT_VERSION_REF,
        MATCHING_CONTRACT_HASH,
        MATCHING_PUBLIC_SEED,
        MATCHING_ALGORITHM_VERSION,
        MATCHING_REPLAY_ID,
        now,
      ],
    );
    await client.query(
      `INSERT INTO attention_commitments (
         commitment_ref, opportunity_ref, reviewer_ref, active_wip, direct_slots,
         explore_slots, credit_per_window, accept_sla_hours, checkpoint_sla_seconds,
         final_review_sla_hours, version
       ) VALUES ('attention-commitment-1', $1, $2, 2, 1, 1, 10, 24, 90, 24, 1)`,
      [MATCHING_OPPORTUNITY_REF, MATCHING_REVIEWER_REF],
    );
    await client.query(
      `INSERT INTO attention_slots (slot_ref, commitment_ref, slot_kind, status, version)
       VALUES
         ('attention-slot-direct-1', 'attention-commitment-1', 'DIRECT', 'AVAILABLE', 1),
         ('attention-slot-explore-1', 'attention-commitment-1', 'EXPLORE', 'AVAILABLE', 1)`,
    );
    await client.query(
      `INSERT INTO credit_accounts (
         account_ref, opportunity_ref, available_credits, held_credits, version
       ) VALUES ('credit-account-1', $1, 20, 0, 1)`,
      [MATCHING_OPPORTUNITY_REF],
    );

    for (const candidateRef of MATCHING_CANDIDATE_REFS) {
      const input = syntheticBuildMatchEdgeInput(candidateRef);
      const candidateToken = candidateRef.slice("candidate-".length);
      await client.query(
        `INSERT INTO candidate_claim_snapshots (
           claim_snapshot_ref, candidate_ref, snapshot_version, consent_version,
           hard_facts_json, claims_json, source_refs_json, snapshot_hash, created_at
         ) VALUES ($1, $2, 1, 'synthetic-consent@1', $3::jsonb, $4::jsonb, $5::jsonb, $6, $7)`,
        [
          input.claim_snapshot.claim_snapshot_ref,
          candidateRef,
          JSON.stringify(input.claim_snapshot.hard_facts),
          JSON.stringify(input.claim_snapshot.claims),
          JSON.stringify(input.source_refs),
          `sha256:${candidateToken.padStart(64, "0")}`,
          now,
        ],
      );
      await client.query(
        `INSERT INTO candidate_private_labels (
           candidate_ref, synthetic, encrypted_payload, created_at
         ) VALUES ($1, true, $2, $3)`,
        [candidateRef, Buffer.from(`sealed-synthetic:${candidateToken}`, "utf8"), now],
      );
      const interestRef = `interest-${candidateToken}`;
      await client.query(
        `INSERT INTO candidate_interests (
           interest_ref, opportunity_ref, candidate_ref, claim_snapshot_ref, status, submitted_at
         ) VALUES ($1, $2, $3, $4, 'SUBMITTED', $5)`,
        [
          interestRef,
          MATCHING_OPPORTUNITY_REF,
          candidateRef,
          input.claim_snapshot.claim_snapshot_ref,
          now,
        ],
      );
      const candidateProjection = CandidateOpportunityProjectionSchema.parse({
        schema_version: "candidate-opportunity-projection@1",
        view: "CANDIDATE",
        opportunity_ref: MATCHING_OPPORTUNITY_REF,
        candidate_ref: candidateRef,
        state: "INTEREST_RECEIVED",
        runtime_mode: "GOLDEN_REPLAY",
        synthetic: true,
        reviewer: null,
        review_window_ref: null,
        review_window_version: null,
        accept_by: null,
        checkpoint_sla_seconds: null,
        final_review_sla_hours: null,
        candidate_effort_limit_minutes: null,
        candidate_ai_policy: null,
        message: "Your interest was recorded. No human review has been reserved yet.",
      });
      await client.query(
        `INSERT INTO candidate_opportunity_projections (
           opportunity_ref, candidate_ref, projection_version, projection_json, updated_at
         ) VALUES ($1, $2, 1, $3::jsonb, $4)`,
        [MATCHING_OPPORTUNITY_REF, candidateRef, JSON.stringify(candidateProjection), now],
      );
      const eventId = `event-interest-submitted-${candidateToken}`;
      const correlationId = `correlation-match-${candidateToken}`;
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'CandidateInterestSubmitted', 1, 'CandidateInterest', $2, 1, $3, $4, $5::jsonb)`,
        [
          eventId,
          interestRef,
          correlationId,
          now,
          JSON.stringify({
            schema_version: "candidate-interest-submitted@1",
            interest_ref: interestRef,
            opportunity_ref: MATCHING_OPPORTUNITY_REF,
            candidate_ref: candidateRef,
            matching_cycle_ref: MATCHING_CYCLE_REF,
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'CandidateInterestSubmitted', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          `outbox-interest-submitted-${candidateToken}`,
          eventId,
          `CandidateInterestSubmitted:${interestRef}:1`,
          correlationId,
          JSON.stringify({
            interestRef,
            matchingCycleRef: MATCHING_CYCLE_REF,
            candidateRef,
          }),
          now,
        ],
      );
    }

    const employerProjection = EmployerMatchingProjectionSchema.parse({
      schema_version: "employer-matching-projection@1",
      view: "EMPLOYER",
      opportunity_ref: MATCHING_OPPORTUNITY_REF,
      matching_cycle_ref: MATCHING_CYCLE_REF,
      matching_cycle_version: 1,
      commitment_ref: "attention-commitment-1",
      commitment_version: 1,
      reviewer: { id: MATCHING_REVIEWER_REF, display_name: "Sarah Chen" },
      state: "EVALUATING",
      eligible_count: 0,
      proofable_count: 0,
      abstain_count: 0,
      needs_human_count: 0,
      attention_slots: 2,
      public_seed: MATCHING_PUBLIC_SEED,
      allocator_version: MATCHING_ALGORITHM_VERSION,
      runtime_mode: "GOLDEN_REPLAY",
      synthetic: true,
      disclosure: "Synthetic — Pre-recorded external inputs",
      cards: MATCHING_CANDIDATE_REFS.map((candidateRef) => ({
        candidate_ref: candidateRef,
        opaque_id: candidateDisplayRef(candidateRef),
        status: "PROCESSING",
        match_edge_ref: null,
        uncertainty_ref: null,
        claim_refs: [],
        proof_template_ref: null,
        source_refs: [],
        why: null,
        still_unknown: [],
        abstain_reason_code: null,
      })),
      allocation_run_ref: null,
      allocations: [],
    });
    await client.query(
      `INSERT INTO employer_matching_projections (
         opportunity_ref, reviewer_ref, projection_version, projection_json, updated_at
       ) VALUES ($1, $2, 1, $3::jsonb, $4)`,
      [MATCHING_OPPORTUNITY_REF, MATCHING_REVIEWER_REF, JSON.stringify(employerProjection), now],
    );
    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resetCandidate42GoldenDemo(
  pool: Pool,
  environment: DemoSeedEnvironment,
): Promise<void> {
  assertDemoSeedEnvironment(environment);
  await runPostgresMigrations(pool);

  let window = reserveReviewWindow({
    id: "review-window-42",
    candidateId: "candidate-42",
    opportunityId: "opp-senior-backend-1",
    reviewerId: "reviewer-sarah-chen",
    attentionSlotId: "attention-slot-42",
    attentionSlotAvailable: true,
    creditHoldId: "credit-hold-42",
    creditHoldStatus: "HELD",
    matchEdgeId: "match-edge-42",
    versionPins: {
      contractVersionId: "contract-payment-retry@1",
      labelPolicyVersionId: "label-policy@1",
      proofTemplateVersionId: "payment-retry@1",
      challengeCatalogVersionId: "payment-retry@1",
    },
  }).window;
  window = acceptProofWindow(window).window;
  const stageATransition = submitStageA(window, "snapshot-42-stage-a");
  window = stageATransition.window;

  const employerProjection = EmployerReviewWindowProjectionSchema.parse({
    schema_version: "employer-review-window-projection@1",
    view: "EMPLOYER",
    review_window_id: window.id,
    aggregate_version: window.version,
    state: "CHECKPOINT_PENDING",
    runtime_mode: "GOLDEN_REPLAY",
    synthetic: true,
    disclosure: "Synthetic — Pre-recorded external inputs",
    reviewer: { id: "reviewer-sarah-chen", display_name: "Sarah Chen" },
    candidate: { opaque_id: "Candidate 42" },
    recommendation: {
      status: "RUNNING",
      output_ref: null,
      prompt_version: "1.1.0",
      input_hash: null,
      options: [],
      reason_code: null,
    },
    authorization: null,
  });
  const candidateProjection = CandidateReviewWindowProjectionSchema.parse({
    schema_version: "candidate-review-window-projection@1",
    view: "CANDIDATE",
    review_window_id: window.id,
    aggregate_version: window.version,
    candidate_ref: "candidate-42",
    reviewer: { id: "reviewer-sarah-chen", display_name: "Sarah Chen" },
    runtime_mode: "GOLDEN_REPLAY",
    synthetic: true,
    state: "CHECKPOINT_PENDING",
    selected_challenge: null,
    message: "Sarah is reviewing your Stage A evidence.",
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const nowResult = await client.query<{ database_now: Date }>(
      "SELECT clock_timestamp() AS database_now",
    );
    const now = nowResult.rows[0]?.database_now;
    if (now === undefined) {
      throw new Error("PostgreSQL did not return database time.");
    }
    await client.query(`
      TRUNCATE TABLE
        opportunities,
        candidate_claim_snapshots,
        candidate_private_labels,
        matching_command_receipts,
        candidate_review_window_projections,
        employer_review_window_projections,
        inbox_messages,
        outbox_messages,
        domain_events,
        ai_output_consumptions,
        ai_outputs,
        ai_source_refs,
        ai_model_runs,
        hiring_intelligence_requests,
        stage_a_evidence,
        proof_sessions,
        review_windows
      CASCADE
    `);
    await client.query(
      `INSERT INTO review_windows (
         id, candidate_id, opportunity_id, reviewer_id, state, version,
         contract_version_id, label_policy_version_id, proof_template_version_id,
         challenge_catalog_version_id, stage_a_snapshot_id, aggregate_json,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $13)`,
      [
        window.id,
        window.candidateId,
        window.opportunityId,
        window.reviewerId,
        window.state,
        window.version,
        window.versionPins.contractVersionId,
        window.versionPins.labelPolicyVersionId,
        window.versionPins.proofTemplateVersionId,
        window.versionPins.challengeCatalogVersionId,
        window.stageASnapshotId,
        JSON.stringify(window),
        now,
      ],
    );
    await client.query(
      `INSERT INTO proof_sessions (
         id, review_window_id, runtime_mode, replay_id, sandbox_session_ref,
         replay_session_key, recommendation_request_ref, capability_refs,
         base_snapshot_version, stage_a_patch_ref, stage_a_artifact_ref,
         stage_a_snapshot_ref, remaining_time_seconds, created_at, updated_at
       ) VALUES ($1, $2, 'GOLDEN_REPLAY', 'payment-retry-v1', $3, $4, $5,
                 $6::jsonb, $7, $8, $9, $10, $11, $12, $12)`,
      [
        "proof-42",
        window.id,
        "replay-session-42",
        "candidate-42",
        "ai-request-candidate-42-challenges",
        JSON.stringify([
          "clarify_ambiguous_failure",
          "inspect_state_transition",
          "design_verification",
          "revise_under_failover",
        ]),
        "payment-retry@1",
        "patch-42-stage-a",
        "artifact-42-stage-a",
        "snapshot-42-stage-a",
        180,
        now,
      ],
    );
    const evidence = [
      [
        "evidence-E17",
        1,
        "verification",
        "The common verifier exercised concurrent retries against the Stage A artifact.",
        "sha256:b79aaaf98e1fed3058429ec2a53cbf877772bca1284ce1fbd09a339fd0dca34c",
      ],
      [
        "evidence-D04",
        2,
        "diff",
        "The Stage A change moved the idempotency guard ahead of payment execution.",
        "sha256:8f2363f4f6c73b702d263b49b0440ce1e6f531a0d79a25aff7d9773e7cd4e5e1",
      ],
      [
        "evidence-C09",
        3,
        "event",
        "The candidate explicitly marked acknowledgement loss as unresolved.",
        "sha256:6cc5ea23916ea9b4dafff0ea1dad6117afc1edee60af42bba700a11574f83e10",
      ],
    ] as const;
    for (const [reference, ordinal, type, summary, hash] of evidence) {
      await client.query(
        `INSERT INTO stage_a_evidence (
           evidence_ref, review_window_id, ordinal, evidence_type, summary, sha256, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [reference, window.id, ordinal, type, summary, hash, now],
      );
    }
    const stageEvent = stageATransition.events[0];
    if (stageEvent?.type !== "StageASubmitted") {
      throw new Error("Synthetic seed did not produce StageASubmitted.");
    }
    await client.query(
      `INSERT INTO domain_events (
         event_id, event_type, event_version, aggregate_type, aggregate_id,
         aggregate_version, correlation_id, occurred_at, payload
       ) VALUES ($1, 'StageASubmitted', 1, 'ReviewWindow', $2, $3, $4, $5, $6::jsonb)`,
      [
        "event-stage-a-submitted-42",
        window.id,
        window.version,
        "correlation-candidate-42",
        now,
        JSON.stringify(stageEvent),
      ],
    );
    await client.query(
      `INSERT INTO outbox_messages (
         message_id, message_type, message_version, event_id, idempotency_key,
         correlation_id, payload, available_at
       ) VALUES ($1, 'StageASubmitted', 1, $2, $3, $4, $5::jsonb, $6)`,
      [
        "outbox-stage-a-submitted-42",
        "event-stage-a-submitted-42",
        "StageASubmitted:review-window-42:3",
        "correlation-candidate-42",
        JSON.stringify({ reviewWindowId: window.id }),
        now,
      ],
    );
    await client.query(
      `INSERT INTO employer_review_window_projections (
         review_window_id, projection_version, projection_json, updated_at
       ) VALUES ($1, $2, $3::jsonb, $4)`,
      [window.id, window.version, JSON.stringify(employerProjection), now],
    );
    await client.query(
      `INSERT INTO candidate_review_window_projections (
         review_window_id, candidate_id, projection_version, projection_json, updated_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [window.id, window.candidateId, window.version, JSON.stringify(candidateProjection), now],
    );
    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
