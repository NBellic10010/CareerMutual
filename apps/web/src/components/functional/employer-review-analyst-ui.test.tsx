import { EmployerCurrentReviewProjectionSchema } from "@onlyboth/contracts";
import { buildAnswerProcessEvidence } from "@onlyboth/application";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SequentialReviewWorkspace } from "./sequential-review-workspace";

function reviewProjection(status: "ANALYZING" | "READY") {
  const answerText = "Use an idempotency key so retries produce one charge.";
  const processEvidence = buildAnswerProcessEvidence({
    processEvidenceRef: "process-evidence:analyst-ui",
    answerSessionRef: "answer-session:analyst-ui",
    answerSubmissionRef: "answer-submission:analyst-ui",
    startedAt: "2026-07-20T12:00:00.000Z",
    answerDueAt: "2026-07-20T12:06:00.000Z",
    submittedAt: "2026-07-20T12:05:45.000Z",
    submissionSource: "MANUAL",
    revisions: [
      {
        artifactRef: "artifact:draft-ui",
        revision: 1,
        sha256: `sha256:${"b".repeat(64)}`,
        recordedAt: "2026-07-20T12:04:10.000Z",
        plainTextLength: answerText.length,
        final: true,
      },
    ],
    platformGptTurnTimes: ["2026-07-20T12:04:30.000Z"],
    voiceMemoTimes: [],
    knownPlatformFailures: [],
  });
  return EmployerCurrentReviewProjectionSchema.parse({
    schema_version: "employer-current-review-projection@3",
    opportunity_ref: "opportunity:analyst-ui",
    title: "Reliability Engineer",
    reviewer_ref: "employer-sarah",
    queue: {
      pending_review_count: 1,
      available_slot_count: 0,
      waiting_interest_count: 3,
    },
    current: {
      obligation_ref: "obligation:analyst-ui",
      obligation_version: 1,
      cohort_ref: "cohort:analyst-ui",
      cohort_version: 1,
      answer_submission_ref: "answer-submission:analyst-ui",
      opaque_candidate_label: "Anonymous answer A-042",
      submitted_at: "2026-07-20T12:05:00.000Z",
      critical_question: "Describe a retry invariant and a falsifiable recovery check.",
      rich_text_document: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: answerText }] }],
      },
      rich_text_plain_text: answerText,
      artifacts: [
        {
          artifact_ref: "artifact:final-answer",
          kind: "RICH_TEXT",
          state: "SEALED",
          content_type: "application/json",
          content_length: answerText.length,
          sha256: `sha256:${"a".repeat(64)}`,
          transcript_artifact_ref: null,
          transcription_status: null,
          transcription_error_code: null,
        },
      ],
      assistant_trace: [],
      permitted_evidence_refs: ["artifact:final-answer"],
      focus_policy_auto_submitted: false,
      ai_review: {
        schema_version: "employer-ai-review-projection@1",
        policy: "ANSWER_PLUS_PROCESS",
        status,
        answer_submission_ref: "answer-submission:analyst-ui",
        process_evidence: processEvidence,
        analysis:
          status === "ANALYZING"
            ? null
            : {
                schema_version: "answer-evidence-edge-draft@2",
                readiness: "ready",
                summary: [
                  {
                    sentence: "The answer defines an idempotency-based retry invariant.",
                    sources: [
                      {
                        source_block_ref: "source-block:final-answer",
                        exact_quote: "Use an idempotency key",
                        occurrence_index: 0,
                      },
                    ],
                  },
                ],
                criterion_findings: [
                  {
                    criterion_ref: "criterion:retry-invariant",
                    status: "SUPPORTED",
                    explanation: "The final answer names a concrete invariant.",
                    supporting_evidence: [
                      {
                        source_block_ref: "source-block:final-answer",
                        exact_quote: "retries produce one charge",
                        occurrence_index: 0,
                      },
                    ],
                    contradicting_evidence: [],
                  },
                ],
                still_unknown: ["Behavior outside this bounded task remains unknown."],
                reviewer_questions: [
                  {
                    question: "Which race should be tested first?",
                    sources: [
                      {
                        source_block_ref: "source-block:final-answer",
                        exact_quote: "retries produce one charge",
                        occurrence_index: 0,
                      },
                    ],
                  },
                ],
                process_timeline: [],
                answer_verdict: {
                  verdict: "GOOD_ANSWER",
                  explanation: "The bounded answer states a concrete and testable invariant.",
                  evidence: [
                    {
                      source_block_ref: "source-block:final-answer",
                      exact_quote: "Use an idempotency key",
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
                  observation: "The answer uses a direct, task-specific statement.",
                  evidence: [
                    {
                      source_block_ref: "source-block:final-answer",
                      exact_quote: "Use an idempotency key",
                      occurrence_index: 0,
                    },
                  ],
                })),
              },
        ai_output_ref: status === "READY" ? "ai-output:analyst-ui" : null,
        error_code: null,
        synthetic: false,
        disclosure:
          "AI maps source-linked evidence to sealed criteria; it does not score or decide.",
      },
    },
  });
}

describe("Employer AI Review Analyst UI", () => {
  it("renders source-linked assistance beside an independent required human receipt", () => {
    const markup = renderToStaticMarkup(
      createElement(SequentialReviewWorkspace, {
        initialReview: reviewProjection("READY"),
        csrfToken: "csrf-test",
      }),
    );

    expect(markup).toContain("AI Evidence Analyst · READY");
    expect(markup).toContain("Source-linked summary");
    expect(markup).toContain("GOOD ANSWER");
    expect(markup).toContain("Language analysis");
    expect(markup).toContain("Answer behavior profile");
    expect(markup).toContain("RED · High concern");
    expect(markup).toContain("GREEN · Low concern");
    expect(markup).toContain("SUPPORTED");
    expect(markup).toContain("Use an idempotency key");
    expect(markup).toContain("Required human receipt");
    expect(markup).toContain("Evidence-linked review comment");
    expect(markup).not.toMatch(
      /match score|candidate score|recommend advancing|cheating probability/iu,
    );
  });

  it("keeps the human review form available while analysis is running", () => {
    const markup = renderToStaticMarkup(
      createElement(SequentialReviewWorkspace, {
        initialReview: reviewProjection("ANALYZING"),
        csrfToken: "csrf-test",
      }),
    );

    expect(markup).toContain("Analysis is still running");
    expect(markup).toContain("Answer behavior profile");
    expect(markup).toContain("Cite this disclosed process signal");
    expect(markup).toContain("Record review &amp; release Slot");
    expect(markup).toContain("No Skip · no batch reject · no next-answer prefetch");
  });
});
