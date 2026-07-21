import { createHash } from "node:crypto";

import {
  CandidateDiscoveryWorker,
  EmployerReviewAnalystWorker,
  CandidateEvidencePassportService,
  FunctionalProductService,
  InterestQueueWorker,
  OfferNextQueuedInterestHandler,
  SubmitCandidateInterestHandler,
  type BlindReviewApplicationIdFactory,
  type CandidateInterestIdFactory,
  type CandidateDiscoveryIdFactory,
  type FunctionalProductApplicationError,
  type FunctionalProductIdFactory,
} from "../../packages/application/src/index";
import {
  PostgresCandidateDiscoveryStore,
  PostgresCandidateInterestStore,
  PostgresFunctionalProductStore,
  PostgresEmployerReviewAnalystStore,
  PostgresInterestQueueStore,
  createPostgresPool,
  runPostgresMigrations,
} from "../../packages/db/src/index";
import { MemoryObjectStore } from "../../packages/storage/src/index";
import {
  CandidateJobDiscoveryValidator,
  HiringIntelligenceError,
  PROMPT_REGISTRY,
  SyntheticEmployerReviewAnalystAdapter,
  validateAnswerEvidenceEdge,
} from "../../packages/ai/src/index";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("BLOCKED: Functional product tests require TEST_DATABASE_URL.");
}
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)).toLowerCase();
if (!/(?:^|[_-])test(?:$|[_-])/u.test(databaseName)) {
  throw new Error("REFUSED: Functional product tests require a dedicated test database.");
}

const pool = createPostgresPool(databaseUrl);
const objectStore = new MemoryObjectStore();
const store = new PostgresFunctionalProductStore(pool, objectStore);
let sequence = 0;
const functionalIds = {
  nextId: (kind) => `functional-test:${kind}:${++sequence}`,
} satisfies FunctionalProductIdFactory;
const interestIds = {
  nextId: (kind) => `functional-interest-test:${kind}:${++sequence}`,
} satisfies CandidateInterestIdFactory;
const queueIds = {
  nextId: (kind) => `functional-queue-test:${kind}:${++sequence}`,
} satisfies BlindReviewApplicationIdFactory;
const discoveryIds = {
  nextId: (kind) => `candidate-discovery-test:${kind}:${++sequence}`,
} satisfies CandidateDiscoveryIdFactory;
const service = new FunctionalProductService(store, objectStore, functionalIds);
const discoveryStore = new PostgresCandidateDiscoveryStore(pool, store);
const passportService = new CandidateEvidencePassportService(discoveryStore, discoveryIds);
const digest = (value: string) =>
  `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;

const employer = {
  actor: { role: "EMPLOYER" as const, actorId: "reviewer-sarah-chen" },
  correlationId: "functional-test:employer",
};

function candidate(candidateRef: string) {
  return {
    actor: { role: "CANDIDATE" as const, actorId: candidateRef },
    correlationId: `functional-test:${candidateRef}`,
  };
}

async function clearFixture(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      employer_resume_reveals,
      candidate_resume_snapshots,
      candidate_discovery_projections,
      candidate_job_discovery_signals,
      candidate_discovery_signal_sets,
      candidate_evidence_passport_snapshots,
      candidate_evidence_passport_drafts,
      blind_review_command_receipts,
      inbox_messages,
      job_post_drafts,
      employer_attention_wallets,
      employer_reliability_accounts,
      candidate_credit_accounts,
      opportunities,
      domain_events
    CASCADE
  `);
}

async function seedAccounts(): Promise<void> {
  await pool.query(
    `INSERT INTO employer_attention_wallets (
       owner_ref, available_credits, committed_credits, forfeited_credits,
       version, created_at, updated_at
     ) VALUES ('reviewer-sarah-chen', 20, 0, 0, 1, clock_timestamp(), clock_timestamp())`,
  );
  for (const candidateRef of ["candidate-42", "candidate-17"] as const) {
    const accountRef = `candidate-credit:${candidateRef}:test`;
    await pool.query(
      `INSERT INTO candidate_credit_accounts (
         account_ref, candidate_ref, period_ref, allowance, available_credits,
         consumed_credits, period_started_at, period_ends_at, state, version,
         created_at, updated_at
       ) VALUES ($1, $2, 'functional-test-period', 3, 3, 0,
                 clock_timestamp() - interval '1 day',
                 clock_timestamp() + interval '30 days', 'ACTIVE', 1,
                 clock_timestamp(), clock_timestamp())`,
      [accountRef, candidateRef],
    );
    await pool.query(
      `INSERT INTO candidate_credit_ledger_entries (
         ledger_entry_ref, account_ref, entry_type, amount, subject_ref, occurred_at
       ) VALUES ($1, $2, 'GRANT', 3, 'functional-test-period', clock_timestamp())`,
      [`candidate-credit-grant:${candidateRef}`, accountRef],
    );
    const resumeSnapshotRef = `resume-snapshot:${candidateRef}:test`;
    const displayName = candidateRef === "candidate-42" ? "Jordan Rivera" : "Alex Morgan";
    const resume = {
      schema_version: "candidate-resume-snapshot@1",
      resume_snapshot_ref: resumeSnapshotRef,
      candidate_ref: candidateRef,
      snapshot_version: 1,
      display_name: displayName,
      headline: "Synthetic backend reliability engineer",
      location: "New York, NY",
      contact_email: `${candidateRef}@example.test`,
      summary:
        "Synthetic candidate focused on payment reliability, durable workflows, and observable recovery paths.",
      education: [
        {
          institution: "Synthetic Regional University",
          credential: "Bachelor of Science",
          field_of_study: "Computer science",
          graduation_date: "2025-05-15",
        },
      ],
      experience: [
        {
          organization: "Synthetic Payments Lab",
          title: "Backend Engineer",
          started_on: "2023-01-01",
          ended_on: null,
          highlights: [
            "Designed a synthetic retry ledger with explicit idempotency and recovery boundaries.",
          ],
        },
      ],
      certifications: ["Synthetic cloud reliability certificate"],
      skills: ["PostgreSQL", "Distributed systems"],
      source_sha256: digest(`resume:${candidateRef}`),
      synthetic: true,
      sealed_at: "2026-07-21T10:00:00.000Z",
    };
    await pool.query(
      `INSERT INTO candidate_resume_snapshots (
         resume_snapshot_ref, candidate_ref, snapshot_version, resume_json,
         source_sha256, synthetic, sealed_at
       ) VALUES ($1, $2, 1, $3::jsonb, $4, true, $5)`,
      [
        resumeSnapshotRef,
        candidateRef,
        JSON.stringify(resume),
        resume.source_sha256,
        resume.sealed_at,
      ],
    );
  }
}

