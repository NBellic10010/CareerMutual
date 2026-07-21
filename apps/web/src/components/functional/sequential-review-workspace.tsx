"use client";

import type {
  EmployerCurrentReviewProjection,
  EmployerProcessContext,
  RichTextNode,
} from "@onlyboth/contracts";
import { useState } from "react";

import { CriticalChallengeView } from "./critical-challenge-view";

function key() {
  return `human-review:${crypto.randomUUID()}`;
}

function severityLabel(severity: "GREEN" | "YELLOW" | "RED") {
  return severity === "GREEN" ? "Low concern" : severity === "YELLOW" ? "Review" : "High concern";
}

function RichNode({ node }: { readonly node: RichTextNode }) {
  const children = node.content?.map((child, index) => (
    <RichNode key={`${child.type}-${index}`} node={child} />
  ));
  if (node.type === "text") return <>{node.text}</>;
  if (node.type === "heading") return <h3>{children}</h3>;
  if (node.type === "bulletList") return <ul>{children}</ul>;
  if (node.type === "orderedList") return <ol>{children}</ol>;
  if (node.type === "listItem") return <li>{children}</li>;
  if (node.type === "blockquote") return <blockquote>{children}</blockquote>;
  if (node.type === "codeBlock")
    return (
      <pre>
        <code>{children}</code>
      </pre>
    );
  if (node.type === "hardBreak") return <br />;
  if (node.type === "paragraph") return <p>{children}</p>;
  return <>{children}</>;
}

function BehaviorProfile({
  processEvidence,
  citedRefs,
  onCitationChange,
}: {
  readonly processEvidence: EmployerProcessContext | null;
  readonly citedRefs: readonly string[];
  readonly onCitationChange: (signalRef: string, checked: boolean) => void;
}) {
  if (processEvidence?.schema_version !== "answer-process-evidence@2") return null;
  return (
    <details className="process-context behavior-profile" open>
      <summary>Answer behavior profile</summary>
      <p>
        Severity follows {processEvidence.behavior_rule_set_ref}. It is a disclosed review signal
        for this session, not proof of intent or external AI use.
      </p>
      <div className="behavior-signal-list">
        {processEvidence.behavior_signals.map((signal) => (
          <article
            className={`severity-card severity-card--${signal.severity.toLowerCase()}`}
            aria-label={`${signal.title}: ${severityLabel(signal.severity)}`}
            key={signal.signal_ref}
          >
            <div className="severity-card__header">
              <strong>{signal.title}</strong>
              <span>
                {signal.severity} · {severityLabel(signal.severity)}
              </span>
            </div>
            <p>{signal.observed_value}</p>
            <small>{signal.applied_rule}</small>
            <small>{signal.reviewer_caveat}</small>
            <label className="signal-citation-control">
              <input
                type="checkbox"
                checked={citedRefs.includes(signal.signal_ref)}
                onChange={(event) => onCitationChange(signal.signal_ref, event.target.checked)}
              />
              Cite this disclosed process signal in my human review
            </label>
          </article>
        ))}
      </div>
    </details>
  );
}

