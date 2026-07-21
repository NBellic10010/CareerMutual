import { createHash } from "node:crypto";

import {
  FunctionalProductService,
  InterestQueueWorker,
  OfferNextQueuedInterestHandler,
  SubmitCandidateInterestHandler,
  type BlindReviewApplicationIdFactory,
  type CandidateInterestIdFactory,
  type FunctionalProductIdFactory,
} from "@onlyboth/application";
import {
  PostgresCandidateEligibilityStore,
  PostgresCandidateInterestStore,
  PostgresFunctionalProductStore,
  PostgresInterestQueueStore,
  createPostgresPool,
} from "@onlyboth/db";
import {
  CandidateEvidenceItemSchema,
  CandidateEvidencePassportProjectionSchema,
  CandidateEligibilityJobMatchSchema,
  CandidateEligibilityProjectionSchema,
  CandidateEducationRecordSchema,
  CandidateJobDiscoverySignalSchema,
  CandidateResumeSnapshotSchema,
  ELIGIBILITY_BACKGROUND_TAG_CATALOG,
} from "@onlyboth/contracts";
import { SYNTHETIC_CANDIDATES } from "@onlyboth/demo-fixtures";
import { MemoryObjectStore } from "@onlyboth/storage";

import {
  ADDITIONAL_SYNTHETIC_JOB_POSTS,
  MATCHING_LAB_SYNTHETIC_JOB_POSTS,
  SYNTHETIC_ELIGIBILITY_DEMO_TARGETS,
  resolveFunctionalDemoEmployerReviewPolicy,
} from "./functional-demo-job-fixtures";
import { CANDIDATE_ELIGIBILITY_RECORDED_LIVE } from "./fixtures/candidate-eligibility-recorded-live";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://onlyboth:local-development-only@127.0.0.1:5432/onlyboth";
const employerReviewPolicy = resolveFunctionalDemoEmployerReviewPolicy(process.env);

if (process.env.DEMO_MODE !== "true") {
  throw new Error("REFUSED: functional demo reset requires DEMO_MODE=true synthetic scope.");
}

function deterministicIds<TKind extends string>(prefix: string) {
  const counts = new Map<string, number>();
  return {
    nextId(kind: TKind) {
      const count = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, count);
      return `${prefix}:${kind}:${count}`;
    },
  };
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function canonicalSha256(value: unknown): string {
  return sha256(canonicalJson(value));
}

const functionalIds = deterministicIds<Parameters<FunctionalProductIdFactory["nextId"]>[0]>(
  "functional-demo-job",
) as FunctionalProductIdFactory;
const interestIds = deterministicIds<Parameters<CandidateInterestIdFactory["nextId"]>[0]>(
  "functional-demo-interest",
) as CandidateInterestIdFactory;
const queueIds = deterministicIds<Parameters<BlindReviewApplicationIdFactory["nextId"]>[0]>(
  "functional-demo-queue",
) as BlindReviewApplicationIdFactory;

const pool = createPostgresPool(databaseUrl);
const objects = new MemoryObjectStore();
const store = new PostgresFunctionalProductStore(pool, objects);
const service = new FunctionalProductService(store, objects, functionalIds);

