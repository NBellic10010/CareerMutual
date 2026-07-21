import {
  EmployerReviewAnalystWorker,
  buildAnswerProcessEvidence,
  buildLegacyAnswerProcessEvidence,
  type AnswerAnalysisContext,
  type ClaimedAnswerAnalysisMessage,
  type EmployerReviewAnalystWorkerStore,
} from "../../packages/application/src/index";
import {
  EMPLOYER_REVIEW_ANALYST_DEVELOPER_PROMPT,
  EMPLOYER_REVIEW_ANALYST_PROMPT_VERSION,
  LiveEmployerReviewAnalystAdapter,
  SyntheticEmployerReviewAnalystAdapter,
  validateAnswerEvidenceEdge,
  type EmployerReviewResponsesClient,
} from "../../packages/ai/src/index";
import {
  AnswerEvidenceEdgeDraftSchema,
  BuildAnswerEvidenceEdgeInputSchema,
} from "../../packages/contracts/src/index";
import { describe, expect, it, vi } from "vitest";

const processEvidence = buildAnswerProcessEvidence({
  processEvidenceRef: "process-evidence:test",
  answerSessionRef: "answer-session:test",
  answerSubmissionRef: "answer-submission:test",
  startedAt: "2026-07-20T12:00:00.000Z",
  answerDueAt: "2026-07-20T12:06:00.000Z",
  submittedAt: "2026-07-20T12:05:00.000Z",
  submissionSource: "MANUAL",
  revisions: [
    {
      artifactRef: "artifact:draft-1",
      revision: 1,
      sha256: `sha256:${"1".repeat(64)}`,
      recordedAt: "2026-07-20T12:01:00.000Z",
      plainTextLength: 20,
      final: false,
    },
    {
      artifactRef: "artifact:draft-2",
      revision: 2,
      sha256: `sha256:${"2".repeat(64)}`,
      recordedAt: "2026-07-20T12:04:00.000Z",
      plainTextLength: 12,
      final: true,
    },
  ],
  platformGptTurnTimes: ["2026-07-20T12:03:00.000Z"],
  voiceMemoTimes: [],
  knownPlatformFailures: [],
});

const input = BuildAnswerEvidenceEdgeInputSchema.parse({
  schema_version: "build-answer-evidence-edge-input@1",
  request_ref: "answer-analysis-request:test",
  answer_submission_ref: "answer-submission:test",
  contract_version_ref: "contract:test",
  contract_hash: `sha256:${"a".repeat(64)}`,
  question_version_ref: "question:test",
  policy: "ANSWER_PLUS_PROCESS",
  critical_question: "Describe the retry invariant and a falsifiable recovery test.",
  review_criteria: [
    {
      criterion_ref: "criterion:invariant",
      capability_ref: "capability:reliability",
      statement: "The answer defines a concrete retry invariant and a falsifiable test.",
      support_indicators: ["Names an invariant and observable test."],
      contradiction_indicators: ["Allows duplicate payment capture."],
      bounded_limitations: ["Cannot establish performance outside this challenge."],
    },
  ],
  source_blocks: [
    {
      source_block_ref: "source-block:answer",
      artifact_ref: "artifact:final",
      source_kind: "ANSWER_FINAL",
      text: "Use a provider idempotency key and verify that retries produce one charge.",
      sha256: `sha256:${"b".repeat(64)}`,
      derived: false,
    },
    {
      source_block_ref: "source-block:process",
      artifact_ref: null,
      source_kind: "PROCESS",
      text: "Longest interval with no server-recorded revision: 180 seconds.",
      sha256: `sha256:${"c".repeat(64)}`,
      derived: true,
    },
  ],
  process_evidence: processEvidence,
});

function validOutput() {
  return AnswerEvidenceEdgeDraftSchema.parse({
    schema_version: "answer-evidence-edge-draft@2",
    readiness: "ready",
    summary: [
      {
        sentence: "The answer proposes an idempotency invariant and retry check.",
        sources: [
          {
            source_block_ref: "source-block:answer",
            exact_quote: "Use a provider idempotency key",
            occurrence_index: 0,
          },
        ],
      },
    ],
    criterion_findings: [
      {
        criterion_ref: "criterion:invariant",
        status: "SUPPORTED",
        explanation: "The final answer states a concrete invariant and observable retry outcome.",
        supporting_evidence: [
          {
            source_block_ref: "source-block:answer",
            exact_quote: "retries produce one charge",
            occurrence_index: 0,
          },
        ],
        contradicting_evidence: [],
      },
    ],
    still_unknown: ["Behavior under provider timeout remains unknown."],
    reviewer_questions: [
      {
        question: "Which retry race should be falsified first?",
        sources: [
          {
            source_block_ref: "source-block:answer",
            exact_quote: "retries produce one charge",
            occurrence_index: 0,
          },
        ],
      },
    ],
    process_timeline: [
      {
        statement: "Longest interval with no server-recorded revision: 180 seconds.",
        source_block_ref: "source-block:process",
      },
    ],
    answer_verdict: {
      verdict: "GOOD_ANSWER",
      explanation: "The bounded answer supplies supported evidence without a contradiction.",
      evidence: [
        {
          source_block_ref: "source-block:answer",
          exact_quote: "retries produce one charge",
          occurrence_index: 0,
        },
      ],
      scope: "THIS_SEALED_CHALLENGE_ONLY",
    },
    language_findings: [
      "LOGICAL_STRUCTURE",
      "CLARITY",
      "INTERNAL_CONSISTENCY",
      "RESPONSIVENESS",
    ].map((dimension) => ({
      dimension,
      status: "CLEAR",
      severity: "GREEN",
      observation: "The answer uses a direct and reviewable statement.",
      evidence: [
        {
          source_block_ref: "source-block:answer",
          exact_quote: "retries produce one charge",
          occurrence_index: 0,
        },
      ],
    })),
  });
}