export function SequentialReviewWorkspace({
  initialReview,
  csrfToken,
}: {
  readonly initialReview: EmployerCurrentReviewProjection;
  readonly csrfToken: string;
}) {
  const current = initialReview.current;
  const [decision, setDecision] = useState<
    "ADVANCE_ELIGIBLE" | "NO_FURTHER_PROOF" | "INCONCLUSIVE"
  >("INCONCLUSIVE");
  const [evidence, setEvidence] = useState<string[]>(
    current === null ? [] : [current.permitted_evidence_refs[0]!],
  );
  const [comment, setComment] = useState("");
  const [unknown, setUnknown] = useState("");
  const [settled, setSettled] = useState(false);
  const [consultedAi, setConsultedAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitReview() {
    if (current === null) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/employer/answer-obligations/${current.obligation_ref}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
            "Idempotency-Key": key(),
          },
          body: JSON.stringify({
            schema_version: "record-functional-human-review-command@2",
            decision,
            evidence_refs: evidence,
            review_comment: comment,
            still_unknown: [
              unknown.trim().length === 0 ? "None within this bounded task" : unknown,
            ],
            consulted_ai_output_ref:
              consultedAi && current.ai_review.ai_output_ref !== null
                ? current.ai_review.ai_output_ref
                : null,
            expected_obligation_version: current.obligation_version,
            expected_cohort_version: current.cohort_version,
          }),
        },
      );
      const result = (await response.json()) as Record<string, unknown>;
      if (!response.ok)
        throw new Error(
          String((result.error as { code?: string } | undefined)?.code ?? "REVIEW_FAILED"),
        );
      setSettled(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="review-shell">
      <header className="review-header">
        <div>
          <p className="eyebrow">Sequential human review / identity sealed</p>
          <h1>{initialReview.title}</h1>
        </div>
        <div className="review-debt">
          <span>Pending debt</span>
          <strong>{initialReview.queue.pending_review_count}</strong>
          <small>{initialReview.queue.available_slot_count} Slot(s) available</small>
        </div>
      </header>
      {current === null ? (
        <section className="empty-review">
          <span>QUEUE CLEAR</span>
          <h2>No submitted answer is waiting.</h2>
          <p>
            Candidate identities and résumés remain unavailable.{" "}
            {initialReview.queue.waiting_interest_count} Interest(s) wait for a backed Slot.
          </p>
          <a className="secondary-button" href="/employer">
            Back to JobPosts
          </a>
        </section>
      ) : settled ? (
        <section className="settlement-receipt">
          <span>ATOMIC SETTLEMENT</span>
          <h2>Review receipt recorded.</h2>
          <p>Attention Hold returned → Slot released → next queued Interest requested.</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Next answer
          </button>
        </section>
      ) : (
        <div className="review-grid">
          <section className="anonymous-submission">
            <div className="anonymous-header">
              <div>
                <span>{current.opaque_candidate_label}</span>
                <h2>Bounded answer</h2>
              </div>
              <small>Submitted {new Date(current.submitted_at).toISOString()} UTC</small>
            </div>
            <CriticalChallengeView challenge={current.critical_challenge} compact />
            <div className="read-only-answer">
              {current.rich_text_document === null ? (
                <p>No rich-text Artifact.</p>
              ) : (
                <RichNode node={current.rich_text_document} />
              )}
            </div>
            <div className="artifact-ledger">
              <h3>Private Object Storage Artifacts</h3>
              {current.artifacts.map((artifact) => (
                <label className="artifact-row" key={artifact.artifact_ref}>
                  <input
                    type="checkbox"
                    checked={evidence.includes(artifact.artifact_ref)}
                    onChange={(event) =>
                      setEvidence((items) =>
                        event.target.checked
                          ? [...items, artifact.artifact_ref]
                          : items.filter((item) => item !== artifact.artifact_ref),
                      )
                    }
                  />
                  <span>
                    <strong>{artifact.kind}</strong>
                    <small>
                      {artifact.content_type} · {artifact.content_length} bytes · {artifact.sha256}
                    </small>
                  </span>
                  {artifact.kind === "VOICE_MEMO" ? (
                    <audio
                      controls
                      preload="none"
                      src={`/api/v1/artifacts/${artifact.artifact_ref}?role=employer`}
                    />
                  ) : null}
                </label>
              ))}
            </div>
            <details className="gpt-trace">
              <summary>
                Disclosed platform GPT trace · {current.assistant_trace.length} turn(s)
              </summary>
              {current.assistant_trace.map((turn) => (
                <article key={turn.turn_ref}>
                  <span>{turn.role}</span>
                  <p>{turn.content ?? turn.error_code}</p>
                </article>
              ))}
            </details>
            <details
              className="ai-evidence-analyst"
              onToggle={(event) => {
                if (event.currentTarget.open) setConsultedAi(true);
              }}
            >
              <summary>
                AI Evidence Analyst · {current.ai_review.status.replaceAll("_", " ")}
              </summary>
              <p>{current.ai_review.disclosure}</p>
              {current.ai_review.status === "DISABLED" ? (
                <p>This sealed JobPost uses human review only.</p>
              ) : current.ai_review.status === "ANALYZING" ? (
                <p>Analysis is still running. You may complete the human review now.</p>
              ) : current.ai_review.status === "FAILED" ||
                (current.ai_review.status === "NEEDS_HUMAN" &&
                  current.ai_review.analysis === null) ? (
                <p>
                  Analysis is unavailable ({current.ai_review.error_code ?? "needs human review"}).
                  The human review path remains fully available.
                </p>
              ) : current.ai_review.status === "SUPERSEDED" ? (
                <p>The human review completed before analysis. Late model output is not shown.</p>
              ) : current.ai_review.analysis === null ? null : (
                <div className="analyst-output">
                  {current.ai_review.analysis.schema_version === "answer-evidence-edge-draft@2" ? (
                    <section
                      className={`answer-verdict answer-verdict--${current.ai_review.analysis.answer_verdict.verdict === "GOOD_ANSWER" ? "good" : "bad"}`}
                      aria-label={`Bounded answer verdict: ${current.ai_review.analysis.answer_verdict.verdict.replaceAll("_", " ")}`}
                    >
                      <p className="section-kicker">This sealed challenge only</p>
                      <h3>
                        {current.ai_review.analysis.answer_verdict.verdict.replaceAll("_", " ")}
                      </h3>
                      <p>{current.ai_review.analysis.answer_verdict.explanation}</p>
                      {current.ai_review.analysis.answer_verdict.evidence.map((quote) => (
                        <blockquote
                          key={`${quote.source_block_ref}:${quote.occurrence_index}:${quote.exact_quote}`}
                        >
                          “{quote.exact_quote}” <small>{quote.source_block_ref}</small>
                        </blockquote>
                      ))}
                    </section>
                  ) : null}
                  <div className="analyst-coverage" aria-label="Criterion evidence coverage">
                    {(
                      [
                        "SUPPORTED",
                        "CONTRADICTED",
                        "NOT_ADDRESSED",
                        "INSUFFICIENT_EVIDENCE",
                      ] as const
                    ).map((status) => (
                      <span key={status}>
                        {
                          current.ai_review.analysis!.criterion_findings.filter(
                            (finding) => finding.status === status,
                          ).length
                        }{" "}
                        {status.toLowerCase().replaceAll("_", " ")}
                      </span>
                    ))}
                  </div>
                  <section>
                    <h3>Source-linked summary</h3>
                    {current.ai_review.analysis.summary.map((sentence, index) => (
                      <p key={`${sentence.sentence}-${index}`}>
                        {sentence.sentence}{" "}
                        <small>
                          [
                          {sentence.sources
                            .map(({ source_block_ref }) => source_block_ref)
                            .join(", ")}
                          ]
                        </small>
                      </p>
                    ))}
                  </section>
                  {current.ai_review.analysis.schema_version === "answer-evidence-edge-draft@2" ? (
                    <section className="language-analysis">
                      <div className="analyst-section-heading">
                        <div>
                          <p className="section-kicker">Answer language</p>
                          <h3>Language analysis</h3>
                        </div>
                        <small>Observations describe this answer, not the Candidate.</small>
                      </div>
                      <div className="language-analysis-grid">
                        {current.ai_review.analysis.language_findings.map((finding) => (
                          <article
                            className={`severity-card severity-card--${finding.severity.toLowerCase()}`}
                            aria-label={`${finding.dimension.replaceAll("_", " ")}: ${severityLabel(finding.severity)}`}
                            key={finding.dimension}
                          >
                            <div className="severity-card__header">
                              <strong>{finding.dimension.replaceAll("_", " ")}</strong>
                              <span>
                                {finding.severity} · {severityLabel(finding.severity)}
                              </span>
                            </div>
                            <p>{finding.observation}</p>
                            {finding.evidence.map((quote) => (
                              <blockquote
                                key={`${finding.dimension}:${quote.source_block_ref}:${quote.occurrence_index}`}
                              >
                                “{quote.exact_quote}”
                              </blockquote>
                            ))}
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  <section>
                    <h3>Sealed criteria</h3>
                    {current.ai_review.analysis.criterion_findings.map((finding) => (
                      <article className="analyst-finding" key={finding.criterion_ref}>
                        <strong>{finding.status.replaceAll("_", " ")}</strong>
                        <span>{finding.criterion_ref}</span>
                        <p>{finding.explanation}</p>
                        {[...finding.supporting_evidence, ...finding.contradicting_evidence].map(
                          (quote) => (
                            <blockquote
                              key={`${quote.source_block_ref}:${quote.occurrence_index}:${quote.exact_quote}`}
                            >
                              “{quote.exact_quote}” <small>{quote.source_block_ref}</small>
                            </blockquote>
                          ),
                        )}
                      </article>
                    ))}
                  </section>
                  <section>
                    <h3>Still unknown</h3>
                    <ul>
                      {current.ai_review.analysis.still_unknown.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h3>Questions for the reviewer</h3>
                    <ul>
                      {current.ai_review.analysis.reviewer_questions.map((item) => (
                        <li key={item.question}>{item.question}</li>
                      ))}
                    </ul>
                  </section>
                  {current.ai_review.process_evidence?.schema_version !==
                    "answer-process-evidence@2" &&
                  current.ai_review.analysis.process_timeline.length > 0 ? (
                    <details className="process-context">
                      <summary>Legacy neutral process context</summary>
                      <p>Historical @1 evidence is not retrospectively severity-classified.</p>
                      <ul>
                        {current.ai_review.analysis.process_timeline.map((item) => (
                          <li key={`${item.source_block_ref}:${item.statement}`}>
                            {item.statement}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              )}
              <BehaviorProfile
                processEvidence={current.ai_review.process_evidence}
                citedRefs={evidence}
                onCitationChange={(signalRef, checked) =>
                  setEvidence((items) =>
                    checked ? [...items, signalRef] : items.filter((item) => item !== signalRef),
                  )
                }
              />
            </details>
          </section>
          <aside className="review-form">
            <p className="section-kicker">Required human receipt</p>
            <h2>Your next answer stays locked until this commits.</h2>
            <fieldset>
              <legend>Bounded decision</legend>
              {(["ADVANCE_ELIGIBLE", "NO_FURTHER_PROOF", "INCONCLUSIVE"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="decision"
                    value={value}
                    checked={decision === value}
                    onChange={() => setDecision(value)}
                  />
                  {value.replaceAll("_", " ")}
                </label>
              ))}
            </fieldset>
            <label>
              Evidence-linked review comment
              <textarea
                rows={7}
                minLength={10}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="What in this answer changed or supported your judgment?"
              />
            </label>
            <label>
              Still unknown
              <textarea
                rows={4}
                value={unknown}
                onChange={(event) => setUnknown(event.target.value)}
                placeholder="Name what this bounded task cannot establish, or leave blank for the explicit None statement."
              />
            </label>
            <p className="review-lock-note">No Skip · no batch reject · no next-answer prefetch</p>
            <button
              className="primary-button"
              disabled={busy || comment.trim().length < 10 || evidence.length === 0}
              type="button"
              onClick={() => void submitReview()}
            >
              {busy ? "Recording…" : "Record review & release Slot"}
            </button>
            {error === null ? null : (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
