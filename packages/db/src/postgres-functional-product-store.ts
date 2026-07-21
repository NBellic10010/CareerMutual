import { createHash } from "node:crypto";

import {
  FunctionalProductApplicationError,
  buildAnswerProcessEvidence,
  buildLegacyAnswerProcessEvidence,
  type AnswerArtifactRecord,
  type CandidateAssistantContext,
  type CompleteAnswerArtifactUploadReceipt,
  type CreateArtifactUploadIntentInput,
  type CreateJobPostDraftStoreInput,
  type FunctionalActor,
  type FunctionalProductIdFactory,
  type FunctionalProductStore,
  type FunctionalProductWorkerStore,
  type PersistRichTextDraftInput,
  type PublishJobPostReceipt,
  type PublishJobPostStoreInput,
  type QueueAssistantExchangeInput,
  type RecordFunctionalReviewStoreInput,
  type RecordSandboxActivityStoreInput,
  type StartBackedApplicationStoreInput,
  type SubmitFunctionalAnswerStoreInput,
  type UpdateJobPostDraftStoreInput,
  type VerifyArtifactUploadInput,
  type VoiceTranscriptionContext,
  type ObjectStorePort,
} from "@onlyboth/application";
import {
  CandidateAnswerSessionProjectionSchema,
  CandidateSandboxActivityReceiptSchema,
  CandidateApplicationCreditProjectionSchema,
  CandidateAssistantTurnProjectionSchema,
  CandidateResumeSnapshotSchema,
  CompleteAnswerArtifactUploadReceiptSchema,
  CandidateJobCardSchema,
  CandidateJobDetailSchema,
  CandidateOpportunityFeedSchema,
  CriticalChallengeSchema,
  EmployerAttentionWalletProjectionSchema,
  AnswerProcessEvidenceSchema,
  AnswerEvidenceEdgeDraftSchema,
  EmployerAiReviewProjectionSchema,
  EmployerProcessContextSchema,
  EmployerCurrentReviewProjectionSchema,
  EmployerBlindReviewProjectionSchema,
  EmployerJobDashboardSchema,
  EmployerJobPostSummarySchema,
  EmployerRevealedCandidatePageSchema,
  FunctionalAnswerSubmissionReceiptSchema,
  FunctionalHumanReviewReceiptSchema,
  JobPostDraftInputSchema,
  JobPostDraftProjectionSchema,
  PublicOpportunityProjectionSchema,
  PublishJobPostReceiptSchema,
  StartBackedApplicationReceiptSchema,
  SANDBOX_FOCUS_DISCLOSURE_VERSION,
  SANDBOX_FOCUS_POLICY_VERSION,
  type CandidateAnswerSessionProjection,
  type CandidateJobDetail,
  type CandidateOpportunityFeed,
  type CriticalChallenge,
  type EmployerRevealedCandidatePage,
  type FunctionalHumanReviewReceipt,
  type JobPostDraftInput,
  type RichTextNode,
} from "@onlyboth/contracts";
import {
  acceptBackedAnswerOffer,
  applySandboxActivity,
  activateBlindReviewCommitment,
  createRollingBlindReview,
  expireEmptyActiveBlindAnswer,
  sandboxFocusThresholdReached,
  recordAndSettleHumanAnswerReview,
  settleEmployerReviewBreach,
  submitBlindAnswer,
  type RollingBlindReview,
  type SandboxFocusState,
} from "@onlyboth/domain";
import type { Pool, PoolClient, QueryResult } from "pg";

interface StoredReceiptRow {
  readonly command_fingerprint: string;
  readonly command_type: string;
  readonly receipt_json: unknown;
}

interface ArtifactRow {
  readonly artifact_ref: string;
  readonly answer_session_ref: string;
  readonly candidate_ref: string;
  readonly kind: AnswerArtifactRecord["kind"];
  readonly object_key: string;
  readonly content_type: string;
  readonly content_length: number;
  readonly sha256: string | null;
  readonly state: AnswerArtifactRecord["state"];
  readonly revision: number;
  readonly metadata_json: unknown;
  readonly created_at: Date;
}

interface FocusProjectionRow {
  readonly answer_session_ref: string;
  readonly candidate_ref: string;
  readonly policy_version: "sandbox-focus-policy@1" | "sandbox-focus-policy@legacy-unmonitored";
  readonly disclosure_version: string;
  readonly policy_state: "ACTIVE" | "WARNED" | "AUTO_SUBMIT_PENDING" | "AUTO_SUBMITTED";
  readonly document_visibility: "VISIBLE" | "HIDDEN";
  readonly window_focus: "FOCUSED" | "BLURRED";
  readonly away_started_at: Date | null;
  readonly countable_away_count: number;
  readonly cumulative_away_ms: number;
  readonly system_dialog_used: boolean;
  readonly system_dialog_until: Date | null;
  readonly auto_submit_requested_at: Date | null;
  readonly platform_settlement_due_at: Date | null;
  readonly auto_submitted_at: Date | null;
  readonly version: number;
}

const FOCUS_TELEMETRY_LIMITATIONS =
  "Browser-reported focus activity is not secure proctoring and cannot detect a second device." as const;

function focusDomainState(row: FocusProjectionRow): SandboxFocusState {
  return {
    policyState: row.policy_state === "AUTO_SUBMITTED" ? "AUTO_SUBMIT_PENDING" : row.policy_state,
    documentVisibility: row.document_visibility,
    windowFocus: row.window_focus,
    awayStartedAtMs: row.away_started_at?.getTime() ?? null,
    countableAwayCount: row.countable_away_count,
    cumulativeAwayMs: row.cumulative_away_ms,
    systemDialogUsed: row.system_dialog_used,
    systemDialogUntilMs: row.system_dialog_until?.getTime() ?? null,
  };
}

function focusProjection(row: FocusProjectionRow) {
  return {
    policy_version: row.policy_version,
    disclosure_version: row.disclosure_version,
    state: row.policy_state,
    document_visibility: row.document_visibility,
    window_focus: row.window_focus,
    countable_away_count: row.countable_away_count,
    cumulative_away_ms: row.cumulative_away_ms,
    current_away_started_at: row.away_started_at?.toISOString() ?? null,
    warning_required: row.policy_state === "WARNED",
    telemetry_limitations: FOCUS_TELEMETRY_LIMITATIONS,
  } as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function criticalChallengeFromContract(
  contract: Record<string, unknown>,
  criticalQuestion: string,
): CriticalChallenge {
  const parsed = CriticalChallengeSchema.safeParse(contract.critical_challenge);
  if (parsed.success) return parsed.data;
  return CriticalChallengeSchema.parse({
    schema_version: "critical-challenge@1",
    challenge_ref: "critical-challenge:legacy-contract",
    title: "Sealed critical challenge",
    objective: criticalQuestion,
    parts: [
      {
        part_ref: "challenge-part:legacy-contract-text",
        kind: "TEXT",
        title: "Role question",
        instructions:
          "Respond to the complete sealed role question using the required proof format.",
        text_content: criticalQuestion,
        asset: null,
      },
    ],
  });
}

function parseReview(value: unknown): RollingBlindReview {
  if (
    !isRecord(value) ||
    !isRecord(value.commitment) ||
    !Array.isArray(value.interests) ||
    !Array.isArray(value.slots) ||
    !Array.isArray(value.obligations) ||
    !Array.isArray(value.invitations) ||
    !Array.isArray(value.cohorts)
  ) {
    throw new FunctionalProductApplicationError(
      "INVALID_STATE",
      "The persisted Blind Review aggregate is invalid.",
    );
  }
  return structuredClone(value) as unknown as RollingBlindReview;
}

function requireOne(result: QueryResult, message: string): void {
  if (result.rowCount !== 1) {
    throw new FunctionalProductApplicationError("STALE_VERSION", message);
  }
}

function hash(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function artifactRecord(row: ArtifactRow): AnswerArtifactRecord {
  return {
    artifactRef: row.artifact_ref,
    answerSessionRef: row.answer_session_ref,
    candidateRef: row.candidate_ref,
    kind: row.kind,
    objectKey: row.object_key,
    contentType: row.content_type,
    contentLength: row.content_length,
    sha256: row.sha256,
    state: row.state,
    revision: row.revision,
    metadata: isRecord(row.metadata_json) ? row.metadata_json : {},
    createdAt: row.created_at.toISOString(),
  };
}

function objectText(body: Uint8Array): string {
  return Buffer.from(body).toString("utf8");
}

function richTextContent(node: RichTextNode): string {
  return [node.text ?? "", ...(node.content ?? []).map(richTextContent)]
    .filter(Boolean)
    .join(node.type === "text" ? "" : "\n")
    .trim();
}

function requireRole(actor: FunctionalActor, role: "CANDIDATE" | "EMPLOYER"): void {
  if (actor.role !== role) {
    throw new FunctionalProductApplicationError("ROLE_FORBIDDEN", `${role} role is required.`);
  }
}

function commandFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

async function databaseNow(client: PoolClient): Promise<Date> {
  const result = await client.query<{ database_now: Date }>(
    "SELECT clock_timestamp() AS database_now",
  );
  const now = result.rows[0]?.database_now;
  if (now === undefined) throw new Error("PostgreSQL did not return database time.");
  return now;
}

async function findReceipt(
  client: PoolClient,
  actorRef: string,
  idempotencyKey: string,
  commandType: string,
  fingerprint: string,
): Promise<unknown | null> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `blind-review-command:${actorRef}:${idempotencyKey}`,
  ]);
  const result = await client.query<StoredReceiptRow>(
    `SELECT command_fingerprint, command_type, receipt_json
       FROM blind_review_command_receipts
      WHERE actor_ref = $1 AND idempotency_key = $2`,
    [actorRef, idempotencyKey],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  if (row.command_type !== commandType || row.command_fingerprint !== fingerprint) {
    throw new FunctionalProductApplicationError(
      "IDEMPOTENCY_CONFLICT",
      "The Idempotency-Key was already used for another command.",
    );
  }
  return row.receipt_json;
}

async function insertReceipt(
  client: PoolClient,
  input: {
    readonly actorRef: string;
    readonly idempotencyKey: string;
    readonly commandId: string;
    readonly commandType: string;
    readonly fingerprint: string;
    readonly receipt: unknown;
    readonly occurredAt: Date;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO blind_review_command_receipts (
       actor_ref, idempotency_key, command_id, command_fingerprint,
       command_type, receipt_json, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      input.actorRef,
      input.idempotencyKey,
      input.commandId,
      input.fingerprint,
      input.commandType,
      JSON.stringify(input.receipt),
      input.occurredAt,
    ],
  );
}

async function runTransaction<TResult>(
  pool: Pool,
  work: (client: PoolClient, now: Date) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client, await databaseNow(client));
    await client.query("COMMIT");
    return result;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function normalizeInterestState(
  status: string | null,
):
  | "NOT_REGISTERED"
  | "WAITING_FOR_BACKED_SLOT"
  | "BACKED_OFFERED"
  | "APPLICATION_ACTIVE"
  | "APPLICATION_SUBMITTED"
  | "REVIEWED"
  | "EMPLOYER_BREACH"
  | "OFFER_DECLINED"
  | "OFFER_EXPIRED" {
  switch (status) {
    case "WAITING_FOR_BACKED_SLOT":
    case "BACKED_OFFERED":
    case "APPLICATION_ACTIVE":
    case "APPLICATION_SUBMITTED":
    case "REVIEWED":
    case "EMPLOYER_BREACH":
    case "OFFER_DECLINED":
    case "OFFER_EXPIRED":
      return status;
    default:
      return "NOT_REGISTERED";
  }
}

function contractPredicate(predicate: JobPostDraftInput["hard_predicates"][number]) {
  if (predicate.operator === "GTE") {
    if (typeof predicate.expected !== "number") {
      throw new FunctionalProductApplicationError(
        "INVALID_STATE",
        "A GTE hard predicate requires a numeric expected value.",
      );
    }
    return {
      predicate_ref: predicate.predicate_ref,
      fact_type: predicate.fact_type,
      operator: "GTE",
      minimum: predicate.expected,
    };
  }
  if (predicate.operator === "CONTAINS") {
    if (typeof predicate.expected !== "string") {
      throw new FunctionalProductApplicationError(
        "INVALID_STATE",
        "A CONTAINS hard predicate requires a string expected value.",
      );
    }
    return {
      predicate_ref: predicate.predicate_ref,
      fact_type: predicate.fact_type,
      operator: "CONTAINS",
      member: predicate.expected,
    };
  }
  return predicate;
}

