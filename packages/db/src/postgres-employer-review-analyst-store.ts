import { createHash } from "node:crypto";

import type {
  AnswerAnalysisContext,
  ClaimedAnswerAnalysisMessage,
  EmployerReviewAnalystWorkerStore,
  ObjectStorePort,
} from "@onlyboth/application";
import {
  AnswerEvidenceEdgeDraftSchema,
  AnswerProcessEvidenceSchema,
  BuildAnswerEvidenceEdgeInputSchema,
  ReviewCriterionSchema,
  type AnswerEvidenceEdgeDraft,
  type BuildAnswerEvidenceEdgeInput,
} from "@onlyboth/contracts";
import type { Pool, PoolClient } from "pg";

interface ClaimedRow {
  readonly message_id: string;
  readonly correlation_id: string;
  readonly payload: unknown;
  readonly attempt_count: number;
  readonly lease_owner: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function digest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function textFromRichDocument(value: unknown): string {
  if (!record(value)) return "";
  const own = typeof value.text === "string" ? value.text : "";
  const children = Array.isArray(value.content)
    ? value.content.map(textFromRichDocument).filter(Boolean).join("\n")
    : "";
  return [own, children].filter(Boolean).join("\n").trim();
}

function disclosedTraceText(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!record(parsed) || !Array.isArray(parsed.turns)) return value;
    return parsed.turns
      .flatMap((turn) =>
        record(turn) && typeof turn.content === "string"
          ? [`${String(turn.role ?? "TURN")}: ${turn.content}`]
          : [],
      )
      .join("\n");
  } catch {
    return value;
  }
}