describe("Employer AI Review Analyst", () => {
  it("pins the V2.0.2 literal citation and injection no-echo checks", () => {
    expect(EMPLOYER_REVIEW_ANALYST_PROMPT_VERSION).toBe("2.0.2");
    expect(EMPLOYER_REVIEW_ANALYST_DEVELOPER_PROMPT).toContain(
      "perform a literal substring check for every citation",
    );
    expect(EMPLOYER_REVIEW_ANALYST_DEVELOPER_PROMPT).toContain(
      "occurrence_index is smaller than the number of exact non-overlapping matches",
    );
    expect(EMPLOYER_REVIEW_ANALYST_DEVELOPER_PROMPT).toContain(
      "This rule also applies to exact_quote",
    );
  });

  it("derives neutral server-recorded process metrics without focus telemetry", () => {
    expect(processEvidence).toMatchObject({
      draft_revision_count: 2,
      longest_no_server_recorded_revision_seconds: 180,
      net_growth_revision_count: 0,
      net_shrink_revision_count: 1,
      maximum_absolute_net_length_change: 8,
      platform_gpt_turn_count: 1,
      seconds_remaining_at_submit: 60,
      wording_guard: "no server-recorded revision",
      schema_version: "answer-process-evidence@2",
      behavior_rule_set_ref: "onlyboth.answer-behavior-severity@1",
    });
    expect(processEvidence.behavior_signals).toHaveLength(6);
    expect(processEvidence.behavior_signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "REVISION_GAP", severity: "YELLOW" }),
        expect.objectContaining({ kind: "PLATFORM_RELIABILITY", severity: "GREEN" }),
      ]),
    );
    expect(JSON.stringify(processEvidence)).not.toMatch(/clipboard|keystroke|camera|biometric/i);
  });

  it("keeps pre-disclosure legacy evidence neutral and unclassified", () => {
    const legacy = buildLegacyAnswerProcessEvidence({
      processEvidenceRef: "process-evidence:legacy",
      answerSessionRef: "answer-session:legacy",
      answerSubmissionRef: "answer-submission:legacy",
      startedAt: "2026-07-20T12:00:00.000Z",
      answerDueAt: "2026-07-20T12:06:00.000Z",
      submittedAt: "2026-07-20T12:05:00.000Z",
      submissionSource: "MANUAL",
      revisions: [],
      platformGptTurnTimes: [],
      voiceMemoTimes: [],
      knownPlatformFailures: [],
    });
    expect(legacy.schema_version).toBe("answer-process-evidence@1");
    expect(JSON.stringify(legacy)).not.toContain("behavior_signals");
  });

  it("validates exact quotes and a complete criterion set", () => {
    expect(validateAnswerEvidenceEdge(input, validOutput())).toEqual(validOutput());
  });

  it("rejects inconsistent Good/Bad verdict and language severity mappings", () => {
    const output = validOutput();
    if (output.schema_version !== "answer-evidence-edge-draft@2") {
      throw new Error("Expected the current answer evidence schema.");
    }
    expect(() =>
      validateAnswerEvidenceEdge(input, {
        ...output,
        answer_verdict: { ...output.answer_verdict, verdict: "BAD_ANSWER" },
      }),
    ).toThrow(/BAD_ANSWER/);
    expect(() =>
      validateAnswerEvidenceEdge(input, {
        ...output,
        language_findings: output.language_findings.map((finding, index) =>
          index === 0 ? { ...finding, status: "CONCERN", severity: "GREEN" } : finding,
        ),
      }),
    ).toThrow(/severity/);
  });

  it("rejects process evidence used to support a criterion", () => {
    const output = validOutput();
    const invalid = {
      ...output,
      criterion_findings: [
        {
          ...output.criterion_findings[0]!,
          supporting_evidence: [
            {
              source_block_ref: "source-block:process",
              exact_quote: "no server-recorded revision",
              occurrence_index: 0,
            },
          ],
        },
      ],
    };
    expect(() => validateAnswerEvidenceEdge(input, invalid)).toThrow(/Process evidence/);
  });

  it("rejects scoring and behavioral character judgments", () => {
    const output = validOutput();
    expect(() =>
      validateAnswerEvidenceEdge(input, {
        ...output,
        still_unknown: ["Candidate score and suspicious behavior remain unknown."],
      }),
    ).toThrow(/prohibited/);
    expect(() =>
      validateAnswerEvidenceEdge(input, {
        ...output,
        reviewer_questions: [
          {
            question: "Why was the candidate inactive?",
            sources: [
              {
                source_block_ref: "source-block:process",
                exact_quote: "no server-recorded revision",
                occurrence_index: 0,
              },
            ],
          },
        ],
      }),
    ).toThrow(/prohibited/);
  });

  it("uses the bounded Responses API configuration without tools or remote state", async () => {
    const parse = vi.fn(async (request: Readonly<Record<string, unknown>>) => ({
      id: "resp-test",
      model: "gpt-5.6-sol",
      status: "completed",
      output: [],
      output_parsed: validOutput(),
      request,
    }));
    const client = { responses: { parse } } as unknown as EmployerReviewResponsesClient;
    const adapter = new LiveEmployerReviewAnalystAdapter({ client });
    await adapter.buildAnswerEvidenceEdge(input, "client-request-test");
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.6-sol",
        reasoning: { effort: "medium" },
        store: false,
      }),
      { headers: { "X-Client-Request-Id": "client-request-test" } },
    );
    const request = parse.mock.calls[0]![0];
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("conversation");
    expect(request).not.toHaveProperty("previous_response_id");
    expect(request).not.toHaveProperty("background");
  });

  it("allows an isolated eval harness to override the model without changing reasoning policy", async () => {
    const parse = vi.fn(async () => ({
      id: "resp-mini-eval",
      model: "gpt-5.4-mini-2026-03-17",
      status: "completed",
      output: [],
      output_parsed: validOutput(),
    }));
    const client = { responses: { parse } } as unknown as EmployerReviewResponsesClient;
    const adapter = new LiveEmployerReviewAnalystAdapter({
      client,
      model: "gpt-5.4-mini",
    });
    await adapter.buildAnswerEvidenceEdge(input, "client-request-mini-eval");
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.4-mini",
        reasoning: { effort: "medium" },
        store: false,
      }),
      { headers: { "X-Client-Request-Id": "client-request-mini-eval" } },
    );
  });

  it("keeps OFF and kill-switch paths independent from human review", async () => {
    const message: ClaimedAnswerAnalysisMessage = {
      messageId: "message:test",
      answerSubmissionRef: "answer-submission:test",
      correlationId: "correlation:test",
      leaseOwner: "worker:test",
      attempt: 1,
    };
    const finishWithoutAnalysis = vi.fn(async () => undefined);
    const context: AnswerAnalysisContext = {
      policy: "OFF",
      humanReviewCompleted: false,
      input: null,
      inputHash: null,
    };
    const store = {
      claimNext: vi.fn(async () => message),
      loadContext: vi.fn(async () => context),
      finishWithoutAnalysis,
      start: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    } as unknown as EmployerReviewAnalystWorkerStore;
    const worker = new EmployerReviewAnalystWorker(
      store,
      new SyntheticEmployerReviewAnalystAdapter(),
      validateAnswerEvidenceEdge,
      () => "client:test",
      true,
    );
    await expect(worker.runOnce("worker:test")).resolves.toBe("PROCESSED");
    expect(finishWithoutAnalysis).toHaveBeenCalledWith(message, "DISABLED");
    expect(store.start).not.toHaveBeenCalled();
  });

  it("reports an enabled LIVE adapter without a key as unavailable rather than synthetic", async () => {
    const message: ClaimedAnswerAnalysisMessage = {
      messageId: "message:keyless-live",
      answerSubmissionRef: "answer-submission:test",
      correlationId: "correlation:test",
      leaseOwner: "worker:test",
      attempt: 1,
    };
    const finishWithoutAnalysis = vi.fn(async () => undefined);
    const store = {
      claimNext: vi.fn(async () => message),
      loadContext: vi.fn(async () => ({
        policy: "ANSWER_PLUS_PROCESS" as const,
        humanReviewCompleted: false,
        input,
        inputHash: `sha256:${"f".repeat(64)}`,
      })),
      finishWithoutAnalysis,
      start: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    } as unknown as EmployerReviewAnalystWorkerStore;
    const worker = new EmployerReviewAnalystWorker(
      store,
      null,
      validateAnswerEvidenceEdge,
      () => "client:test",
      false,
      3,
      "OPENAI_KEY_UNAVAILABLE",
    );

    await expect(worker.runOnce("worker:test")).resolves.toBe("PROCESSED");
    expect(finishWithoutAnalysis).toHaveBeenCalledWith(
      message,
      "NEEDS_HUMAN",
      "OPENAI_KEY_UNAVAILABLE",
    );
    expect(store.start).not.toHaveBeenCalled();
  });
});