async function createPublishedJob(
  employerAiReviewPolicy: "OFF" | "ANSWER_ONLY" | "ANSWER_PLUS_PROCESS" = "OFF",
): Promise<string> {
  const draft = await service.createJobPostDraft(
    { ...employer, idempotencyKey: "functional-test:create-draft" },
    {
      schema_version: "create-job-post-draft-command@1",
      expected_wallet_version: 1,
      draft: {
        organization_public_name: "Northstar Payments",
        title: "Senior Backend Reliability Engineer",
        role_category: "TECHNOLOGY",
        public_role_summary:
          "Own payment retry correctness and failure recovery for a high-volume distributed platform.",
        employment_type: "FULL_TIME",
        seniority_band: "SENIOR",
        compensation_range: "$185k–$225k + equity",
        location_and_work_mode: "Remote · Americas",
        public_hard_requirements: ["English working proficiency"],
        hard_predicates: [
          {
            predicate_ref: "hard-language",
            fact_type: "required_language",
            operator: "EQUALS",
            expected: "English",
          },
        ],
        capability_areas: ["Payment idempotency", "Failure recovery"],
        critical_question:
          "A provider charge succeeds but Redis fails before acknowledgement. Explain the smallest safe recovery design, invariants, and falsifying tests.",
        critical_challenge: {
          schema_version: "critical-challenge@1",
          challenge_ref: "critical-challenge:functional-postgres-test@1",
          title: "Recover a charged payment without duplicating it",
          objective:
            "Explain the smallest safe recovery design and the evidence that would falsify it.",
          parts: [
            {
              part_ref: "challenge-part:functional-postgres-test:text",
              kind: "TEXT",
              title: "Failure scenario",
              instructions:
                "State the recovery invariant and the tests that would falsify the proposed design.",
              text_content:
                "A provider charge succeeds but Redis fails before acknowledgement. Explain the smallest safe recovery design, invariants, and falsifying tests.",
              asset: null,
            },
          ],
        },
        allowed_assumptions: ["At-least-once delivery", "Provider idempotency keys"],
        proof_format: "A bounded design answer with explicit invariants and tests.",
        maximum_candidate_minutes: 6,
        answer_review_sla_hours: 24,
        offer_expiry_hours: 24,
        answer_review_wip: 2,
        advancement_cohort_size: 2,
        credit_per_answer_review: 1,
        candidate_ai_policy: "PLATFORM_ASSISTANT_ALLOWED",
        employer_ai_review_policy: employerAiReviewPolicy,
        employer_ai_review_disclosure_version: "employer-ai-review-disclosure@2",
        review_criteria: [
          {
            criterion_ref: "criterion:reliability-invariants",
            capability_ref: "capability:failure-recovery",
            statement:
              "The answer defines concrete reliability invariants and a falsifiable recovery design.",
            support_indicators: ["Names invariants and ties them to observable tests."],
            contradiction_indicators: ["Permits a duplicate provider charge under retry."],
            bounded_limitations: ["This task cannot establish overall job performance."],
          },
        ],
        terms_version: "candidate-application-terms@2",
        ai_disclosure_version: "candidate-ai-disclosure@1",
        conditional_reveal_consent_version: "resume-reveal-consent@1",
        sandbox_focus_policy_version: "sandbox-focus-policy@1",
        focus_tracking_disclosure_version: "sandbox-focus-disclosure@1",
      },
    },
  );
  const receipt = await service.publishJobPost(
    { ...employer, idempotencyKey: "functional-test:publish" },
    draft.draft_ref,
    {
      schema_version: "publish-job-post-command@1",
      expected_draft_version: draft.version,
      expected_wallet_version: 1,
    },
  );
  return receipt.opportunity_ref;
}

async function registerInterest(opportunityRef: string, candidateRef: string): Promise<void> {
  const handler = new SubmitCandidateInterestHandler(
    new PostgresCandidateInterestStore(pool),
    interestIds,
    digest,
  );
  await handler.execute({
    opportunityRef,
    actor: { role: "CANDIDATE", actorId: candidateRef },
    idempotencyKey: `functional-test:interest:${candidateRef}`,
    correlationId: `functional-test:interest:${candidateRef}`,
    command: {
      schema_version: "candidate-interest-command@1",
      hard_facts: [
        {
          fact_ref: `fact-language-${candidateRef}`,
          fact_type: "required_language",
          value: "English",
        },
      ],
      consent_version: "candidate-application-terms@2",
      expected_opportunity_version: 1,
    },
  });
}

async function offerAvailableSlots(): Promise<void> {
  const queueStore = new PostgresInterestQueueStore(pool);
  const worker = new InterestQueueWorker(
    queueStore,
    new OfferNextQueuedInterestHandler(queueStore, queueIds, digest),
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await worker.runOnce("functional-product-test")) === "IDLE") break;
  }
}

async function acceptApplication(candidateRef: string, opportunityRef: string) {
  const actor = candidate(candidateRef);
  const detail = await store.getCandidateJobDetail(candidateRef, opportunityRef);
  expect(detail?.interest_state).toBe("BACKED_OFFERED");
  const offer = detail?.backed_offer;
  if (detail === null || offer === undefined || offer === null) {
    throw new Error(`No backed offer was created for ${candidateRef}.`);
  }
  const started = await service.startBackedApplication(
    { ...actor, idempotencyKey: `functional-test:accept:${candidateRef}` },
    offer.invitation_ref,
    {
      schema_version: "start-backed-application-command@3",
      terms_version: detail.terms_version,
      ai_disclosure_version: detail.ai_disclosure_version,
      conditional_reveal_consent_version: detail.conditional_reveal_consent_version,
      sandbox_focus_policy_version: detail.sandbox_focus_policy_version,
      focus_tracking_disclosure_version: detail.focus_tracking_disclosure_version,
      employer_ai_review_policy: detail.employer_ai_review_policy,
      employer_ai_review_disclosure_version: detail.employer_ai_review_disclosure_version,
      expected_obligation_version: offer.expected_obligation_version,
      expected_slot_version: offer.expected_slot_version,
      expected_candidate_credit_version: 1,
    },
  );
  expect(started.candidate_credit_remaining).toBe(2);
  return { actor, started };
}

async function acceptAndSubmit(candidateRef: string, opportunityRef: string) {
  const { actor, started } = await acceptApplication(candidateRef, opportunityRef);
  const saved = await service.saveAnswerDraft(
    { ...actor, idempotencyKey: `functional-test:draft:${candidateRef}` },
    started.answer_session_ref,
    {
      schema_version: "save-answer-draft-command@1",
      expected_session_version: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `Use a durable payment-attempt ledger and provider idempotency key for ${candidateRef}.`,
              },
            ],
          },
        ],
      },
    },
  );
  const projected = await store.getCandidateAnswerSession(candidateRef, started.answer_session_ref);
  expect(projected?.version).toBe(saved.session_version);
  const submitted = await service.submitAnswer(
    { ...actor, idempotencyKey: `functional-test:submit:${candidateRef}` },
    started.answer_session_ref,
    {
      schema_version: "submit-functional-answer-command@1",
      final_artifact_refs: [saved.artifact_ref],
      expected_session_version: saved.session_version,
    },
  );
  return { actor, started, saved, submitted };
}