export class PostgresFunctionalProductStore
  implements FunctionalProductStore, FunctionalProductWorkerStore
{
  public constructor(
    private readonly pool: Pool,
    private readonly objectStore: ObjectStorePort,
  ) {}

  public async getCandidateOpportunityFeed(
    candidateRef: string,
  ): Promise<CandidateOpportunityFeed> {
    const accountResult = await this.pool.query<{
      account_ref: string;
      period_ref: string;
      allowance: number;
      available_credits: number;
      consumed_credits: number;
      version: number;
      period_ends_at: Date;
    }>(
      `SELECT account_ref, period_ref, allowance, available_credits,
              consumed_credits, version, period_ends_at
         FROM candidate_credit_accounts
        WHERE candidate_ref = $1 AND state = 'ACTIVE'
          AND period_started_at <= clock_timestamp()
          AND period_ends_at > clock_timestamp()
        ORDER BY period_ends_at DESC LIMIT 1`,
      [candidateRef],
    );
    const account = accountResult.rows[0];
    if (account === undefined) {
      throw new FunctionalProductApplicationError(
        "INVALID_STATE",
        "Candidate application Credits are not configured.",
      );
    }
    const result = await this.pool.query<{
      projection_json: unknown;
      opportunity_version: number;
      interest_status: string | null;
      invitation_ref: string | null;
      obligation_ref: string | null;
      slot_ref: string | null;
      obligation_version: number | null;
      slot_version: number | null;
      reviewer_display_name: string | null;
      offered_at: Date | null;
      offer_expires_at: Date | null;
      answer_session_ref: string | null;
    }>(
      `SELECT public.projection_json, opportunity.version AS opportunity_version,
              interest.status AS interest_status,
              invitation.invitation_ref, obligation.obligation_ref, obligation.slot_ref,
              obligation.version AS obligation_version, slot.version AS slot_version,
              attention.reviewer_display_name, invitation.offered_at, invitation.offer_expires_at,
              session.answer_session_ref
         FROM public_opportunity_projections AS public
         JOIN opportunities AS opportunity ON opportunity.id = public.opportunity_ref
         JOIN blind_review_commitments AS commitment
           ON commitment.opportunity_ref = opportunity.id AND commitment.state = 'ACTIVE'
         JOIN attention_commitments AS attention
           ON attention.commitment_ref = commitment.source_attention_commitment_ref
         LEFT JOIN candidate_interests AS interest
           ON interest.opportunity_ref = opportunity.id AND interest.candidate_ref = $1
         LEFT JOIN answer_review_obligations AS obligation
           ON obligation.interest_ref = interest.interest_ref
          AND obligation.status NOT IN ('SETTLED', 'DECLINED', 'EXPIRED', 'WITHDRAWN',
             'PLATFORM_ABORT', 'BREACH_SETTLED')
         LEFT JOIN answer_invitations AS invitation
           ON invitation.obligation_ref = obligation.obligation_ref
         LEFT JOIN answer_review_slots AS slot ON slot.slot_ref = obligation.slot_ref
         LEFT JOIN answer_sessions AS session ON session.obligation_ref = obligation.obligation_ref
        WHERE opportunity.status = 'OPEN'
        ORDER BY opportunity.created_at DESC, opportunity.id`,
      [candidateRef],
    );
    const opportunities = result.rows.map((row) => {
      const publicProjection = PublicOpportunityProjectionSchema.parse(row.projection_json);
      return CandidateJobCardSchema.parse({
        schema_version: "candidate-job-card@1",
        opportunity_ref: publicProjection.opportunity_ref,
        opportunity_version: row.opportunity_version,
        title: publicProjection.title,
        organization_public_name: publicProjection.organization_public_name,
        role_category: publicProjection.role_category,
        public_role_summary: publicProjection.public_role_summary,
        employment_type: publicProjection.employment_type,
        seniority_band: publicProjection.seniority_band,
        compensation_range: publicProjection.compensation_range,
        location_and_work_mode: publicProjection.location_and_work_mode,
        maximum_candidate_minutes: publicProjection.maximum_candidate_minutes,
        human_review_sla_hours: publicProjection.human_review_sla_hours,
        candidate_ai_policy: publicProjection.candidate_ai_policy,
        challenge_part_kinds: publicProjection.challenge_part_kinds,
        interest_state: normalizeInterestState(row.interest_status),
        backed_offer:
          row.interest_status === "BACKED_OFFERED" &&
          row.invitation_ref !== null &&
          row.obligation_ref !== null &&
          row.slot_ref !== null &&
          row.obligation_version !== null &&
          row.slot_version !== null &&
          row.offered_at !== null &&
          row.offer_expires_at !== null
            ? {
                invitation_ref: row.invitation_ref,
                obligation_ref: row.obligation_ref,
                slot_ref: row.slot_ref,
                expected_obligation_version: row.obligation_version,
                expected_slot_version: row.slot_version,
                reviewer_display_name: row.reviewer_display_name ?? "Named reviewer",
                offered_at: row.offered_at.toISOString(),
                offer_expires_at: row.offer_expires_at.toISOString(),
              }
            : null,
        active_answer_session_ref: row.answer_session_ref,
      });
    });
    return CandidateOpportunityFeedSchema.parse({
      schema_version: "candidate-opportunity-feed@1",
      candidate_ref: candidateRef,
      credit: CandidateApplicationCreditProjectionSchema.parse({
        schema_version: "candidate-application-credit-projection@1",
        account_ref: account.account_ref,
        candidate_ref: candidateRef,
        period_ref: account.period_ref,
        allowance: account.allowance,
        available_credits: account.available_credits,
        consumed_credits: account.consumed_credits,
        version: account.version,
        period_ends_at: account.period_ends_at.toISOString(),
      }),
      opportunities,
    });
  }

  public async getCandidateJobDetail(
    candidateRef: string,
    opportunityRef: string,
  ): Promise<CandidateJobDetail | null> {
    const feed = await this.getCandidateOpportunityFeed(candidateRef);
    const card = feed.opportunities.find(
      (opportunity) => opportunity.opportunity_ref === opportunityRef,
    );
    if (card === undefined) return null;
    const result = await this.pool.query<{
      projection_json: unknown;
      contract_json: unknown;
      answer_review_wip: number;
      available_slot_count: string;
      waiting_interest_count: string;
    }>(
      `SELECT public.projection_json, contract.contract_json,
              commitment.answer_review_wip,
              COUNT(slot.slot_ref) FILTER (WHERE slot.status = 'AVAILABLE')::text
                AS available_slot_count,
              (SELECT COUNT(*)::text FROM candidate_interests queued
                WHERE queued.opportunity_ref = opportunity.id
                  AND queued.status = 'WAITING_FOR_BACKED_SLOT') AS waiting_interest_count
         FROM opportunities AS opportunity
         JOIN public_opportunity_projections AS public
           ON public.opportunity_ref = opportunity.id
         JOIN sealed_capability_contracts AS contract
           ON contract.contract_version_ref = opportunity.current_contract_version_ref
         JOIN blind_review_commitments AS commitment
           ON commitment.opportunity_ref = opportunity.id
         LEFT JOIN answer_review_slots AS slot ON slot.commitment_ref = commitment.commitment_ref
        WHERE opportunity.id = $1
        GROUP BY public.projection_json, contract.contract_json,
                 commitment.answer_review_wip, opportunity.id`,
      [opportunityRef],
    );
    const row = result.rows[0];
    if (row === undefined || !isRecord(row.contract_json)) return null;
    const publicProjection = PublicOpportunityProjectionSchema.parse(row.projection_json);
    const criticalQuestion = String(row.contract_json.critical_question ?? "Sealed role question");
    return CandidateJobDetailSchema.parse({
      ...card,
      schema_version: "candidate-job-detail@1",
      public_hard_requirements: publicProjection.public_hard_requirements,
      capability_areas: publicProjection.capability_area_preview,
      critical_question_preview: criticalQuestion,
      critical_challenge: criticalChallengeFromContract(row.contract_json, criticalQuestion),
      proof_format: publicProjection.proof_format,
      answer_review_wip: row.answer_review_wip,
      available_slot_count: Number(row.available_slot_count),
      waiting_interest_count: Number(row.waiting_interest_count),
      terms_version: String(row.contract_json.terms_version ?? "candidate-application-terms@1"),
      ai_disclosure_version: String(
        row.contract_json.ai_disclosure_version ?? "candidate-ai-disclosure@1",
      ),
      conditional_reveal_consent_version: String(
        row.contract_json.conditional_reveal_consent_version ?? "resume-reveal-consent@1",
      ),
      sandbox_focus_policy_version: String(
        row.contract_json.sandbox_focus_policy_version ?? SANDBOX_FOCUS_POLICY_VERSION,
      ),
      focus_tracking_disclosure_version: String(
        row.contract_json.focus_tracking_disclosure_version ?? SANDBOX_FOCUS_DISCLOSURE_VERSION,
      ),
      employer_ai_review_policy: String(row.contract_json.employer_ai_review_policy ?? "OFF"),
      employer_ai_review_disclosure_version: String(
        row.contract_json.employer_ai_review_disclosure_version ??
          "employer-ai-review-disclosure@legacy-off",
      ),
      review_criteria: row.contract_json.review_criteria,
    });
  }

  public async getEmployerDashboard(reviewerRef: string) {
    const walletResult = await this.pool.query<{
      available_credits: number;
      committed_credits: number;
      forfeited_credits: number;
      version: number;
    }>(
      `SELECT available_credits, committed_credits, forfeited_credits, version
         FROM employer_attention_wallets WHERE owner_ref = $1`,
      [reviewerRef],
    );
    const wallet = walletResult.rows[0];
    if (wallet === undefined) {
      throw new FunctionalProductApplicationError(
        "INVALID_STATE",
        "Employer Attention wallet is not configured.",
      );
    }
    const draftResult = await this.pool.query<{
      draft_ref: string;
      owner_ref: string;
      state: "DRAFT" | "PUBLISHED";
      version: number;
      draft_json: unknown;
      published_opportunity_ref: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT draft_ref, owner_ref, state, version, draft_json,
              published_opportunity_ref, created_at, updated_at
         FROM job_post_drafts WHERE owner_ref = $1 ORDER BY updated_at DESC`,
      [reviewerRef],
    );
    const jobResult = await this.pool.query<{
      opportunity_ref: string;
      title: string;
      organization_public_name: string;
      role_category: string;
      status: "OPEN" | "CLOSED";
      commitment_state: "ACTIVE" | "PAUSED" | "CLOSING" | "CLOSED" | "SUSPENDED";
      answer_review_wip: number;
      available_slot_count: string;
      outstanding_obligation_count: string;
      pending_review_count: string;
      waiting_interest_count: string;
      published_at: Date;
    }>(
      `SELECT opportunity.id AS opportunity_ref, opportunity.title,
              public.projection_json->>'organization_public_name' AS organization_public_name,
              COALESCE(public.projection_json->>'role_category', 'TECHNOLOGY') AS role_category,
              opportunity.status, commitment.state AS commitment_state,
              commitment.answer_review_wip,
              COUNT(DISTINCT slot.slot_ref) FILTER (WHERE slot.status = 'AVAILABLE')::text
                AS available_slot_count,
              COUNT(DISTINCT obligation.obligation_ref) FILTER (
                WHERE obligation.status NOT IN ('SETTLED', 'DECLINED', 'EXPIRED', 'WITHDRAWN',
                  'PLATFORM_ABORT', 'BREACH_SETTLED'))::text AS outstanding_obligation_count,
              COUNT(DISTINCT obligation.obligation_ref) FILTER (
                WHERE obligation.status = 'REVIEW_PENDING')::text AS pending_review_count,
              COUNT(DISTINCT interest.interest_ref) FILTER (
                WHERE interest.status = 'WAITING_FOR_BACKED_SLOT')::text AS waiting_interest_count,
              opportunity.created_at AS published_at
         FROM opportunities AS opportunity
         JOIN blind_review_commitments AS commitment
           ON commitment.opportunity_ref = opportunity.id
         JOIN public_opportunity_projections AS public
           ON public.opportunity_ref = opportunity.id
         LEFT JOIN answer_review_slots AS slot ON slot.commitment_ref = commitment.commitment_ref
         LEFT JOIN answer_review_obligations AS obligation
           ON obligation.commitment_ref = commitment.commitment_ref
         LEFT JOIN candidate_interests AS interest
           ON interest.opportunity_ref = opportunity.id
        WHERE opportunity.reviewer_id = $1
        GROUP BY opportunity.id, public.projection_json, commitment.state,
                 commitment.answer_review_wip
        ORDER BY opportunity.created_at DESC`,
      [reviewerRef],
    );
    return EmployerJobDashboardSchema.parse({
      schema_version: "employer-job-dashboard@1",
      reviewer_ref: reviewerRef,
      wallet: EmployerAttentionWalletProjectionSchema.parse({
        schema_version: "employer-attention-wallet-projection@1",
        owner_ref: reviewerRef,
        ...wallet,
      }),
      drafts: draftResult.rows.map((row) =>
        JobPostDraftProjectionSchema.parse({
          schema_version: "job-post-draft-projection@1",
          draft_ref: row.draft_ref,
          owner_ref: row.owner_ref,
          state: row.state,
          version: row.version,
          draft: JobPostDraftInputSchema.parse(row.draft_json),
          published_opportunity_ref: row.published_opportunity_ref,
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
        }),
      ),
      job_posts: jobResult.rows.map((row) =>
        EmployerJobPostSummarySchema.parse({
          schema_version: "employer-job-post-summary@1",
          ...row,
          available_slot_count: Number(row.available_slot_count),
          outstanding_obligation_count: Number(row.outstanding_obligation_count),
          pending_review_count: Number(row.pending_review_count),
          waiting_interest_count: Number(row.waiting_interest_count),
          published_at: row.published_at.toISOString(),
        }),
      ),
    });
  }

  public async getEmployerRevealedCandidates(
    reviewerRef: string,
    page: number,
  ): Promise<EmployerRevealedCandidatePage> {
    if (!Number.isInteger(page) || page < 1) {
      throw new FunctionalProductApplicationError(
        "INVALID_STATE",
        "The revealed Candidate page must be a positive integer.",
      );
    }
    const countResult = await this.pool.query<{ total_items: string }>(
      `SELECT COUNT(*)::text AS total_items
         FROM employer_resume_reveals
        WHERE reviewer_ref = $1`,
      [reviewerRef],
    );
    const totalItems = Number(countResult.rows[0]?.total_items ?? 0);
    const effectivePage = totalItems === 0 ? 1 : Math.min(page, totalItems);
    const result = await this.pool.query<{
      reveal_ref: string;
      opportunity_ref: string;
      opportunity_title: string;
      human_review_ref: string;
      answer_submission_ref: string;
      review_comment: string;
      revealed_at: Date;
      resume_json: unknown;
    }>(
      `SELECT reveal.reveal_ref, reveal.opportunity_ref,
              opportunity.title AS opportunity_title,
              reveal.human_review_ref, reveal.answer_submission_ref,
              review.review_comment, reveal.revealed_at, resume.resume_json
         FROM employer_resume_reveals AS reveal
         JOIN opportunities AS opportunity ON opportunity.id = reveal.opportunity_ref
         JOIN human_answer_reviews AS review
           ON review.human_review_ref = reveal.human_review_ref
         JOIN candidate_resume_snapshots AS resume
           ON resume.resume_snapshot_ref = reveal.resume_snapshot_ref
        WHERE reveal.reviewer_ref = $1
        ORDER BY reveal.revealed_at DESC, reveal.reveal_ref DESC
        LIMIT 1 OFFSET $2`,
      [reviewerRef, effectivePage - 1],
    );
    return EmployerRevealedCandidatePageSchema.parse({
      schema_version: "employer-revealed-candidate-page@1",
      reviewer_ref: reviewerRef,
      page: effectivePage,
      page_size: 1,
      total_items: totalItems,
      total_pages: totalItems,
      items: result.rows.map((row) => ({
        reveal_ref: row.reveal_ref,
        opportunity_ref: row.opportunity_ref,
        opportunity_title: row.opportunity_title,
        human_review_ref: row.human_review_ref,
        answer_submission_ref: row.answer_submission_ref,
        review_comment: row.review_comment,
        revealed_at: row.revealed_at.toISOString(),
        resume: CandidateResumeSnapshotSchema.parse(row.resume_json),
      })),
    });
  }

  public async getAuthorizedArtifact(
    actor: FunctionalActor,
    artifactRef: string,
  ): Promise<AnswerArtifactRecord | null> {
    const result = await this.pool.query<ArtifactRow & { reviewer_ref: string }>(
      `SELECT artifact.*, commitment.reviewer_ref
         FROM answer_artifacts AS artifact
         JOIN answer_sessions AS session
           ON session.answer_session_ref = artifact.answer_session_ref
         JOIN answer_review_obligations AS obligation
           ON obligation.obligation_ref = session.obligation_ref
         JOIN blind_review_commitments AS commitment
           ON commitment.commitment_ref = obligation.commitment_ref
        WHERE artifact.artifact_ref = $1`,
      [artifactRef],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    const authorized =
      (actor.role === "CANDIDATE" && row.candidate_ref === actor.actorId) ||
      (actor.role === "EMPLOYER" && row.reviewer_ref === actor.actorId && row.state === "SEALED") ||
      actor.role === "SYSTEM";
    return authorized ? artifactRecord(row) : null;
  }

  public async getCandidateAnswerSession(
    candidateRef: string,
    answerSessionRef: string,
  ): Promise<CandidateAnswerSessionProjection | null> {
    const result = await this.pool.query<
      {
        answer_session_ref: string;
        invitation_ref: string;
        obligation_ref: string;
        candidate_ref: string;
        status:
          | "ACTIVE"
          | "SUBMITTED"
          | "EXPIRED_EMPTY"
          | "FOCUS_POLICY_TERMINATED_EMPTY"
          | "WITHDRAWN"
          | "PLATFORM_ABORT";
        session_version: number;
        started_at: Date;
        answer_due_at: Date;
        submitted_at: Date | null;
        latest_rich_text_artifact_ref: string | null;
        opportunity_ref: string;
        title: string;
        reviewer_display_name: string | null;
        projection_json: unknown;
        contract_json: unknown;
        process_manifest_json: unknown | null;
      } & FocusProjectionRow
    >(
      `SELECT session.answer_session_ref, session.invitation_ref, session.obligation_ref,
              session.candidate_ref, session.status, session.version AS session_version,
              session.started_at,
              session.answer_due_at, session.submitted_at,
              session.latest_rich_text_artifact_ref, commitment.opportunity_ref,
              opportunity.title, attention.reviewer_display_name,
              public.projection_json, contract.contract_json,
              process.process_manifest_json,
              focus.answer_session_ref, focus.candidate_ref, focus.policy_version,
              focus.disclosure_version, focus.policy_state, focus.document_visibility,
              focus.window_focus, focus.away_started_at, focus.countable_away_count,
              focus.cumulative_away_ms, focus.system_dialog_used, focus.system_dialog_until,
              focus.auto_submit_requested_at, focus.platform_settlement_due_at,
              focus.auto_submitted_at, focus.version
         FROM answer_sessions AS session
         JOIN answer_review_obligations AS obligation
           ON obligation.obligation_ref = session.obligation_ref
         JOIN blind_review_commitments AS commitment
           ON commitment.commitment_ref = obligation.commitment_ref
         JOIN opportunities AS opportunity ON opportunity.id = commitment.opportunity_ref
         JOIN public_opportunity_projections AS public
           ON public.opportunity_ref = opportunity.id
         JOIN attention_commitments AS attention
           ON attention.commitment_ref = commitment.source_attention_commitment_ref
         JOIN sealed_capability_contracts AS contract
           ON contract.contract_version_ref = commitment.contract_version_ref
         JOIN answer_session_focus_projections AS focus
           ON focus.answer_session_ref = session.answer_session_ref
         LEFT JOIN answer_process_evidence AS process
           ON process.answer_session_ref = session.answer_session_ref
        WHERE session.answer_session_ref = $1 AND session.candidate_ref = $2`,
      [answerSessionRef, candidateRef],
    );
    const row = result.rows[0];
    if (row === undefined || !isRecord(row.contract_json)) return null;
    const publicProjection = PublicOpportunityProjectionSchema.parse(row.projection_json);
    const artifactResult = await this.pool.query<ArtifactRow>(
      `SELECT artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
              content_type, content_length, sha256, state, revision, metadata_json, created_at
         FROM answer_artifacts WHERE answer_session_ref = $1
        ORDER BY created_at, revision, artifact_ref`,
      [answerSessionRef],
    );
    const artifacts = artifactResult.rows.map(artifactRecord);
    let latestDocument: RichTextNode | null = null;
    if (row.latest_rich_text_artifact_ref !== null) {
      const latest = artifacts.find(
        (artifact) => artifact.artifactRef === row.latest_rich_text_artifact_ref,
      );
      if (latest !== undefined && latest.state !== "FAILED") {
        try {
          latestDocument = JSON.parse(
            objectText(await this.objectStore.getObject(latest.objectKey)),
          ) as RichTextNode;
        } catch {
          latestDocument = null;
        }
      }
    }
    const exchangeResult = await this.pool.query<{
      exchange_ref: string;
      ordinal: number;
      status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
      error_code: string | null;
      created_at: Date;
      user_artifact_ref: string;
      assistant_artifact_ref: string | null;
    }>(
      `SELECT exchange_ref, ordinal, status, error_code, created_at,
              user_artifact_ref, assistant_artifact_ref
         FROM candidate_assistant_exchanges
        WHERE answer_session_ref = $1 ORDER BY ordinal`,
      [answerSessionRef],
    );
    const contentByRef = new Map<string, string | null>();
    await Promise.all(
      artifacts
        .filter(({ kind }) => kind === "GPT_TURN")
        .map(async (artifact) => {
          try {
            contentByRef.set(
              artifact.artifactRef,
              objectText(await this.objectStore.getObject(artifact.objectKey)),
            );
          } catch {
            contentByRef.set(artifact.artifactRef, null);
          }
        }),
    );
    const assistantTurns = exchangeResult.rows.flatMap((exchange) => [
      CandidateAssistantTurnProjectionSchema.parse({
        turn_ref: exchange.user_artifact_ref,
        ordinal: exchange.ordinal * 2 - 1,
        role: "USER",
        status: exchange.status,
        content: contentByRef.get(exchange.user_artifact_ref) ?? null,
        error_code: exchange.error_code,
        created_at: exchange.created_at.toISOString(),
      }),
      CandidateAssistantTurnProjectionSchema.parse({
        turn_ref: exchange.assistant_artifact_ref ?? `assistant-pending:${exchange.exchange_ref}`,
        ordinal: exchange.ordinal * 2,
        role: "ASSISTANT",
        status: exchange.status,
        content:
          exchange.assistant_artifact_ref === null
            ? null
            : (contentByRef.get(exchange.assistant_artifact_ref) ?? null),
        error_code: exchange.error_code,
        created_at: exchange.created_at.toISOString(),
      }),
    ]);
    return CandidateAnswerSessionProjectionSchema.parse({
      schema_version: "candidate-answer-session-projection@2",
      answer_session_ref: row.answer_session_ref,
      opportunity_ref: row.opportunity_ref,
      candidate_ref: row.candidate_ref,
      invitation_ref: row.invitation_ref,
      obligation_ref: row.obligation_ref,
      state:
        row.status === "ACTIVE" && row.policy_state === "AUTO_SUBMIT_PENDING"
          ? "FOCUS_POLICY_AUTO_SUBMIT_PENDING"
          : row.status,
      version: row.session_version,
      title: row.title,
      organization_public_name: publicProjection.organization_public_name,
      reviewer_display_name: row.reviewer_display_name ?? "Named reviewer",
      critical_question: String(row.contract_json.critical_question ?? "Sealed question"),
      critical_challenge: criticalChallengeFromContract(
        row.contract_json,
        String(row.contract_json.critical_question ?? "Sealed question"),
      ),
      allowed_assumptions: Array.isArray(row.contract_json.allowed_assumptions)
        ? row.contract_json.allowed_assumptions.map(String)
        : [],
      proof_format: publicProjection.proof_format,
      candidate_ai_policy: publicProjection.candidate_ai_policy,
      started_at: row.started_at.toISOString(),
      answer_due_at: row.answer_due_at.toISOString(),
      submitted_at: row.submitted_at?.toISOString() ?? null,
      latest_document: latestDocument,
      latest_rich_text_artifact_ref: row.latest_rich_text_artifact_ref,
      artifacts: artifacts.map((artifact) => ({
        artifact_ref: artifact.artifactRef,
        kind: artifact.kind,
        state: artifact.state,
        content_type: artifact.contentType,
        content_length: artifact.contentLength,
        sha256: artifact.sha256,
        transcript_artifact_ref:
          typeof artifact.metadata.transcript_artifact_ref === "string"
            ? artifact.metadata.transcript_artifact_ref
            : null,
        transcription_status:
          artifact.kind === "VOICE_MEMO" &&
          typeof artifact.metadata.transcription_status === "string"
            ? artifact.metadata.transcription_status
            : null,
        transcription_error_code:
          artifact.kind === "VOICE_MEMO" &&
          typeof artifact.metadata.transcription_error_code === "string"
            ? artifact.metadata.transcription_error_code
            : null,
      })),
      assistant_turns: assistantTurns,
      focus: focusProjection(row),
      process_evidence:
        row.process_manifest_json === null
          ? null
          : AnswerProcessEvidenceSchema.parse(row.process_manifest_json),
    });
  }

  public async getCurrentEmployerReview(reviewerRef: string, opportunityRef: string) {
    const result = await this.pool.query<{
      title: string;
      reviewer_ref: string;
      contract_json: unknown;
      obligation_ref: string | null;
      obligation_version: number | null;
      cohort_ref: string | null;
      cohort_version: number | null;
      answer_submission_ref: string | null;
      answer_session_ref: string | null;
      candidate_ref: string | null;
      submitted_at: Date | null;
      submission_source: "LEGACY" | "MANUAL" | "DEADLINE_AUTO" | "FOCUS_POLICY_AUTO" | null;
      pending_review_count: string;
      available_slot_count: string;
      waiting_interest_count: string;
    }>(
      `SELECT opportunity.title, commitment.reviewer_ref, contract.contract_json,
              current.obligation_ref, current.obligation_version, current.cohort_ref,
              current.cohort_version, current.answer_submission_ref,
              current.answer_session_ref, current.candidate_ref, current.submitted_at,
              current.submission_source,
              (SELECT COUNT(*)::text FROM answer_review_obligations pending
                WHERE pending.commitment_ref = commitment.commitment_ref
                  AND pending.status = 'REVIEW_PENDING') AS pending_review_count,
              (SELECT COUNT(*)::text FROM answer_review_slots available
                WHERE available.commitment_ref = commitment.commitment_ref
                  AND available.status = 'AVAILABLE') AS available_slot_count,
              (SELECT COUNT(*)::text FROM candidate_interests waiting
                WHERE waiting.opportunity_ref = opportunity.id
                  AND waiting.status = 'WAITING_FOR_BACKED_SLOT') AS waiting_interest_count
         FROM opportunities AS opportunity
         JOIN blind_review_commitments AS commitment
           ON commitment.opportunity_ref = opportunity.id
         JOIN sealed_capability_contracts AS contract
           ON contract.contract_version_ref = commitment.contract_version_ref
         LEFT JOIN LATERAL (
           SELECT obligation.obligation_ref, obligation.version AS obligation_version,
                  obligation.cohort_ref, cohort.version AS cohort_version,
                  submission.answer_submission_ref, submission.answer_session_ref,
                  submission.candidate_ref, submission.submitted_at,
                  submission.submission_source
             FROM answer_review_obligations AS obligation
             JOIN answer_submissions AS submission
               ON submission.answer_submission_ref = obligation.answer_submission_ref
             JOIN advancement_cohorts AS cohort ON cohort.cohort_ref = obligation.cohort_ref
            WHERE obligation.commitment_ref = commitment.commitment_ref
              AND obligation.status = 'REVIEW_PENDING'
            ORDER BY submission.submitted_at, submission.answer_submission_ref
            LIMIT 1
         ) AS current ON true
        WHERE opportunity.id = $1 AND commitment.reviewer_ref = $2`,
      [opportunityRef, reviewerRef],
    );
    const row = result.rows[0];
    if (row === undefined || !isRecord(row.contract_json)) return null;
    let current: Record<string, unknown> | null = null;
    if (
      row.answer_submission_ref !== null &&
      row.obligation_ref !== null &&
      row.obligation_version !== null &&
      row.cohort_ref !== null &&
      row.cohort_version !== null &&
      row.answer_session_ref !== null &&
      row.candidate_ref !== null &&
      row.submitted_at !== null
    ) {
      const artifactResult = await this.pool.query<ArtifactRow>(
        `SELECT artifact.artifact_ref, artifact.answer_session_ref, artifact.candidate_ref,
                artifact.kind, artifact.object_key, artifact.content_type,
                artifact.content_length, artifact.sha256, artifact.state,
                artifact.revision, artifact.metadata_json, artifact.created_at
           FROM answer_submissions AS submission
           JOIN answer_artifacts AS artifact
             ON artifact.artifact_ref IN (
               SELECT jsonb_array_elements_text(submission.artifact_manifest_json)
             )
          WHERE submission.answer_submission_ref = $1
          ORDER BY artifact.created_at, artifact.artifact_ref`,
        [row.answer_submission_ref],
      );
      const artifacts = artifactResult.rows.map(artifactRecord);
      const textByRef = new Map<string, string | null>();
      await Promise.all(
        artifacts.map(async (artifact) => {
          if (!["RICH_TEXT", "GPT_TURN", "VOICE_TRANSCRIPT", "GPT_TRACE"].includes(artifact.kind)) {
            return;
          }
          try {
            textByRef.set(
              artifact.artifactRef,
              objectText(await this.objectStore.getObject(artifact.objectKey)),
            );
          } catch {
            textByRef.set(artifact.artifactRef, null);
          }
        }),
      );
      const rich = artifacts.find(({ kind }) => kind === "RICH_TEXT");
      let richDocument: RichTextNode | null = null;
      if (rich !== undefined) {
        try {
          richDocument = JSON.parse(
            textByRef.get(rich.artifactRef) ?? "null",
          ) as RichTextNode | null;
        } catch {
          richDocument = null;
        }
      }
      const exchangeResult = await this.pool.query<{
        exchange_ref: string;
        ordinal: number;
        status: "COMPLETED" | "FAILED";
        error_code: string | null;
        created_at: Date;
        user_artifact_ref: string;
        assistant_artifact_ref: string | null;
      }>(
        `SELECT exchange_ref, ordinal, status, error_code, created_at,
                user_artifact_ref, assistant_artifact_ref
           FROM candidate_assistant_exchanges
          WHERE answer_session_ref = $1 AND status IN ('COMPLETED', 'FAILED')
          ORDER BY ordinal, exchange_ref`,
        [row.answer_session_ref],
      );
      const assistantTrace = exchangeResult.rows.flatMap((exchange) => [
        CandidateAssistantTurnProjectionSchema.parse({
          turn_ref: exchange.user_artifact_ref,
          ordinal: exchange.ordinal * 2 - 1,
          role: "USER",
          status: "COMPLETED",
          content: textByRef.get(exchange.user_artifact_ref) ?? null,
          error_code: null,
          created_at: exchange.created_at.toISOString(),
        }),
        CandidateAssistantTurnProjectionSchema.parse({
          turn_ref: exchange.assistant_artifact_ref ?? `assistant-result:${exchange.exchange_ref}`,
          ordinal: exchange.ordinal * 2,
          role: "ASSISTANT",
          status: exchange.status,
          content:
            exchange.assistant_artifact_ref === null
              ? null
              : (textByRef.get(exchange.assistant_artifact_ref) ?? null),
          error_code: exchange.error_code,
          created_at: exchange.created_at.toISOString(),
        }),
      ]);
      const aiReviewResult = await this.pool.query<{
        policy: "OFF" | "ANSWER_ONLY" | "ANSWER_PLUS_PROCESS";
        status: "DISABLED" | "ANALYZING" | "READY" | "NEEDS_HUMAN" | "FAILED" | "SUPERSEDED";
        process_manifest_json: unknown;
        projection_json: unknown;
        ai_output_ref: string | null;
        error_code: string | null;
        synthetic: boolean;
      }>(
        `SELECT projection.policy, projection.status,
                process.process_manifest_json, projection.projection_json,
                projection.ai_output_ref, projection.error_code, projection.synthetic
           FROM employer_answer_review_projections AS projection
           JOIN answer_process_evidence AS process
             ON process.process_evidence_ref = projection.process_evidence_ref
          WHERE projection.answer_submission_ref = $1`,
        [row.answer_submission_ref],
      );
      const aiReviewRow = aiReviewResult.rows[0];
      const aiReview = EmployerAiReviewProjectionSchema.parse({
        schema_version: "employer-ai-review-projection@1",
        policy: aiReviewRow?.policy ?? "OFF",
        status: aiReviewRow?.status ?? "DISABLED",
        answer_submission_ref: row.answer_submission_ref,
        process_evidence:
          aiReviewRow?.policy === "ANSWER_PLUS_PROCESS"
            ? EmployerProcessContextSchema.parse(aiReviewRow.process_manifest_json)
            : null,
        analysis:
          aiReviewRow?.projection_json === null || aiReviewRow?.projection_json === undefined
            ? null
            : AnswerEvidenceEdgeDraftSchema.parse(aiReviewRow.projection_json),
        ai_output_ref: aiReviewRow?.ai_output_ref ?? null,
        error_code: aiReviewRow?.error_code ?? null,
        synthetic: aiReviewRow?.synthetic ?? false,
        disclosure:
          aiReviewRow?.synthetic === true
            ? "Synthetic analyst output — explicitly replayed for local demonstration."
            : "Optional AI evidence analysis; the human reviewer remains independently responsible.",
      });
      current = {
        obligation_ref: row.obligation_ref,
        obligation_version: row.obligation_version,
        cohort_ref: row.cohort_ref,
        cohort_version: row.cohort_version,
        answer_submission_ref: row.answer_submission_ref,
        opaque_candidate_label: `Anonymous ${hash(row.candidate_ref).slice(-6).toUpperCase()}`,
        submitted_at: row.submitted_at.toISOString(),
        critical_question: String(row.contract_json.critical_question ?? "Sealed question"),
        critical_challenge: criticalChallengeFromContract(
          row.contract_json,
          String(row.contract_json.critical_question ?? "Sealed question"),
        ),
        rich_text_document: richDocument,
        rich_text_plain_text: richDocument === null ? null : richTextContent(richDocument),
        artifacts: artifacts.map((artifact) => ({
          artifact_ref: artifact.artifactRef,
          kind: artifact.kind,
          state: artifact.state,
          content_type: artifact.contentType,
          content_length: artifact.contentLength,
          sha256: artifact.sha256,
          transcript_artifact_ref:
            typeof artifact.metadata.transcript_artifact_ref === "string"
              ? artifact.metadata.transcript_artifact_ref
              : null,
          transcription_status:
            artifact.kind === "VOICE_MEMO" &&
            typeof artifact.metadata.transcription_status === "string"
              ? artifact.metadata.transcription_status
              : null,
          transcription_error_code:
            artifact.kind === "VOICE_MEMO" &&
            typeof artifact.metadata.transcription_error_code === "string"
              ? artifact.metadata.transcription_error_code
              : null,
        })),
        assistant_trace: assistantTrace,
        permitted_evidence_refs: [
          row.answer_submission_ref,
          ...artifacts.map((value) => value.artifactRef),
          ...(aiReview.process_evidence?.schema_version === "answer-process-evidence@2"
            ? aiReview.process_evidence.behavior_signals.map(({ signal_ref }) => signal_ref)
            : []),
        ],
        focus_policy_auto_submitted: row.submission_source === "FOCUS_POLICY_AUTO",
        ai_review: aiReview,
      };
    }
    return EmployerCurrentReviewProjectionSchema.parse({
      schema_version: "employer-current-review-projection@3",
      opportunity_ref: opportunityRef,
      title: row.title,
      reviewer_ref: reviewerRef,
      queue: {
        pending_review_count: Number(row.pending_review_count),
        available_slot_count: Number(row.available_slot_count),
        waiting_interest_count: Number(row.waiting_interest_count),
      },
      current,
    });
  }

  public async createJobPostDraft(
    input: CreateJobPostDraftStoreInput,
  ): Promise<ReturnType<typeof JobPostDraftProjectionSchema.parse>> {
    requireRole(input.actor, "EMPLOYER");
    const fingerprint = commandFingerprint({
      draft: input.draft,
      wallet: input.expectedWalletVersion,
    });
    return runTransaction(this.pool, async (client, now) => {
      const existing = await findReceipt(
        client,
        input.actor.actorId,
        input.idempotencyKey,
        "CreateJobPostDraft",
        fingerprint,
      );
      if (existing !== null) return JobPostDraftProjectionSchema.parse(existing);
      const wallet = await client.query<{ version: number }>(
        "SELECT version FROM employer_attention_wallets WHERE owner_ref = $1 FOR UPDATE",
        [input.actor.actorId],
      );
      if (wallet.rows[0]?.version !== input.expectedWalletVersion) {
        throw new FunctionalProductApplicationError("STALE_VERSION", "Attention wallet changed.");
      }
      await client.query(
        `INSERT INTO job_post_drafts (
           draft_ref, owner_ref, state, version, draft_json, created_at, updated_at
         ) VALUES ($1, $2, 'DRAFT', 1, $3::jsonb, $4, $4)`,
        [input.draftRef, input.actor.actorId, JSON.stringify(input.draft), now],
      );
      const projection = JobPostDraftProjectionSchema.parse({
        schema_version: "job-post-draft-projection@1",
        draft_ref: input.draftRef,
        owner_ref: input.actor.actorId,
        state: "DRAFT",
        version: 1,
        draft: input.draft,
        published_opportunity_ref: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      await insertReceipt(client, {
        actorRef: input.actor.actorId,
        idempotencyKey: input.idempotencyKey,
        commandId: `command:create-draft:${input.draftRef}`,
        commandType: "CreateJobPostDraft",
        fingerprint,
        receipt: projection,
        occurredAt: now,
      });
      return projection;
    });
  }

  public async updateJobPostDraft(input: UpdateJobPostDraftStoreInput) {
    requireRole(input.actor, "EMPLOYER");
    const fingerprint = commandFingerprint({
      draftRef: input.draftRef,
      draft: input.draft,
      version: input.expectedDraftVersion,
    });
    return runTransaction(this.pool, async (client, now) => {
      const existing = await findReceipt(
        client,
        input.actor.actorId,
        input.idempotencyKey,
        "UpdateJobPostDraft",
        fingerprint,
      );
      if (existing !== null) return JobPostDraftProjectionSchema.parse(existing);
      const result = await client.query<{
        owner_ref: string;
        state: string;
        version: number;
        created_at: Date;
      }>(
        "SELECT owner_ref, state, version, created_at FROM job_post_drafts WHERE draft_ref = $1 FOR UPDATE",
        [input.draftRef],
      );
      const row = result.rows[0];
      if (row === undefined)
        throw new FunctionalProductApplicationError("RESOURCE_NOT_FOUND", "Draft not found.");
      if (row.owner_ref !== input.actor.actorId)
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "Draft belongs to another Employer.",
        );
      if (row.state !== "DRAFT")
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "Published drafts are immutable.",
        );
      if (row.version !== input.expectedDraftVersion)
        throw new FunctionalProductApplicationError("STALE_VERSION", "Draft changed.");
      const nextVersion = row.version + 1;
      requireOne(
        await client.query(
          `UPDATE job_post_drafts SET draft_json = $1::jsonb, version = $2, updated_at = $3
          WHERE draft_ref = $4 AND version = $5 AND state = 'DRAFT'`,
          [JSON.stringify(input.draft), nextVersion, now, input.draftRef, row.version],
        ),
        "Draft changed before update.",
      );
      const projection = JobPostDraftProjectionSchema.parse({
        schema_version: "job-post-draft-projection@1",
        draft_ref: input.draftRef,
        owner_ref: input.actor.actorId,
        state: "DRAFT",
        version: nextVersion,
        draft: input.draft,
        published_opportunity_ref: null,
        created_at: row.created_at.toISOString(),
        updated_at: now.toISOString(),
      });
      await insertReceipt(client, {
        actorRef: input.actor.actorId,
        idempotencyKey: input.idempotencyKey,
        commandId: `command:update-draft:${input.draftRef}:${nextVersion}`,
        commandType: "UpdateJobPostDraft",
        fingerprint,
        receipt: projection,
        occurredAt: now,
      });
      return projection;
    });
  }

  public async publishJobPost(input: PublishJobPostStoreInput): Promise<PublishJobPostReceipt> {
    requireRole(input.actor, "EMPLOYER");
    const fingerprint = commandFingerprint({
      draftRef: input.draftRef,
      draftVersion: input.expectedDraftVersion,
      walletVersion: input.expectedWalletVersion,
    });
    return runTransaction(this.pool, async (client, now) => {
      const existing = await findReceipt(
        client,
        input.actor.actorId,
        input.idempotencyKey,
        "PublishJobPost",
        fingerprint,
      );
      if (existing !== null) return PublishJobPostReceiptSchema.parse(existing);

      const draftResult = await client.query<{
        owner_ref: string;
        state: "DRAFT" | "PUBLISHED";
        version: number;
        draft_json: unknown;
      }>(
        `SELECT owner_ref, state, version, draft_json
           FROM job_post_drafts WHERE draft_ref = $1 FOR UPDATE`,
        [input.draftRef],
      );
      const draftRow = draftResult.rows[0];
      if (draftRow === undefined) {
        throw new FunctionalProductApplicationError("RESOURCE_NOT_FOUND", "Draft not found.");
      }
      if (draftRow.owner_ref !== input.actor.actorId) {
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "Draft belongs to another Employer.",
        );
      }
      if (draftRow.state !== "DRAFT") {
        throw new FunctionalProductApplicationError("INVALID_STATE", "Draft is already published.");
      }
      if (draftRow.version !== input.expectedDraftVersion) {
        throw new FunctionalProductApplicationError("STALE_VERSION", "Draft changed.");
      }
      const draft = JobPostDraftInputSchema.parse(draftRow.draft_json);
      const walletResult = await client.query<{
        available_credits: number;
        committed_credits: number;
        forfeited_credits: number;
        version: number;
      }>(
        `SELECT available_credits, committed_credits, forfeited_credits, version
           FROM employer_attention_wallets WHERE owner_ref = $1 FOR UPDATE`,
        [input.actor.actorId],
      );
      const wallet = walletResult.rows[0];
      if (wallet === undefined) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "Employer Attention wallet is not configured.",
        );
      }
      if (wallet.version !== input.expectedWalletVersion) {
        throw new FunctionalProductApplicationError("STALE_VERSION", "Attention wallet changed.");
      }
      const committedCredits = draft.answer_review_wip * draft.credit_per_answer_review;
      if (wallet.available_credits < committedCredits) {
        throw new FunctionalProductApplicationError(
          "CREDIT_EXHAUSTED",
          "The Employer wallet cannot back the requested Review Slots.",
        );
      }

      const opportunityRef = input.ids.nextId("opportunity");
      const contractRef = input.ids.nextId("contract");
      const labelPolicyRef = input.ids.nextId("label-policy");
      const attentionCommitmentRef = input.ids.nextId("attention-commitment");
      const blindCommitmentRef = input.ids.nextId("blind-review-commitment");
      const creditAccountRef = `answer-credit-account:${opportunityRef}`;
      const slotRefs = Array.from({ length: draft.answer_review_wip }, () =>
        input.ids.nextId("answer-review-slot"),
      );
      const reservationRefs = slotRefs.map(() => input.ids.nextId("slot-credit-reservation"));
      const eventId = input.ids.nextId("event");
      const commandId = input.ids.nextId("command");
      const questionVersionRef = `question:${contractRef}`;
      const contractJson = {
        schema_version: "sealed-functional-job-contract@1",
        organization_public_name: draft.organization_public_name,
        role_category: draft.role_category,
        critical_question: draft.critical_question,
        critical_challenge: draft.critical_challenge,
        allowed_assumptions: draft.allowed_assumptions,
        hard_predicates: draft.hard_predicates.map(contractPredicate),
        capability_areas: draft.capability_areas,
        candidate_effort_limit_minutes: draft.maximum_candidate_minutes,
        candidate_ai_policy: draft.candidate_ai_policy,
        terms_version: draft.terms_version,
        ai_disclosure_version: draft.ai_disclosure_version,
        conditional_reveal_consent_version: draft.conditional_reveal_consent_version,
        sandbox_focus_policy_version: draft.sandbox_focus_policy_version,
        focus_tracking_disclosure_version: draft.focus_tracking_disclosure_version,
        employer_ai_review_policy: draft.employer_ai_review_policy,
        employer_ai_review_disclosure_version: draft.employer_ai_review_disclosure_version,
        review_criteria: draft.review_criteria,
        proof_template_version_id: `proof-template:${opportunityRef}@1`,
        challenge_catalog_version_id: "payment-retry@1",
      };
      const contractHash = hash(JSON.stringify(contractJson));
      const questionHash = hash(JSON.stringify(draft.critical_challenge));
      const labelPolicyJson = {
        opportunity_ref: opportunityRef,
        sealed_fields: [
          "name",
          "photo",
          "school_name",
          "previous_employer_name",
          "referral_source",
        ],
        reveal_condition: "reviewed_answer_and_held_post_answer_advancement_with_prior_consent",
      };
      const labelPolicyHash = hash(JSON.stringify(labelPolicyJson));
      const publicSeed = hash(`queue|${opportunityRef}|${now.toISOString()}`);
      const review = activateBlindReviewCommitment(
        createRollingBlindReview({
          commitmentRef: blindCommitmentRef,
          opportunityRef,
          reviewerRef: input.actor.actorId,
          answerReviewWip: draft.answer_review_wip,
          answerReviewSlaHours: draft.answer_review_sla_hours,
          advancementCohortSize: draft.advancement_cohort_size,
          queuePolicyVersion: "onlyboth.interest-queue@1",
          creditPerAnswerReview: draft.credit_per_answer_review,
        }),
        { slotRefs, activatedAt: now.toISOString() },
      );

      await client.query(
        `INSERT INTO opportunities (
           id, title, status, reviewer_id, current_contract_version_ref,
           current_label_policy_version_ref, created_at, version, updated_at,
           runtime_mode, synthetic, required_interest_consent_version
         ) VALUES ($1, $2, 'OPEN', $3, $4, $5, $6, 1, $6, 'LIVE', false, $7)`,
        [
          opportunityRef,
          draft.title,
          input.actor.actorId,
          contractRef,
          labelPolicyRef,
          now,
          draft.terms_version,
        ],
      );
      await client.query(
        `INSERT INTO sealed_capability_contracts (
           contract_version_ref, opportunity_ref, contract_hash, contract_json, sealed_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [contractRef, opportunityRef, contractHash, JSON.stringify(contractJson), now],
      );
      await client.query(
        `INSERT INTO label_policy_versions (
           label_policy_version_ref, opportunity_ref, policy_hash, policy_json, sealed_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [labelPolicyRef, opportunityRef, labelPolicyHash, JSON.stringify(labelPolicyJson), now],
      );
      await client.query(
        `INSERT INTO attention_commitments (
           commitment_ref, opportunity_ref, reviewer_ref, active_wip, direct_slots,
           explore_slots, credit_per_window, accept_sla_hours, checkpoint_sla_seconds,
           final_review_sla_hours, version, answer_review_wip, answer_review_sla_hours,
           advancement_cohort_size, queue_policy_version, queue_public_seed,
           credit_per_answer_review, blind_review_status, reviewer_display_name,
           question_version_ref, question_hash
         ) VALUES ($1, $2, $3, $4, $4, 0, $5, $6, 90, $7, 1, $4, $7, $8,
                   'onlyboth.interest-queue@1', $9, $5, 'ACTIVE', 'Sarah Chen', $10, $11)`,
        [
          attentionCommitmentRef,
          opportunityRef,
          input.actor.actorId,
          draft.answer_review_wip,
          draft.credit_per_answer_review,
          draft.offer_expiry_hours,
          draft.answer_review_sla_hours,
          draft.advancement_cohort_size,
          publicSeed,
          questionVersionRef,
          questionHash,
        ],
      );
      await client.query(
        `INSERT INTO credit_accounts (
           account_ref, opportunity_ref, available_credits, held_credits, version, reserved_credits
         ) VALUES ($1, $2, 0, 0, 1, $3)`,
        [creditAccountRef, opportunityRef, committedCredits],
      );
      await client.query(
        `INSERT INTO blind_review_commitments (
           commitment_ref, opportunity_ref, source_attention_commitment_ref,
           credit_account_ref, contract_version_ref, contract_hash,
           question_version_ref, question_hash, reviewer_ref, answer_review_wip,
           answer_review_sla_hours, advancement_cohort_size, queue_policy_version,
           queue_public_seed, credit_per_answer_review, reserved_credit_amount,
           state, version, aggregate_json, activated_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                   'onlyboth.interest-queue@1', $13, $14, $15, 'ACTIVE', 1,
                   $16::jsonb, $17, $17, $17)`,
        [
          blindCommitmentRef,
          opportunityRef,
          attentionCommitmentRef,
          creditAccountRef,
          contractRef,
          contractHash,
          questionVersionRef,
          questionHash,
          input.actor.actorId,
          draft.answer_review_wip,
          draft.answer_review_sla_hours,
          draft.advancement_cohort_size,
          publicSeed,
          draft.credit_per_answer_review,
          committedCredits,
          JSON.stringify(review),
          now,
        ],
      );
      for (let index = 0; index < slotRefs.length; index += 1) {
        const slotRef = slotRefs[index]!;
        const reservationRef = reservationRefs[index]!;
        await client.query(
          `INSERT INTO answer_review_slots (
             slot_ref, commitment_ref, ordinal, status, current_obligation_ref,
             reserved_credit_amount, version, created_at, updated_at
           ) VALUES ($1, $2, $3, 'AVAILABLE', NULL, $4, 1, $5, $5)`,
          [slotRef, blindCommitmentRef, index + 1, draft.credit_per_answer_review, now],
        );
        await client.query(
          `INSERT INTO answer_review_slot_credit_reservations (
             reservation_ref, slot_ref, account_ref, amount, state, version,
             created_at, updated_at
           ) VALUES ($1, $2, $3, $4, 'RESERVED', 1, $5, $5)`,
          [reservationRef, slotRef, creditAccountRef, draft.credit_per_answer_review, now],
        );
      }

      const publicProjection = PublicOpportunityProjectionSchema.parse({
        schema_version: "public-opportunity-projection@1",
        view: "PUBLIC_CANDIDATE",
        opportunity_ref: opportunityRef,
        opportunity_version: 1,
        title: draft.title,
        organization_public_name: draft.organization_public_name,
        role_category: draft.role_category,
        public_role_summary: draft.public_role_summary,
        employment_type: draft.employment_type,
        seniority_band: draft.seniority_band,
        compensation_range: draft.compensation_range,
        location_and_work_mode: draft.location_and_work_mode,
        public_hard_requirements: draft.public_hard_requirements,
        capability_area_preview: draft.capability_areas,
        proof_format: draft.proof_format,
        maximum_candidate_minutes: draft.maximum_candidate_minutes,
        candidate_ai_policy: draft.candidate_ai_policy,
        challenge_part_kinds: draft.critical_challenge.parts.map((part) => part.kind),
        human_review_sla_hours: draft.answer_review_sla_hours,
        review_capacity_status: "ACTIVE",
        interest_status: null,
      });
      const employerProjection = EmployerBlindReviewProjectionSchema.parse({
        schema_version: "employer-blind-review-projection@2",
        view: "EMPLOYER",
        phase: "PRE_ANSWER",
        opportunity_ref: opportunityRef,
        commitment_ref: blindCommitmentRef,
        commitment_version: 1,
        queue_policy_version: "onlyboth.interest-queue@1",
        eligible_interest_count: 0,
        waiting_interest_count: 0,
        answer_review_wip: draft.answer_review_wip,
        available_slot_count: draft.answer_review_wip,
        outstanding_obligation_count: 0,
        disclosure:
          "Candidate identities, Claims, and résumé labels are unavailable before submitted answers.",
        runtime_mode: "LIVE",
        synthetic: false,
      });
      await client.query(
        `INSERT INTO public_opportunity_projections (
           opportunity_ref, projection_version, projection_json, updated_at
         ) VALUES ($1, 1, $2::jsonb, $3)`,
        [opportunityRef, JSON.stringify(publicProjection), now],
      );
      await client.query(
        `INSERT INTO employer_blind_review_projections (
           opportunity_ref, projection_version, projection_json, updated_at
         ) VALUES ($1, 1, $2::jsonb, $3)`,
        [opportunityRef, JSON.stringify(employerProjection), now],
      );
      requireOne(
        await client.query(
          `UPDATE employer_attention_wallets
            SET available_credits = available_credits - $1,
                committed_credits = committed_credits + $1,
                version = version + 1, updated_at = $2
          WHERE owner_ref = $3 AND version = $4 AND available_credits >= $1`,
          [committedCredits, now, input.actor.actorId, wallet.version],
        ),
        "The Employer Attention wallet changed before publish.",
      );
      await client.query(
        `INSERT INTO employer_attention_wallet_ledger (
           ledger_entry_ref, owner_ref, entry_type, amount, subject_ref, occurred_at
         ) VALUES ($1, $2, 'COMMIT', $3, $4, $5)`,
        [
          `wallet-ledger:${opportunityRef}`,
          input.actor.actorId,
          committedCredits,
          opportunityRef,
          now,
        ],
      );
      requireOne(
        await client.query(
          `UPDATE job_post_drafts
              SET state = 'PUBLISHED', published_opportunity_ref = $1,
                  version = version + 1, updated_at = $2
            WHERE draft_ref = $3 AND version = $4 AND state = 'DRAFT'`,
          [opportunityRef, now, input.draftRef, draftRow.version],
        ),
        "Draft changed before publish.",
      );
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'JobPostPublished', 1, 'BlindReviewCommitment', $2, 1, $3, $4, $5::jsonb)`,
        [
          eventId,
          blindCommitmentRef,
          input.correlationId,
          now,
          JSON.stringify({
            schema_version: "job-post-published@1",
            opportunity_ref: opportunityRef,
            commitment_ref: blindCommitmentRef,
            slot_refs: slotRefs,
          }),
        ],
      );
      for (const slotRef of slotRefs) {
        await client.query(
          `INSERT INTO outbox_messages (
             message_id, message_type, message_version, event_id, idempotency_key,
             correlation_id, payload, available_at
           ) VALUES ($1, 'OfferNextQueuedInterestRequested', 1, $2, $3, $4, $5::jsonb, $6)`,
          [
            input.ids.nextId("outbox"),
            eventId,
            `OfferNextQueuedInterestRequested:${slotRef}:1`,
            input.correlationId,
            JSON.stringify({
              schema_version: "offer-next-queued-interest-requested@1",
              opportunity_ref: opportunityRef,
              commitment_ref: blindCommitmentRef,
              expected_commitment_version: 1,
              slot_ref: slotRef,
              expected_slot_version: 1,
              queue_policy_version: "onlyboth.interest-queue@1",
              public_seed: publicSeed,
            }),
            now,
          ],
        );
      }
      const receipt = PublishJobPostReceiptSchema.parse({
        schema_version: "publish-job-post-receipt@1",
        command_id: commandId,
        event_id: eventId,
        draft_ref: input.draftRef,
        opportunity_ref: opportunityRef,
        commitment_ref: blindCommitmentRef,
        slot_refs: slotRefs,
        committed_credits: committedCredits,
        new_wallet_version: wallet.version + 1,
        published_at: now.toISOString(),
      });
      await insertReceipt(client, {
        actorRef: input.actor.actorId,
        idempotencyKey: input.idempotencyKey,
        commandId,
        commandType: "PublishJobPost",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return receipt;
    });
  }

  public async startBackedApplication(
    input: StartBackedApplicationStoreInput,
  ): Promise<ReturnType<typeof StartBackedApplicationReceiptSchema.parse>> {
    requireRole(input.actor, "CANDIDATE");
    const fingerprint = commandFingerprint({
      invitationRef: input.invitationRef,
      command: input.command,
    });
    return runTransaction(this.pool, async (client, now) => {
      const existing = await findReceipt(
        client,
        input.actor.actorId,
        input.idempotencyKey,
        "StartBackedApplication",
        fingerprint,
      );
      if (existing !== null) return StartBackedApplicationReceiptSchema.parse(existing);
      const invitationResult = await client.query<{
        invitation_ref: string;
        invitation_status: "OFFERED" | "ACCEPTED" | "DECLINED" | "EXPIRED";
        invitation_version: number;
        candidate_ref: string;
        offer_expires_at: Date;
        obligation_ref: string;
        obligation_status: string;
        obligation_version: number;
        slot_ref: string;
        slot_status: string;
        slot_version: number;
        interest_ref: string;
        cohort_ref: string;
        cohort_seat_ref: string;
        commitment_ref: string;
        aggregate_json: unknown;
        opportunity_ref: string;
        contract_json: unknown;
        maximum_candidate_minutes: number;
      }>(
        `SELECT invitation.invitation_ref, invitation.status AS invitation_status,
                invitation.version AS invitation_version, invitation.candidate_ref,
                invitation.offer_expires_at, obligation.obligation_ref,
                obligation.status AS obligation_status,
                obligation.version AS obligation_version, obligation.slot_ref,
                slot.status AS slot_status, slot.version AS slot_version,
                obligation.interest_ref, obligation.cohort_ref,
                obligation.cohort_seat_ref, commitment.commitment_ref,
                commitment.aggregate_json, commitment.opportunity_ref,
                contract.contract_json,
                (contract.contract_json->>'candidate_effort_limit_minutes')::integer
                  AS maximum_candidate_minutes
           FROM answer_invitations AS invitation
           JOIN answer_review_obligations AS obligation
             ON obligation.obligation_ref = invitation.obligation_ref
           JOIN answer_review_slots AS slot ON slot.slot_ref = obligation.slot_ref
           JOIN blind_review_commitments AS commitment
             ON commitment.commitment_ref = obligation.commitment_ref
           JOIN sealed_capability_contracts AS contract
             ON contract.contract_version_ref = commitment.contract_version_ref
          WHERE invitation.invitation_ref = $1
          FOR UPDATE OF invitation, obligation, slot, commitment`,
        [input.invitationRef],
      );
      const source = invitationResult.rows[0];
      if (source === undefined) {
        throw new FunctionalProductApplicationError(
          "RESOURCE_NOT_FOUND",
          "Backed Offer not found.",
        );
      }
      if (source.candidate_ref !== input.actor.actorId) {
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "This Offer belongs to another Candidate.",
        );
      }
      if (
        source.invitation_status !== "OFFERED" ||
        source.obligation_status !== "INVITED" ||
        source.slot_status !== "OFFERED"
      ) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The backed Offer is not accept-ready.",
        );
      }
      if (now >= source.offer_expires_at) {
        throw new FunctionalProductApplicationError(
          "DEADLINE_REACHED",
          "The backed Offer has expired.",
        );
      }
      if (
        source.obligation_version !== input.command.expected_obligation_version ||
        source.slot_version !== input.command.expected_slot_version
      ) {
        throw new FunctionalProductApplicationError(
          "STALE_VERSION",
          "The Offer changed before acceptance.",
        );
      }
      if (!isRecord(source.contract_json)) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The sealed Job Contract is invalid.",
        );
      }
      for (const [field, expected] of [
        ["terms_version", input.command.terms_version],
        ["ai_disclosure_version", input.command.ai_disclosure_version],
        ["conditional_reveal_consent_version", input.command.conditional_reveal_consent_version],
        ["sandbox_focus_policy_version", input.command.sandbox_focus_policy_version],
        ["focus_tracking_disclosure_version", input.command.focus_tracking_disclosure_version],
        ["employer_ai_review_policy", input.command.employer_ai_review_policy],
        [
          "employer_ai_review_disclosure_version",
          input.command.employer_ai_review_disclosure_version,
        ],
      ] as const) {
        if (source.contract_json[field] !== expected) {
          throw new FunctionalProductApplicationError(
            "INVALID_STATE",
            `The accepted ${field} is not the sealed Job Contract version.`,
          );
        }
      }
      const creditResult = await client.query<{
        account_ref: string;
        available_credits: number;
        consumed_credits: number;
        version: number;
      }>(
        `SELECT account_ref, available_credits, consumed_credits, version
           FROM candidate_credit_accounts
          WHERE candidate_ref = $1 AND state = 'ACTIVE'
            AND period_started_at <= $2 AND period_ends_at > $2
          ORDER BY period_ends_at DESC LIMIT 1 FOR UPDATE`,
        [input.actor.actorId, now],
      );
      const credit = creditResult.rows[0];
      if (credit === undefined || credit.available_credits < 1) {
        throw new FunctionalProductApplicationError(
          "CREDIT_EXHAUSTED",
          "No Candidate application Credit remains.",
        );
      }
      if (credit.version !== input.command.expected_candidate_credit_version) {
        throw new FunctionalProductApplicationError(
          "STALE_VERSION",
          "Candidate Credit balance changed.",
        );
      }
      const resumeResult = await client.query<{ resume_snapshot_ref: string }>(
        `SELECT resume_snapshot_ref
           FROM candidate_resume_snapshots
          WHERE candidate_ref = $1
          ORDER BY snapshot_version DESC
          LIMIT 1`,
        [input.actor.actorId],
      );
      const resumeSnapshotRef = resumeResult.rows[0]?.resume_snapshot_ref;
      if (resumeSnapshotRef === undefined) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "A sealed Candidate Resume is required before accepting a backed application.",
        );
      }

      const previousReview = parseReview(source.aggregate_json);
      const nextReview = acceptBackedAnswerOffer(previousReview, {
        invitationRef: input.invitationRef,
        acceptedAt: now.toISOString(),
      });
      const nextInvitation = nextReview.invitations.find(
        ({ invitationRef }) => invitationRef === input.invitationRef,
      );
      const nextObligation = nextReview.obligations.find(
        ({ obligationRef }) => obligationRef === source.obligation_ref,
      );
      const nextSlot = nextReview.slots.find(({ slotRef }) => slotRef === source.slot_ref);
      const nextInterest = nextReview.interests.find(
        ({ interestRef }) => interestRef === source.interest_ref,
      );
      if (
        nextInvitation === undefined ||
        nextObligation === undefined ||
        nextSlot === undefined ||
        nextInterest === undefined
      ) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The accepted Blind Review transition is incomplete.",
        );
      }

      const commandId = input.ids.nextId("command");
      const eventId = input.ids.nextId("event");
      const outboxId = input.ids.nextId("outbox");
      const answerSessionRef = input.ids.nextId("answer-session");
      const acceptanceRef = input.ids.nextId("terms-acceptance");
      const creditLedgerRef = input.ids.nextId("candidate-credit-ledger");
      const dueAt = new Date(now.getTime() + source.maximum_candidate_minutes * 60_000);

      requireOne(
        await client.query(
          `UPDATE blind_review_commitments SET aggregate_json = $1::jsonb, updated_at = $2
            WHERE commitment_ref = $3 AND aggregate_json = $4::jsonb`,
          [JSON.stringify(nextReview), now, source.commitment_ref, JSON.stringify(previousReview)],
        ),
        "The Blind Review Commitment changed before acceptance.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_invitations SET status = 'ACCEPTED', decided_at = $1,
                  version = $2, updated_at = $1
            WHERE invitation_ref = $3 AND status = 'OFFERED' AND version = $4`,
          [now, nextInvitation.version, input.invitationRef, source.invitation_version],
        ),
        "The Invitation changed before acceptance.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_obligations SET status = 'ANSWER_ACTIVE', version = $1, updated_at = $2
            WHERE obligation_ref = $3 AND status = 'INVITED' AND version = $4`,
          [nextObligation.version, now, source.obligation_ref, source.obligation_version],
        ),
        "The Answer obligation changed before acceptance.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_slots SET status = 'ANSWER_ACTIVE', version = $1, updated_at = $2
            WHERE slot_ref = $3 AND status = 'OFFERED' AND version = $4`,
          [nextSlot.version, now, source.slot_ref, source.slot_version],
        ),
        "The Attention Slot changed before acceptance.",
      );
      requireOne(
        await client.query(
          `UPDATE candidate_interests SET status = 'APPLICATION_ACTIVE', version = $1, updated_at = $2
            WHERE interest_ref = $3 AND status = 'BACKED_OFFERED'`,
          [nextInterest.version, now, source.interest_ref],
        ),
        "The Candidate Interest changed before acceptance.",
      );
      requireOne(
        await client.query(
          `UPDATE candidate_credit_accounts
              SET available_credits = available_credits - 1,
                  consumed_credits = consumed_credits + 1,
                  version = version + 1, updated_at = $1
            WHERE account_ref = $2 AND version = $3 AND available_credits >= 1`,
          [now, credit.account_ref, credit.version],
        ),
        "Candidate Credit changed before consumption.",
      );
      await client.query(
        `INSERT INTO candidate_credit_ledger_entries (
           ledger_entry_ref, account_ref, entry_type, amount, subject_ref, occurred_at
         ) VALUES ($1, $2, 'CONSUME', 1, $3, $4)`,
        [creditLedgerRef, credit.account_ref, answerSessionRef, now],
      );
      await client.query(
        `INSERT INTO answer_terms_acceptances (
           acceptance_ref, candidate_ref, invitation_ref, terms_version,
           ai_disclosure_version, conditional_reveal_consent_version,
           sandbox_focus_policy_version, focus_tracking_disclosure_version,
           employer_ai_review_policy, employer_ai_review_disclosure_version,
           resume_snapshot_ref, accepted_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          acceptanceRef,
          input.actor.actorId,
          input.invitationRef,
          input.command.terms_version,
          input.command.ai_disclosure_version,
          input.command.conditional_reveal_consent_version,
          input.command.sandbox_focus_policy_version,
          input.command.focus_tracking_disclosure_version,
          input.command.employer_ai_review_policy,
          input.command.employer_ai_review_disclosure_version,
          resumeSnapshotRef,
          now,
        ],
      );
      await client.query(
        `INSERT INTO answer_sessions (
           answer_session_ref, invitation_ref, obligation_ref, status,
           started_at, answer_due_at, closed_at, version, created_at, updated_at,
           session_schema_version, candidate_ref, candidate_credit_account_ref,
           candidate_credit_ledger_ref, terms_acceptance_ref
         ) VALUES ($1, $2, $3, 'ACTIVE', $4, $5, NULL, 1, $4, $4,
                   'answer-session@1', $6, $7, $8, $9)`,
        [
          answerSessionRef,
          input.invitationRef,
          source.obligation_ref,
          now,
          dueAt,
          input.actor.actorId,
          credit.account_ref,
          creditLedgerRef,
          acceptanceRef,
        ],
      );
      await client.query(
        `INSERT INTO answer_session_focus_projections (
           answer_session_ref, candidate_ref, policy_version, disclosure_version,
           policy_state, document_visibility, window_focus, version, updated_at
         ) VALUES ($1, $2, $3, $4, 'ACTIVE', 'VISIBLE', 'FOCUSED', 1, $5)`,
        [
          answerSessionRef,
          input.actor.actorId,
          input.command.sandbox_focus_policy_version,
          input.command.focus_tracking_disclosure_version,
          now,
        ],
      );
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'BackedApplicationStarted', 1, 'BlindReviewCommitment',
                   $2, $3, $4, $5, $6::jsonb)`,
        [
          eventId,
          source.commitment_ref,
          nextReview.version,
          input.correlationId,
          now,
          JSON.stringify({
            schema_version: "backed-application-started@1",
            invitation_ref: input.invitationRef,
            obligation_ref: source.obligation_ref,
            answer_session_ref: answerSessionRef,
            candidate_ref: input.actor.actorId,
            answer_due_at: dueAt.toISOString(),
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'FunctionalAnswerSessionStarted', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          outboxId,
          eventId,
          `FunctionalAnswerSessionStarted:${answerSessionRef}:1`,
          input.correlationId,
          JSON.stringify({
            schema_version: "functional-answer-session-started@1",
            answer_session_ref: answerSessionRef,
          }),
          now,
        ],
      );
      const receipt = StartBackedApplicationReceiptSchema.parse({
        schema_version: "start-backed-application-receipt@1",
        command_id: commandId,
        event_id: eventId,
        invitation_ref: input.invitationRef,
        obligation_ref: source.obligation_ref,
        answer_session_ref: answerSessionRef,
        terms_acceptance_ref: acceptanceRef,
        candidate_credit_ledger_ref: creditLedgerRef,
        candidate_credit_remaining: credit.available_credits - 1,
        new_candidate_credit_version: credit.version + 1,
        new_obligation_version: nextObligation.version,
        new_slot_version: nextSlot.version,
        answer_due_at: dueAt.toISOString(),
        occurred_at: now.toISOString(),
      });
      await insertReceipt(client, {
        actorRef: input.actor.actorId,
        idempotencyKey: input.idempotencyKey,
        commandId,
        commandType: "StartBackedApplication",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return receipt;
    });
  }

  public async persistRichTextDraft(input: PersistRichTextDraftInput) {
    requireRole(input.actor, "CANDIDATE");
    const fingerprint = commandFingerprint({
      answerSessionRef: input.answerSessionRef,
      sha256: input.sha256,
      expectedSessionVersion: input.expectedSessionVersion,
    });
    return runTransaction(this.pool, async (client, now) => {
      const existing = await findReceipt(
        client,
        input.actor.actorId,
        input.idempotencyKey,
        "SaveAnswerDraft",
        fingerprint,
      );
      if (existing !== null && isRecord(existing)) {
        return {
          artifactRef: String(existing.artifact_ref),
          sha256: String(existing.sha256),
          savedAt: String(existing.saved_at),
          sessionVersion: Number(existing.session_version),
        };
      }
      const sessionResult = await client.query<{
        candidate_ref: string;
        status: string;
        version: number;
        answer_due_at: Date;
        focus_policy_state: string;
      }>(
        `SELECT session.candidate_ref, session.status, session.version,
                session.answer_due_at, focus.policy_state AS focus_policy_state
           FROM answer_sessions AS session
           JOIN answer_session_focus_projections AS focus
             ON focus.answer_session_ref = session.answer_session_ref
          WHERE session.answer_session_ref = $1 FOR UPDATE OF session, focus`,
        [input.answerSessionRef],
      );
      const session = sessionResult.rows[0];
      if (session === undefined)
        throw new FunctionalProductApplicationError(
          "RESOURCE_NOT_FOUND",
          "Answer Session not found.",
        );
      if (session.candidate_ref !== input.actor.actorId)
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "Answer Session belongs to another Candidate.",
        );
      if (session.status !== "ACTIVE")
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "Submitted answers cannot be edited.",
        );
      if (session.focus_policy_state === "AUTO_SUBMIT_PENDING")
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The Focus Policy has frozen this Answer Session for automatic submission.",
        );
      if (now >= session.answer_due_at)
        throw new FunctionalProductApplicationError(
          "DEADLINE_REACHED",
          "The Answer deadline has passed.",
        );
      if (session.version !== input.expectedSessionVersion)
        throw new FunctionalProductApplicationError("STALE_VERSION", "The Answer Session changed.");
      const revisionResult = await client.query<{ revision: number }>(
        `SELECT COALESCE(MAX(revision), 0)::integer + 1 AS revision
           FROM answer_artifacts
          WHERE answer_session_ref = $1 AND kind = 'RICH_TEXT'`,
        [input.answerSessionRef],
      );
      const revision = revisionResult.rows[0]?.revision ?? 1;
      await client.query(
        `INSERT INTO answer_artifacts (
           artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
           content_type, content_length, sha256, state, revision, metadata_json,
           verified_at, created_at, updated_at
         ) VALUES ($1, $2, $3, 'RICH_TEXT', $4, $5, $6, $7, 'VERIFIED', $8,
                   $9::jsonb, $10, $10, $10)`,
        [
          input.artifactRef,
          input.answerSessionRef,
          input.actor.actorId,
          input.objectKey,
          input.contentType,
          input.contentLength,
          input.sha256,
          revision,
          JSON.stringify({ plain_text_length: input.plainTextLength }),
          now,
        ],
      );
      const nextVersion = session.version + 1;
      requireOne(
        await client.query(
          `UPDATE answer_sessions SET latest_rich_text_artifact_ref = $1,
                  version = $2, updated_at = $3
            WHERE answer_session_ref = $4 AND status = 'ACTIVE' AND version = $5`,
          [input.artifactRef, nextVersion, now, input.answerSessionRef, session.version],
        ),
        "The Answer Session changed before autosave.",
      );
      const receipt = {
        schema_version: "save-answer-draft-receipt@1",
        artifact_ref: input.artifactRef,
        sha256: input.sha256,
        saved_at: now.toISOString(),
        session_version: nextVersion,
      };
      await insertReceipt(client, {
        actorRef: input.actor.actorId,
        idempotencyKey: input.idempotencyKey,
        commandId: `command:save-draft:${input.artifactRef}`,
        commandType: "SaveAnswerDraft",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return {
        artifactRef: input.artifactRef,
        sha256: input.sha256,
        savedAt: now.toISOString(),
        sessionVersion: nextVersion,
      };
    });
  }

  public async createArtifactUploadIntent(input: CreateArtifactUploadIntentInput) {
    requireRole(input.actor, "CANDIDATE");
    const fingerprint = commandFingerprint({
      answerSessionRef: input.answerSessionRef,
      kind: input.kind,
      contentType: input.contentType,
      contentLength: input.contentLength,
      expectedSessionVersion: input.expectedSessionVersion,
    });
    return runTransaction(this.pool, async (client, now) => {
      const existing = await findReceipt(
        client,
        input.actor.actorId,
        input.idempotencyKey,
        "CreateAnswerArtifactUpload",
        fingerprint,
      );
      if (existing !== null && isRecord(existing)) {
        return {
          artifactRef: String(existing.artifact_ref),
          objectKey: String(existing.object_key),
        };
      }
      const sessionResult = await client.query<{
        candidate_ref: string;
        status: string;
        version: number;
        answer_due_at: Date;
        focus_policy_state: string;
      }>(
        `SELECT session.candidate_ref, session.status, session.version,
                session.answer_due_at, focus.policy_state AS focus_policy_state
           FROM answer_sessions AS session
           JOIN answer_session_focus_projections AS focus
             ON focus.answer_session_ref = session.answer_session_ref
          WHERE session.answer_session_ref = $1 FOR UPDATE OF session, focus`,
        [input.answerSessionRef],
      );
      const session = sessionResult.rows[0];
      if (session === undefined)
        throw new FunctionalProductApplicationError(
          "RESOURCE_NOT_FOUND",
          "Answer Session not found.",
        );
      if (session.candidate_ref !== input.actor.actorId)
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "Answer Session belongs to another Candidate.",
        );
      if (session.status !== "ACTIVE")
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "Submitted answers cannot accept uploads.",
        );
      if (session.focus_policy_state === "AUTO_SUBMIT_PENDING")
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The Focus Policy has frozen this Answer Session for automatic submission.",
        );
      if (now >= session.answer_due_at)
        throw new FunctionalProductApplicationError(
          "DEADLINE_REACHED",
          "The Answer deadline has passed.",
        );
      if (session.version !== input.expectedSessionVersion)
        throw new FunctionalProductApplicationError("STALE_VERSION", "The Answer Session changed.");
      const revisionResult = await client.query<{ revision: number }>(
        `SELECT COALESCE(MAX(revision), 0)::integer + 1 AS revision
           FROM answer_artifacts WHERE answer_session_ref = $1 AND kind = 'VOICE_MEMO'`,
        [input.answerSessionRef],
      );
      await client.query(
        `INSERT INTO answer_artifacts (
           artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
           content_type, content_length, sha256, state, revision, metadata_json,
           created_at, updated_at
         ) VALUES ($1, $2, $3, 'VOICE_MEMO', $4, $5, $6, NULL, 'UPLOAD_ISSUED',
                   $7, '{}'::jsonb, $8, $8)`,
        [
          input.artifactRef,
          input.answerSessionRef,
          input.actor.actorId,
          input.objectKey,
          input.contentType,
          input.contentLength,
          revisionResult.rows[0]?.revision ?? 1,
          now,
        ],
      );
      const receipt = { artifact_ref: input.artifactRef, object_key: input.objectKey };
      await insertReceipt(client, {
        actorRef: input.actor.actorId,
        idempotencyKey: input.idempotencyKey,
        commandId: `command:create-upload:${input.artifactRef}`,
        commandType: "CreateAnswerArtifactUpload",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return { artifactRef: input.artifactRef, objectKey: input.objectKey };
    });
  }

  public async verifyArtifactUpload(
    input: VerifyArtifactUploadInput,
  ): Promise<CompleteAnswerArtifactUploadReceipt> {
    requireRole(input.actor, "CANDIDATE");
    const fingerprint = commandFingerprint({
      answerSessionRef: input.answerSessionRef,
      artifactRef: input.artifactRef,
      sha256: input.sha256,
      expectedSessionVersion: input.expectedSessionVersion,
    });
    return runTransaction(this.pool, async (client, now) => {
      const existing = await findReceipt(
        client,
        input.actor.actorId,
        input.idempotencyKey,
        "CompleteAnswerArtifactUpload",
        fingerprint,
      );
      if (existing !== null) return CompleteAnswerArtifactUploadReceiptSchema.parse(existing);
      const result = await client.query<{
        candidate_ref: string;
        session_status: string;
        session_version: number;
        started_at: Date;
        answer_due_at: Date;
        artifact_state: string;
        focus_policy_state: string;
        declared_type: string;
        declared_length: number;
      }>(
        `SELECT session.candidate_ref, session.status AS session_status,
                session.version AS session_version, session.answer_due_at,
                artifact.state AS artifact_state, artifact.content_type AS declared_type,
                artifact.content_length AS declared_length,
                focus.policy_state AS focus_policy_state
           FROM answer_sessions AS session
           JOIN answer_artifacts AS artifact
             ON artifact.answer_session_ref = session.answer_session_ref
           JOIN answer_session_focus_projections AS focus
             ON focus.answer_session_ref = session.answer_session_ref
          WHERE session.answer_session_ref = $1 AND artifact.artifact_ref = $2
          FOR UPDATE OF session, artifact`,
        [input.answerSessionRef, input.artifactRef],
      );
      const row = result.rows[0];
      if (row === undefined)
        throw new FunctionalProductApplicationError(
          "RESOURCE_NOT_FOUND",
          "Upload intent not found.",
        );
      if (row.candidate_ref !== input.actor.actorId)
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "Upload belongs to another Candidate.",
        );
      if (row.session_status !== "ACTIVE" || row.artifact_state !== "UPLOAD_ISSUED")
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "Upload cannot be completed in its current state.",
        );
      if (row.focus_policy_state === "AUTO_SUBMIT_PENDING")
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The Focus Policy has frozen this Answer Session for automatic submission.",
        );
      if (now >= row.answer_due_at)
        throw new FunctionalProductApplicationError(
          "DEADLINE_REACHED",
          "The Answer deadline has passed.",
        );
      if (row.session_version !== input.expectedSessionVersion)
        throw new FunctionalProductApplicationError("STALE_VERSION", "The Answer Session changed.");
      if (row.declared_type !== input.contentType || row.declared_length !== input.contentLength) {
        throw new FunctionalProductApplicationError(
          "ARTIFACT_INVALID",
          "Uploaded object metadata does not match the intent.",
        );
      }
      requireOne(
        await client.query(
          `UPDATE answer_artifacts SET state = 'VERIFIED', sha256 = $1,
                  verified_at = $2, updated_at = $2,
                  metadata_json = metadata_json || '{"transcription_status":"QUEUED"}'::jsonb
            WHERE artifact_ref = $3 AND state = 'UPLOAD_ISSUED'`,
          [input.sha256, now, input.artifactRef],
        ),
        "The upload changed before verification.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_sessions SET version = version + 1, updated_at = $1
            WHERE answer_session_ref = $2 AND status = 'ACTIVE' AND version = $3`,
          [now, input.answerSessionRef, row.session_version],
        ),
        "The Answer Session changed before upload verification.",
      );
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'VoiceMemoVerified', 1, 'AnswerSession', $2, $3, $4, $5, $6::jsonb)`,
        [
          input.eventId,
          input.answerSessionRef,
          row.session_version + 1,
          input.correlationId,
          now,
          JSON.stringify({
            schema_version: "voice-memo-verified@1",
            artifact_ref: input.artifactRef,
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'VoiceTranscriptionRequested', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          input.outboxId,
          input.eventId,
          `VoiceTranscriptionRequested:${input.artifactRef}:1`,
          input.correlationId,
          JSON.stringify({
            schema_version: "voice-transcription-requested@1",
            artifact_ref: input.artifactRef,
          }),
          now,
        ],
      );
      const receipt = CompleteAnswerArtifactUploadReceiptSchema.parse({
        schema_version: "complete-answer-artifact-upload-receipt@1",
        artifact_ref: input.artifactRef,
        state: "VERIFIED",
        sha256: input.sha256,
        verified_at: now.toISOString(),
      });
      await insertReceipt(client, {
        actorRef: input.actor.actorId,
        idempotencyKey: input.idempotencyKey,
        commandId: `command:complete-upload:${input.artifactRef}`,
        commandType: "CompleteAnswerArtifactUpload",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return receipt;
    });
  }

  public async queueAssistantExchange(input: QueueAssistantExchangeInput) {
    requireRole(input.actor, "CANDIDATE");
    const fingerprint = commandFingerprint({
      answerSessionRef: input.answerSessionRef,
      sha256: input.userSha256,
      expectedSessionVersion: input.expectedSessionVersion,
    });
    return runTransaction(this.pool, async (client, now) => {
      const existing = await findReceipt(
        client,
        input.actor.actorId,
        input.idempotencyKey,
        "QueueCandidateAssistantTurn",
        fingerprint,
      );
      if (existing !== null && isRecord(existing)) {
        return { ordinal: Number(existing.ordinal), createdAt: String(existing.created_at) };
      }
      const sessionResult = await client.query<{
        candidate_ref: string;
        status: string;
        version: number;
        answer_due_at: Date;
        contract_json: unknown;
        focus_policy_state: string;
      }>(
        `SELECT session.candidate_ref, session.status, session.version,
                session.answer_due_at, contract.contract_json,
                focus.policy_state AS focus_policy_state
           FROM answer_sessions AS session
           JOIN answer_review_obligations AS obligation
             ON obligation.obligation_ref = session.obligation_ref
           JOIN blind_review_commitments AS commitment
             ON commitment.commitment_ref = obligation.commitment_ref
           JOIN sealed_capability_contracts AS contract
             ON contract.contract_version_ref = commitment.contract_version_ref
           JOIN answer_session_focus_projections AS focus
             ON focus.answer_session_ref = session.answer_session_ref
          WHERE session.answer_session_ref = $1 FOR UPDATE OF session`,
        [input.answerSessionRef],
      );
      const session = sessionResult.rows[0];
      if (session === undefined)
        throw new FunctionalProductApplicationError(
          "RESOURCE_NOT_FOUND",
          "Answer Session not found.",
        );
      if (session.candidate_ref !== input.actor.actorId)
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "Answer Session belongs to another Candidate.",
        );
      if (session.status !== "ACTIVE")
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The assistant is unavailable after submission.",
        );
      if (session.focus_policy_state === "AUTO_SUBMIT_PENDING")
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The Focus Policy has frozen this Answer Session for automatic submission.",
        );
      if (now >= session.answer_due_at)
        throw new FunctionalProductApplicationError(
          "DEADLINE_REACHED",
          "The Answer deadline has passed.",
        );
      if (session.version !== input.expectedSessionVersion)
        throw new FunctionalProductApplicationError("STALE_VERSION", "The Answer Session changed.");
      if (
        !isRecord(session.contract_json) ||
        session.contract_json.candidate_ai_policy !== "PLATFORM_ASSISTANT_ALLOWED"
      ) {
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "This Job Contract does not allow the platform assistant.",
        );
      }
      const ordinalResult = await client.query<{ ordinal: number }>(
        `SELECT COALESCE(MAX(ordinal), 0)::integer + 1 AS ordinal
           FROM candidate_assistant_exchanges WHERE answer_session_ref = $1`,
        [input.answerSessionRef],
      );
      const ordinal = ordinalResult.rows[0]?.ordinal ?? 1;
      if (ordinal > 20)
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The disclosed assistant turn limit has been reached.",
        );
      await client.query(
        `INSERT INTO answer_artifacts (
           artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
           content_type, content_length, sha256, state, revision, metadata_json,
           verified_at, created_at, updated_at
         ) VALUES ($1, $2, $3, 'GPT_TURN', $4, 'text/plain; charset=utf-8', $5,
                   $6, 'VERIFIED', $7, '{"role":"USER"}'::jsonb, $8, $8, $8)`,
        [
          input.userArtifactRef,
          input.answerSessionRef,
          input.actor.actorId,
          input.userObjectKey,
          input.userContentLength,
          input.userSha256,
          ordinal * 2 - 1,
          now,
        ],
      );
      await client.query(
        `INSERT INTO candidate_assistant_exchanges (
           exchange_ref, answer_session_ref, candidate_ref, ordinal,
           user_artifact_ref, status, created_at
         ) VALUES ($1, $2, $3, $4, $5, 'QUEUED', $6)`,
        [
          input.exchangeRef,
          input.answerSessionRef,
          input.actor.actorId,
          ordinal,
          input.userArtifactRef,
          now,
        ],
      );
      requireOne(
        await client.query(
          `UPDATE answer_sessions SET version = version + 1, updated_at = $1
            WHERE answer_session_ref = $2 AND status = 'ACTIVE' AND version = $3`,
          [now, input.answerSessionRef, session.version],
        ),
        "The Answer Session changed before the assistant turn was queued.",
      );
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'CandidateAssistantTurnQueued', 1, 'AnswerSession',
                   $2, $3, $4, $5, $6::jsonb)`,
        [
          input.eventId,
          input.answerSessionRef,
          session.version + 1,
          input.correlationId,
          now,
          JSON.stringify({
            schema_version: "candidate-assistant-turn-queued@1",
            exchange_ref: input.exchangeRef,
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'CandidateAssistantTurnRequested', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          input.outboxId,
          input.eventId,
          `CandidateAssistantTurnRequested:${input.exchangeRef}:1`,
          input.correlationId,
          JSON.stringify({
            schema_version: "candidate-assistant-turn-requested@1",
            exchange_ref: input.exchangeRef,
          }),
          now,
        ],
      );
      const receipt = { ordinal, created_at: now.toISOString() };
      await insertReceipt(client, {
        actorRef: input.actor.actorId,
        idempotencyKey: input.idempotencyKey,
        commandId: `command:assistant-turn:${input.exchangeRef}`,
        commandType: "QueueCandidateAssistantTurn",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return { ordinal, createdAt: now.toISOString() };
    });
  }

  public async recordSandboxActivity(
    input: RecordSandboxActivityStoreInput,
  ): Promise<ReturnType<typeof CandidateSandboxActivityReceiptSchema.parse>> {
    requireRole(input.actor, "CANDIDATE");
    const fingerprint = commandFingerprint({
      answerSessionRef: input.answerSessionRef,
      command: input.command,
    });
    return runTransaction(this.pool, async (client, now) => {
      const existing = await findReceipt(
        client,
        input.actor.actorId,
        input.idempotencyKey,
        "RecordCandidateSandboxActivity",
        fingerprint,
      );
      if (existing !== null) return CandidateSandboxActivityReceiptSchema.parse(existing);

      const duplicate = await client.query<{ answer_session_ref: string }>(
        "SELECT answer_session_ref FROM answer_session_activity_events WHERE event_ref = $1",
        [input.command.event_ref],
      );
      if (duplicate.rowCount !== 0) {
        throw new FunctionalProductApplicationError(
          "IDEMPOTENCY_CONFLICT",
          "The Sandbox Activity event ref has already been used.",
        );
      }

      const result = await client.query<FocusProjectionRow & { readonly session_status: string }>(
        `SELECT focus.*, session.status AS session_status
           FROM answer_session_focus_projections AS focus
           JOIN answer_sessions AS session
             ON session.answer_session_ref = focus.answer_session_ref
          WHERE focus.answer_session_ref = $1
          FOR UPDATE OF focus, session`,
        [input.answerSessionRef],
      );
      const current = result.rows[0];
      if (current === undefined) {
        throw new FunctionalProductApplicationError(
          "RESOURCE_NOT_FOUND",
          "Answer Session focus policy not found.",
        );
      }
      if (current.candidate_ref !== input.actor.actorId) {
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "Answer Session belongs to another Candidate.",
        );
      }
      if (current.policy_version !== SANDBOX_FOCUS_POLICY_VERSION) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "This legacy Answer Session does not collect focus activity.",
        );
      }
      if (current.session_status !== "ACTIVE" || current.policy_state === "AUTO_SUBMITTED") {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "Focus activity is closed for this Answer Session.",
        );
      }

      await client.query(
        `INSERT INTO answer_session_activity_events (
           event_ref, answer_session_ref, candidate_ref, event_type, system_dialog_type,
           client_sequence, client_monotonic_ms, policy_version, recorded_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          input.command.event_ref,
          input.answerSessionRef,
          input.actor.actorId,
          input.command.event_type,
          input.command.system_dialog_type,
          input.command.client_sequence,
          input.command.client_monotonic_ms,
          input.command.policy_version,
          now,
        ],
      );

      let next = applySandboxActivity(
        focusDomainState(current),
        input.command.event_type,
        now.getTime(),
      );
      const thresholdReached = sandboxFocusThresholdReached(next, now.getTime());
      const autoSubmitRequested =
        current.policy_state !== "AUTO_SUBMIT_PENDING" && thresholdReached;
      if (thresholdReached && next.policyState !== "AUTO_SUBMIT_PENDING") {
        next = { ...next, policyState: "AUTO_SUBMIT_PENDING" };
      }
      const policyState =
        current.policy_state === "AUTO_SUBMIT_PENDING" ? "AUTO_SUBMIT_PENDING" : next.policyState;
      const requestedAt = autoSubmitRequested ? now : current.auto_submit_requested_at;
      const settlementDueAt = autoSubmitRequested
        ? new Date(now.getTime() + 30_000)
        : current.platform_settlement_due_at;
      requireOne(
        await client.query(
          `UPDATE answer_session_focus_projections
              SET policy_state = $1, document_visibility = $2, window_focus = $3,
                  away_started_at = $4, countable_away_count = $5,
                  cumulative_away_ms = $6, system_dialog_used = $7,
                  system_dialog_until = $8, auto_submit_requested_at = $9,
                  platform_settlement_due_at = $10, version = version + 1,
                  updated_at = $11
            WHERE answer_session_ref = $12 AND version = $13`,
          [
            policyState,
            next.documentVisibility,
            next.windowFocus,
            next.awayStartedAtMs === null ? null : new Date(next.awayStartedAtMs),
            next.countableAwayCount,
            next.cumulativeAwayMs,
            next.systemDialogUsed,
            next.systemDialogUntilMs === null ? null : new Date(next.systemDialogUntilMs),
            requestedAt,
            settlementDueAt,
            now,
            input.answerSessionRef,
            current.version,
          ],
        ),
        "The Sandbox focus projection changed.",
      );

      if (autoSubmitRequested) {
        const eventId = input.ids.nextId("event");
        await client.query(
          `INSERT INTO domain_events (
             event_id, event_type, event_version, aggregate_type, aggregate_id,
             aggregate_version, correlation_id, occurred_at, payload
           ) VALUES ($1, 'SandboxFocusAutoSubmitRequested', 1, 'AnswerSession',
                     $2, $3, $4, $5, $6::jsonb)`,
          [
            eventId,
            input.answerSessionRef,
            current.version + 1,
            input.correlationId,
            now,
            JSON.stringify({
              schema_version: "sandbox-focus-auto-submit-requested@1",
              answer_session_ref: input.answerSessionRef,
              countable_away_count: next.countableAwayCount,
              cumulative_away_ms: next.cumulativeAwayMs,
            }),
          ],
        );
      }

      const updated: FocusProjectionRow = {
        ...current,
        policy_state: policyState,
        document_visibility: next.documentVisibility,
        window_focus: next.windowFocus,
        away_started_at: next.awayStartedAtMs === null ? null : new Date(next.awayStartedAtMs),
        countable_away_count: next.countableAwayCount,
        cumulative_away_ms: next.cumulativeAwayMs,
        system_dialog_used: next.systemDialogUsed,
        system_dialog_until:
          next.systemDialogUntilMs === null ? null : new Date(next.systemDialogUntilMs),
        auto_submit_requested_at: requestedAt,
        platform_settlement_due_at: settlementDueAt,
        version: current.version + 1,
      };
      const receipt = CandidateSandboxActivityReceiptSchema.parse({
        schema_version: "candidate-sandbox-activity-receipt@1",
        event_ref: input.command.event_ref,
        answer_session_ref: input.answerSessionRef,
        recorded_at: now.toISOString(),
        focus: focusProjection(updated),
        auto_submit_requested: autoSubmitRequested,
      });
      await insertReceipt(client, {
        actorRef: input.actor.actorId,
        idempotencyKey: input.idempotencyKey,
        commandId: `command:sandbox-activity:${input.command.event_ref}`,
        commandType: "RecordCandidateSandboxActivity",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return receipt;
    });
  }

  public async submitAnswer(
    input: SubmitFunctionalAnswerStoreInput,
  ): Promise<ReturnType<typeof FunctionalAnswerSubmissionReceiptSchema.parse>> {
    if (input.actor.role !== "SYSTEM") requireRole(input.actor, "CANDIDATE");
    await this.ensureAssistantTraceArtifact(input.answerSessionRef, input.actor);
    const fingerprint = commandFingerprint({
      answerSessionRef: input.answerSessionRef,
      finalArtifactRefs: [...input.finalArtifactRefs].sort(),
      expectedSessionVersion: input.expectedSessionVersion,
      submissionSource: input.submissionSource,
    });
    return runTransaction(this.pool, async (client, now) => {
      const receiptActor = input.actor.actorId;
      const existing = await findReceipt(
        client,
        receiptActor,
        input.idempotencyKey,
        "SubmitFunctionalAnswer",
        fingerprint,
      );
      if (existing !== null) return FunctionalAnswerSubmissionReceiptSchema.parse(existing);
      const result = await client.query<{
        answer_session_ref: string;
        invitation_ref: string;
        obligation_ref: string;
        candidate_ref: string;
        session_status: string;
        session_version: number;
        started_at: Date;
        answer_due_at: Date;
        interest_ref: string;
        obligation_status: string;
        obligation_version: number;
        slot_ref: string;
        slot_version: number;
        cohort_ref: string;
        cohort_version: number;
        cohort_seat_ref: string;
        commitment_ref: string;
        aggregate_json: unknown;
        answer_review_sla_hours: number;
        contract_version_ref: string;
        contract_hash: string;
        contract_json: unknown;
        focus_policy_state: "ACTIVE" | "WARNED" | "AUTO_SUBMIT_PENDING" | "AUTO_SUBMITTED";
      }>(
        `SELECT session.answer_session_ref, session.invitation_ref,
                session.obligation_ref, session.candidate_ref,
                session.status AS session_status, session.version AS session_version,
                session.answer_due_at, session.started_at, obligation.interest_ref,
                obligation.status AS obligation_status,
                obligation.version AS obligation_version, obligation.slot_ref,
                slot.version AS slot_version, obligation.cohort_ref,
                cohort.version AS cohort_version, obligation.cohort_seat_ref,
                commitment.commitment_ref, commitment.aggregate_json,
                commitment.answer_review_sla_hours, commitment.contract_version_ref,
                contract.contract_hash, contract.contract_json,
                focus.policy_state AS focus_policy_state
           FROM answer_sessions AS session
           JOIN answer_review_obligations AS obligation
             ON obligation.obligation_ref = session.obligation_ref
           JOIN answer_review_slots AS slot ON slot.slot_ref = obligation.slot_ref
           JOIN advancement_cohorts AS cohort ON cohort.cohort_ref = obligation.cohort_ref
           JOIN blind_review_commitments AS commitment
             ON commitment.commitment_ref = obligation.commitment_ref
           JOIN sealed_capability_contracts AS contract
             ON contract.contract_version_ref = commitment.contract_version_ref
           JOIN answer_session_focus_projections AS focus
             ON focus.answer_session_ref = session.answer_session_ref
          WHERE session.answer_session_ref = $1
          FOR UPDATE OF session, obligation, slot, cohort, commitment`,
        [input.answerSessionRef],
      );
      const source = result.rows[0];
      if (source === undefined)
        throw new FunctionalProductApplicationError(
          "RESOURCE_NOT_FOUND",
          "Answer Session not found.",
        );
      if (input.actor.role !== "SYSTEM" && source.candidate_ref !== input.actor.actorId) {
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "Answer Session belongs to another Candidate.",
        );
      }
      if (source.session_status !== "ACTIVE" || source.obligation_status !== "ANSWER_ACTIVE") {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "Only an active answer can be submitted.",
        );
      }
      if (
        (input.submissionSource === "MANUAL" &&
          source.focus_policy_state === "AUTO_SUBMIT_PENDING") ||
        (input.submissionSource === "FOCUS_POLICY_AUTO" &&
          source.focus_policy_state !== "AUTO_SUBMIT_PENDING")
      ) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          input.submissionSource === "MANUAL"
            ? "The Focus Policy has frozen this Answer Session."
            : "Focus-policy submission requires a pending policy trigger.",
        );
      }
      if (source.session_version !== input.expectedSessionVersion) {
        throw new FunctionalProductApplicationError("STALE_VERSION", "The Answer Session changed.");
      }
      if (
        (input.submissionSource === "MANUAL" && now >= source.answer_due_at) ||
        (input.submissionSource === "DEADLINE_AUTO" && now < source.answer_due_at)
      ) {
        throw new FunctionalProductApplicationError(
          "DEADLINE_REACHED",
          input.submissionSource === "MANUAL"
            ? "The manual submission deadline has passed."
            : "Automatic submission cannot run before the deadline.",
        );
      }
      const requestedRefs = [...new Set(input.finalArtifactRefs)];
      if (requestedRefs.length !== input.finalArtifactRefs.length) {
        throw new FunctionalProductApplicationError(
          "ARTIFACT_INVALID",
          "Final Artifact refs must be unique.",
        );
      }
      const artifactResult = await client.query<ArtifactRow>(
        `SELECT artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
                content_type, content_length, sha256, state, revision,
                metadata_json, created_at
           FROM answer_artifacts
          WHERE answer_session_ref = $1
            AND artifact_ref = ANY($2::text[])
          FOR UPDATE`,
        [input.answerSessionRef, requestedRefs],
      );
      if (artifactResult.rows.length !== requestedRefs.length) {
        throw new FunctionalProductApplicationError(
          "ARTIFACT_INVALID",
          "A final Artifact is missing or belongs to another Session.",
        );
      }
      const requestedArtifacts = artifactResult.rows.map(artifactRecord);
      if (requestedArtifacts.some(({ state, sha256 }) => state !== "VERIFIED" || sha256 === null)) {
        throw new FunctionalProductApplicationError(
          "ARTIFACT_NOT_READY",
          "Every final Artifact must be verified before submission.",
        );
      }
      const hasNonEmptyRichText = requestedArtifacts.some(
        (artifact) =>
          artifact.kind === "RICH_TEXT" &&
          typeof artifact.metadata.plain_text_length === "number" &&
          artifact.metadata.plain_text_length > 0,
      );
      const hasVoice = requestedArtifacts.some(
        ({ kind, contentLength }) => kind === "VOICE_MEMO" && contentLength > 0,
      );
      if (!hasNonEmptyRichText && !hasVoice) {
        throw new FunctionalProductApplicationError(
          "ARTIFACT_INVALID",
          "A final answer requires non-empty rich text or a verified Voice Memo.",
        );
      }
      const pendingAssistant = await client.query(
        `SELECT 1 FROM candidate_assistant_exchanges
          WHERE answer_session_ref = $1 AND status IN ('QUEUED', 'RUNNING') LIMIT 1`,
        [input.answerSessionRef],
      );
      const pendingVoice = requestedArtifacts.some(
        (artifact) =>
          artifact.kind === "VOICE_MEMO" &&
          !["COMPLETED", "FAILED"].includes(
            typeof artifact.metadata.transcription_status === "string"
              ? artifact.metadata.transcription_status
              : "QUEUED",
          ),
      );
      if (pendingAssistant.rowCount !== 0 || pendingVoice) {
        throw new FunctionalProductApplicationError(
          "ARTIFACT_NOT_READY",
          "Disclosed platform work must complete or fail explicitly before final submission.",
        );
      }
      const traceResult = await client.query<ArtifactRow>(
        `SELECT artifact.artifact_ref, artifact.answer_session_ref,
                artifact.candidate_ref, artifact.kind, artifact.object_key,
                artifact.content_type, artifact.content_length, artifact.sha256,
                artifact.state, artifact.revision, artifact.metadata_json,
                artifact.created_at
           FROM answer_artifacts AS artifact
          WHERE artifact.answer_session_ref = $1
            AND artifact.kind IN ('GPT_TURN', 'GPT_TRACE', 'VOICE_TRANSCRIPT')
            AND artifact.state = 'VERIFIED'
          ORDER BY artifact.created_at, artifact.artifact_ref
          FOR UPDATE`,
        [input.answerSessionRef],
      );
      const allArtifacts = [...requestedArtifacts, ...traceResult.rows.map(artifactRecord)]
        .filter(
          (artifact, index, values) =>
            values.findIndex(({ artifactRef }) => artifactRef === artifact.artifactRef) === index,
        )
        .sort((left, right) => left.artifactRef.localeCompare(right.artifactRef));
      const previousReview = parseReview(source.aggregate_json);
      const answerSubmissionRef = input.ids.nextId("answer-submission");
      const processEvidenceRef = input.ids.nextId("process-evidence");
      const snapshotRef = `answer-snapshot:${answerSubmissionRef}`;
      const nextReview = submitBlindAnswer(previousReview, {
        obligationRef: source.obligation_ref,
        answerSubmissionRef,
        snapshotRef,
        submittedAt: now.toISOString(),
      });
      const nextObligation = nextReview.obligations.find(
        ({ obligationRef }) => obligationRef === source.obligation_ref,
      );
      const nextSlot = nextReview.slots.find(({ slotRef }) => slotRef === source.slot_ref);
      const nextInterest = nextReview.interests.find(
        ({ interestRef }) => interestRef === source.interest_ref,
      );
      const nextCohort = nextReview.cohorts.find(
        ({ cohortRef }) => cohortRef === source.cohort_ref,
      );
      const nextSeat = nextCohort?.seats.find(
        ({ cohortSeatRef }) => cohortSeatRef === source.cohort_seat_ref,
      );
      if (
        nextObligation === undefined ||
        nextSlot === undefined ||
        nextInterest === undefined ||
        nextCohort === undefined ||
        nextSeat === undefined
      ) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The submission transition is incomplete.",
        );
      }
      const eventId = input.ids.nextId("event");
      const commandId = input.ids.nextId("command");
      const outboxId = input.ids.nextId("outbox");
      const artifactRefs = allArtifacts.map(({ artifactRef }) => artifactRef);
      const submissionHash = hash(
        JSON.stringify({
          answer_session_ref: input.answerSessionRef,
          artifact_refs: artifactRefs,
          artifact_hashes: allArtifacts.map(({ artifactRef, sha256 }) => [artifactRef, sha256]),
          submitted_at: now.toISOString(),
          submission_source: input.submissionSource,
        }),
      );
      const reviewDueAt = new Date(now.getTime() + source.answer_review_sla_hours * 3_600_000);

      const revisionResult = await client.query<ArtifactRow>(
        `SELECT artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
                content_type, content_length, sha256, state, revision,
                metadata_json, created_at
           FROM answer_artifacts
          WHERE answer_session_ref = $1 AND kind = 'RICH_TEXT'
            AND state IN ('VERIFIED', 'SEALED')
          ORDER BY created_at, revision, artifact_ref
          FOR UPDATE`,
        [input.answerSessionRef],
      );
      const revisionArtifacts = revisionResult.rows.map(artifactRecord);
      const exchangeProcessResult = await client.query<{
        created_at: Date;
        status: string;
        error_code: string | null;
      }>(
        `SELECT created_at, status, error_code
           FROM candidate_assistant_exchanges
          WHERE answer_session_ref = $1 ORDER BY created_at, exchange_ref`,
        [input.answerSessionRef],
      );
      const aiPolicy =
        isRecord(source.contract_json) &&
        ["ANSWER_ONLY", "ANSWER_PLUS_PROCESS"].includes(
          String(source.contract_json.employer_ai_review_policy),
        )
          ? String(source.contract_json.employer_ai_review_policy)
          : "OFF";
      const processEvidenceInput = {
        processEvidenceRef,
        answerSessionRef: input.answerSessionRef,
        answerSubmissionRef,
        startedAt: source.started_at.toISOString(),
        answerDueAt: source.answer_due_at.toISOString(),
        submittedAt: now.toISOString(),
        submissionSource: input.submissionSource,
        revisions: revisionArtifacts.flatMap((artifact) =>
          artifact.sha256 === null
            ? []
            : [
                {
                  artifactRef: artifact.artifactRef,
                  revision: artifact.revision,
                  sha256: artifact.sha256,
                  recordedAt: artifact.createdAt,
                  plainTextLength:
                    typeof artifact.metadata.plain_text_length === "number"
                      ? artifact.metadata.plain_text_length
                      : 0,
                  final: requestedRefs.includes(artifact.artifactRef),
                },
              ],
        ),
        platformGptTurnTimes: exchangeProcessResult.rows.map(({ created_at }) =>
          created_at.toISOString(),
        ),
        voiceMemoTimes: requestedArtifacts
          .filter(({ kind }) => kind === "VOICE_MEMO")
          .map(({ createdAt }) => createdAt),
        knownPlatformFailures: [
          ...exchangeProcessResult.rows.flatMap(({ status, error_code }) =>
            status === "FAILED" && error_code !== null ? [error_code] : [],
          ),
          ...requestedArtifacts.flatMap((artifact) =>
            artifact.kind === "VOICE_MEMO" &&
            typeof artifact.metadata.transcription_error_code === "string"
              ? [artifact.metadata.transcription_error_code]
              : [],
          ),
        ],
      } as const;
      const processEvidence =
        aiPolicy === "ANSWER_PLUS_PROCESS" &&
        isRecord(source.contract_json) &&
        source.contract_json.employer_ai_review_disclosure_version ===
          "employer-ai-review-disclosure@2"
          ? buildAnswerProcessEvidence(processEvidenceInput)
          : buildLegacyAnswerProcessEvidence(processEvidenceInput);
      const processHash = hash(JSON.stringify(processEvidence));

      requireOne(
        await client.query(
          `UPDATE blind_review_commitments SET aggregate_json = $1::jsonb, updated_at = $2
            WHERE commitment_ref = $3 AND aggregate_json = $4::jsonb`,
          [JSON.stringify(nextReview), now, source.commitment_ref, JSON.stringify(previousReview)],
        ),
        "The Blind Review Commitment changed before submission.",
      );
      await client.query(
        `INSERT INTO answer_process_evidence (
           process_evidence_ref, answer_submission_ref, answer_session_ref,
           process_manifest_json, process_hash, created_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          processEvidenceRef,
          answerSubmissionRef,
          input.answerSessionRef,
          JSON.stringify(processEvidence),
          processHash,
          now,
        ],
      );
      await client.query(
        `INSERT INTO answer_submissions (
           answer_submission_ref, answer_session_ref, invitation_ref,
           obligation_ref, interest_ref, candidate_ref, cohort_ref,
           cohort_seat_ref, snapshot_ref, artifact_refs, event_refs,
           submission_hash, submitted_at, created_at, submission_source,
           artifact_manifest_json, process_evidence_ref, process_capture_version,
           process_manifest_json
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
                   $11::jsonb, $12, $13, $13, $14, $10::jsonb, $15,
                   $16, $17::jsonb)`,
        [
          answerSubmissionRef,
          input.answerSessionRef,
          source.invitation_ref,
          source.obligation_ref,
          source.interest_ref,
          source.candidate_ref,
          source.cohort_ref,
          source.cohort_seat_ref,
          snapshotRef,
          JSON.stringify(artifactRefs),
          JSON.stringify([eventId]),
          submissionHash,
          now,
          input.submissionSource,
          processEvidenceRef,
          processEvidence.schema_version,
          JSON.stringify(processEvidence.revision_manifest),
        ],
      );
      await client.query(
        `INSERT INTO employer_answer_review_projections (
           answer_submission_ref, policy, status, process_evidence_ref,
           synthetic, version, updated_at
         ) VALUES ($1, $2, $3, $4, false, 1, $5)`,
        [
          answerSubmissionRef,
          aiPolicy,
          aiPolicy === "OFF" ? "DISABLED" : "ANALYZING",
          processEvidenceRef,
          now,
        ],
      );
      requireOne(
        await client.query(
          `UPDATE answer_sessions SET status = 'SUBMITTED', submitted_at = $1,
                  submission_source = $2, closed_at = $1, version = version + 1,
                  updated_at = $1
            WHERE answer_session_ref = $3 AND status = 'ACTIVE' AND version = $4`,
          [now, input.submissionSource, input.answerSessionRef, source.session_version],
        ),
        "The Answer Session changed before submission.",
      );
      if (input.submissionSource === "FOCUS_POLICY_AUTO") {
        requireOne(
          await client.query(
            `UPDATE answer_session_focus_projections
                SET policy_state = 'AUTO_SUBMITTED', auto_submitted_at = $1,
                    away_started_at = NULL, version = version + 1, updated_at = $1
              WHERE answer_session_ref = $2 AND policy_state = 'AUTO_SUBMIT_PENDING'`,
            [now, input.answerSessionRef],
          ),
          "The Focus Policy changed before automatic submission.",
        );
      }
      requireOne(
        await client.query(
          `UPDATE answer_review_obligations SET status = 'REVIEW_PENDING',
                  answer_submission_ref = $1, review_due_at = $2,
                  version = $3, updated_at = $4
            WHERE obligation_ref = $5 AND status = 'ANSWER_ACTIVE' AND version = $6`,
          [
            answerSubmissionRef,
            reviewDueAt,
            nextObligation.version,
            now,
            source.obligation_ref,
            source.obligation_version,
          ],
        ),
        "The review obligation changed before submission.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_slots SET status = 'REVIEW_PENDING', version = $1, updated_at = $2
            WHERE slot_ref = $3 AND status = 'ANSWER_ACTIVE' AND version = $4`,
          [nextSlot.version, now, source.slot_ref, source.slot_version],
        ),
        "The Attention Slot changed before submission.",
      );
      requireOne(
        await client.query(
          `UPDATE candidate_interests SET status = 'APPLICATION_SUBMITTED', version = $1, updated_at = $2
            WHERE interest_ref = $3 AND status = 'APPLICATION_ACTIVE'`,
          [nextInterest.version, now, source.interest_ref],
        ),
        "The Candidate Interest changed before submission.",
      );
      requireOne(
        await client.query(
          `UPDATE advancement_cohorts SET submitted_count = $1, reviewed_count = $2,
                  state = $3, version = $4, updated_at = $5
            WHERE cohort_ref = $6 AND version = $7`,
          [
            nextCohort.submittedCount,
            nextCohort.reviewedCount,
            nextCohort.state,
            nextCohort.version,
            now,
            source.cohort_ref,
            source.cohort_version,
          ],
        ),
        "The Advancement Cohort changed before submission.",
      );
      requireOne(
        await client.query(
          `UPDATE advancement_cohort_seats SET status = 'ANSWER_SUBMITTED',
                  answer_submission_ref = $1, version = version + 1, updated_at = $2
            WHERE cohort_seat_ref = $3 AND status = 'RESERVED'
              AND obligation_ref = $4`,
          [answerSubmissionRef, now, source.cohort_seat_ref, source.obligation_ref],
        ),
        "The Cohort Seat changed before submission.",
      );
      const sealed = await client.query(
        `UPDATE answer_artifacts SET state = 'SEALED', sealed_at = $1, updated_at = $1
            WHERE answer_session_ref = $2 AND artifact_ref = ANY($3::text[])
              AND state = 'VERIFIED'`,
        [now, input.answerSessionRef, artifactRefs],
      );
      if (sealed.rowCount !== artifactRefs.length) {
        throw new FunctionalProductApplicationError(
          "STALE_VERSION",
          "A final Artifact changed before sealing.",
        );
      }
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'BlindAnswerSubmitted', 1, 'BlindReviewCommitment',
                   $2, $3, $4, $5, $6::jsonb)`,
        [
          eventId,
          source.commitment_ref,
          nextReview.version,
          input.correlationId,
          now,
          JSON.stringify({
            schema_version: "blind-answer-submitted@1",
            answer_submission_ref: answerSubmissionRef,
            process_evidence_ref: processEvidenceRef,
            employer_ai_review_policy: aiPolicy,
            obligation_ref: source.obligation_ref,
            artifact_refs: artifactRefs,
            review_due_at: reviewDueAt.toISOString(),
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'FunctionalAnswerSubmittedForReview', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          outboxId,
          eventId,
          `FunctionalAnswerSubmittedForReview:${answerSubmissionRef}:1`,
          input.correlationId,
          JSON.stringify({
            schema_version: "functional-answer-submitted-for-review@1",
            answer_submission_ref: answerSubmissionRef,
            process_evidence_ref: processEvidenceRef,
          }),
          now,
        ],
      );
      const receipt = FunctionalAnswerSubmissionReceiptSchema.parse({
        schema_version: "functional-answer-submission-receipt@2",
        command_id: commandId,
        event_id: eventId,
        answer_session_ref: input.answerSessionRef,
        answer_submission_ref: answerSubmissionRef,
        process_evidence_ref: processEvidenceRef,
        obligation_ref: source.obligation_ref,
        submission_source: input.submissionSource,
        artifact_refs: artifactRefs,
        submission_hash: submissionHash,
        submitted_at: now.toISOString(),
        new_session_version: source.session_version + 1,
        new_obligation_version: nextObligation.version,
      });
      await insertReceipt(client, {
        actorRef: receiptActor,
        idempotencyKey: input.idempotencyKey,
        commandId,
        commandType: "SubmitFunctionalAnswer",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return receipt;
    });
  }

  private async ensureAssistantTraceArtifact(
    answerSessionRef: string,
    actor: FunctionalActor,
  ): Promise<void> {
    const exchangeResult = await this.pool.query<{
      exchange_ref: string;
      candidate_ref: string;
      ordinal: number;
      status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
      error_code: string | null;
      user_artifact_ref: string;
      assistant_artifact_ref: string | null;
    }>(
      `SELECT exchange.exchange_ref, exchange.candidate_ref, exchange.ordinal,
              exchange.status, exchange.error_code, exchange.user_artifact_ref,
              exchange.assistant_artifact_ref
         FROM candidate_assistant_exchanges AS exchange
         JOIN answer_sessions AS session
           ON session.answer_session_ref = exchange.answer_session_ref
        WHERE exchange.answer_session_ref = $1
        ORDER BY exchange.ordinal, exchange.exchange_ref`,
      [answerSessionRef],
    );
    if (exchangeResult.rows.length === 0) return;
    const candidateRef = exchangeResult.rows[0]?.candidate_ref;
    if (
      candidateRef === undefined ||
      exchangeResult.rows.some(({ candidate_ref }) => candidate_ref !== candidateRef) ||
      (actor.role !== "SYSTEM" && actor.actorId !== candidateRef)
    ) {
      throw new FunctionalProductApplicationError(
        "RESOURCE_NOT_FOUND",
        "Answer Session not found.",
      );
    }
    if (exchangeResult.rows.some(({ status }) => status === "QUEUED" || status === "RUNNING")) {
      return;
    }

    const turnRefs = exchangeResult.rows.flatMap(({ user_artifact_ref, assistant_artifact_ref }) =>
      assistant_artifact_ref === null
        ? [user_artifact_ref]
        : [user_artifact_ref, assistant_artifact_ref],
    );
    const artifactResult = await this.pool.query<ArtifactRow>(
      `SELECT artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
              content_type, content_length, sha256, state, revision,
              metadata_json, created_at
         FROM answer_artifacts
        WHERE answer_session_ref = $1 AND artifact_ref = ANY($2::text[])
        ORDER BY revision, artifact_ref`,
      [answerSessionRef, turnRefs],
    );
    const artifacts = new Map(
      artifactResult.rows.map((row) => {
        const artifact = artifactRecord(row);
        return [artifact.artifactRef, artifact] as const;
      }),
    );
    if (turnRefs.some((ref) => !artifacts.has(ref))) {
      throw new FunctionalProductApplicationError(
        "ARTIFACT_NOT_READY",
        "The disclosed assistant trace is missing a turn Artifact.",
      );
    }
    const textByRef = new Map<string, string>();
    try {
      await Promise.all(
        [...artifacts.values()].map(async (artifact) => {
          textByRef.set(
            artifact.artifactRef,
            objectText(await this.objectStore.getObject(artifact.objectKey)),
          );
        }),
      );
    } catch (error: unknown) {
      throw new FunctionalProductApplicationError(
        "STORE_UNAVAILABLE",
        "The disclosed assistant trace could not be read from private object storage.",
        { cause: error },
      );
    }
    const trace = {
      schema_version: "candidate-assistant-trace@1",
      answer_session_ref: answerSessionRef,
      turns: exchangeResult.rows.flatMap((exchange) => {
        const userArtifact = artifacts.get(exchange.user_artifact_ref);
        if (userArtifact === undefined) return [];
        const userTurn = {
          ordinal: exchange.ordinal * 2 - 1,
          role: "USER",
          status: "COMPLETED",
          artifact_ref: userArtifact.artifactRef,
          sha256: userArtifact.sha256,
          content: textByRef.get(userArtifact.artifactRef) ?? "",
          error_code: null,
        };
        const assistantArtifact =
          exchange.assistant_artifact_ref === null
            ? undefined
            : artifacts.get(exchange.assistant_artifact_ref);
        return [
          userTurn,
          {
            ordinal: exchange.ordinal * 2,
            role: "ASSISTANT",
            status: exchange.status,
            artifact_ref: assistantArtifact?.artifactRef ?? null,
            sha256: assistantArtifact?.sha256 ?? null,
            content:
              assistantArtifact === undefined
                ? null
                : (textByRef.get(assistantArtifact.artifactRef) ?? ""),
            error_code: exchange.error_code,
          },
        ];
      }),
    };
    const body = new TextEncoder().encode(JSON.stringify(trace));
    const digest = hash(body);
    const artifactRef = `gpt-trace:${digest.slice("sha256:".length)}`;
    const objectKey = `answers/${candidateRef}/${answerSessionRef}/assistant/${artifactRef}.json`;
    await this.pool.query(
      `INSERT INTO answer_artifacts (
         artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
         content_type, content_length, state, revision, metadata_json,
         created_at, updated_at
       ) VALUES ($1, $2, $3, 'GPT_TRACE', $4, 'application/json', $5,
                 'UPLOAD_ISSUED', 1, $6::jsonb, clock_timestamp(), clock_timestamp())
       ON CONFLICT (answer_session_ref, kind, revision) DO NOTHING`,
      [
        artifactRef,
        answerSessionRef,
        candidateRef,
        objectKey,
        body.byteLength,
        JSON.stringify({ schema_version: "candidate-assistant-trace@1" }),
      ],
    );
    const existingResult = await this.pool.query<ArtifactRow>(
      `SELECT artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
              content_type, content_length, sha256, state, revision,
              metadata_json, created_at
         FROM answer_artifacts
        WHERE answer_session_ref = $1 AND kind = 'GPT_TRACE' AND revision = 1`,
      [answerSessionRef],
    );
    const existingRow = existingResult.rows[0];
    if (existingRow === undefined) {
      throw new FunctionalProductApplicationError(
        "ARTIFACT_NOT_READY",
        "The disclosed assistant trace could not be registered.",
      );
    }
    const existing = artifactRecord(existingRow);
    if (existing.state === "VERIFIED" || existing.state === "SEALED") {
      if (existing.sha256 !== digest) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The disclosed assistant trace no longer matches its frozen Artifact.",
        );
      }
      return;
    }
    try {
      await this.objectStore.putObject({
        objectKey: existing.objectKey,
        contentType: "application/json",
        body,
        checksumSha256: digest,
      });
    } catch (error: unknown) {
      throw new FunctionalProductApplicationError(
        "STORE_UNAVAILABLE",
        "The disclosed assistant trace could not be persisted to private object storage.",
        { cause: error },
      );
    }
    await this.pool.query(
      `UPDATE answer_artifacts
          SET sha256 = $1, state = 'VERIFIED', verified_at = clock_timestamp(),
              updated_at = clock_timestamp()
        WHERE artifact_ref = $2 AND state = 'UPLOAD_ISSUED'`,
      [digest, existing.artifactRef],
    );
  }

  public async recordHumanReview(
    input: RecordFunctionalReviewStoreInput,
  ): Promise<FunctionalHumanReviewReceipt> {
    requireRole(input.actor, "EMPLOYER");
    const fingerprint = commandFingerprint({
      obligationRef: input.obligationRef,
      command: input.command,
    });
    return runTransaction(this.pool, async (client, now) => {
      const existing = await findReceipt(
        client,
        input.actor.actorId,
        input.idempotencyKey,
        "RecordFunctionalHumanReview",
        fingerprint,
      );
      if (existing !== null) return FunctionalHumanReviewReceiptSchema.parse(existing);
      const contextResult = await client.query<{
        commitment_ref: string;
        opportunity_ref: string;
        reviewer_ref: string;
        aggregate_json: unknown;
        queue_public_seed: string;
      }>(
        `SELECT commitment.commitment_ref, commitment.opportunity_ref,
                commitment.reviewer_ref, commitment.aggregate_json,
                commitment.queue_public_seed
           FROM answer_review_obligations AS obligation
           JOIN blind_review_commitments AS commitment
             ON commitment.commitment_ref = obligation.commitment_ref
          WHERE obligation.obligation_ref = $1
          FOR UPDATE OF commitment`,
        [input.obligationRef],
      );
      const context = contextResult.rows[0];
      if (context === undefined)
        throw new FunctionalProductApplicationError(
          "RESOURCE_NOT_FOUND",
          "Review obligation not found.",
        );
      if (context.reviewer_ref !== input.actor.actorId)
        throw new FunctionalProductApplicationError(
          "ROLE_FORBIDDEN",
          "Review obligation belongs to another Employer.",
        );
      const currentResult = await client.query<{
        obligation_ref: string;
        obligation_version: number;
        slot_ref: string;
        slot_version: number;
        interest_ref: string;
        candidate_ref: string;
        cohort_ref: string;
        cohort_version: number;
        cohort_seat_ref: string;
        answer_submission_ref: string;
        artifact_manifest_json: unknown;
        process_evidence_ref: string;
        process_manifest_json: unknown;
        ai_policy: "OFF" | "ANSWER_ONLY" | "ANSWER_PLUS_PROCESS";
        submitted_at: Date;
        credit_hold_ref: string;
        credit_amount: number;
        credit_account_ref: string;
        reservation_ref: string;
        reservation_version: number;
        credit_account_version: number;
        resume_snapshot_ref: string | null;
        conditional_reveal_consent_version: string;
      }>(
        `SELECT obligation.obligation_ref, obligation.version AS obligation_version,
                obligation.slot_ref, slot.version AS slot_version,
                obligation.interest_ref, obligation.candidate_ref,
                obligation.cohort_ref, cohort.version AS cohort_version,
                obligation.cohort_seat_ref, submission.answer_submission_ref,
                submission.artifact_manifest_json, submission.process_evidence_ref,
                process.process_manifest_json, analysis.policy AS ai_policy,
                submission.submitted_at,
                obligation.credit_hold_ref, hold.amount AS credit_amount,
                hold.account_ref AS credit_account_ref, hold.reservation_ref,
                reservation.version AS reservation_version,
                account.version AS credit_account_version,
                acceptance.resume_snapshot_ref,
                acceptance.conditional_reveal_consent_version
           FROM answer_review_obligations AS obligation
           JOIN answer_submissions AS submission
             ON submission.answer_submission_ref = obligation.answer_submission_ref
           JOIN answer_process_evidence AS process
             ON process.process_evidence_ref = submission.process_evidence_ref
           JOIN employer_answer_review_projections AS analysis
             ON analysis.answer_submission_ref = submission.answer_submission_ref
           JOIN answer_review_slots AS slot ON slot.slot_ref = obligation.slot_ref
           JOIN advancement_cohorts AS cohort ON cohort.cohort_ref = obligation.cohort_ref
           JOIN credit_holds AS hold ON hold.credit_hold_ref = obligation.credit_hold_ref
           JOIN answer_review_slot_credit_reservations AS reservation
             ON reservation.reservation_ref = hold.reservation_ref
           JOIN credit_accounts AS account ON account.account_ref = hold.account_ref
           JOIN answer_sessions AS session
             ON session.answer_session_ref = submission.answer_session_ref
           JOIN answer_terms_acceptances AS acceptance
             ON acceptance.acceptance_ref = session.terms_acceptance_ref
          WHERE obligation.commitment_ref = $1 AND obligation.status = 'REVIEW_PENDING'
          ORDER BY submission.submitted_at, submission.answer_submission_ref
          LIMIT 1
          FOR UPDATE OF obligation, slot, cohort, hold, reservation, account`,
        [context.commitment_ref],
      );
      const current = currentResult.rows[0];
      if (current === undefined || current.obligation_ref !== input.obligationRef) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The requested answer is not the next sequential Review obligation.",
        );
      }
      if (
        current.obligation_version !== input.command.expected_obligation_version ||
        current.cohort_version !== input.command.expected_cohort_version
      ) {
        throw new FunctionalProductApplicationError(
          "STALE_VERSION",
          "The review obligation changed.",
        );
      }
      const artifactRefs = Array.isArray(current.artifact_manifest_json)
        ? current.artifact_manifest_json.map(String)
        : [];
      const processEvidence = AnswerProcessEvidenceSchema.parse(current.process_manifest_json);
      const permittedEvidence = new Set([
        current.answer_submission_ref,
        ...artifactRefs,
        ...(current.ai_policy === "ANSWER_PLUS_PROCESS" &&
        processEvidence.schema_version === "answer-process-evidence@2"
          ? processEvidence.behavior_signals.map(({ signal_ref }) => signal_ref)
          : []),
      ]);
      if (input.command.evidence_refs.some((ref) => !permittedEvidence.has(ref))) {
        throw new FunctionalProductApplicationError(
          "REVIEW_EVIDENCE_INVALID",
          "Review Evidence must reference the current anonymous Submission.",
        );
      }
      if (input.command.consulted_ai_output_ref !== null) {
        const consulted = await client.query(
          `SELECT 1 FROM employer_answer_review_projections
            WHERE answer_submission_ref = $1 AND ai_output_ref = $2
              AND status IN ('READY', 'NEEDS_HUMAN')`,
          [current.answer_submission_ref, input.command.consulted_ai_output_ref],
        );
        if (consulted.rowCount !== 1) {
          throw new FunctionalProductApplicationError(
            "REVIEW_EVIDENCE_INVALID",
            "The consulted AI output is not the current validated analysis.",
          );
        }
      }
      const previousReview = parseReview(context.aggregate_json);
      const humanReviewRef = input.ids.nextId("human-review");
      const settlement = recordAndSettleHumanAnswerReview(previousReview, {
        obligationRef: input.obligationRef,
        humanReviewRef,
        decision: input.command.decision,
        evidenceRefs: input.command.evidence_refs,
        stillUnknown: input.command.still_unknown,
        reviewedAt: now.toISOString(),
      });
      const nextReview = settlement.state;
      const nextObligation = nextReview.obligations.find(
        ({ obligationRef }) => obligationRef === input.obligationRef,
      );
      const nextSlot = nextReview.slots.find(({ slotRef }) => slotRef === current.slot_ref);
      const nextInterest = nextReview.interests.find(
        ({ interestRef }) => interestRef === current.interest_ref,
      );
      const nextCohort = nextReview.cohorts.find(
        ({ cohortRef }) => cohortRef === current.cohort_ref,
      );
      const nextSeat = nextCohort?.seats.find(
        ({ cohortSeatRef }) => cohortSeatRef === current.cohort_seat_ref,
      );
      if (!nextObligation || !nextSlot || !nextInterest || !nextCohort || !nextSeat) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The review settlement transition is incomplete.",
        );
      }
      const commandId = input.ids.nextId("command");
      const reviewEventId = input.ids.nextId("event");
      const releaseEventId = input.ids.nextId("event");
      const resumeRevealRef =
        input.command.decision === "ADVANCE_ELIGIBLE" ? input.ids.nextId("resume-reveal") : null;
      const revealEventId =
        input.command.decision === "ADVANCE_ELIGIBLE" ? input.ids.nextId("event") : null;
      const outboxId = input.ids.nextId("outbox");
      requireOne(
        await client.query(
          `UPDATE blind_review_commitments SET aggregate_json = $1::jsonb, updated_at = $2
            WHERE commitment_ref = $3 AND aggregate_json = $4::jsonb`,
          [JSON.stringify(nextReview), now, context.commitment_ref, JSON.stringify(previousReview)],
        ),
        "The Blind Review Commitment changed before review settlement.",
      );
      await client.query(
        `INSERT INTO human_answer_reviews (
           human_review_ref, answer_submission_ref, obligation_ref, reviewer_ref,
           decision, evidence_refs, still_unknown, reviewed_at, created_at, review_comment
           , consulted_ai_output_ref
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $8, $9, $10)`,
        [
          humanReviewRef,
          current.answer_submission_ref,
          input.obligationRef,
          input.actor.actorId,
          input.command.decision,
          JSON.stringify(input.command.evidence_refs),
          JSON.stringify(input.command.still_unknown),
          now,
          input.command.review_comment,
          input.command.consulted_ai_output_ref,
        ],
      );
      if (resumeRevealRef !== null && revealEventId !== null) {
        if (current.resume_snapshot_ref === null) {
          throw new FunctionalProductApplicationError(
            "INVALID_STATE",
            "The Candidate Resume was not pinned when reveal consent was recorded.",
          );
        }
        await client.query(
          `INSERT INTO employer_resume_reveals (
             reveal_ref, reviewer_ref, candidate_ref, opportunity_ref,
             answer_submission_ref, human_review_ref, resume_snapshot_ref,
             authorization_reason, reveal_policy_version, revealed_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7,
                     'ADVANCE_ELIGIBLE_HUMAN_REVIEW', $8, $9)`,
          [
            resumeRevealRef,
            input.actor.actorId,
            current.candidate_ref,
            context.opportunity_ref,
            current.answer_submission_ref,
            humanReviewRef,
            current.resume_snapshot_ref,
            current.conditional_reveal_consent_version,
            now,
          ],
        );
      }
      await client.query(
        `UPDATE employer_answer_review_projections
            SET status = 'SUPERSEDED', error_code = 'HUMAN_REVIEW_COMPLETED_FIRST',
                version = version + 1, updated_at = $1
          WHERE answer_submission_ref = $2 AND status = 'ANALYZING'`,
        [now, current.answer_submission_ref],
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_obligations SET status = 'SETTLED', human_review_ref = $1,
                  closed_at = $2, version = $3, updated_at = $2
            WHERE obligation_ref = $4 AND status = 'REVIEW_PENDING' AND version = $5`,
          [
            humanReviewRef,
            now,
            nextObligation.version,
            input.obligationRef,
            current.obligation_version,
          ],
        ),
        "The review obligation changed before settlement.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_slots SET status = 'AVAILABLE', current_obligation_ref = NULL,
                  version = $1, updated_at = $2
            WHERE slot_ref = $3 AND status = 'REVIEW_PENDING' AND version = $4`,
          [nextSlot.version, now, current.slot_ref, current.slot_version],
        ),
        "The Attention Slot changed before release.",
      );
      requireOne(
        await client.query(
          `UPDATE candidate_interests SET status = 'REVIEWED', version = $1, updated_at = $2
            WHERE interest_ref = $3 AND status = 'APPLICATION_SUBMITTED'`,
          [nextInterest.version, now, current.interest_ref],
        ),
        "The Candidate Interest changed before review settlement.",
      );
      requireOne(
        await client.query(
          `UPDATE advancement_cohorts SET submitted_count = $1, reviewed_count = $2,
                  state = $3, version = $4, updated_at = $5
            WHERE cohort_ref = $6 AND version = $7`,
          [
            nextCohort.submittedCount,
            nextCohort.reviewedCount,
            nextCohort.state,
            nextCohort.version,
            now,
            current.cohort_ref,
            current.cohort_version,
          ],
        ),
        "The Advancement Cohort changed before review settlement.",
      );
      requireOne(
        await client.query(
          `UPDATE advancement_cohort_seats SET status = 'REVIEWED', human_review_ref = $1,
                  version = version + 1, updated_at = $2
            WHERE cohort_seat_ref = $3 AND status = 'ANSWER_SUBMITTED'
              AND answer_submission_ref = $4`,
          [humanReviewRef, now, current.cohort_seat_ref, current.answer_submission_ref],
        ),
        "The Cohort Seat changed before review settlement.",
      );
      requireOne(
        await client.query(
          `UPDATE credit_holds SET status = 'RETURNED', settled_at = $1
            WHERE credit_hold_ref = $2 AND status = 'HELD'`,
          [now, current.credit_hold_ref],
        ),
        "The Employer Attention hold changed before settlement.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_slot_credit_reservations
              SET state = 'RESERVED', version = version + 1, updated_at = $1
            WHERE reservation_ref = $2 AND state = 'BOUND' AND version = $3`,
          [now, current.reservation_ref, current.reservation_version],
        ),
        "The Slot Credit reservation changed before settlement.",
      );
      requireOne(
        await client.query(
          `UPDATE credit_accounts
              SET held_credits = held_credits - $1,
                  reserved_credits = reserved_credits + $1,
                  version = version + 1
            WHERE account_ref = $2 AND version = $3 AND held_credits >= $1`,
          [current.credit_amount, current.credit_account_ref, current.credit_account_version],
        ),
        "The Employer Attention account changed before settlement.",
      );
      await client.query(
        `INSERT INTO credit_ledger_entries (
           ledger_entry_ref, account_ref, credit_hold_ref, entry_type, amount, occurred_at
         ) VALUES ($1, $2, $3, 'RETURN', $4, $5)`,
        [
          `ledger-return:${current.credit_hold_ref}`,
          current.credit_account_ref,
          current.credit_hold_ref,
          current.credit_amount,
          now,
        ],
      );
      requireOne(
        await client.query(
          `UPDATE candidate_activity_leases SET status = 'RELEASED', released_at = $1,
                  version = version + 1
            WHERE subject_type = 'ANSWER_REVIEW_OBLIGATION' AND subject_ref = $2
              AND candidate_ref = $3 AND status = 'ACTIVE'`,
          [now, input.obligationRef, current.candidate_ref],
        ),
        "The Candidate activity lease changed before release.",
      );
      for (const [eventId, eventType, aggregateType, aggregateId, aggregateVersion, payload] of [
        [
          reviewEventId,
          "HumanAnswerReviewRecorded",
          "BlindReviewCommitment",
          context.commitment_ref,
          nextReview.version,
          {
            schema_version: "human-answer-review-recorded@1",
            human_review_ref: humanReviewRef,
            answer_submission_ref: current.answer_submission_ref,
            decision: input.command.decision,
          },
        ],
        [
          releaseEventId,
          "AnswerReviewSlotReleased",
          "AnswerReviewSlot",
          current.slot_ref,
          nextSlot.version,
          {
            schema_version: "answer-review-slot-released@1",
            slot_ref: current.slot_ref,
            next_offer_requested: true,
          },
        ],
        ...(resumeRevealRef !== null && revealEventId !== null
          ? [
              [
                revealEventId,
                "CandidateResumeRevealAuthorized",
                "EmployerResumeReveal",
                resumeRevealRef,
                1,
                {
                  schema_version: "candidate-resume-reveal-authorized@1",
                  reveal_ref: resumeRevealRef,
                  human_review_ref: humanReviewRef,
                  answer_submission_ref: current.answer_submission_ref,
                  authorization_reason: "ADVANCE_ELIGIBLE_HUMAN_REVIEW",
                },
              ] as const,
            ]
          : []),
      ] as const) {
        await client.query(
          `INSERT INTO domain_events (
             event_id, event_type, event_version, aggregate_type, aggregate_id,
             aggregate_version, correlation_id, occurred_at, payload
           ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            eventId,
            eventType,
            aggregateType,
            aggregateId,
            aggregateVersion,
            input.correlationId,
            now,
            JSON.stringify(payload),
          ],
        );
      }
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'OfferNextQueuedInterestRequested', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          outboxId,
          releaseEventId,
          `OfferNextQueuedInterestRequested:${current.slot_ref}:${nextSlot.version}`,
          input.correlationId,
          JSON.stringify({
            schema_version: "offer-next-queued-interest-requested@1",
            opportunity_ref: context.opportunity_ref,
            commitment_ref: context.commitment_ref,
            expected_commitment_version: nextReview.commitment.version,
            slot_ref: current.slot_ref,
            expected_slot_version: nextSlot.version,
            queue_policy_version: "onlyboth.interest-queue@1",
            public_seed: context.queue_public_seed,
          }),
          now,
        ],
      );
      const receipt = FunctionalHumanReviewReceiptSchema.parse({
        schema_version: "functional-human-review-receipt@3",
        command_id: commandId,
        event_ids:
          revealEventId === null
            ? [reviewEventId, releaseEventId]
            : [reviewEventId, releaseEventId, revealEventId],
        human_review_ref: humanReviewRef,
        answer_submission_ref: current.answer_submission_ref,
        obligation_ref: input.obligationRef,
        slot_ref: current.slot_ref,
        decision: input.command.decision,
        evidence_refs: input.command.evidence_refs,
        review_comment: input.command.review_comment,
        still_unknown: input.command.still_unknown,
        consulted_ai_output_ref: input.command.consulted_ai_output_ref,
        slot_state: "AVAILABLE",
        next_offer_requested: true,
        resume_reveal_ref: resumeRevealRef,
        reviewed_at: now.toISOString(),
      });
      await insertReceipt(client, {
        actorRef: input.actor.actorId,
        idempotencyKey: input.idempotencyKey,
        commandId,
        commandType: "RecordFunctionalHumanReview",
        fingerprint,
        receipt,
        occurredAt: now,
      });
      return receipt;
    });
  }

  private async requestOpenAwayFocusAutoSubmit(ids: FunctionalProductIdFactory): Promise<boolean> {
    return runTransaction(this.pool, async (client, now) => {
      const result = await client.query<FocusProjectionRow>(
        `SELECT focus.*
           FROM answer_session_focus_projections AS focus
           JOIN answer_sessions AS session
             ON session.answer_session_ref = focus.answer_session_ref
          WHERE session.status = 'ACTIVE'
            AND focus.policy_version = 'sandbox-focus-policy@1'
            AND focus.policy_state IN ('ACTIVE', 'WARNED')
            AND (
              focus.away_started_at IS NOT NULL
              OR (
                focus.system_dialog_until IS NOT NULL
                AND focus.system_dialog_until <= $1
                AND (focus.document_visibility = 'HIDDEN' OR focus.window_focus = 'BLURRED')
              )
            )
            AND focus.cumulative_away_ms
                + GREATEST(0, EXTRACT(EPOCH FROM (
                    $1 - COALESCE(focus.away_started_at, focus.system_dialog_until)
                  )) * 1000)
                >= 15000
          ORDER BY COALESCE(focus.away_started_at, focus.system_dialog_until),
                   focus.answer_session_ref
          LIMIT 1 FOR UPDATE OF focus SKIP LOCKED`,
        [now],
      );
      const focus = result.rows[0];
      if (focus === undefined) return false;
      const effectiveCumulative =
        focus.cumulative_away_ms +
        Math.max(
          0,
          now.getTime() -
            (focus.away_started_at?.getTime() ??
              focus.system_dialog_until?.getTime() ??
              now.getTime()),
        );
      requireOne(
        await client.query(
          `UPDATE answer_session_focus_projections
              SET policy_state = 'AUTO_SUBMIT_PENDING', cumulative_away_ms = $1,
                  away_started_at = NULL, auto_submit_requested_at = $2,
                  platform_settlement_due_at = $3, version = version + 1,
                  updated_at = $2
            WHERE answer_session_ref = $4 AND version = $5
              AND policy_state IN ('ACTIVE', 'WARNED')`,
          [
            effectiveCumulative,
            now,
            new Date(now.getTime() + 30_000),
            focus.answer_session_ref,
            focus.version,
          ],
        ),
        "The open Sandbox away interval changed before automatic submission.",
      );
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'SandboxFocusAutoSubmitRequested', 1, 'AnswerSession',
                   $2, $3, $4, $5, $6::jsonb)`,
        [
          ids.nextId("event"),
          focus.answer_session_ref,
          focus.version + 1,
          `focus-policy:${focus.answer_session_ref}`,
          now,
          JSON.stringify({
            schema_version: "sandbox-focus-auto-submit-requested@1",
            answer_session_ref: focus.answer_session_ref,
            countable_away_count: focus.countable_away_count,
            cumulative_away_ms: effectiveCumulative,
          }),
        ],
      );
      return true;
    });
  }

  private async failExpiredFocusPlatformWork(answerSessionRef: string): Promise<void> {
    await runTransaction(this.pool, async (client, now) => {
      await client.query(
        `UPDATE candidate_assistant_exchanges
            SET status = 'FAILED', error_code = 'FOCUS_POLICY_SETTLEMENT_TIMEOUT',
                completed_at = $1
          WHERE answer_session_ref = $2 AND status IN ('QUEUED', 'RUNNING')`,
        [now, answerSessionRef],
      );
      await client.query(
        `UPDATE answer_artifacts
            SET metadata_json = metadata_json || $1::jsonb, updated_at = $2
          WHERE answer_session_ref = $3 AND kind = 'VOICE_MEMO' AND state = 'VERIFIED'
            AND COALESCE(metadata_json->>'transcription_status', 'QUEUED')
                IN ('QUEUED', 'RUNNING')`,
        [
          JSON.stringify({
            transcription_status: "FAILED",
            transcription_error_code: "FOCUS_POLICY_SETTLEMENT_TIMEOUT",
          }),
          now,
          answerSessionRef,
        ],
      );
      await client.query(
        `UPDATE outbox_messages SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
          WHERE processed_at IS NULL
            AND ((message_type = 'CandidateAssistantTurnRequested'
                  AND payload->>'exchange_ref' IN (
                    SELECT exchange_ref FROM candidate_assistant_exchanges
                     WHERE answer_session_ref = $2
                  ))
              OR (message_type = 'VoiceTranscriptionRequested'
                  AND payload->>'artifact_ref' IN (
                    SELECT artifact_ref FROM answer_artifacts
                     WHERE answer_session_ref = $2 AND kind = 'VOICE_MEMO'
                  )))`,
        [now, answerSessionRef],
      );
    });
  }

  public async settleOneFocusPolicyAnswer(ids: FunctionalProductIdFactory): Promise<boolean> {
    await this.requestOpenAwayFocusAutoSubmit(ids);
    return this.expireOneAnswerSession(ids, true);
  }

  public async expireOneAnswerSession(
    ids: FunctionalProductIdFactory,
    focusOnly = false,
  ): Promise<boolean> {
    const dueResult = await this.pool.query<{
      answer_session_ref: string;
      candidate_ref: string;
      version: number;
      artifact_refs: string[];
      has_answer: boolean;
      has_pending_platform_work: boolean;
      focus_policy_state: "ACTIVE" | "WARNED" | "AUTO_SUBMIT_PENDING" | "AUTO_SUBMITTED";
      platform_settlement_due_at: Date | null;
      platform_settlement_expired: boolean;
    }>(
      `SELECT session.answer_session_ref, session.candidate_ref, session.version,
              COALESCE(array_agg(artifact.artifact_ref ORDER BY artifact.artifact_ref)
                FILTER (WHERE artifact.state = 'VERIFIED'), ARRAY[]::text[]) AS artifact_refs,
              COALESCE(bool_or(
                (artifact.kind = 'RICH_TEXT'
                  AND COALESCE((artifact.metadata_json->>'plain_text_length')::integer, 0) > 0)
                OR (artifact.kind = 'VOICE_MEMO' AND artifact.content_length > 0)
              ), false) AS has_answer,
              EXISTS (
                SELECT 1 FROM candidate_assistant_exchanges exchange
                 WHERE exchange.answer_session_ref = session.answer_session_ref
                   AND exchange.status IN ('QUEUED', 'RUNNING')
              ) OR COALESCE(bool_or(
                artifact.kind = 'VOICE_MEMO'
                AND COALESCE(artifact.metadata_json->>'transcription_status', 'QUEUED')
                    IN ('QUEUED', 'RUNNING')
              ), false) AS has_pending_platform_work,
              focus.policy_state AS focus_policy_state,
              focus.platform_settlement_due_at,
              COALESCE(focus.platform_settlement_due_at <= clock_timestamp(), false)
                AS platform_settlement_expired
         FROM answer_sessions AS session
         JOIN answer_session_focus_projections AS focus
           ON focus.answer_session_ref = session.answer_session_ref
         LEFT JOIN answer_artifacts AS artifact
           ON artifact.answer_session_ref = session.answer_session_ref
        WHERE session.status = 'ACTIVE'
          AND (($1::boolean AND focus.policy_state = 'AUTO_SUBMIT_PENDING')
            OR (NOT $1::boolean AND session.answer_due_at <= clock_timestamp()))
        GROUP BY session.answer_session_ref, session.candidate_ref, session.version,
                 focus.policy_state, focus.platform_settlement_due_at
        ORDER BY session.answer_due_at, session.answer_session_ref
        LIMIT 1`,
      [focusOnly],
    );
    const due = dueResult.rows[0];
    if (due === undefined) return false;
    if (due.has_pending_platform_work) {
      if (focusOnly && due.platform_settlement_due_at !== null && due.platform_settlement_expired) {
        await this.failExpiredFocusPlatformWork(due.answer_session_ref);
        return true;
      }
      return false;
    }
    if (due.has_answer) {
      await this.submitAnswer({
        actor: {
          role: "SYSTEM",
          actorId: focusOnly ? "system:focus-policy-worker" : "system:deadline-worker",
        },
        idempotencyKey: `${focusOnly ? "focus-policy" : "deadline"}-auto-submit:${due.answer_session_ref}`,
        correlationId: `${focusOnly ? "focus-policy" : "deadline"}:${due.answer_session_ref}`,
        answerSessionRef: due.answer_session_ref,
        finalArtifactRefs: due.artifact_refs.filter((ref) => ref.length > 0),
        expectedSessionVersion: due.version,
        submissionSource: focusOnly ? "FOCUS_POLICY_AUTO" : "DEADLINE_AUTO",
        ids,
      });
      return true;
    }
    return runTransaction(this.pool, async (client, now) => {
      const sourceResult = await client.query<{
        answer_session_ref: string;
        session_version: number;
        obligation_ref: string;
        obligation_version: number;
        invitation_ref: string;
        invitation_version: number;
        candidate_ref: string;
        interest_ref: string;
        slot_ref: string;
        slot_version: number;
        cohort_ref: string;
        cohort_version: number;
        cohort_seat_ref: string;
        commitment_ref: string;
        opportunity_ref: string;
        aggregate_json: unknown;
        queue_public_seed: string;
        credit_hold_ref: string;
        amount: number;
        account_ref: string;
        account_version: number;
        reservation_ref: string;
        reservation_version: number;
        focus_policy_state: string;
      }>(
        `SELECT session.answer_session_ref, session.version AS session_version,
                obligation.obligation_ref, obligation.version AS obligation_version,
                session.invitation_ref, invitation.version AS invitation_version,
                session.candidate_ref, obligation.interest_ref,
                obligation.slot_ref, slot.version AS slot_version,
                obligation.cohort_ref, cohort.version AS cohort_version,
                obligation.cohort_seat_ref, commitment.commitment_ref,
                commitment.opportunity_ref, commitment.aggregate_json,
                commitment.queue_public_seed, obligation.credit_hold_ref,
                hold.amount, hold.account_ref, account.version AS account_version,
                hold.reservation_ref, reservation.version AS reservation_version,
                focus.policy_state AS focus_policy_state
           FROM answer_sessions AS session
           JOIN answer_review_obligations AS obligation
             ON obligation.obligation_ref = session.obligation_ref
           JOIN answer_invitations AS invitation
             ON invitation.invitation_ref = session.invitation_ref
           JOIN answer_review_slots AS slot ON slot.slot_ref = obligation.slot_ref
           JOIN advancement_cohorts AS cohort ON cohort.cohort_ref = obligation.cohort_ref
           JOIN blind_review_commitments AS commitment
             ON commitment.commitment_ref = obligation.commitment_ref
           JOIN credit_holds AS hold ON hold.credit_hold_ref = obligation.credit_hold_ref
           JOIN credit_accounts AS account ON account.account_ref = hold.account_ref
           JOIN answer_review_slot_credit_reservations AS reservation
             ON reservation.reservation_ref = hold.reservation_ref
           JOIN answer_session_focus_projections AS focus
             ON focus.answer_session_ref = session.answer_session_ref
          WHERE session.answer_session_ref = $1 AND session.status = 'ACTIVE'
            AND (($3::boolean AND focus.policy_state = 'AUTO_SUBMIT_PENDING')
              OR (NOT $3::boolean AND session.answer_due_at <= $2))
          FOR UPDATE OF session, invitation, obligation, slot, cohort, commitment,
                        hold, account, reservation`,
        [due.answer_session_ref, now, focusOnly],
      );
      const source = sourceResult.rows[0];
      if (source === undefined) return false;
      const artifactCheck = await client.query(
        `SELECT 1 FROM answer_artifacts
          WHERE answer_session_ref = $1 AND state = 'VERIFIED'
            AND ((kind = 'RICH_TEXT'
                  AND COALESCE((metadata_json->>'plain_text_length')::integer, 0) > 0)
              OR (kind = 'VOICE_MEMO' AND content_length > 0)) LIMIT 1`,
        [source.answer_session_ref],
      );
      if (artifactCheck.rowCount !== 0) return false;
      const previousReview = parseReview(source.aggregate_json);
      const expiry = expireEmptyActiveBlindAnswer(previousReview, {
        obligationRef: source.obligation_ref,
        expiredAt: now.toISOString(),
      });
      const nextReview = expiry.state;
      const nextObligation = nextReview.obligations.find(
        ({ obligationRef }) => obligationRef === source.obligation_ref,
      )!;
      const nextSlot = nextReview.slots.find(({ slotRef }) => slotRef === source.slot_ref)!;
      const nextInterest = nextReview.interests.find(
        ({ interestRef }) => interestRef === source.interest_ref,
      )!;
      const nextInvitation = nextReview.invitations.find(
        ({ invitationRef }) => invitationRef === source.invitation_ref,
      )!;
      const nextCohort = nextReview.cohorts.find(
        ({ cohortRef }) => cohortRef === source.cohort_ref,
      )!;
      requireOne(
        await client.query(
          `UPDATE blind_review_commitments SET aggregate_json = $1::jsonb, updated_at = $2
            WHERE commitment_ref = $3 AND aggregate_json = $4::jsonb`,
          [JSON.stringify(nextReview), now, source.commitment_ref, JSON.stringify(previousReview)],
        ),
        "The Blind Review Commitment changed before empty expiry.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_sessions SET status = $1, closed_at = $2,
                version = version + 1, updated_at = $2
          WHERE answer_session_ref = $3 AND status = 'ACTIVE' AND version = $4`,
          [
            focusOnly ? "FOCUS_POLICY_TERMINATED_EMPTY" : "EXPIRED_EMPTY",
            now,
            source.answer_session_ref,
            source.session_version,
          ],
        ),
        "The Answer Session changed before empty expiry.",
      );
      if (focusOnly) {
        requireOne(
          await client.query(
            `UPDATE answer_session_focus_projections
                SET policy_state = 'AUTO_SUBMITTED', auto_submitted_at = $1,
                    away_started_at = NULL, version = version + 1, updated_at = $1
              WHERE answer_session_ref = $2 AND policy_state = 'AUTO_SUBMIT_PENDING'`,
            [now, source.answer_session_ref],
          ),
          "The Focus Policy changed before empty termination.",
        );
      }
      requireOne(
        await client.query(
          `UPDATE answer_review_obligations SET status = 'SETTLED', closed_at = $1,
                version = $2, updated_at = $1
          WHERE obligation_ref = $3 AND status = 'ANSWER_ACTIVE' AND version = $4`,
          [now, nextObligation.version, source.obligation_ref, source.obligation_version],
        ),
        "The obligation changed before empty expiry.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_slots SET status = 'AVAILABLE', current_obligation_ref = NULL,
                version = $1, updated_at = $2
          WHERE slot_ref = $3 AND status = 'ANSWER_ACTIVE' AND version = $4`,
          [nextSlot.version, now, source.slot_ref, source.slot_version],
        ),
        "The Slot changed before empty expiry.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_invitations SET status = 'EXPIRED', version = $1, updated_at = $2
          WHERE invitation_ref = $3 AND status = 'ACCEPTED' AND version = $4`,
          [nextInvitation.version, now, source.invitation_ref, source.invitation_version],
        ),
        "The accepted Invitation changed before empty expiry.",
      );
      requireOne(
        await client.query(
          `UPDATE candidate_interests SET status = 'OFFER_EXPIRED', version = $1, updated_at = $2
          WHERE interest_ref = $3 AND status = 'APPLICATION_ACTIVE'`,
          [nextInterest.version, now, source.interest_ref],
        ),
        "The Interest changed before empty expiry.",
      );
      requireOne(
        await client.query(
          `UPDATE advancement_cohorts SET submitted_count = $1, reviewed_count = $2,
                state = $3, version = $4, updated_at = $5
          WHERE cohort_ref = $6 AND version = $7`,
          [
            nextCohort.submittedCount,
            nextCohort.reviewedCount,
            nextCohort.state,
            nextCohort.version,
            now,
            source.cohort_ref,
            source.cohort_version,
          ],
        ),
        "The Cohort changed before empty expiry.",
      );
      requireOne(
        await client.query(
          `UPDATE advancement_cohort_seats SET status = 'OPEN', obligation_ref = NULL,
                answer_submission_ref = NULL, human_review_ref = NULL,
                version = version + 1, updated_at = $1
          WHERE cohort_seat_ref = $2 AND status = 'RESERVED' AND obligation_ref = $3`,
          [now, source.cohort_seat_ref, source.obligation_ref],
        ),
        "The Cohort Seat changed before empty expiry.",
      );
      requireOne(
        await client.query(
          `UPDATE credit_holds SET status = 'RETURNED', settled_at = $1
          WHERE credit_hold_ref = $2 AND status = 'HELD'`,
          [now, source.credit_hold_ref],
        ),
        "The Attention hold changed before empty expiry.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_slot_credit_reservations SET state = 'RESERVED',
                version = version + 1, updated_at = $1
          WHERE reservation_ref = $2 AND state = 'BOUND' AND version = $3`,
          [now, source.reservation_ref, source.reservation_version],
        ),
        "The Slot reservation changed before empty expiry.",
      );
      requireOne(
        await client.query(
          `UPDATE credit_accounts SET held_credits = held_credits - $1,
                reserved_credits = reserved_credits + $1, version = version + 1
          WHERE account_ref = $2 AND version = $3 AND held_credits >= $1`,
          [source.amount, source.account_ref, source.account_version],
        ),
        "The Attention account changed before empty expiry.",
      );
      await client.query(
        `INSERT INTO credit_ledger_entries (
           ledger_entry_ref, account_ref, credit_hold_ref, entry_type, amount, occurred_at
         ) VALUES ($1, $2, $3, 'RETURN', $4, $5)`,
        [
          `ledger-return:${source.credit_hold_ref}`,
          source.account_ref,
          source.credit_hold_ref,
          source.amount,
          now,
        ],
      );
      await client.query(
        `UPDATE candidate_activity_leases SET status = 'RELEASED', released_at = $1,
                version = version + 1
          WHERE subject_type = 'ANSWER_REVIEW_OBLIGATION' AND subject_ref = $2
            AND status = 'ACTIVE'`,
        [now, source.obligation_ref],
      );
      const eventId = ids.nextId("event");
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, $2, 1, 'BlindReviewCommitment',
                   $3, $4, $5, $6, $7::jsonb)`,
        [
          eventId,
          focusOnly ? "FocusPolicyAnswerTerminatedEmpty" : "EmptyAnswerSessionExpired",
          source.commitment_ref,
          nextReview.version,
          `${focusOnly ? "focus-policy" : "deadline"}:${source.answer_session_ref}`,
          now,
          JSON.stringify({
            schema_version: focusOnly
              ? "focus-policy-answer-terminated-empty@1"
              : "empty-answer-session-expired@1",
            answer_session_ref: source.answer_session_ref,
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'OfferNextQueuedInterestRequested', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          ids.nextId("outbox"),
          eventId,
          `OfferNextQueuedInterestRequested:${source.slot_ref}:${nextSlot.version}`,
          `${focusOnly ? "focus-policy" : "deadline"}:${source.answer_session_ref}`,
          JSON.stringify({
            schema_version: "offer-next-queued-interest-requested@1",
            opportunity_ref: source.opportunity_ref,
            commitment_ref: source.commitment_ref,
            expected_commitment_version: nextReview.commitment.version,
            slot_ref: source.slot_ref,
            expected_slot_version: nextSlot.version,
            queue_policy_version: "onlyboth.interest-queue@1",
            public_seed: source.queue_public_seed,
          }),
          now,
        ],
      );
      return true;
    });
  }

  public async settleOneOverdueEmployerReview(ids: FunctionalProductIdFactory): Promise<boolean> {
    return runTransaction(this.pool, async (client, now) => {
      const result = await client.query<{
        commitment_ref: string;
        aggregate_json: unknown;
        reviewer_ref: string;
        obligation_ref: string;
        obligation_version: number;
        review_due_at: Date;
        answer_submission_ref: string;
        slot_ref: string;
        slot_version: number;
        interest_ref: string;
        candidate_ref: string;
        cohort_ref: string;
        cohort_version: number;
        cohort_seat_ref: string;
        credit_hold_ref: string;
        credit_amount: number;
        employer_credit_account_ref: string;
        employer_credit_account_version: number;
        reservation_ref: string;
        reservation_version: number;
        candidate_credit_account_ref: string;
        candidate_credit_account_version: number;
        candidate_available_credits: number;
        candidate_consumed_credits: number;
        employer_wallet_version: number;
        employer_committed_credits: number;
      }>(
        `SELECT commitment.commitment_ref, commitment.aggregate_json,
                commitment.reviewer_ref, obligation.obligation_ref,
                obligation.version AS obligation_version, obligation.review_due_at,
                obligation.answer_submission_ref, obligation.slot_ref,
                slot.version AS slot_version, obligation.interest_ref,
                obligation.candidate_ref, obligation.cohort_ref,
                cohort.version AS cohort_version, obligation.cohort_seat_ref,
                obligation.credit_hold_ref, hold.amount AS credit_amount,
                hold.account_ref AS employer_credit_account_ref,
                account.version AS employer_credit_account_version,
                hold.reservation_ref, reservation.version AS reservation_version,
                candidate_credit.account_ref AS candidate_credit_account_ref,
                candidate_credit.version AS candidate_credit_account_version,
                candidate_credit.available_credits AS candidate_available_credits,
                candidate_credit.consumed_credits AS candidate_consumed_credits,
                wallet.version AS employer_wallet_version,
                wallet.committed_credits AS employer_committed_credits
           FROM answer_review_obligations AS obligation
           JOIN blind_review_commitments AS commitment
             ON commitment.commitment_ref = obligation.commitment_ref
           JOIN answer_review_slots AS slot ON slot.slot_ref = obligation.slot_ref
           JOIN advancement_cohorts AS cohort ON cohort.cohort_ref = obligation.cohort_ref
           JOIN answer_submissions AS submission
             ON submission.answer_submission_ref = obligation.answer_submission_ref
           JOIN answer_sessions AS session
             ON session.answer_session_ref = submission.answer_session_ref
           JOIN candidate_credit_accounts AS candidate_credit
             ON candidate_credit.account_ref = session.candidate_credit_account_ref
           JOIN credit_holds AS hold ON hold.credit_hold_ref = obligation.credit_hold_ref
           JOIN answer_review_slot_credit_reservations AS reservation
             ON reservation.reservation_ref = hold.reservation_ref
           JOIN credit_accounts AS account ON account.account_ref = hold.account_ref
           JOIN employer_attention_wallets AS wallet
             ON wallet.owner_ref = commitment.reviewer_ref
          WHERE obligation.status = 'REVIEW_PENDING'
            AND obligation.review_due_at <= clock_timestamp()
          ORDER BY obligation.review_due_at, obligation.obligation_ref
          LIMIT 1
          FOR UPDATE OF obligation, commitment, slot, cohort, candidate_credit,
                        hold, reservation, account, wallet SKIP LOCKED`,
      );
      const source = result.rows[0];
      if (source === undefined) return false;
      if (
        source.answer_submission_ref === null ||
        source.review_due_at === null ||
        source.candidate_consumed_credits < 1 ||
        source.employer_committed_credits < source.credit_amount
      ) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The overdue Review obligation cannot be settled consistently.",
        );
      }
      const previousReview = parseReview(source.aggregate_json);
      const settlement = settleEmployerReviewBreach(previousReview, {
        obligationRef: source.obligation_ref,
        reviewDueAt: source.review_due_at.toISOString(),
        breachedAt: now.toISOString(),
      });
      const nextReview = settlement.state;
      const nextObligation = nextReview.obligations.find(
        ({ obligationRef }) => obligationRef === source.obligation_ref,
      );
      const nextSlot = nextReview.slots.find(({ slotRef }) => slotRef === source.slot_ref);
      const nextInterest = nextReview.interests.find(
        ({ interestRef }) => interestRef === source.interest_ref,
      );
      const nextCohort = nextReview.cohorts.find(
        ({ cohortRef }) => cohortRef === source.cohort_ref,
      );
      const nextSeat = nextCohort?.seats.find(
        ({ cohortSeatRef }) => cohortSeatRef === source.cohort_seat_ref,
      );
      if (!nextObligation || !nextSlot || !nextInterest || !nextCohort || !nextSeat) {
        throw new FunctionalProductApplicationError(
          "INVALID_STATE",
          "The Employer Review breach transition is incomplete.",
        );
      }
      const breachRef = ids.nextId("employer-review-breach");
      const breachEventId = ids.nextId("event");
      const creditEventId = ids.nextId("event");
      const slotEventId = ids.nextId("event");
      const outboxId = ids.nextId("outbox");
      const candidateLedgerRef = `candidate-credit-return:${source.obligation_ref}`;
      const employerForfeitLedgerRef = `ledger-forfeit:${source.credit_hold_ref}`;
      const walletForfeitLedgerRef = `wallet-forfeit:${source.obligation_ref}`;

      requireOne(
        await client.query(
          `UPDATE blind_review_commitments SET aggregate_json = $1::jsonb, updated_at = $2
            WHERE commitment_ref = $3 AND aggregate_json = $4::jsonb`,
          [JSON.stringify(nextReview), now, source.commitment_ref, JSON.stringify(previousReview)],
        ),
        "The Blind Review Commitment changed before breach settlement.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_obligations
              SET status = 'BREACH_SETTLED', closed_at = $1, version = $2, updated_at = $1
            WHERE obligation_ref = $3 AND status = 'REVIEW_PENDING' AND version = $4`,
          [now, nextObligation.version, source.obligation_ref, source.obligation_version],
        ),
        "The overdue Review obligation changed before breach settlement.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_slots
              SET status = 'RETIRED', current_obligation_ref = NULL,
                  version = $1, updated_at = $2
            WHERE slot_ref = $3 AND status = 'REVIEW_PENDING' AND version = $4`,
          [nextSlot.version, now, source.slot_ref, source.slot_version],
        ),
        "The breached Review Slot changed before retirement.",
      );
      requireOne(
        await client.query(
          `UPDATE candidate_interests SET status = 'EMPLOYER_BREACH', version = $1, updated_at = $2
            WHERE interest_ref = $3 AND status = 'APPLICATION_SUBMITTED'`,
          [nextInterest.version, now, source.interest_ref],
        ),
        "The Candidate Interest changed before breach notice.",
      );
      requireOne(
        await client.query(
          `UPDATE advancement_cohorts SET state = 'CLOSED_NO_ALLOCATION',
                  version = $1, updated_at = $2
            WHERE cohort_ref = $3 AND version = $4`,
          [nextCohort.version, now, source.cohort_ref, source.cohort_version],
        ),
        "The Advancement Cohort changed before breach closure.",
      );
      requireOne(
        await client.query(
          `UPDATE advancement_cohort_seats SET status = 'BREACH_SETTLED',
                  version = version + 1, updated_at = $1
            WHERE cohort_seat_ref = $2 AND status = 'ANSWER_SUBMITTED'
              AND obligation_ref = $3 AND answer_submission_ref = $4`,
          [now, source.cohort_seat_ref, source.obligation_ref, source.answer_submission_ref],
        ),
        "The Advancement Cohort Seat changed before breach settlement.",
      );
      requireOne(
        await client.query(
          `UPDATE credit_holds SET status = 'FORFEITED', settled_at = $1
            WHERE credit_hold_ref = $2 AND status = 'HELD'`,
          [now, source.credit_hold_ref],
        ),
        "The breached Employer Credit Hold changed before forfeiture.",
      );
      requireOne(
        await client.query(
          `UPDATE answer_review_slot_credit_reservations
              SET state = 'RELEASED', version = version + 1, updated_at = $1
            WHERE reservation_ref = $2 AND state = 'BOUND' AND version = $3`,
          [now, source.reservation_ref, source.reservation_version],
        ),
        "The breached Slot reservation changed before release.",
      );
      requireOne(
        await client.query(
          `UPDATE credit_accounts SET held_credits = held_credits - $1,
                  version = version + 1
            WHERE account_ref = $2 AND version = $3 AND held_credits >= $1`,
          [
            source.credit_amount,
            source.employer_credit_account_ref,
            source.employer_credit_account_version,
          ],
        ),
        "The Employer Credit Account changed before forfeiture.",
      );
      await client.query(
        `INSERT INTO credit_ledger_entries (
           ledger_entry_ref, account_ref, credit_hold_ref, entry_type, amount, occurred_at
         ) VALUES ($1, $2, $3, 'FORFEIT', $4, $5)`,
        [
          employerForfeitLedgerRef,
          source.employer_credit_account_ref,
          source.credit_hold_ref,
          source.credit_amount,
          now,
        ],
      );
      requireOne(
        await client.query(
          `UPDATE employer_attention_wallets
              SET committed_credits = committed_credits - $1,
                  forfeited_credits = forfeited_credits + $1,
                  version = version + 1, updated_at = $2
            WHERE owner_ref = $3 AND version = $4 AND committed_credits >= $1`,
          [source.credit_amount, now, source.reviewer_ref, source.employer_wallet_version],
        ),
        "The Employer Attention Wallet changed before forfeiture.",
      );
      await client.query(
        `INSERT INTO employer_attention_wallet_ledger (
           ledger_entry_ref, owner_ref, entry_type, amount, subject_ref, occurred_at
         ) VALUES ($1, $2, 'FORFEIT', $3, $4, $5)`,
        [
          walletForfeitLedgerRef,
          source.reviewer_ref,
          source.credit_amount,
          source.obligation_ref,
          now,
        ],
      );
      requireOne(
        await client.query(
          `UPDATE candidate_credit_accounts
              SET available_credits = available_credits + 1,
                  consumed_credits = consumed_credits - 1,
                  version = version + 1, updated_at = $1
            WHERE account_ref = $2 AND version = $3 AND consumed_credits >= 1`,
          [now, source.candidate_credit_account_ref, source.candidate_credit_account_version],
        ),
        "The Candidate Credit Account changed before compensation.",
      );
      await client.query(
        `INSERT INTO candidate_credit_ledger_entries (
           ledger_entry_ref, account_ref, entry_type, amount, subject_ref, occurred_at
         ) VALUES ($1, $2, 'RETURN', 1, $3, $4)`,
        [candidateLedgerRef, source.candidate_credit_account_ref, source.obligation_ref, now],
      );
      requireOne(
        await client.query(
          `UPDATE candidate_activity_leases SET status = 'RELEASED', released_at = $1,
                  version = version + 1
            WHERE subject_type = 'ANSWER_REVIEW_OBLIGATION' AND subject_ref = $2
              AND candidate_ref = $3 AND status = 'ACTIVE'`,
          [now, source.obligation_ref, source.candidate_ref],
        ),
        "The Candidate activity lease changed before breach compensation.",
      );
      await client.query(
        `INSERT INTO employer_reliability_accounts (
           reviewer_ref, settled_breach_count, penalty_points, version,
           created_at, updated_at
         ) VALUES ($1, 1, 1, 1, $2, $2)
         ON CONFLICT (reviewer_ref) DO UPDATE
           SET settled_breach_count = employer_reliability_accounts.settled_breach_count + 1,
               penalty_points = employer_reliability_accounts.penalty_points + 1,
               version = employer_reliability_accounts.version + 1,
               updated_at = EXCLUDED.updated_at`,
        [source.reviewer_ref, now],
      );
      await client.query(
        `INSERT INTO employer_review_breaches (
           breach_ref, obligation_ref, answer_submission_ref, candidate_ref,
           reviewer_ref, slot_ref, notice_code, candidate_credit_account_ref,
           candidate_credit_return_ledger_ref, employer_credit_hold_ref,
           employer_credit_forfeit_ledger_ref, employer_wallet_forfeit_ledger_ref,
           reliability_penalty_points, breached_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'HUMAN_REVIEW_SLA_EXPIRED',
                   $7, $8, $9, $10, $11, 1, $12)`,
        [
          breachRef,
          source.obligation_ref,
          source.answer_submission_ref,
          source.candidate_ref,
          source.reviewer_ref,
          source.slot_ref,
          source.candidate_credit_account_ref,
          candidateLedgerRef,
          source.credit_hold_ref,
          employerForfeitLedgerRef,
          walletForfeitLedgerRef,
          now,
        ],
      );
      for (const [eventId, eventType, aggregateType, aggregateId, aggregateVersion, payload] of [
        [
          breachEventId,
          "EmployerAnswerReviewBreached",
          "BlindReviewCommitment",
          source.commitment_ref,
          nextReview.version,
          {
            schema_version: "employer-answer-review-breached@1",
            breach_ref: breachRef,
            obligation_ref: source.obligation_ref,
            notice_code: "HUMAN_REVIEW_SLA_EXPIRED",
          },
        ],
        [
          creditEventId,
          "CandidateApplicationCreditReturned",
          "CandidateCreditAccount",
          source.candidate_credit_account_ref,
          source.candidate_credit_account_version + 1,
          {
            schema_version: "candidate-application-credit-returned@1",
            obligation_ref: source.obligation_ref,
            amount: 1,
            reason: "EMPLOYER_REVIEW_BREACH",
          },
        ],
        [
          slotEventId,
          "AnswerReviewSlotRetired",
          "AnswerReviewSlot",
          source.slot_ref,
          nextSlot.version,
          {
            schema_version: "answer-review-slot-retired@1",
            obligation_ref: source.obligation_ref,
            reason: "EMPLOYER_REVIEW_BREACH",
          },
        ],
      ] as const) {
        await client.query(
          `INSERT INTO domain_events (
             event_id, event_type, event_version, aggregate_type, aggregate_id,
             aggregate_version, correlation_id, occurred_at, payload
           ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            eventId,
            eventType,
            aggregateType,
            aggregateId,
            aggregateVersion,
            `review-breach:${source.obligation_ref}`,
            now,
            JSON.stringify(payload),
          ],
        );
      }
      await client.query(
        `INSERT INTO outbox_messages (
           message_id, message_type, message_version, event_id, idempotency_key,
           correlation_id, payload, available_at
         ) VALUES ($1, 'EmployerReviewBreachNoticeRequested', 1, $2, $3, $4, $5::jsonb, $6)`,
        [
          outboxId,
          breachEventId,
          `EmployerReviewBreachNoticeRequested:${source.obligation_ref}:1`,
          `review-breach:${source.obligation_ref}`,
          JSON.stringify({
            schema_version: "employer-review-breach-notice-requested@1",
            breach_ref: breachRef,
            obligation_ref: source.obligation_ref,
            candidate_ref: source.candidate_ref,
            candidate_credit_returned: 1,
          }),
          now,
        ],
      );
      return true;
    });
  }

  public async claimAssistantExchange(
    _workerId: string,
  ): Promise<CandidateAssistantContext | null> {
    return runTransaction(this.pool, async (client) => {
      const result = await client.query<{
        exchange_ref: string;
        answer_session_ref: string;
        candidate_ref: string;
        user_artifact_ref: string;
        critical_question: string;
        allowed_assumptions: unknown;
        latest_rich_text_artifact_ref: string | null;
      }>(
        `SELECT exchange.exchange_ref, exchange.answer_session_ref,
                exchange.candidate_ref, exchange.user_artifact_ref,
                contract.contract_json->>'critical_question' AS critical_question,
                contract.contract_json->'allowed_assumptions' AS allowed_assumptions,
                session.latest_rich_text_artifact_ref
           FROM candidate_assistant_exchanges AS exchange
           JOIN answer_sessions AS session
             ON session.answer_session_ref = exchange.answer_session_ref
           JOIN answer_review_obligations AS obligation
             ON obligation.obligation_ref = session.obligation_ref
           JOIN blind_review_commitments AS commitment
             ON commitment.commitment_ref = obligation.commitment_ref
           JOIN sealed_capability_contracts AS contract
             ON contract.contract_version_ref = commitment.contract_version_ref
          WHERE exchange.status = 'QUEUED' AND session.status = 'ACTIVE'
          ORDER BY exchange.created_at, exchange.exchange_ref
          LIMIT 1 FOR UPDATE OF exchange SKIP LOCKED`,
      );
      const row = result.rows[0];
      if (row === undefined) return null;
      requireOne(
        await client.query(
          `UPDATE candidate_assistant_exchanges SET status = 'RUNNING'
          WHERE exchange_ref = $1 AND status = 'QUEUED'`,
          [row.exchange_ref],
        ),
        "The assistant exchange changed before claim.",
      );
      const artifactsResult = await client.query<ArtifactRow>(
        `SELECT artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
                content_type, content_length, sha256, state, revision,
                metadata_json, created_at
           FROM answer_artifacts WHERE answer_session_ref = $1
          ORDER BY created_at, revision, artifact_ref`,
        [row.answer_session_ref],
      );
      const artifacts = artifactsResult.rows.map(artifactRecord);
      const userArtifact = artifacts.find(
        ({ artifactRef }) => artifactRef === row.user_artifact_ref,
      );
      if (userArtifact === undefined)
        throw new Error("Assistant exchange user Artifact is missing.");
      return {
        exchangeRef: row.exchange_ref,
        answerSessionRef: row.answer_session_ref,
        candidateRef: row.candidate_ref,
        userArtifact,
        question: row.critical_question,
        allowedAssumptions: Array.isArray(row.allowed_assumptions)
          ? row.allowed_assumptions.map(String)
          : [],
        currentDraftArtifact:
          row.latest_rich_text_artifact_ref === null
            ? null
            : (artifacts.find(
                ({ artifactRef }) => artifactRef === row.latest_rich_text_artifact_ref,
              ) ?? null),
        priorArtifacts: artifacts.filter(
          ({ kind, artifactRef }) => kind === "GPT_TURN" && artifactRef !== row.user_artifact_ref,
        ),
      };
    });
  }

  public async completeAssistantExchange(input: {
    readonly exchangeRef: string;
    readonly artifactRef: string;
    readonly objectKey: string;
    readonly contentLength: number;
    readonly sha256: string;
    readonly providerResponseId: string;
    readonly completedAt: Date;
  }): Promise<void> {
    await runTransaction(this.pool, async (client) => {
      const result = await client.query<{
        answer_session_ref: string;
        candidate_ref: string;
        ordinal: number;
      }>(
        `SELECT answer_session_ref, candidate_ref, ordinal
           FROM candidate_assistant_exchanges
          WHERE exchange_ref = $1 AND status = 'RUNNING' FOR UPDATE`,
        [input.exchangeRef],
      );
      const row = result.rows[0];
      if (row === undefined) return;
      await client.query(
        `INSERT INTO answer_artifacts (
           artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
           content_type, content_length, sha256, state, revision, metadata_json,
           verified_at, created_at, updated_at
         ) VALUES ($1, $2, $3, 'GPT_TURN', $4, 'text/plain; charset=utf-8',
                   $5, $6, 'VERIFIED', $7, '{"role":"ASSISTANT"}'::jsonb,
                   $8, $8, $8)`,
        [
          input.artifactRef,
          row.answer_session_ref,
          row.candidate_ref,
          input.objectKey,
          input.contentLength,
          input.sha256,
          row.ordinal * 2,
          input.completedAt,
        ],
      );
      requireOne(
        await client.query(
          `UPDATE candidate_assistant_exchanges SET status = 'COMPLETED',
                assistant_artifact_ref = $1, provider_response_id = $2,
                completed_at = $3
          WHERE exchange_ref = $4 AND status = 'RUNNING'`,
          [input.artifactRef, input.providerResponseId, input.completedAt, input.exchangeRef],
        ),
        "The assistant exchange changed before completion.",
      );
      await client.query(
        `UPDATE outbox_messages SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
          WHERE message_type = 'CandidateAssistantTurnRequested'
            AND payload->>'exchange_ref' = $2 AND processed_at IS NULL`,
        [input.completedAt, input.exchangeRef],
      );
    });
  }

  public async failAssistantExchange(
    exchangeRef: string,
    errorCode: string,
    completedAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE candidate_assistant_exchanges SET status = 'FAILED', error_code = $1,
              completed_at = $2
        WHERE exchange_ref = $3 AND status IN ('QUEUED', 'RUNNING')`,
      [errorCode.slice(0, 200), completedAt, exchangeRef],
    );
    await this.pool.query(
      `UPDATE outbox_messages SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
        WHERE message_type = 'CandidateAssistantTurnRequested'
          AND payload->>'exchange_ref' = $2 AND processed_at IS NULL`,
      [completedAt, exchangeRef],
    );
  }

  public async claimVoiceTranscription(
    _workerId: string,
  ): Promise<VoiceTranscriptionContext | null> {
    return runTransaction(this.pool, async (client) => {
      const result = await client.query<ArtifactRow>(
        `SELECT artifact.artifact_ref, artifact.answer_session_ref,
                artifact.candidate_ref, artifact.kind, artifact.object_key,
                artifact.content_type, artifact.content_length, artifact.sha256,
                artifact.state, artifact.revision, artifact.metadata_json,
                artifact.created_at
           FROM answer_artifacts AS artifact
           JOIN answer_sessions AS session
             ON session.answer_session_ref = artifact.answer_session_ref
          WHERE artifact.kind = 'VOICE_MEMO' AND artifact.state = 'VERIFIED'
            AND session.status = 'ACTIVE'
            AND COALESCE(artifact.metadata_json->>'transcription_status', 'QUEUED') = 'QUEUED'
          ORDER BY artifact.created_at, artifact.artifact_ref
          LIMIT 1 FOR UPDATE OF artifact SKIP LOCKED`,
      );
      const row = result.rows[0];
      if (row === undefined) return null;
      requireOne(
        await client.query(
          `UPDATE answer_artifacts
            SET metadata_json = metadata_json || '{"transcription_status":"RUNNING"}'::jsonb,
                updated_at = clock_timestamp()
          WHERE artifact_ref = $1 AND state = 'VERIFIED'`,
          [row.artifact_ref],
        ),
        "The Voice Memo changed before transcription claim.",
      );
      return {
        artifact: artifactRecord(row),
        candidateRef: row.candidate_ref,
        answerSessionRef: row.answer_session_ref,
      };
    });
  }

  public async completeVoiceTranscription(input: {
    readonly sourceArtifactRef: string;
    readonly transcriptArtifactRef: string;
    readonly objectKey: string;
    readonly contentLength: number;
    readonly sha256: string;
    readonly completedAt: Date;
  }): Promise<void> {
    await runTransaction(this.pool, async (client) => {
      const result = await client.query<ArtifactRow>(
        `SELECT artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
                content_type, content_length, sha256, state, revision,
                metadata_json, created_at
           FROM answer_artifacts WHERE artifact_ref = $1 FOR UPDATE`,
        [input.sourceArtifactRef],
      );
      const source = result.rows[0];
      if (source === undefined || source.state !== "VERIFIED") return;
      await client.query(
        `INSERT INTO answer_artifacts (
           artifact_ref, answer_session_ref, candidate_ref, kind, object_key,
           content_type, content_length, sha256, state, revision, metadata_json,
           verified_at, created_at, updated_at
         ) VALUES ($1, $2, $3, 'VOICE_TRANSCRIPT', $4, 'text/plain; charset=utf-8',
                   $5, $6, 'VERIFIED', $7, $8::jsonb, $9, $9, $9)`,
        [
          input.transcriptArtifactRef,
          source.answer_session_ref,
          source.candidate_ref,
          input.objectKey,
          input.contentLength,
          input.sha256,
          source.revision,
          JSON.stringify({ source_artifact_ref: input.sourceArtifactRef }),
          input.completedAt,
        ],
      );
      requireOne(
        await client.query(
          `UPDATE answer_artifacts
            SET metadata_json = metadata_json || $1::jsonb, updated_at = $2
          WHERE artifact_ref = $3 AND state = 'VERIFIED'`,
          [
            JSON.stringify({
              transcription_status: "COMPLETED",
              transcript_artifact_ref: input.transcriptArtifactRef,
            }),
            input.completedAt,
            input.sourceArtifactRef,
          ],
        ),
        "The Voice Memo changed before transcription completion.",
      );
      await client.query(
        `UPDATE outbox_messages SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
          WHERE message_type = 'VoiceTranscriptionRequested'
            AND payload->>'artifact_ref' = $2 AND processed_at IS NULL`,
        [input.completedAt, input.sourceArtifactRef],
      );
    });
  }

  public async failVoiceTranscription(
    sourceArtifactRef: string,
    errorCode: string,
    completedAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE answer_artifacts
          SET metadata_json = metadata_json || $1::jsonb, updated_at = $2
        WHERE artifact_ref = $3 AND state = 'VERIFIED'`,
      [
        JSON.stringify({
          transcription_status: "FAILED",
          transcription_error_code: errorCode.slice(0, 200),
        }),
        completedAt,
        sourceArtifactRef,
      ],
    );
    await this.pool.query(
      `UPDATE outbox_messages SET processed_at = $1, lease_owner = NULL, lease_expires_at = NULL
        WHERE message_type = 'VoiceTranscriptionRequested'
          AND payload->>'artifact_ref' = $2 AND processed_at IS NULL`,
      [completedAt, sourceArtifactRef],
    );
  }

  public async cleanupOrphanArtifact(before: Date): Promise<string | null> {
    const result = await this.pool.query<{ object_key: string }>(
      `DELETE FROM answer_artifacts
        WHERE artifact_ref = (
          SELECT artifact_ref FROM answer_artifacts
           WHERE (state = 'UPLOAD_ISSUED' AND created_at < $1)
              OR (
                state = 'VERIFIED' AND kind = 'RICH_TEXT' AND created_at < $1
                AND EXISTS (
                  SELECT 1 FROM answer_submissions submission
                   WHERE submission.answer_session_ref = answer_artifacts.answer_session_ref
                     AND NOT submission.artifact_manifest_json ? answer_artifacts.artifact_ref
                )
              )
           ORDER BY created_at, artifact_ref LIMIT 1
        )
      RETURNING object_key`,
      [before],
    );
    return result.rows[0]?.object_key ?? null;
  }
}