async function assertLease(
  client: PoolClient,
  message: ClaimedAnswerAnalysisMessage,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM outbox_messages
      WHERE message_id = $1 AND lease_owner = $2 AND attempt_count = $3
        AND processed_at IS NULL AND lease_expires_at >= clock_timestamp()
      FOR UPDATE`,
    [message.messageId, message.leaseOwner, message.attempt],
  );
  if (result.rowCount !== 1) throw new Error("Employer review analysis lease was lost.");
}

async function markProcessed(
  client: PoolClient,
  message: ClaimedAnswerAnalysisMessage,
  outcome: string,
): Promise<void> {
  await client.query(
    `INSERT INTO inbox_messages (
       consumer, message_id, idempotency_key, payload_hash, result_json, processed_at
     ) VALUES ('employer-review-analyst', $1, $1, $2, $3::jsonb, clock_timestamp())
     ON CONFLICT (consumer, message_id) DO NOTHING`,
    [message.messageId, digest(message.messageId), JSON.stringify({ outcome })],
  );
  const result = await client.query(
    `UPDATE outbox_messages
        SET processed_at = clock_timestamp(), lease_owner = NULL, lease_expires_at = NULL
      WHERE message_id = $1 AND lease_owner = $2 AND attempt_count = $3
        AND processed_at IS NULL`,
    [message.messageId, message.leaseOwner, message.attempt],
  );
  if (result.rowCount !== 1) throw new Error("Employer review analysis message changed.");
}

export interface EmployerReviewAnalystPromptPins {
  readonly promptId: string;
  readonly promptVersion: string;
  readonly promptHash: string;
  readonly inputSchemaVersion: string;
  readonly outputSchemaVersion: string;
  readonly runtimeMode: "LIVE" | "GOLDEN_REPLAY";
  readonly adapterId: string;
  readonly requestedModel: string;
}

export class PostgresEmployerReviewAnalystStore implements EmployerReviewAnalystWorkerStore {
  public constructor(
    private readonly pool: Pool,
    private readonly objects: ObjectStorePort,
    private readonly prompt: EmployerReviewAnalystPromptPins,
  ) {}

  public async claimNext(
    workerId: string,
    leaseSeconds: number,
  ): Promise<ClaimedAnswerAnalysisMessage | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ClaimedRow>(
        `WITH next_message AS (
           SELECT message_id FROM outbox_messages
            WHERE processed_at IS NULL AND available_at <= clock_timestamp()
              AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
              AND message_type = 'FunctionalAnswerSubmittedForReview'
            ORDER BY available_at, created_at, message_id
            FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE outbox_messages AS message
            SET lease_owner = $1,
                lease_expires_at = clock_timestamp() + ($2 * interval '1 second'),
                attempt_count = attempt_count + 1
           FROM next_message
          WHERE message.message_id = next_message.message_id
         RETURNING message.message_id, message.correlation_id, message.payload,
                   message.attempt_count, message.lease_owner`,
        [workerId, leaseSeconds],
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      if (
        row === undefined ||
        !record(row.payload) ||
        typeof row.payload.answer_submission_ref !== "string"
      ) {
        return null;
      }
      return {
        messageId: row.message_id,
        answerSubmissionRef: row.payload.answer_submission_ref,
        correlationId: row.correlation_id,
        leaseOwner: row.lease_owner,
        attempt: row.attempt_count,
      };
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async loadContext(answerSubmissionRef: string): Promise<AnswerAnalysisContext | null> {
    const result = await this.pool.query<{
      answer_submission_ref: string;
      contract_version_ref: string;
      contract_hash: string;
      contract_json: unknown;
      question_version_ref: string | null;
      policy: "OFF" | "ANSWER_ONLY" | "ANSWER_PLUS_PROCESS";
      artifact_manifest_json: unknown;
      process_manifest_json: unknown;
      human_review_completed: boolean;
    }>(
      `SELECT submission.answer_submission_ref, commitment.contract_version_ref,
              contract.contract_hash, contract.contract_json,
              attention.question_version_ref, projection.policy,
              submission.artifact_manifest_json, process.process_manifest_json,
              EXISTS (SELECT 1 FROM human_answer_reviews review
                WHERE review.answer_submission_ref = submission.answer_submission_ref)
                AS human_review_completed
         FROM answer_submissions AS submission
         JOIN answer_review_obligations AS obligation
           ON obligation.obligation_ref = submission.obligation_ref
         JOIN blind_review_commitments AS commitment
           ON commitment.commitment_ref = obligation.commitment_ref
         JOIN sealed_capability_contracts AS contract
           ON contract.contract_version_ref = commitment.contract_version_ref
         LEFT JOIN attention_commitments AS attention
           ON attention.commitment_ref = commitment.source_attention_commitment_ref
         JOIN answer_process_evidence AS process
           ON process.process_evidence_ref = submission.process_evidence_ref
         JOIN employer_answer_review_projections AS projection
           ON projection.answer_submission_ref = submission.answer_submission_ref
        WHERE submission.answer_submission_ref = $1`,
      [answerSubmissionRef],
    );
    const row = result.rows[0];
    if (row === undefined || !record(row.contract_json)) return null;
    if (row.policy === "OFF") {
      return {
        policy: "OFF",
        humanReviewCompleted: row.human_review_completed,
        input: null,
        inputHash: null,
      };
    }
    const artifactRefs = Array.isArray(row.artifact_manifest_json)
      ? row.artifact_manifest_json.map(String)
      : [];
    const artifactResult = await this.pool.query<{
      artifact_ref: string;
      kind: string;
      object_key: string;
      sha256: string;
    }>(
      `SELECT artifact_ref, kind, object_key, sha256
         FROM answer_artifacts
        WHERE artifact_ref = ANY($1::text[])
          AND kind IN ('RICH_TEXT', 'VOICE_TRANSCRIPT', 'GPT_TRACE')
          AND state = 'SEALED'
        ORDER BY created_at, artifact_ref`,
      [artifactRefs],
    );
    const blocks: BuildAnswerEvidenceEdgeInput["source_blocks"][number][] = [];
    for (const artifact of artifactResult.rows) {
      const raw = new TextDecoder().decode(await this.objects.getObject(artifact.object_key));
      let text = raw;
      if (artifact.kind === "RICH_TEXT") {
        try {
          text = textFromRichDocument(JSON.parse(raw) as unknown);
        } catch {
          text = "";
        }
      } else if (artifact.kind === "GPT_TRACE") {
        text = disclosedTraceText(raw);
      }
      text = text.trim().slice(0, 20_000);
      if (text.length === 0) continue;
      blocks.push({
        source_block_ref: `source-block:${artifact.artifact_ref}`,
        artifact_ref: artifact.artifact_ref,
        source_kind:
          artifact.kind === "RICH_TEXT"
            ? "ANSWER_FINAL"
            : artifact.kind === "VOICE_TRANSCRIPT"
              ? "VOICE_TRANSCRIPT"
              : "PLATFORM_GPT_TRACE",
        text,
        sha256: digest(text),
        derived: artifact.kind === "VOICE_TRANSCRIPT",
      });
    }
    const processEvidence = AnswerProcessEvidenceSchema.parse(row.process_manifest_json);
    if (row.policy === "ANSWER_PLUS_PROCESS") {
      const processText = [
        `Server recorded ${processEvidence.draft_revision_count} draft revisions.`,
        `Longest interval with no server-recorded revision: ${processEvidence.longest_no_server_recorded_revision_seconds} seconds.`,
        `Net-growth revisions: ${processEvidence.net_growth_revision_count}; net-shrink revisions: ${processEvidence.net_shrink_revision_count}.`,
        `Platform GPT turns: ${processEvidence.platform_gpt_turn_count}; Voice Memos: ${processEvidence.voice_memo_count}.`,
        `Submission source: ${processEvidence.submission_source}; seconds remaining: ${processEvidence.seconds_remaining_at_submit}.`,
        processEvidence.known_platform_failures.length === 0
          ? "Known platform failures: none recorded."
          : `Known platform failures: ${processEvidence.known_platform_failures.join(", ")}.`,
        ...(processEvidence.schema_version === "answer-process-evidence@2"
          ? processEvidence.behavior_signals.map(
              (signal) =>
                `${signal.title}: ${signal.severity}. ${signal.observed_value} Rule: ${signal.applied_rule} Caveat: ${signal.reviewer_caveat}`,
            )
          : []),
      ].join(" ");
      blocks.push({
        source_block_ref: `source-block:${processEvidence.process_evidence_ref}`,
        artifact_ref: null,
        source_kind: "PROCESS",
        text: processText,
        sha256: digest(processText),
        derived: true,
      });
    }
    const input = BuildAnswerEvidenceEdgeInputSchema.parse({
      schema_version: "build-answer-evidence-edge-input@1",
      request_ref: `answer-analysis-request:${answerSubmissionRef}`,
      answer_submission_ref: answerSubmissionRef,
      contract_version_ref: row.contract_version_ref,
      contract_hash: row.contract_hash,
      question_version_ref: row.question_version_ref ?? `question:${row.contract_version_ref}`,
      policy: row.policy,
      critical_question: String(row.contract_json.critical_question ?? "Sealed review question"),
      review_criteria: Array.isArray(row.contract_json.review_criteria)
        ? row.contract_json.review_criteria.map((criterion) =>
            ReviewCriterionSchema.parse(criterion),
          )
        : [],
      source_blocks: blocks,
      process_evidence: row.policy === "ANSWER_PLUS_PROCESS" ? processEvidence : null,
    });
    return {
      policy: row.policy,
      humanReviewCompleted: row.human_review_completed,
      input,
      inputHash: digest(JSON.stringify(input)),
    };
  }

  public async finishWithoutAnalysis(
    message: ClaimedAnswerAnalysisMessage,
    outcome: "DISABLED" | "SUPERSEDED" | "NEEDS_HUMAN",
    errorCode?: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertLease(client, message);
      await client.query(
        `UPDATE employer_answer_review_projections
            SET status = $1, error_code = $2, version = version + 1,
                updated_at = clock_timestamp()
          WHERE answer_submission_ref = $3`,
        [outcome, errorCode ?? null, message.answerSubmissionRef],
      );
      await markProcessed(client, message, outcome);
      await client.query("COMMIT");
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async start(
    message: ClaimedAnswerAnalysisMessage,
    context: AnswerAnalysisContext,
  ): Promise<string> {
    if (context.input === null || context.inputHash === null)
      throw new Error("Analysis input missing.");
    const requestId = context.input.request_ref;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertLease(client, message);
      await client.query(
        `INSERT INTO hiring_intelligence_requests (
           id, operation, aggregate_version, runtime_mode, prompt_id, prompt_version,
           prompt_hash, input_schema_version, output_schema_version, input_hash,
           input_json, idempotency_key, status, attempt_count, next_attempt_at,
           answer_submission_ref, question_version_ref
         ) VALUES ($1, 'buildAnswerEvidenceEdge', 1, $13, $2, $3, $4, $5, $6,
                   $7, $8::jsonb, $9, 'RUNNING', $10, clock_timestamp(), $11, $12)
         ON CONFLICT (id) DO UPDATE SET status = 'RUNNING', attempt_count = EXCLUDED.attempt_count,
           next_attempt_at = clock_timestamp()`,
        [
          requestId,
          this.prompt.promptId,
          this.prompt.promptVersion,
          this.prompt.promptHash,
          this.prompt.inputSchemaVersion,
          this.prompt.outputSchemaVersion,
          context.inputHash,
          JSON.stringify(context.input),
          `buildAnswerEvidenceEdge:${message.answerSubmissionRef}:${context.inputHash}`,
          message.attempt,
          message.answerSubmissionRef,
          context.input.question_version_ref,
          this.prompt.runtimeMode,
        ],
      );
      for (const source of context.input.source_blocks) {
        await client.query(
          `INSERT INTO ai_source_refs (request_id, source_ref, source_kind, sha256)
           VALUES ($1, $2, $3, $4) ON CONFLICT (request_id, source_ref) DO NOTHING`,
          [requestId, source.source_block_ref, source.source_kind, source.sha256],
        );
      }
      await client.query(
        `INSERT INTO ai_model_runs (
           id, request_id, attempt, adapter_id, requested_model,
           prompt_id, prompt_version, prompt_hash, input_schema_version,
           output_schema_version, status, input_bytes, started_at
         ) VALUES ($1, $2, $3, $10, $11,
                   $4, $5, $6, $7, $8, 'RUNNING', $9, clock_timestamp())`,
        [
          `answer-analysis-run:${message.answerSubmissionRef}:${message.attempt}`,
          requestId,
          message.attempt,
          this.prompt.promptId,
          this.prompt.promptVersion,
          this.prompt.promptHash,
          this.prompt.inputSchemaVersion,
          this.prompt.outputSchemaVersion,
          Buffer.byteLength(JSON.stringify(context.input)),
          this.prompt.adapterId,
          this.prompt.requestedModel,
        ],
      );
      await client.query(
        `UPDATE employer_answer_review_projections
            SET status = 'ANALYZING', ai_request_ref = $1, error_code = NULL,
                version = version + 1, updated_at = clock_timestamp()
          WHERE answer_submission_ref = $2 AND status IN ('ANALYZING', 'FAILED')`,
        [requestId, message.answerSubmissionRef],
      );
      await client.query("COMMIT");
      return requestId;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async complete(
    message: ClaimedAnswerAnalysisMessage,
    input: BuildAnswerEvidenceEdgeInput,
    rawOutput: AnswerEvidenceEdgeDraft,
    metadata: {
      readonly clientRequestId: string;
      readonly providerResponseId: string;
      readonly resolvedModel: string;
      readonly synthetic: boolean;
    },
  ): Promise<void> {
    const output = AnswerEvidenceEdgeDraftSchema.parse(rawOutput);
    const requestId = input.request_ref;
    const outputRef = `ai-output-answer-analysis:${message.answerSubmissionRef}`;
    const edgeRef = `answer-evidence-edge:${message.answerSubmissionRef}`;
    const outputHash = digest(JSON.stringify(output));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertLease(client, message);
      const reviewed = await client.query(
        `SELECT 1 FROM human_answer_reviews WHERE answer_submission_ref = $1`,
        [message.answerSubmissionRef],
      );
      if (reviewed.rowCount !== 0) {
        await client.query(
          `UPDATE hiring_intelligence_requests SET status = 'SUPERSEDED', completed_at = clock_timestamp()
            WHERE id = $1`,
          [requestId],
        );
        await client.query(
          `UPDATE ai_model_runs SET status = 'SUCCEEDED', client_request_id = $1,
                  provider_response_id = $2, resolved_model = $3,
                  output_bytes = $4, completed_at = clock_timestamp()
            WHERE request_id = $5 AND attempt = $6`,
          [
            metadata.clientRequestId,
            metadata.providerResponseId,
            metadata.resolvedModel,
            Buffer.byteLength(JSON.stringify(output)),
            requestId,
            message.attempt,
          ],
        );
        await client.query(
          `UPDATE employer_answer_review_projections SET status = 'SUPERSEDED',
                  error_code = 'HUMAN_REVIEW_COMPLETED_FIRST', version = version + 1,
                  updated_at = clock_timestamp() WHERE answer_submission_ref = $1`,
          [message.answerSubmissionRef],
        );
        await markProcessed(client, message, "SUPERSEDED");
        await client.query("COMMIT");
        return;
      }
      await client.query(
        `INSERT INTO ai_outputs (
           id, request_id, output_schema_version, validated_json, output_hash,
           validation_policy_version
         ) VALUES ($1, $2, $3, $4::jsonb, $5,
                   'onlyboth.answer-evidence-validation@2')`,
        [outputRef, requestId, output.schema_version, JSON.stringify(output), outputHash],
      );
      const evidenceRefs = [
        ...new Set(
          output.criterion_findings.flatMap((finding) => [
            ...finding.supporting_evidence.map(({ source_block_ref }) => source_block_ref),
            ...finding.contradicting_evidence.map(({ source_block_ref }) => source_block_ref),
          ]),
        ),
      ];
      await client.query(
        `INSERT INTO answer_evidence_edges (
           answer_evidence_edge_ref, answer_submission_ref, ai_output_ref,
           contract_version_ref, uncertainty_ref, evidence_refs, proof_template_ref,
           still_unknown, edge_json, edge_hash
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10)`,
        [
          edgeRef,
          message.answerSubmissionRef,
          outputRef,
          input.contract_version_ref,
          `criterion-set:${input.contract_version_ref}`,
          JSON.stringify(evidenceRefs),
          `review-criteria:${input.contract_version_ref}`,
          JSON.stringify(output.still_unknown),
          JSON.stringify(output),
          outputHash,
        ],
      );
      await client.query(
        `UPDATE hiring_intelligence_requests SET status = 'SUCCEEDED', completed_at = clock_timestamp()
          WHERE id = $1`,
        [requestId],
      );
      await client.query(
        `UPDATE ai_model_runs SET status = 'SUCCEEDED', client_request_id = $1,
                provider_response_id = $2, resolved_model = $3, output_bytes = $4,
                completed_at = clock_timestamp()
          WHERE request_id = $5 AND attempt = $6`,
        [
          metadata.clientRequestId,
          metadata.providerResponseId,
          metadata.resolvedModel,
          Buffer.byteLength(JSON.stringify(output)),
          requestId,
          message.attempt,
        ],
      );
      await client.query(
        `UPDATE employer_answer_review_projections
            SET status = $1, ai_output_ref = $2, answer_evidence_edge_ref = $3,
                projection_json = $4::jsonb, error_code = NULL, synthetic = $5,
                version = version + 1, updated_at = clock_timestamp()
          WHERE answer_submission_ref = $6 AND status = 'ANALYZING'`,
        [
          output.readiness === "ready" ? "READY" : "NEEDS_HUMAN",
          outputRef,
          edgeRef,
          JSON.stringify(output),
          metadata.synthetic,
          message.answerSubmissionRef,
        ],
      );
      const eventId = `event:${edgeRef}`;
      await client.query(
        `INSERT INTO domain_events (
           event_id, event_type, event_version, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, occurred_at, payload
         ) VALUES ($1, 'AnswerEvidenceEdgeCompleted', 1, 'AnswerEvidenceEdge', $2, 1,
                   $3, clock_timestamp(), $4::jsonb)`,
        [
          eventId,
          edgeRef,
          message.correlationId,
          JSON.stringify({
            schema_version: "answer-evidence-edge-completed@1",
            answer_submission_ref: message.answerSubmissionRef,
            answer_evidence_edge_ref: edgeRef,
            ai_output_ref: outputRef,
          }),
        ],
      );
      await markProcessed(client, message, output.readiness.toUpperCase());
      await client.query("COMMIT");
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async fail(
    message: ClaimedAnswerAnalysisMessage,
    errorCode: string,
    retryable: boolean,
    maximumAttempts: number,
  ): Promise<"FAILED" | "RETRY_SCHEDULED"> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertLease(client, message);
      const retry = retryable && message.attempt < maximumAttempts;
      const needsHuman =
        !retry &&
        [
          "AI_REFUSED",
          "AI_INCOMPLETE",
          "AI_SCHEMA_MISMATCH",
          "AI_OUTPUT_POLICY_VIOLATION",
          "AI_SOURCE_REF_INVALID",
        ].includes(errorCode);
      await client.query(
        `UPDATE hiring_intelligence_requests
            SET status = $1, next_attempt_at = clock_timestamp() + ($2 * interval '1 second'),
                completed_at = CASE WHEN $1 IN ('FAILED_PERMANENT', 'NEEDS_HUMAN')
                                    THEN clock_timestamp() ELSE NULL END
          WHERE id = $3`,
        [
          retry ? "RETRYABLE" : needsHuman ? "NEEDS_HUMAN" : "FAILED_PERMANENT",
          message.attempt,
          `answer-analysis-request:${message.answerSubmissionRef}`,
        ],
      );
      await client.query(
        `UPDATE ai_model_runs SET status = $1, error_code = $2, completed_at = clock_timestamp()
          WHERE request_id = $3 AND attempt = $4`,
        [
          retry ? "FAILED_RETRYABLE" : needsHuman ? "NEEDS_HUMAN" : "FAILED_PERMANENT",
          errorCode,
          `answer-analysis-request:${message.answerSubmissionRef}`,
          message.attempt,
        ],
      );
      if (retry) {
        await client.query(
          `UPDATE outbox_messages SET available_at = clock_timestamp() + ($1 * interval '1 second'),
                  lease_owner = NULL, lease_expires_at = NULL, last_error_code = $2
            WHERE message_id = $3 AND lease_owner = $4 AND attempt_count = $5`,
          [message.attempt, errorCode, message.messageId, message.leaseOwner, message.attempt],
        );
      } else {
        await client.query(
          `UPDATE employer_answer_review_projections SET status = $1, error_code = $2,
                  version = version + 1, updated_at = clock_timestamp()
            WHERE answer_submission_ref = $3`,
          [needsHuman ? "NEEDS_HUMAN" : "FAILED", errorCode, message.answerSubmissionRef],
        );
        await markProcessed(client, message, needsHuman ? "NEEDS_HUMAN" : "FAILED");
      }
      await client.query("COMMIT");
      return retry ? "RETRY_SCHEDULED" : "FAILED";
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