describe.sequential("Functional product PostgreSQL vertical", () => {
  beforeAll(async () => {
    await runPostgresMigrations(pool);
  });

  beforeEach(async () => {
    await clearFixture();
    await seedAccounts();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("consumes Candidate Credit only after a backed Slot and enforces immutable sequential review", async () => {
    const opportunityRef = await createPublishedJob();
    await registerInterest(opportunityRef, "candidate-42");
    await registerInterest(opportunityRef, "candidate-17");
    await offerAvailableSlots();

    const before = await store.getCandidateOpportunityFeed("candidate-42");
    expect(before.credit.available_credits).toBe(3);
    expect(before.opportunities[0]?.interest_state).toBe("BACKED_OFFERED");

    const first = await acceptAndSubmit("candidate-42", opportunityRef);
    const second = await acceptAndSubmit("candidate-17", opportunityRef);
    const afterAccept = await store.getCandidateOpportunityFeed("candidate-42");
    expect(afterAccept.credit.available_credits).toBe(2);
    expect(afterAccept.credit.consumed_credits).toBe(1);

    await expect(
      service.saveAnswerDraft(
        { ...first.actor, idempotencyKey: "functional-test:late-edit" },
        first.started.answer_session_ref,
        {
          schema_version: "save-answer-draft-command@1",
          expected_session_version: first.submitted.new_session_version,
          document: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Too late" }] }],
          },
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
    } satisfies Partial<FunctionalProductApplicationError>);

    const current = await store.getCurrentEmployerReview("reviewer-sarah-chen", opportunityRef);
    expect(current?.current?.obligation_ref).toBe(first.submitted.obligation_ref);
    expect(current?.current?.opaque_candidate_label).not.toContain("42");
    expect(current?.current?.permitted_evidence_refs).toContain(first.saved.artifact_ref);
    const beforeReveal = await store.getEmployerRevealedCandidates("reviewer-sarah-chen", 1);
    expect(beforeReveal.items).toEqual([]);

    const secondState = await pool.query<{
      obligation_version: number;
      cohort_version: number;
    }>(
      `SELECT obligation.version AS obligation_version, cohort.version AS cohort_version
         FROM answer_review_obligations AS obligation
         JOIN advancement_cohorts AS cohort ON cohort.cohort_ref = obligation.cohort_ref
        WHERE obligation.obligation_ref = $1`,
      [second.submitted.obligation_ref],
    );
    await expect(
      service.recordHumanReview(
        { ...employer, idempotencyKey: "functional-test:skip-first" },
        second.submitted.obligation_ref,
        {
          schema_version: "record-functional-human-review-command@2",
          decision: "INCONCLUSIVE",
          evidence_refs: [second.saved.artifact_ref],
          review_comment: "This answer cannot be reviewed before the earlier obligation.",
          still_unknown: ["The earlier answer remains unsettled."],
          expected_obligation_version: secondState.rows[0]?.obligation_version,
          expected_cohort_version: secondState.rows[0]?.cohort_version,
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });

    if (current?.current === null || current?.current === undefined) {
      throw new Error("The first sequential review was not visible.");
    }
    const settled = await service.recordHumanReview(
      { ...employer, idempotencyKey: "functional-test:review:first" },
      current.current.obligation_ref,
      {
        schema_version: "record-functional-human-review-command@2",
        decision: "ADVANCE_ELIGIBLE",
        evidence_refs: [first.saved.artifact_ref],
        review_comment:
          "The answer names a durable source of truth and a falsifiable retry invariant.",
        still_unknown: ["Cross-region provider reconciliation remains outside this task."],
        expected_obligation_version: current.current.obligation_version,
        expected_cohort_version: current.current.cohort_version,
      },
    );
    expect(settled.slot_state).toBe("AVAILABLE");
    expect(settled.next_offer_requested).toBe(true);
    expect(settled.resume_reveal_ref).not.toBeNull();
    const revealed = await store.getEmployerRevealedCandidates("reviewer-sarah-chen", 1);
    expect(revealed).toMatchObject({ total_items: 1, total_pages: 1, page_size: 1 });
    expect(revealed.items[0]).toMatchObject({
      reveal_ref: settled.resume_reveal_ref,
      answer_submission_ref: first.submitted.answer_submission_ref,
      resume: { candidate_ref: "candidate-42", display_name: "Jordan Rivera" },
    });
    await expect(
      store.getEmployerRevealedCandidates("reviewer-sarah-chen", 99),
    ).resolves.toMatchObject({ page: 1, total_pages: 1, total_items: 1 });

    const next = await store.getCurrentEmployerReview("reviewer-sarah-chen", opportunityRef);
    expect(next?.current?.obligation_ref).toBe(second.submitted.obligation_ref);
    await expect(
      pool.query(
        `UPDATE answer_submissions SET submission_hash = $1 WHERE answer_submission_ref = $2`,
        [`sha256:${"0".repeat(64)}`, first.submitted.answer_submission_ref],
      ),
    ).rejects.toThrow(/immutable/u);
  });

  it("builds a synthetic source-validated analysis while preserving independent human review", async () => {
    const opportunityRef = await createPublishedJob("ANSWER_PLUS_PROCESS");
    await registerInterest(opportunityRef, "candidate-42");
    await offerAvailableSlots();
    const submitted = await acceptAndSubmit("candidate-42", opportunityRef);
    const analystStore = new PostgresEmployerReviewAnalystStore(pool, objectStore, {
      promptId: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptId,
      promptVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptVersion,
      promptHash: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptHash,
      inputSchemaVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.inputSchemaVersion,
      outputSchemaVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.outputSchemaVersion,
      runtimeMode: "GOLDEN_REPLAY",
      adapterId: "synthetic-employer-review-analyst@1",
      requestedModel: "synthetic@1",
    });
    const analystWorker = new EmployerReviewAnalystWorker(
      analystStore,
      new SyntheticEmployerReviewAnalystAdapter(),
      validateAnswerEvidenceEdge,
      () => `client-request:${++sequence}`,
      true,
    );
    await expect(analystWorker.runOnce("analyst-worker:test")).resolves.toBe("PROCESSED");

    const review = await store.getCurrentEmployerReview("reviewer-sarah-chen", opportunityRef);
    expect(review?.current?.ai_review).toMatchObject({
      policy: "ANSWER_PLUS_PROCESS",
      status: "READY",
      synthetic: true,
    });
    expect(review?.current?.ai_review.process_evidence?.wording_guard).toBe(
      "no server-recorded revision",
    );
    expect(review?.current?.ai_review.process_evidence).toMatchObject({
      schema_version: "answer-process-evidence@2",
      behavior_rule_set_ref: "onlyboth.answer-behavior-severity@1",
    });
    if (
      review?.current?.ai_review.process_evidence?.schema_version !== "answer-process-evidence@2"
    ) {
      throw new Error("The versioned behavior profile was not visible.");
    }
    const firstBehaviorSignal = review.current.ai_review.process_evidence.behavior_signals[0]!;
    expect(review.current.permitted_evidence_refs).toContain(firstBehaviorSignal.signal_ref);
    expect(JSON.stringify(review?.current?.ai_review.process_evidence)).not.toMatch(
      /revision_manifest|platform_gpt_turn_times|voice_memo_times/u,
    );
    expect(review?.current?.ai_review.analysis).toMatchObject({
      schema_version: "answer-evidence-edge-draft@2",
      answer_verdict: { verdict: "GOOD_ANSWER", scope: "THIS_SEALED_CHALLENGE_ONLY" },
    });
    expect(JSON.stringify(review?.current?.ai_review)).not.toMatch(
      /candidate score|cheating probability|personality/i,
    );
    const candidateProjection = await store.getCandidateAnswerSession(
      "candidate-42",
      submitted.started.answer_session_ref,
    );
    expect(candidateProjection?.process_evidence?.revision_manifest).toHaveLength(1);
    if (review?.current === null || review?.current === undefined) {
      throw new Error("The analyzed review was not visible.");
    }
    expect(review.current.ai_review.ai_output_ref).not.toBeNull();
    await expect(
      pool.query(`UPDATE ai_outputs SET output_hash = $1 WHERE id = $2`, [
        `sha256:${"0".repeat(64)}`,
        review.current.ai_review.ai_output_ref,
      ]),
    ).rejects.toThrow(/immutable/u);
    await expect(
      pool.query(
        `UPDATE answer_evidence_edges SET edge_hash = $1
          WHERE answer_submission_ref = $2`,
        [`sha256:${"1".repeat(64)}`, submitted.submitted.answer_submission_ref],
      ),
    ).rejects.toThrow(/immutable/u);
    const humanReceipt = await service.recordHumanReview(
      { ...employer, idempotencyKey: "functional-test:review-with-consulted-analysis" },
      review.current.obligation_ref,
      {
        schema_version: "record-functional-human-review-command@2",
        decision: "ADVANCE_ELIGIBLE",
        evidence_refs: [submitted.saved.artifact_ref, firstBehaviorSignal.signal_ref],
        review_comment:
          "The source answer states a bounded invariant and an observable retry check.",
        still_unknown: ["Performance outside the bounded task remains unknown."],
        consulted_ai_output_ref: review.current.ai_review.ai_output_ref,
        expected_obligation_version: review.current.obligation_version,
        expected_cohort_version: review.current.cohort_version,
      },
    );
    expect(humanReceipt.consulted_ai_output_ref).toBe(review.current.ai_review.ai_output_ref);

    const processRef = submitted.submitted.process_evidence_ref;
    await expect(
      pool.query(
        `UPDATE answer_process_evidence SET process_manifest_json = '{}'::jsonb
          WHERE process_evidence_ref = $1`,
        [processRef],
      ),
    ).rejects.toThrow(/immutable/);
  });

  it("routes semantic model failures to NEEDS_HUMAN without blocking the review obligation", async () => {
    const opportunityRef = await createPublishedJob("ANSWER_ONLY");
    await registerInterest(opportunityRef, "candidate-42");
    await offerAvailableSlots();
    const submitted = await acceptAndSubmit("candidate-42", opportunityRef);
    const analystStore = new PostgresEmployerReviewAnalystStore(pool, objectStore, {
      promptId: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptId,
      promptVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptVersion,
      promptHash: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptHash,
      inputSchemaVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.inputSchemaVersion,
      outputSchemaVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.outputSchemaVersion,
      runtimeMode: "LIVE",
      adapterId: "test-refusal@1",
      requestedModel: "gpt-5.6-sol",
    });
    const analystWorker = new EmployerReviewAnalystWorker(
      analystStore,
      {
        buildAnswerEvidenceEdge: async () => {
          throw new HiringIntelligenceError(
            "AI_REFUSED",
            "buildAnswerEvidenceEdge",
            false,
            "Synthetic refusal for status mapping.",
          );
        },
      },
      validateAnswerEvidenceEdge,
      () => `client-request:${++sequence}`,
      false,
    );

    await expect(analystWorker.runOnce("analyst-worker:refusal")).resolves.toBe("PROCESSED");
    const review = await store.getCurrentEmployerReview("reviewer-sarah-chen", opportunityRef);
    expect(review?.current?.ai_review).toMatchObject({
      status: "NEEDS_HUMAN",
      error_code: "AI_REFUSED",
      analysis: null,
    });
    expect(review?.current?.obligation_ref).toBe(submitted.submitted.obligation_ref);

    const state = await pool.query<{ request_status: string; run_status: string }>(
      `SELECT request.status AS request_status, run.status AS run_status
         FROM hiring_intelligence_requests AS request
         JOIN ai_model_runs AS run ON run.request_id = request.id
        WHERE request.answer_submission_ref = $1`,
      [submitted.submitted.answer_submission_ref],
    );
    expect(state.rows[0]).toEqual({
      request_status: "NEEDS_HUMAN",
      run_status: "NEEDS_HUMAN",
    });
  });

  it("supersedes late analysis when the human review settles first", async () => {
    const opportunityRef = await createPublishedJob("ANSWER_PLUS_PROCESS");
    await registerInterest(opportunityRef, "candidate-42");
    await offerAvailableSlots();
    const submitted = await acceptAndSubmit("candidate-42", opportunityRef);
    const current = await store.getCurrentEmployerReview("reviewer-sarah-chen", opportunityRef);
    expect(current?.current?.ai_review.status).toBe("ANALYZING");
    if (current?.current === null || current?.current === undefined) {
      throw new Error("The pending review was not visible.");
    }
    const inconclusiveReceipt = await service.recordHumanReview(
      { ...employer, idempotencyKey: "functional-test:review-before-analysis" },
      current.current.obligation_ref,
      {
        schema_version: "record-functional-human-review-command@2",
        decision: "INCONCLUSIVE",
        evidence_refs: [submitted.saved.artifact_ref],
        review_comment: "The bounded answer is reviewed without waiting for optional AI analysis.",
        still_unknown: ["Provider reconciliation remains outside the bounded task."],
        expected_obligation_version: current.current.obligation_version,
        expected_cohort_version: current.current.cohort_version,
      },
    );
    expect(inconclusiveReceipt.resume_reveal_ref).toBeNull();
    await expect(
      store.getEmployerRevealedCandidates("reviewer-sarah-chen", 1),
    ).resolves.toMatchObject({ total_items: 0, items: [] });

    const analystStore = new PostgresEmployerReviewAnalystStore(pool, objectStore, {
      promptId: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptId,
      promptVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptVersion,
      promptHash: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptHash,
      inputSchemaVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.inputSchemaVersion,
      outputSchemaVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.outputSchemaVersion,
      runtimeMode: "GOLDEN_REPLAY",
      adapterId: "synthetic-employer-review-analyst@1",
      requestedModel: "synthetic@1",
    });
    const analystWorker = new EmployerReviewAnalystWorker(
      analystStore,
      new SyntheticEmployerReviewAnalystAdapter(),
      validateAnswerEvidenceEdge,
      () => `client-request:${++sequence}`,
      true,
    );
    await expect(analystWorker.runOnce("analyst-worker:late")).resolves.toBe("PROCESSED");

    const state = await pool.query<{ status: string }>(
      `SELECT status FROM employer_answer_review_projections
        WHERE answer_submission_ref = $1`,
      [submitted.submitted.answer_submission_ref],
    );
    expect(state.rows[0]?.status).toBe("SUPERSEDED");
    const requestCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM hiring_intelligence_requests
        WHERE answer_submission_ref = $1`,
      [submitted.submitted.answer_submission_ref],
    );
    expect(requestCount.rows[0]?.count).toBe("0");
  });

  it("keeps a model result hidden when Human Review commits during the provider call", async () => {
    const opportunityRef = await createPublishedJob("ANSWER_ONLY");
    await registerInterest(opportunityRef, "candidate-42");
    await offerAvailableSlots();
    const submitted = await acceptAndSubmit("candidate-42", opportunityRef);
    const current = await store.getCurrentEmployerReview("reviewer-sarah-chen", opportunityRef);
    if (current?.current === null || current?.current === undefined) {
      throw new Error("The pending review was not visible.");
    }
    const synthetic = new SyntheticEmployerReviewAnalystAdapter();
    const analystStore = new PostgresEmployerReviewAnalystStore(pool, objectStore, {
      promptId: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptId,
      promptVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptVersion,
      promptHash: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptHash,
      inputSchemaVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.inputSchemaVersion,
      outputSchemaVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.outputSchemaVersion,
      runtimeMode: "GOLDEN_REPLAY",
      adapterId: "synthetic-employer-review-analyst@1",
      requestedModel: "synthetic@1",
    });
    const analystWorker = new EmployerReviewAnalystWorker(
      analystStore,
      {
        buildAnswerEvidenceEdge: async (input, clientRequestId) => {
          await service.recordHumanReview(
            { ...employer, idempotencyKey: "functional-test:review-during-analysis" },
            current.current!.obligation_ref,
            {
              schema_version: "record-functional-human-review-command@2",
              decision: "INCONCLUSIVE",
              evidence_refs: [submitted.saved.artifact_ref],
              review_comment:
                "The human review commits independently while optional analysis remains in flight.",
              still_unknown: ["The bounded answer does not establish broader performance."],
              expected_obligation_version: current.current!.obligation_version,
              expected_cohort_version: current.current!.cohort_version,
            },
          );
          return synthetic.buildAnswerEvidenceEdge(input, clientRequestId);
        },
      },
      validateAnswerEvidenceEdge,
      () => `client-request:${++sequence}`,
      true,
    );
    await expect(analystWorker.runOnce("analyst-worker:race")).resolves.toBe("PROCESSED");

    const state = await pool.query<{
      status: string;
      projection_json: unknown;
      error_code: string | null;
    }>(
      `SELECT status, projection_json, error_code FROM employer_answer_review_projections
        WHERE answer_submission_ref = $1`,
      [submitted.submitted.answer_submission_ref],
    );
    expect(state.rows[0]).toMatchObject({
      status: "SUPERSEDED",
      projection_json: null,
      error_code: "HUMAN_REVIEW_COMPLETED_FIRST",
    });
    const persistedOutput = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ai_outputs AS output
         JOIN hiring_intelligence_requests AS request ON request.id = output.request_id
        WHERE request.answer_submission_ref = $1`,
      [submitted.submitted.answer_submission_ref],
    );
    expect(persistedOutput.rows[0]?.count).toBe("0");
  });

  it("cleans a 24-hour intermediate draft body while preserving final evidence and process metadata", async () => {
    const opportunityRef = await createPublishedJob("ANSWER_PLUS_PROCESS");
    await registerInterest(opportunityRef, "candidate-42");
    await offerAvailableSlots();
    const { actor, started } = await acceptApplication("candidate-42", opportunityRef);
    const first = await service.saveAnswerDraft(
      { ...actor, idempotencyKey: "functional-test:cleanup-draft:first" },
      started.answer_session_ref,
      {
        schema_version: "save-answer-draft-command@1",
        expected_session_version: 1,
        document: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "First revision" }] }],
        },
      },
    );
    await pool.query(
      `UPDATE answer_artifacts SET created_at = clock_timestamp() - interval '25 hours'
        WHERE artifact_ref = $1`,
      [first.artifact_ref],
    );
    const final = await service.saveAnswerDraft(
      { ...actor, idempotencyKey: "functional-test:cleanup-draft:final" },
      started.answer_session_ref,
      {
        schema_version: "save-answer-draft-command@1",
        expected_session_version: first.session_version,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Final immutable answer revision" }],
            },
          ],
        },
      },
    );
    const submitted = await service.submitAnswer(
      { ...actor, idempotencyKey: "functional-test:cleanup-submit" },
      started.answer_session_ref,
      {
        schema_version: "submit-functional-answer-command@1",
        final_artifact_refs: [final.artifact_ref],
        expected_session_version: final.session_version,
      },
    );

    await expect(
      store.cleanupOrphanArtifact(new Date(Date.now() - 24 * 60 * 60 * 1_000)),
    ).resolves.toContain(first.artifact_ref);
    const artifactState = await pool.query<{ artifact_ref: string }>(
      `SELECT artifact_ref FROM answer_artifacts
        WHERE artifact_ref = ANY($1::text[]) ORDER BY artifact_ref`,
      [[first.artifact_ref, final.artifact_ref]],
    );
    expect(artifactState.rows).toEqual([{ artifact_ref: final.artifact_ref }]);
    const process = await pool.query<{ process_manifest_json: { revision_manifest: unknown[] } }>(
      `SELECT process_manifest_json FROM answer_process_evidence
        WHERE process_evidence_ref = $1`,
      [submitted.process_evidence_ref],
    );
    expect(process.rows[0]?.process_manifest_json.revision_manifest).toHaveLength(2);
  });

  it("records deduplicated focus activity without racing autosave and auto-submits persisted work", async () => {
    const opportunityRef = await createPublishedJob();
    await registerInterest(opportunityRef, "candidate-42");
    await offerAvailableSlots();
    const { actor, started } = await acceptApplication("candidate-42", opportunityRef);

    const record = async (eventType: string, sequenceNumber: number) =>
      service.recordSandboxActivity(
        { ...actor, idempotencyKey: `functional-test:focus:${sequenceNumber}` },
        started.answer_session_ref,
        {
          schema_version: "candidate-sandbox-activity-command@1",
          event_ref: `sandbox-activity:functional-test:${sequenceNumber}`,
          event_type: eventType,
          system_dialog_type: null,
          client_sequence: sequenceNumber,
          client_monotonic_ms: sequenceNumber * 10,
          policy_version: "sandbox-focus-policy@1",
        },
      );

    await record("WINDOW_BLURRED", 1);
    await record("VISIBILITY_HIDDEN", 2);
    await pool.query(
      `UPDATE answer_session_focus_projections
          SET away_started_at = clock_timestamp() - interval '3 seconds'
        WHERE answer_session_ref = $1`,
      [started.answer_session_ref],
    );
    await record("WINDOW_FOCUSED", 3);
    const warning = await record("VISIBILITY_VISIBLE", 4);
    expect(warning.focus.state).toBe("WARNED");
    expect(warning.focus.countable_away_count).toBe(1);
    const replayed = await record("VISIBILITY_VISIBLE", 4);
    expect(replayed).toEqual(warning);
    const outOfOrder = await record("WINDOW_FOCUSED", 0);
    expect(outOfOrder.focus.state).toBe("WARNED");
    expect(outOfOrder.focus.countable_away_count).toBe(1);
    const recordedEvents = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM answer_session_activity_events WHERE answer_session_ref = $1",
      [started.answer_session_ref],
    );
    expect(recordedEvents.rows[0]?.count).toBe("5");

    const saved = await service.saveAnswerDraft(
      { ...actor, idempotencyKey: "functional-test:focus-draft" },
      started.answer_session_ref,
      {
        schema_version: "save-answer-draft-command@1",
        expected_session_version: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Persisted before the second focus departure." }],
            },
          ],
        },
      },
    );

    await record("WINDOW_BLURRED", 5);
    await pool.query(
      `UPDATE answer_session_focus_projections
          SET away_started_at = clock_timestamp() - interval '3 seconds'
        WHERE answer_session_ref = $1`,
      [started.answer_session_ref],
    );
    const pending = await record("WINDOW_FOCUSED", 6);
    expect(pending.focus.state).toBe("AUTO_SUBMIT_PENDING");
    expect(pending.auto_submit_requested).toBe(true);

    const sessionVersion = await pool.query<{ version: number }>(
      "SELECT version FROM answer_sessions WHERE answer_session_ref = $1",
      [started.answer_session_ref],
    );
    expect(sessionVersion.rows[0]?.version).toBe(saved.session_version);
    await expect(
      service.saveAnswerDraft(
        { ...actor, idempotencyKey: "functional-test:focus-frozen-draft" },
        started.answer_session_ref,
        {
          schema_version: "save-answer-draft-command@1",
          expected_session_version: saved.session_version,
          document: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Too late" }] }],
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });

    expect(await store.settleOneFocusPolicyAnswer(functionalIds)).toBe(true);
    const sealed = await store.getCandidateAnswerSession(
      "candidate-42",
      started.answer_session_ref,
    );
    expect(sealed?.state).toBe("SUBMITTED");
    expect(sealed?.focus.state).toBe("AUTO_SUBMITTED");
    const current = await store.getCurrentEmployerReview("reviewer-sarah-chen", opportunityRef);
    expect(current?.current?.focus_policy_auto_submitted).toBe(true);

    await expect(
      pool.query(
        "UPDATE answer_session_activity_events SET client_sequence = 99 WHERE event_ref = $1",
        ["sandbox-activity:functional-test:1"],
      ),
    ).rejects.toThrow(/immutable/iu);
  });

  it("terminates an empty focus-policy session, keeps Candidate Credit consumed, and releases the Slot", async () => {
    const opportunityRef = await createPublishedJob();
    await registerInterest(opportunityRef, "candidate-42");
    await registerInterest(opportunityRef, "candidate-17");
    await registerInterest(opportunityRef, "candidate-03");
    await offerAvailableSlots();
    const { actor, started } = await acceptApplication("candidate-42", opportunityRef);

    for (const [index, type] of [
      "WINDOW_BLURRED",
      "WINDOW_FOCUSED",
      "WINDOW_BLURRED",
      "WINDOW_FOCUSED",
    ].entries()) {
      if (type === "WINDOW_FOCUSED") {
        await pool.query(
          `UPDATE answer_session_focus_projections
              SET away_started_at = clock_timestamp() - interval '3 seconds'
            WHERE answer_session_ref = $1`,
          [started.answer_session_ref],
        );
      }
      await service.recordSandboxActivity(
        { ...actor, idempotencyKey: `functional-test:empty-focus:${index}` },
        started.answer_session_ref,
        {
          schema_version: "candidate-sandbox-activity-command@1",
          event_ref: `sandbox-activity:empty:${index}`,
          event_type: type,
          system_dialog_type: null,
          client_sequence: index,
          client_monotonic_ms: index,
          policy_version: "sandbox-focus-policy@1",
        },
      );
    }

    expect(await store.settleOneFocusPolicyAnswer(functionalIds)).toBe(true);
    const terminated = await store.getCandidateAnswerSession(
      "candidate-42",
      started.answer_session_ref,
    );
    expect(terminated?.state).toBe("FOCUS_POLICY_TERMINATED_EMPTY");
    const credit = await store.getCandidateOpportunityFeed("candidate-42");
    expect(credit.credit.available_credits).toBe(2);
    expect(credit.credit.consumed_credits).toBe(1);
    const slots = await pool.query<{ status: string }>(
      "SELECT status FROM answer_review_slots ORDER BY ordinal",
    );
    expect(slots.rows.some(({ status }) => status === "AVAILABLE")).toBe(true);
    await offerAvailableSlots();
    const nextInterest = await pool.query<{ status: string }>(
      "SELECT status FROM candidate_interests WHERE opportunity_ref = $1 AND candidate_ref = 'candidate-03'",
      [opportunityRef],
    );
    expect(nextInterest.rows[0]?.status).toBe("BACKED_OFFERED");
  });

  it("uses database time to auto-submit a continuously hidden session without another browser event", async () => {
    const opportunityRef = await createPublishedJob();
    await registerInterest(opportunityRef, "candidate-42");
    await offerAvailableSlots();
    const { actor, started } = await acceptApplication("candidate-42", opportunityRef);
    await service.saveAnswerDraft(
      { ...actor, idempotencyKey: "functional-test:hidden-focus-draft" },
      started.answer_session_ref,
      {
        schema_version: "save-answer-draft-command@1",
        expected_session_version: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Persisted before a continuous hidden interval." }],
            },
          ],
        },
      },
    );
    await service.recordSandboxActivity(
      { ...actor, idempotencyKey: "functional-test:hidden-focus-event" },
      started.answer_session_ref,
      {
        schema_version: "candidate-sandbox-activity-command@1",
        event_ref: "sandbox-activity:hidden-worker-threshold",
        event_type: "VISIBILITY_HIDDEN",
        system_dialog_type: null,
        client_sequence: 1,
        client_monotonic_ms: 100,
        policy_version: "sandbox-focus-policy@1",
      },
    );
    await pool.query(
      `UPDATE answer_session_focus_projections
          SET away_started_at = clock_timestamp() - interval '16 seconds'
        WHERE answer_session_ref = $1`,
      [started.answer_session_ref],
    );

    expect(await store.settleOneFocusPolicyAnswer(functionalIds)).toBe(true);
    const submission = await pool.query<{ submission_source: string }>(
      "SELECT submission_source FROM answer_submissions WHERE answer_session_ref = $1",
      [started.answer_session_ref],
    );
    expect(submission.rows[0]?.submission_source).toBe("FOCUS_POLICY_AUTO");
  });

  it("settles an overdue human Review as Employer Breach with Candidate refund and Slot retirement", async () => {
    const opportunityRef = await createPublishedJob();
    await registerInterest(opportunityRef, "candidate-42");
    await offerAvailableSlots();
    const submitted = await acceptAndSubmit("candidate-42", opportunityRef);
    await pool.query(
      `UPDATE answer_review_obligations
          SET review_due_at = clock_timestamp() - interval '1 second'
        WHERE obligation_ref = $1 AND status = 'REVIEW_PENDING'`,
      [submitted.submitted.obligation_ref],
    );

    await expect(store.settleOneOverdueEmployerReview(functionalIds)).resolves.toBe(true);
    await expect(store.settleOneOverdueEmployerReview(functionalIds)).resolves.toBe(false);

    const feed = await store.getCandidateOpportunityFeed("candidate-42");
    expect(feed.credit).toMatchObject({ available_credits: 3, consumed_credits: 0, version: 3 });
    expect(feed.opportunities[0]?.interest_state).toBe("EMPLOYER_BREACH");

    const settlement = await pool.query<{
      obligation_status: string;
      slot_status: string;
      hold_status: string;
      reservation_state: string;
      committed_credits: number;
      forfeited_credits: number;
      breach_count: string;
      penalty_points: number;
      candidate_failure_count: string;
    }>(
      `SELECT obligation.status AS obligation_status, slot.status AS slot_status,
              hold.status AS hold_status, reservation.state AS reservation_state,
              wallet.committed_credits, wallet.forfeited_credits,
              (SELECT COUNT(*)::text FROM employer_review_breaches
                WHERE obligation_ref = obligation.obligation_ref) AS breach_count,
              reliability.penalty_points,
              (SELECT COUNT(*)::text FROM domain_events
                WHERE event_type = 'CandidateFailureRecorded') AS candidate_failure_count
         FROM answer_review_obligations AS obligation
         JOIN answer_review_slots AS slot ON slot.slot_ref = obligation.slot_ref
         JOIN credit_holds AS hold ON hold.credit_hold_ref = obligation.credit_hold_ref
         JOIN answer_review_slot_credit_reservations AS reservation
           ON reservation.reservation_ref = hold.reservation_ref
         JOIN blind_review_commitments AS commitment
           ON commitment.commitment_ref = obligation.commitment_ref
         JOIN employer_attention_wallets AS wallet
           ON wallet.owner_ref = commitment.reviewer_ref
         JOIN employer_reliability_accounts AS reliability
           ON reliability.reviewer_ref = commitment.reviewer_ref
        WHERE obligation.obligation_ref = $1`,
      [submitted.submitted.obligation_ref],
    );
    expect(settlement.rows[0]).toMatchObject({
      obligation_status: "BREACH_SETTLED",
      slot_status: "RETIRED",
      hold_status: "FORFEITED",
      reservation_state: "RELEASED",
      committed_credits: 1,
      forfeited_credits: 1,
      breach_count: "1",
      penalty_points: 1,
      candidate_failure_count: "0",
    });
    const notices = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM outbox_messages
        WHERE message_type = 'EmployerReviewBreachNoticeRequested'
          AND payload->>'obligation_ref' = $1`,
      [submitted.submitted.obligation_ref],
    );
    expect(notices.rows[0]?.count).toBe("1");
  });

  it("publishes an immutable Candidate-only Passport and completes evidence-linked discovery", async () => {
    const opportunityRef = await createPublishedJob();
    const actor = { role: "CANDIDATE" as const, actorId: "candidate-42" };
    const evidence = [
      {
        evidence_ref: "evidence:postgres-retry-sample",
        kind: "WORK_SAMPLE" as const,
        display_title: "Synthetic payment retry work sample",
        bounded_summary:
          "A synthetic work sample describing retry idempotency, acknowledgement loss, and falsifiable failure checks.",
        contribution_summary:
          "I authored the bounded failure analysis and the associated falsification checklist.",
        occurred_from: "2025-01-01",
        occurred_to: "2025-01-02",
        synthetic_locator_label: "synthetic://work-sample/postgres-retry",
        source_sha256: digest("candidate-discovery-postgres-source"),
        verification_state: "SYNTHETIC_SOURCE_ATTACHED" as const,
        visibility: "CANDIDATE_ONLY" as const,
      },
    ];
    const education = {
      education_ref: "education:candidate-discovery-postgres",
      level: "BACHELOR" as const,
      status: "GRADUATED" as const,
      institution_label: "Synthetic Regional University",
      field_of_study: "Computer science",
      graduation_date: "2025-05-15",
      source_sha256: digest("candidate-discovery-postgres-education"),
      verification_state: "SYNTHETIC_SOURCE_ATTACHED" as const,
      visibility: "CANDIDATE_ONLY" as const,
    };
    const competingDrafts = await Promise.allSettled([
      passportService.saveDraft(
        {
          actor: { role: "CANDIDATE", actorId: "candidate-17" },
          correlationId: "candidate-discovery-postgres:concurrency-a",
          idempotencyKey: "candidate-discovery-postgres:concurrency-a",
        },
        {
          schema_version: "save-candidate-evidence-passport-draft-command@2",
          expected_draft_version: 0,
          education: { ...education, education_ref: "education:candidate-17" },
          evidence_items: evidence.map((item) => ({
            ...item,
            evidence_ref: "evidence:postgres-concurrent-a",
            synthetic_locator_label: "synthetic://work-sample/postgres-concurrent-a",
          })),
        },
      ),
      passportService.saveDraft(
        {
          actor: { role: "CANDIDATE", actorId: "candidate-17" },
          correlationId: "candidate-discovery-postgres:concurrency-b",
          idempotencyKey: "candidate-discovery-postgres:concurrency-b",
        },
        {
          schema_version: "save-candidate-evidence-passport-draft-command@2",
          expected_draft_version: 0,
          education: { ...education, education_ref: "education:candidate-17" },
          evidence_items: evidence.map((item) => ({
            ...item,
            evidence_ref: "evidence:postgres-concurrent-b",
            synthetic_locator_label: "synthetic://work-sample/postgres-concurrent-b",
          })),
        },
      ),
    ]);
    expect(competingDrafts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(competingDrafts.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(competingDrafts.find((result) => result.status === "rejected")?.reason).toMatchObject({
      code: "STALE_VERSION",
    });
    const concurrentState = await pool.query<{ count: string; draft_version: number }>(
      `SELECT COUNT(*)::text AS count, MAX(draft_version)::integer AS draft_version
         FROM candidate_evidence_passport_drafts WHERE candidate_ref = 'candidate-17'`,
    );
    expect(concurrentState.rows[0]).toEqual({ count: "1", draft_version: 1 });

    const commandContext = {
      actor,
      correlationId: "candidate-discovery-postgres",
      idempotencyKey: "candidate-discovery-postgres:save",
    };
    const saved = await passportService.saveDraft(commandContext, {
      schema_version: "save-candidate-evidence-passport-draft-command@2",
      expected_draft_version: 0,
      education,
      evidence_items: evidence,
    });
    const duplicate = await passportService.saveDraft(commandContext, {
      schema_version: "save-candidate-evidence-passport-draft-command@2",
      expected_draft_version: 0,
      education,
      evidence_items: evidence,
    });
    expect(duplicate).toEqual(saved);

    const published = await passportService.publish(
      {
        ...commandContext,
        idempotencyKey: "candidate-discovery-postgres:publish",
      },
      {
        schema_version: "publish-candidate-evidence-passport-command@1",
        expected_draft_version: saved.draft_version,
        discovery_consent_version: "candidate-discovery-consent@1",
      },
    );
    expect(published).toMatchObject({ discovery_status: "GENERATING", snapshot_version: 1 });
    const duplicatePublish = await passportService.publish(
      {
        ...commandContext,
        idempotencyKey: "candidate-discovery-postgres:publish",
      },
      {
        schema_version: "publish-candidate-evidence-passport-command@1",
        expected_draft_version: saved.draft_version,
        discovery_consent_version: "candidate-discovery-consent@1",
      },
    );
    expect(duplicatePublish).toEqual(published);
    const transactionState = await pool.query<{ signal_count: string; outbox_count: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM candidate_discovery_signal_sets
           WHERE signal_set_ref = $1 AND status = 'GENERATING') AS signal_count,
         (SELECT COUNT(*)::text FROM outbox_messages
           WHERE message_type = 'CandidateDiscoveryRequested'
             AND payload->>'signalSetRef' = $1) AS outbox_count`,
      [published.signal_set_ref],
    );
    expect(transactionState.rows[0]).toEqual({ signal_count: "1", outbox_count: "1" });

    const worker = new CandidateDiscoveryWorker(
      discoveryStore,
      {
        async deriveSignals(input) {
          const role = input.opportunities[0];
          const source = input.evidence[0];
          if (role === undefined || source === undefined)
            throw new Error("Missing discovery input.");
          return {
            output: {
              schema_version: "candidate-job-discovery-output@1",
              status: "ready",
              opportunity_signals: [
                {
                  opportunity_ref: role.opportunity_ref,
                  discovery_band: "EVIDENCE_CONNECTED",
                  connections: [
                    {
                      capability_ref: role.capabilities[0]!.capability_ref,
                      evidence_refs: [source.evidence_ref],
                      bounded_reason:
                        "The synthetic work sample discusses the payment-retry boundary named by this public role.",
                      still_unknown: [
                        "Whether the described approach transfers to this exact production environment.",
                      ],
                    },
                  ],
                },
              ],
              reason_code: null,
              explanation: null,
            },
            providerResponseId: "response:postgres-discovery",
            resolvedModel: "gpt-5.6-luna",
          };
        },
      },
      new CandidateJobDiscoveryValidator(),
      { hash: (value) => digest(JSON.stringify(value)) },
      discoveryIds,
      {
        promptId: "onlyboth.derive-candidate-job-signals",
        promptVersion: "1.1.0",
        promptHash: digest("candidate-discovery-prompt-v1"),
        inputSchemaVersion: "candidate-job-discovery-input@2",
        outputSchemaVersion: "candidate-job-discovery-output@1",
      },
      3,
      () => new Date(),
      () => "candidate-discovery-postgres-client-request",
    );
    await expect(worker.runOnce("candidate-discovery-postgres-worker")).resolves.toBe("PROCESSED");
    const projection = await passportService.getProjection(actor);
    expect(projection.discovery).toMatchObject({
      status: "READY",
      synthetic_preloaded: false,
      last_ready_signal_set_ref: published.signal_set_ref,
    });
    const feed = await discoveryStore.getCandidateOpportunityFeed("candidate-42");
    expect(feed.schema_version).toBe("candidate-opportunity-feed@2");
    expect(feed.opportunities).toHaveLength(1);
    expect(feed.opportunities[0]).toMatchObject({
      opportunity_ref: opportunityRef,
      discovery: {
        status: "EVIDENCE_CONNECTED",
        evidence_refs: ["evidence:postgres-retry-sample"],
      },
    });
    const otherCandidate = await passportService.getProjection({
      role: "CANDIDATE",
      actorId: "candidate-17",
    });
    expect(otherCandidate.last_published_snapshot).toBeNull();
    await expect(
      pool.query(
        `UPDATE candidate_evidence_passport_snapshots
            SET snapshot_hash = snapshot_hash WHERE snapshot_ref = $1`,
        [published.snapshot_ref],
      ),
    ).rejects.toThrow(/immutable/u);
    const output = await pool.query<{ output_ref: string }>(
      `SELECT output.id AS output_ref
         FROM ai_outputs AS output
         JOIN hiring_intelligence_requests AS request ON request.id = output.request_id
        WHERE request.operation = 'deriveCandidateJobSignals' LIMIT 1`,
    );
    await expect(
      pool.query(`UPDATE ai_outputs SET output_hash = output_hash WHERE id = $1`, [
        output.rows[0]?.output_ref,
      ]),
    ).rejects.toThrow(/immutable/u);
    const employerDashboard = await store.getEmployerDashboard("reviewer-sarah-chen");
    expect(JSON.stringify(employerDashboard)).not.toMatch(
      /postgres-retry-sample|passport-snapshot|candidate-discovery/iu,
    );
  });
});