try {
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
      outbox_messages,
      job_post_drafts,
      employer_attention_wallets,
      candidate_credit_accounts,
      opportunities,
      domain_events
    CASCADE
  `);
  await pool.query(
    `INSERT INTO employer_attention_wallets (
       owner_ref, available_credits, committed_credits, forfeited_credits,
       version, created_at, updated_at
     ) VALUES ('reviewer-sarah-chen', 100, 0, 0, 1, clock_timestamp(), clock_timestamp())
     ON CONFLICT (owner_ref) DO NOTHING`,
  );
  for (const { actor } of SYNTHETIC_CANDIDATES) {
    const accountRef = `candidate-credit:${actor.actor_ref}:buildweek`;
    await pool.query(
      `INSERT INTO candidate_credit_accounts (
         account_ref, candidate_ref, period_ref, allowance, available_credits,
         consumed_credits, period_started_at, period_ends_at, state, version,
         created_at, updated_at
       ) VALUES ($1, $2, 'buildweek-2026', 3, 3, 0, '2026-01-01T00:00:00Z',
                 '2027-01-01T00:00:00Z', 'ACTIVE', 1, clock_timestamp(), clock_timestamp())
       ON CONFLICT (candidate_ref, period_ref) DO NOTHING`,
      [accountRef, actor.actor_ref],
    );
    await pool.query(
      `INSERT INTO candidate_credit_ledger_entries (
         ledger_entry_ref, account_ref, entry_type, amount, subject_ref, occurred_at
       ) VALUES ($1, $2, 'GRANT', 3, 'buildweek-2026', '2026-01-01T00:00:00Z')
       ON CONFLICT DO NOTHING`,
      [`candidate-credit-ledger:${actor.actor_ref}:buildweek:grant`, accountRef],
    );
  }

  const employer = {
    actor: { role: "EMPLOYER" as const, actorId: "reviewer-sarah-chen" },
    correlationId: "functional-demo:job-post",
  };
  const draft = await service.createJobPostDraft(
    { ...employer, idempotencyKey: "functional-demo:create-draft" },
    {
      schema_version: "create-job-post-draft-command@1",
      expected_wallet_version: 1,
      draft: {
        organization_public_name: "Northstar Payments",
        title: "Senior Backend Reliability Engineer",
        role_category: "TECHNOLOGY",
        public_role_summary:
          "Own the reliability boundary for payment retries, idempotency, and failure recovery in a high-volume event-driven platform.",
        employment_type: "FULL_TIME",
        seniority_band: "SENIOR",
        compensation_range: "$185k–$225k + equity",
        location_and_work_mode: "Remote · Americas time zones",
        public_hard_requirements: [
          "Authorized to work in the hiring region",
          "English working proficiency",
          "At least four hours overlap with ET",
        ],
        hard_predicates: [
          {
            predicate_ref: "hard-work-auth",
            fact_type: "work_authorization",
            operator: "EQUALS",
            expected: true,
          },
          {
            predicate_ref: "hard-language",
            fact_type: "required_language",
            operator: "EQUALS",
            expected: "English",
          },
          {
            predicate_ref: "hard-timezone",
            fact_type: "timezone_overlap",
            operator: "EQUALS",
            expected: "ET",
          },
        ],
        capability_areas: ["Distributed systems", "Payment idempotency", "Operational reasoning"],
        eligibility_match_policy: {
          schema_version: "eligibility-match-policy@1",
          access_mode: "EVIDENCE_MATCH_REQUIRED",
          taxonomy_version: "eligibility-background-tags@1",
          accepted_tags: ELIGIBILITY_BACKGROUND_TAG_CATALOG.filter((tag) =>
            [
              "Computer Science",
              "Mathematics",
              "Information Systems",
              "Data Engineering",
              "Backend Engineering",
            ].includes(tag.public_name),
          ),
        },
        critical_question:
          "A payment retry worker can lose Redis during a failover after a provider charge succeeds but before local acknowledgement. Explain the smallest safe recovery design, the invariants you would preserve, and the tests that would falsify your approach.",
        critical_challenge: {
          schema_version: "critical-challenge@1",
          challenge_ref: "critical-challenge:payment-retry@1",
          title: "Recover a charged-but-unacknowledged payment",
          objective:
            "A payment retry worker can lose Redis during a failover after a provider charge succeeds but before local acknowledgement. Explain the smallest safe recovery design, the invariants you would preserve, and the tests that would falsify your approach.",
          parts: [
            {
              part_ref: "challenge-part:payment-retry:text",
              kind: "TEXT",
              title: "Failure boundary",
              instructions:
                "Respond to the exact acknowledgement-loss boundary and keep every proposed recovery step falsifiable.",
              text_content:
                "At-least-once delivery may replay the job after the provider charge succeeds. Redis fails before local acknowledgement, while PostgreSQL remains available.",
              asset: null,
            },
          ],
        },
        allowed_assumptions: [
          "At-least-once message delivery",
          "Provider idempotency keys are supported",
          "PostgreSQL remains available",
        ],
        proof_format:
          "A bounded design answer with explicit invariants, failure modes, and falsifiable tests.",
        maximum_candidate_minutes: 6,
        answer_review_sla_hours: 24,
        offer_expiry_hours: 24,
        answer_review_wip: 2,
        advancement_cohort_size: 8,
        credit_per_answer_review: 1,
        candidate_ai_policy: "PLATFORM_ASSISTANT_ALLOWED",
        employer_ai_review_policy: employerReviewPolicy.policy,
        employer_ai_review_disclosure_version: employerReviewPolicy.disclosureVersion,
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
        terms_version: "candidate-application-terms@1",
        ai_disclosure_version: "candidate-ai-disclosure@1",
        conditional_reveal_consent_version: "resume-reveal-consent@1",
        sandbox_focus_policy_version: "sandbox-focus-policy@1",
        focus_tracking_disclosure_version: "sandbox-focus-disclosure@1",
      },
    },
  );
  const published = await service.publishJobPost(
    { ...employer, idempotencyKey: "functional-demo:publish" },
    draft.draft_ref,
    {
      schema_version: "publish-job-post-command@1",
      expected_draft_version: draft.version,
      expected_wallet_version: 1,
    },
  );

  let walletVersion = published.new_wallet_version;
  const syntheticJobPosts = [
    ...ADDITIONAL_SYNTHETIC_JOB_POSTS,
    ...MATCHING_LAB_SYNTHETIC_JOB_POSTS,
  ];
  for (const [index, jobPost] of syntheticJobPosts.entries()) {
    const configuredJobPost = {
      ...jobPost,
      employer_ai_review_policy: employerReviewPolicy.policy,
      employer_ai_review_disclosure_version: employerReviewPolicy.disclosureVersion,
    };
    const fixtureRef = String(index + 1).padStart(2, "0");
    const extraDraft = await service.createJobPostDraft(
      {
        ...employer,
        idempotencyKey: `functional-demo:additional:${fixtureRef}:create`,
        correlationId: `functional-demo:additional:${fixtureRef}`,
      },
      {
        schema_version: "create-job-post-draft-command@1",
        expected_wallet_version: walletVersion,
        draft: configuredJobPost,
      },
    );
    const extraPublished = await service.publishJobPost(
      {
        ...employer,
        idempotencyKey: `functional-demo:additional:${fixtureRef}:publish`,
        correlationId: `functional-demo:additional:${fixtureRef}`,
      },
      extraDraft.draft_ref,
      {
        schema_version: "publish-job-post-command@1",
        expected_draft_version: extraDraft.version,
        expected_wallet_version: walletVersion,
      },
    );
    walletVersion = extraPublished.new_wallet_version;
  }

  const contract = await pool.query<{ contract_hash: string }>(
    `SELECT contract.contract_hash
       FROM opportunities AS opportunity
       JOIN sealed_capability_contracts AS contract
         ON contract.contract_version_ref = opportunity.current_contract_version_ref
      WHERE opportunity.id = $1`,
    [published.opportunity_ref],
  );
  const contractHash = contract.rows[0]?.contract_hash;
  if (contractHash === undefined) throw new Error("Functional demo Contract was not sealed.");
  const education = CandidateEducationRecordSchema.parse({
    education_ref: "education:candidate-42:highest-v1",
    level: "BACHELOR",
    status: "GRADUATED",
    institution_label: "Lakeview State University",
    field_of_study: "Computer science",
    graduation_date: "2025-05-15",
    source_sha256: sha256("synthetic-candidate-42-education@1"),
    verification_state: "SYNTHETIC_SOURCE_ATTACHED",
    visibility: "CANDIDATE_ONLY",
  });
  const evidenceItems = CandidateEvidenceItemSchema.array().parse([
    {
      evidence_ref: "evidence:github-payment-retry",
      kind: "GITHUB_REPOSITORY",
      display_title: "Synthetic payment retry reference implementation",
      bounded_summary:
        "A synthetic repository snapshot showing idempotency keys, retry state transitions, and failure-oriented integration tests.",
      contribution_summary:
        "I authored the retry state machine, documented its invariants, and added the failure-oriented tests.",
      occurred_from: "2025-04-01",
      occurred_to: "2025-06-30",
      synthetic_locator_label: "synthetic://github/payment-retry-reference",
      source_sha256: sha256("synthetic-github-payment-retry-reference@1"),
      verification_state: "SYNTHETIC_SOURCE_ATTACHED",
      visibility: "CANDIDATE_ONLY",
    },
    {
      evidence_ref: "evidence:cloud-certification",
      kind: "CERTIFICATION",
      display_title: "Synthetic cloud architecture certification",
      bounded_summary:
        "A synthetic certificate record covering resilient distributed workloads and operational recovery concepts.",
      contribution_summary:
        "I completed the synthetic assessment represented by this Candidate-only record.",
      occurred_from: "2024-09-15",
      occurred_to: null,
      synthetic_locator_label: "synthetic://certificate/cloud-architecture",
      source_sha256: sha256("synthetic-cloud-architecture-certificate@1"),
      verification_state: "SYNTHETIC_SOURCE_ATTACHED",
      visibility: "CANDIDATE_ONLY",
    },
    {
      evidence_ref: "evidence:incident-work-sample",
      kind: "WORK_SAMPLE",
      display_title: "Synthetic Redis failover incident analysis",
      bounded_summary:
        "A synthetic work sample tracing acknowledgement loss across a Redis failover and proposing falsifiable recovery checks.",
      contribution_summary:
        "I wrote the failure timeline, smallest-safe recovery proposal, and the associated falsification checklist.",
      occurred_from: "2025-08-10",
      occurred_to: "2025-08-11",
      synthetic_locator_label: "synthetic://work-sample/redis-failover-analysis",
      source_sha256: sha256("synthetic-redis-failover-work-sample@1"),
      verification_state: "SYNTHETIC_SOURCE_ATTACHED",
      visibility: "CANDIDATE_ONLY",
    },
    {
      evidence_ref: "evidence:employment-verification",
      kind: "EMPLOYMENT_VERIFICATION",
      display_title: "Employment verification — redacted synthetic mock",
      bounded_summary:
        "A redacted synthetic record confirming only an employment date range and backend engineering function, with no employer or tax data.",
      contribution_summary:
        "This synthetic record supports only the stated date range and function; it makes no capability claim.",
      occurred_from: "2022-02-01",
      occurred_to: "2025-02-28",
      synthetic_locator_label: "synthetic://employment/redacted-date-range",
      source_sha256: sha256("synthetic-redacted-employment-verification@1"),
      verification_state: "SYNTHETIC_SOURCE_ATTACHED",
      visibility: "CANDIDATE_ONLY",
    },
  ]);
  const snapshotRef = "passport-snapshot:candidate-42:preloaded-v1";
  const signalSetRef = "candidate-discovery:candidate-42:preloaded-v1";
  const snapshotHash = canonicalSha256({ education, evidenceItems });
  const openJobSet = await pool.query<{
    opportunity_ref: string;
    opportunity_version: number;
    contract_hash: string;
    title: string;
  }>(
    `SELECT opportunity.id AS opportunity_ref,
            opportunity.version AS opportunity_version,
            contract.contract_hash,
            opportunity.title
       FROM opportunities AS opportunity
       JOIN sealed_capability_contracts AS contract
         ON contract.contract_version_ref = opportunity.current_contract_version_ref
      WHERE opportunity.status = 'OPEN'
      ORDER BY opportunity.created_at DESC, opportunity.id`,
  );
  const jobSetHash = canonicalSha256(openJobSet.rows);
  const discoverySignal = CandidateJobDiscoverySignalSchema.parse({
    opportunity_ref: published.opportunity_ref,
    discovery_band: "EVIDENCE_CONNECTED",
    connections: [
      {
        capability_ref: `capability:${published.opportunity_ref}:1`,
        evidence_refs: [education.education_ref],
        bounded_reason:
          "The recent synthetic computer-science education record is directly adjacent to the distributed-systems foundation named by this public role.",
        still_unknown: [
          "How the Candidate applies that recent education under this role's production constraints.",
        ],
      },
      {
        capability_ref: `capability:${published.opportunity_ref}:1`,
        evidence_refs: ["evidence:cloud-certification"],
        bounded_reason:
          "The attached synthetic certification record is adjacent to the distributed-systems capability stated in the public contract.",
        still_unknown: [
          "How the Candidate applies those concepts when requirements and telemetry are incomplete.",
        ],
      },
      {
        capability_ref: `capability:${published.opportunity_ref}:2`,
        evidence_refs: ["evidence:github-payment-retry", "evidence:incident-work-sample"],
        bounded_reason:
          "The attached repository description and incident work sample both discuss payment idempotency and retry recovery boundaries named by this role.",
        still_unknown: [
          "Whether the described implementation holds under the role's production traffic and provider boundaries.",
        ],
      },
    ],
  });
  const seededAt = new Date().toISOString();
  const resumeSnapshot = CandidateResumeSnapshotSchema.parse({
    schema_version: "candidate-resume-snapshot@1",
    resume_snapshot_ref: "resume-snapshot:candidate-42:v1",
    candidate_ref: "candidate-42",
    snapshot_version: 1,
    display_name: "Jordan Lee",
    headline: "Backend reliability engineer",
    location: "New York, NY · Remote",
    contact_email: "jordan.lee.synthetic@example.com",
    summary:
      "Synthetic backend engineer focused on payment reliability, durable state transitions, and operational failure analysis.",
    education: [
      {
        institution: education.institution_label,
        credential: "Bachelor of Science",
        field_of_study: education.field_of_study,
        graduation_date: education.graduation_date,
      },
    ],
    experience: [
      {
        organization: "Cedar Local Commerce",
        title: "Backend Engineer",
        started_on: "2022-02-01",
        ended_on: "2025-02-28",
        highlights: [
          "Built retry-safe payment workflows around durable idempotency records and reconciliation.",
          "Led incident reviews that converted acknowledgement-loss failures into falsifiable tests.",
        ],
      },
      {
        organization: "Harbor Systems Cooperative",
        title: "Software Engineering Fellow",
        started_on: "2021-06-01",
        ended_on: "2022-01-31",
        highlights: [
          "Maintained event-driven services and documented operational runbooks for bounded failures.",
        ],
      },
    ],
    certifications: ["Synthetic cloud architecture certification · 2025"],
    skills: [
      "Distributed systems",
      "Payment idempotency",
      "PostgreSQL",
      "TypeScript",
      "Incident analysis",
    ],
    source_sha256: sha256("synthetic-candidate-42-resume@1"),
    synthetic: true,
    sealed_at: seededAt,
  });
  const passportProjection = CandidateEvidencePassportProjectionSchema.parse({
    schema_version: "candidate-evidence-passport-projection@2",
    candidate_ref: "candidate-42",
    projection_version: 1,
    current_draft: {
      schema_version: "candidate-evidence-passport-draft@2",
      candidate_ref: "candidate-42",
      draft_version: 1,
      education,
      evidence_items: evidenceItems,
      has_unpublished_changes: false,
      updated_at: seededAt,
    },
    last_published_snapshot: {
      snapshot_ref: snapshotRef,
      snapshot_version: 1,
      draft_version: 1,
      snapshot_hash: snapshotHash,
      education_ref: education.education_ref,
      evidence_count: evidenceItems.length,
      discovery_consent_version: "candidate-discovery-consent@1",
      published_at: seededAt,
    },
    discovery: {
      status: "READY",
      current_signal_set_ref: signalSetRef,
      last_ready_signal_set_ref: signalSetRef,
      job_set_hash: jobSetHash,
      synthetic_preloaded: true,
      reason_code: null,
      updated_at: seededAt,
    },
    disclosure:
      "Synthetic Evidence Passport — Candidate-only discovery input; not employer-visible.",
  });
  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO candidate_evidence_passport_drafts (
         candidate_ref, draft_version, education_json, evidence_json, updated_at
       ) VALUES ('candidate-42', 1, $1::jsonb, $2::jsonb, $3)
       ON CONFLICT (candidate_ref) DO UPDATE
         SET draft_version = EXCLUDED.draft_version,
             education_json = EXCLUDED.education_json,
             evidence_json = EXCLUDED.evidence_json,
             updated_at = EXCLUDED.updated_at`,
      [JSON.stringify(education), JSON.stringify(evidenceItems), seededAt],
    );
    await pool.query(
      `INSERT INTO candidate_evidence_passport_snapshots (
         snapshot_ref, candidate_ref, snapshot_version, draft_version,
         discovery_consent_version, snapshot_hash, education_json, evidence_json, published_at
       ) VALUES ($1, 'candidate-42', 1, 1, 'candidate-discovery-consent@1', $2,
                 $3::jsonb, $4::jsonb, $5)
       ON CONFLICT (snapshot_ref) DO NOTHING`,
      [
        snapshotRef,
        snapshotHash,
        JSON.stringify(education),
        JSON.stringify(evidenceItems),
        seededAt,
      ],
    );
    await pool.query(
      `INSERT INTO candidate_resume_snapshots (
         resume_snapshot_ref, candidate_ref, snapshot_version, resume_json,
         source_sha256, synthetic, sealed_at
       ) VALUES ($1, 'candidate-42', 1, $2::jsonb, $3, true, $4)
       ON CONFLICT (resume_snapshot_ref) DO NOTHING`,
      [
        resumeSnapshot.resume_snapshot_ref,
        JSON.stringify(resumeSnapshot),
        resumeSnapshot.source_sha256,
        seededAt,
      ],
    );
    await pool.query(
      `INSERT INTO candidate_discovery_signal_sets (
         signal_set_ref, candidate_ref, passport_snapshot_ref, job_set_hash,
         status, synthetic_preloaded, created_at, completed_at
       ) VALUES ($1, 'candidate-42', $2, $3, 'READY', true, $4, $4)
       ON CONFLICT (signal_set_ref) DO UPDATE
         SET status = 'READY', synthetic_preloaded = true, reason_code = NULL,
             job_set_hash = EXCLUDED.job_set_hash, completed_at = EXCLUDED.completed_at`,
      [signalSetRef, snapshotRef, jobSetHash, seededAt],
    );
    await pool.query(
      `INSERT INTO candidate_job_discovery_signals (
         signal_ref, signal_set_ref, opportunity_ref, opportunity_version,
         contract_hash, discovery_band, signal_json, created_at
       ) VALUES ('job-signal:candidate-42:preloaded-v1', $1, $2, 1, $3,
                 'EVIDENCE_CONNECTED', $4::jsonb, $5)
       ON CONFLICT (signal_ref) DO NOTHING`,
      [
        signalSetRef,
        published.opportunity_ref,
        contractHash,
        JSON.stringify(discoverySignal),
        seededAt,
      ],
    );
    await pool.query(
      `INSERT INTO candidate_discovery_projections (
         candidate_ref, projection_version, projection_json, updated_at
       ) VALUES ('candidate-42', 1, $1::jsonb, $2)
       ON CONFLICT (candidate_ref) DO UPDATE
         SET projection_version = EXCLUDED.projection_version,
             projection_json = EXCLUDED.projection_json,
             updated_at = EXCLUDED.updated_at`,
      [JSON.stringify(passportProjection), seededAt],
    );
    await pool.query("COMMIT");
  } catch (error: unknown) {
    await pool.query("ROLLBACK");
    throw error;
  }

  for (const candidate of SYNTHETIC_CANDIDATES.filter(
    ({ actor }) => actor.actor_ref !== "candidate-42",
  )) {
    const candidateRef = candidate.actor.actor_ref;
    const educationRef = `education:${candidateRef}:highest-v1`;
    const evidenceRef = `evidence:${candidateRef}:${candidate.evidence_theme}`;
    const candidateEducation = CandidateEducationRecordSchema.parse({
      education_ref: educationRef,
      level: candidate.education.level,
      status: "GRADUATED",
      institution_label: candidate.education.institution,
      field_of_study: candidate.education.field_of_study,
      graduation_date: candidate.education.graduation_date,
      source_sha256: sha256(`synthetic-${candidateRef}-education@1`),
      verification_state: "SYNTHETIC_SOURCE_ATTACHED",
      visibility: "CANDIDATE_ONLY",
    });
    const candidateEvidence = CandidateEvidenceItemSchema.array().parse([
      {
        evidence_ref: evidenceRef,
        kind: "WORK_SAMPLE",
        display_title: `Synthetic ${candidate.evidence_theme.replaceAll("-", " ")} work sample`,
        bounded_summary: `${candidate.summary} This Candidate-only synthetic source records a bounded work sample, not verified ownership or overall ability.`,
        contribution_summary:
          "The Candidate states that they authored the bounded analysis and its falsification checks.",
        occurred_from: "2025-01-15",
        occurred_to: "2025-02-15",
        synthetic_locator_label: `synthetic://work-sample/${candidate.evidence_theme}`,
        source_sha256: sha256(`synthetic-${candidateRef}-${candidate.evidence_theme}@1`),
        verification_state: "SYNTHETIC_SOURCE_ATTACHED",
        visibility: "CANDIDATE_ONLY",
      },
      {
        evidence_ref: `evidence:${candidateRef}:credential`,
        kind: "CERTIFICATION",
        display_title: candidate.certifications[0] ?? "Synthetic systems credential",
        bounded_summary:
          "A synthetic credential record adjacent to the public systems capability; it does not verify job performance.",
        contribution_summary:
          "The Candidate states that they completed the bounded synthetic assessment represented by this record.",
        occurred_from: "2024-01-10",
        occurred_to: null,
        synthetic_locator_label: `synthetic://credential/${candidateRef}`,
        source_sha256: sha256(`synthetic-${candidateRef}-credential@1`),
        verification_state: "SYNTHETIC_SOURCE_ATTACHED",
        visibility: "CANDIDATE_ONLY",
      },
    ]);
    const candidateSnapshotRef = `passport-snapshot:${candidateRef}:preloaded-v1`;
    const candidateSignalSetRef = `candidate-discovery:${candidateRef}:preloaded-v1`;
    const candidateSnapshotHash = canonicalSha256({
      education: candidateEducation,
      evidenceItems: candidateEvidence,
    });
    const recentGraduation = candidate.education.graduation_date >= "2024-07-21";
    const preferredEvidenceRef = recentGraduation ? educationRef : evidenceRef;
    const discoveryTargetTitle =
      candidate.discovery_target_title ?? "Senior Backend Reliability Engineer";
    const discoveryOpportunity =
      openJobSet.rows.find(({ title }) => title === discoveryTargetTitle) ?? null;
    if (discoveryOpportunity === null) {
      throw new Error(`Synthetic discovery target '${discoveryTargetTitle}' was not published.`);
    }
    const candidateSignal = CandidateJobDiscoverySignalSchema.parse({
      opportunity_ref: discoveryOpportunity.opportunity_ref,
      discovery_band: "EVIDENCE_CONNECTED",
      connections: [
        {
          capability_ref: `capability:${discoveryOpportunity.opportunity_ref}:1`,
          evidence_refs: [preferredEvidenceRef],
          bounded_reason: candidate.discovery_reason,
          still_unknown: [candidate.discovery_unknown],
        },
      ],
    });
    const candidateResume = CandidateResumeSnapshotSchema.parse({
      schema_version: "candidate-resume-snapshot@1",
      resume_snapshot_ref: `resume-snapshot:${candidateRef}:v1`,
      candidate_ref: candidateRef,
      snapshot_version: 1,
      display_name: candidate.actor.display_name,
      headline: candidate.headline,
      location: candidate.location,
      contact_email: candidate.contact_email,
      summary: candidate.summary,
      education: [
        {
          institution: candidate.education.institution,
          credential: candidate.education.credential,
          field_of_study: candidate.education.field_of_study,
          graduation_date: candidate.education.graduation_date,
        },
      ],
      experience: candidate.experience,
      certifications: candidate.certifications,
      skills: candidate.skills,
      source_sha256: sha256(`synthetic-${candidateRef}-resume@1`),
      synthetic: true,
      sealed_at: seededAt,
    });
    const candidateProjection = CandidateEvidencePassportProjectionSchema.parse({
      schema_version: "candidate-evidence-passport-projection@2",
      candidate_ref: candidateRef,
      projection_version: 1,
      current_draft: {
        schema_version: "candidate-evidence-passport-draft@2",
        candidate_ref: candidateRef,
        draft_version: 1,
        education: candidateEducation,
        evidence_items: candidateEvidence,
        has_unpublished_changes: false,
        updated_at: seededAt,
      },
      last_published_snapshot: {
        snapshot_ref: candidateSnapshotRef,
        snapshot_version: 1,
        draft_version: 1,
        snapshot_hash: candidateSnapshotHash,
        education_ref: educationRef,
        evidence_count: candidateEvidence.length,
        discovery_consent_version: "candidate-discovery-consent@1",
        published_at: seededAt,
      },
      discovery: {
        status: "READY",
        current_signal_set_ref: candidateSignalSetRef,
        last_ready_signal_set_ref: candidateSignalSetRef,
        job_set_hash: jobSetHash,
        synthetic_preloaded: true,
        reason_code: null,
        updated_at: seededAt,
      },
      disclosure:
        "Synthetic Evidence Passport — Candidate-only discovery input; not employer-visible.",
    });

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO candidate_evidence_passport_drafts (
           candidate_ref, draft_version, education_json, evidence_json, updated_at
         ) VALUES ($1, 1, $2::jsonb, $3::jsonb, $4)`,
        [
          candidateRef,
          JSON.stringify(candidateEducation),
          JSON.stringify(candidateEvidence),
          seededAt,
        ],
      );
      await pool.query(
        `INSERT INTO candidate_evidence_passport_snapshots (
           snapshot_ref, candidate_ref, snapshot_version, draft_version,
           discovery_consent_version, snapshot_hash, education_json, evidence_json, published_at
         ) VALUES ($1, $2, 1, 1, 'candidate-discovery-consent@1', $3,
                   $4::jsonb, $5::jsonb, $6)`,
        [
          candidateSnapshotRef,
          candidateRef,
          candidateSnapshotHash,
          JSON.stringify(candidateEducation),
          JSON.stringify(candidateEvidence),
          seededAt,
        ],
      );
      await pool.query(
        `INSERT INTO candidate_resume_snapshots (
           resume_snapshot_ref, candidate_ref, snapshot_version, resume_json,
           source_sha256, synthetic, sealed_at
         ) VALUES ($1, $2, 1, $3::jsonb, $4, true, $5)`,
        [
          candidateResume.resume_snapshot_ref,
          candidateRef,
          JSON.stringify(candidateResume),
          candidateResume.source_sha256,
          seededAt,
        ],
      );
      await pool.query(
        `INSERT INTO candidate_discovery_signal_sets (
           signal_set_ref, candidate_ref, passport_snapshot_ref, job_set_hash,
           status, synthetic_preloaded, created_at, completed_at
         ) VALUES ($1, $2, $3, $4, 'READY', true, $5, $5)`,
        [candidateSignalSetRef, candidateRef, candidateSnapshotRef, jobSetHash, seededAt],
      );
      await pool.query(
        `INSERT INTO candidate_job_discovery_signals (
           signal_ref, signal_set_ref, opportunity_ref, opportunity_version,
           contract_hash, discovery_band, signal_json, created_at
         ) VALUES ($1, $2, $3, $4, $5, 'EVIDENCE_CONNECTED', $6::jsonb, $7)`,
        [
          `job-signal:${candidateRef}:preloaded-v1`,
          candidateSignalSetRef,
          discoveryOpportunity.opportunity_ref,
          discoveryOpportunity.opportunity_version,
          discoveryOpportunity.contract_hash,
          JSON.stringify(candidateSignal),
          seededAt,
        ],
      );
      await pool.query(
        `INSERT INTO candidate_discovery_projections (
           candidate_ref, projection_version, projection_json, updated_at
         ) VALUES ($1, 1, $2::jsonb, $3)`,
        [candidateRef, JSON.stringify(candidateProjection), seededAt],
      );
      await pool.query("COMMIT");
    } catch (error: unknown) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }

  const gatedJobs = await pool.query<{
    opportunity_ref: string;
    opportunity_version: number;
    title: string;
    contract_version_ref: string;
    contract_hash: string;
    policy_ref: string;
    accepted_tags_json: readonly { readonly tag_ref: string; readonly public_name: string }[];
  }>(
    `SELECT opportunity.id AS opportunity_ref, opportunity.version AS opportunity_version,
            opportunity.title, contract.contract_version_ref, contract.contract_hash,
            policy.policy_ref, policy.accepted_tags_json
       FROM opportunities AS opportunity
       JOIN sealed_capability_contracts AS contract
         ON contract.contract_version_ref = opportunity.current_contract_version_ref
       JOIN job_eligibility_match_policies AS policy
         ON policy.opportunity_ref = opportunity.id
      WHERE opportunity.status = 'OPEN'
        AND policy.access_mode = 'EVIDENCE_MATCH_REQUIRED'
      ORDER BY opportunity.created_at DESC, opportunity.id`,
  );
  const recordedPins = CANDIDATE_ELIGIBILITY_RECORDED_LIVE.pins;
  const recordedJob = gatedJobs.rows.find(
    (job) => job.opportunity_ref === recordedPins.opportunity_ref,
  );
  const recordedSnapshot = await pool.query<{ snapshot_hash: string }>(
    `SELECT snapshot_hash FROM candidate_evidence_passport_snapshots
      WHERE snapshot_ref = $1 AND candidate_ref = $2`,
    [recordedPins.passport_snapshot_ref, recordedPins.candidate_ref],
  );
  if (
    recordedJob === undefined ||
    recordedJob.opportunity_version !== recordedPins.opportunity_version ||
    recordedJob.contract_hash !== recordedPins.contract_hash ||
    recordedSnapshot.rows[0]?.snapshot_hash !== recordedPins.passport_snapshot_hash
  ) {
    throw new Error(
      "RECORDED_LIVE Eligibility fixture pins are stale; re-run the explicit recording script.",
    );
  }
  const recordedMatch = CandidateEligibilityJobMatchSchema.parse(
    CANDIDATE_ELIGIBILITY_RECORDED_LIVE.output.matches[0],
  );
  for (const candidate of SYNTHETIC_CANDIDATES) {
    const candidateRef = candidate.actor.actor_ref;
    const snapshotRefForMatch = `passport-snapshot:${candidateRef}:preloaded-v1`;
    const matchSetRef = `eligibility-demo-preloaded:${candidateRef}:v1`;
    const targets = SYNTHETIC_ELIGIBILITY_DEMO_TARGETS[candidateRef] ?? [];
    const containsRecordedLive = candidateRef === recordedPins.candidate_ref;
    await pool.query(
      `INSERT INTO candidate_eligibility_match_sets (
         match_set_ref, candidate_ref, passport_snapshot_ref, job_set_hash,
         status, recorded_live, reason_code, created_at, completed_at
       ) VALUES ($1, $2, $3, $4, 'READY', $5, $6, $7, $7)`,
      [
        matchSetRef,
        candidateRef,
        snapshotRefForMatch,
        canonicalSha256(
          gatedJobs.rows.map((job) => ({
            opportunity_ref: job.opportunity_ref,
            contract_hash: job.contract_hash,
          })),
        ),
        containsRecordedLive,
        containsRecordedLive ? "RECORDED_LIVE_WITH_SYNTHETIC_NEGATIVES" : "SYNTHETIC_PRELOADED",
        seededAt,
      ],
    );
    for (const gatedJob of gatedJobs.rows) {
      const isRecordedLive =
        containsRecordedLive && gatedJob.opportunity_ref === recordedPins.opportunity_ref;
      const positiveTarget = targets.find((target) => target.title === gatedJob.title);
      const positive = positiveTarget !== undefined;
      const acceptedTag = positive
        ? gatedJob.accepted_tags_json.find((tag) => tag.public_name === positiveTarget.tag)
        : null;
      if (positive && acceptedTag === undefined) {
        throw new Error(
          `Demo Eligibility tag '${positiveTarget.tag}' is not sealed for '${positiveTarget.title}'.`,
        );
      }
      const match = isRecordedLive
        ? recordedMatch
        : CandidateEligibilityJobMatchSchema.parse({
            opportunity_ref: gatedJob.opportunity_ref,
            state: positive ? "POSITIVE_EVIDENCE" : "NO_POSITIVE_EVIDENCE",
            connections: positive
              ? [
                  {
                    tag_ref: acceptedTag!.tag_ref,
                    evidence_refs: [
                      positiveTarget!.source === "EDUCATION"
                        ? `education:${candidateRef}:highest-v1`
                        : `evidence:${candidateRef}:${candidate.evidence_theme}`,
                    ],
                    connection_type: positiveTarget!.source,
                    bounded_reason:
                      positiveTarget!.source === "EDUCATION"
                        ? `The synthetic education field has a direct bounded connection to the Recruiter-sealed ${acceptedTag!.public_name} tag.`
                        : `The Candidate-only synthetic work sample has a bounded source-linked connection to the Recruiter-sealed ${acceptedTag!.public_name} tag.`,
                    still_unknown: [
                      "The attached source shape does not verify identity, ownership, or role performance.",
                    ],
                  },
                ]
              : [],
          });
      await pool.query(
        `INSERT INTO candidate_job_eligibility_matches (
           match_ref, match_set_ref, candidate_ref, passport_snapshot_ref,
           opportunity_ref, opportunity_version, contract_version_ref, contract_hash,
           policy_ref, state, match_json, output_hash, recorded_live, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)`,
        [
          `eligibility-match:${candidateRef}:${gatedJob.opportunity_ref}:preloaded-v1`,
          matchSetRef,
          candidateRef,
          snapshotRefForMatch,
          gatedJob.opportunity_ref,
          gatedJob.opportunity_version,
          gatedJob.contract_version_ref,
          gatedJob.contract_hash,
          gatedJob.policy_ref,
          match.state,
          JSON.stringify(match),
          canonicalSha256(match),
          isRecordedLive,
          seededAt,
        ],
      );
    }
    const eligibilityProjection = CandidateEligibilityProjectionSchema.parse({
      schema_version: "candidate-eligibility-projection@1",
      candidate_ref: candidateRef,
      status: "READY",
      passport_snapshot_ref: snapshotRefForMatch,
      projection_version: 1,
      reason_code: containsRecordedLive ? "RECORDED_LIVE" : "SYNTHETIC_PRELOADED",
      updated_at: seededAt,
    });
    await pool.query(
      `INSERT INTO candidate_eligibility_projections (
         candidate_ref, projection_version, passport_snapshot_ref, status,
         reason_code, projection_json, updated_at
       ) VALUES ($1, 1, $2, 'READY', $3, $4::jsonb, $5)`,
      [
        candidateRef,
        snapshotRefForMatch,
        eligibilityProjection.reason_code,
        JSON.stringify(eligibilityProjection),
        seededAt,
      ],
    );
  }

  const interest = new SubmitCandidateInterestHandler(
    new PostgresCandidateInterestStore(pool),
    interestIds,
    sha256,
  );
  await interest.execute({
    opportunityRef: published.opportunity_ref,
    actor: { role: "CANDIDATE", actorId: "candidate-42" },
    idempotencyKey: "functional-demo:candidate-42:interest",
    correlationId: "functional-demo:candidate-42:interest",
    command: {
      schema_version: "candidate-interest-command@2",
      hard_facts: [
        { fact_ref: "candidate42-work-auth", fact_type: "work_authorization", value: true },
        { fact_ref: "candidate42-language", fact_type: "required_language", value: "English" },
        { fact_ref: "candidate42-timezone", fact_type: "timezone_overlap", value: "ET" },
      ],
      consent_version: "candidate-application-terms@1",
      expected_opportunity_version: 1,
      background_access_basis: "AI_POSITIVE_EVIDENCE",
      eligibility_match_ref: `eligibility-match:candidate-42:${published.opportunity_ref}:preloaded-v1`,
      eligibility_match_version: 1,
    },
  });
  const queueStore = new PostgresInterestQueueStore(pool);
  const queueWorker = new InterestQueueWorker(
    queueStore,
    new OfferNextQueuedInterestHandler(queueStore, queueIds, sha256),
  );
  const candidateFeedStore = new PostgresCandidateEligibilityStore(pool, store);
  let feed = await candidateFeedStore.getCandidateOpportunityFeed("candidate-42");
  let job = feed.opportunities.find(
    ({ opportunity_ref }) => opportunity_ref === published.opportunity_ref,
  );
  for (let attempt = 0; attempt < 40 && job?.interest_state !== "BACKED_OFFERED"; attempt += 1) {
    await queueWorker.runOnce("functional-demo-reset");
    feed = await candidateFeedStore.getCandidateOpportunityFeed("candidate-42");
    job = feed.opportunities.find(
      ({ opportunity_ref }) => opportunity_ref === published.opportunity_ref,
    );
    if (job?.interest_state !== "BACKED_OFFERED") {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (job?.interest_state !== "BACKED_OFFERED") {
    throw new Error("Functional demo did not produce a backed Candidate 42 Offer.");
  }
  console.log(
    JSON.stringify({
      outcome: "FUNCTIONAL_DEMO_READY",
      opportunity_ref: published.opportunity_ref,
      invitation_ref: job.backed_offer?.invitation_ref,
      candidate_credit: feed.credit.available_credits,
      candidate_feed_count: feed.opportunities.length,
      published_job_post_count: 1 + syntheticJobPosts.length,
      employer_ai_review_policy: employerReviewPolicy.policy,
      synthetic_candidate_count: SYNTHETIC_CANDIDATES.length,
    }),
  );
} finally {
  await pool.end();
}
