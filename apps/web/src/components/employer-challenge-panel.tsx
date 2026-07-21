"use client";

import type {
  EmployerReviewWindowProjection,
  HumanAuthorizationReceipt,
} from "@onlyboth/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

interface EmployerChallengePanelProps {
  readonly initialProjection: EmployerReviewWindowProjection;
  readonly csrfToken: string;
}

export function EmployerChallengePanel({
  initialProjection,
  csrfToken,
}: EmployerChallengePanelProps) {
  const [projection, setProjection] = useState(initialProjection);
  const [receipt, setReceipt] = useState<HumanAuthorizationReceipt | null>(
    initialProjection.authorization,
  );
  const [pendingChallenge, setPendingChallenge] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const idempotencyKeys = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/v1/employer/review-windows/${projection.review_window_id}`, {
      cache: "no-store",
    });
    if (response.ok) {
      const next = (await response.json()) as EmployerReviewWindowProjection;
      setProjection(next);
      if (next.authorization !== null) {
        setReceipt(next.authorization);
      }
    }
  }, [projection.review_window_id]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 600);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function authorize(challengeRef: string): Promise<void> {
    if (
      projection.recommendation.output_ref === null ||
      projection.state !== "CHECKPOINT_PENDING"
    ) {
      return;
    }
    setPendingChallenge(challengeRef);
    setErrorCode(null);
    const idempotencyKey = idempotencyKeys.current.get(challengeRef) ?? window.crypto.randomUUID();
    idempotencyKeys.current.set(challengeRef, idempotencyKey);
    const response = await fetch(
      `/api/v1/review-windows/${projection.review_window_id}/challenge/select`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-CSRF-Token": csrfToken,
          "X-Correlation-Id": `employer-ui-${window.crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          schema_version: "select-human-challenge-command@1",
          selection_source: "AI_RECOMMENDATION",
          recommendation_output_ref: projection.recommendation.output_ref,
          challenge_ref: challengeRef,
          expected_version: projection.aggregate_version,
        }),
      },
    );
    if (response.ok) {
      setReceipt((await response.json()) as HumanAuthorizationReceipt);
      await refresh();
    } else {
      const body = (await response.json()) as { readonly error?: { readonly code?: string } };
      setErrorCode(body.error?.code ?? "COMMAND_FAILED");
      if (response.status === 409) {
        await refresh();
      }
    }
    setPendingChallenge(null);
  }

  return (
    <div className="dashboard-stack" data-testid="employer-challenge-panel">
      <section className="contract-card">
        <div>
          <p className="section-kicker">Proof Analyst Panel</p>
          <h2>Which uncertainty should Sarah test next?</h2>
          <p>GPT prepares evidence-linked options. Sarah authorizes the action.</p>
        </div>
        <div className="panel-provenance">
          <span className="state-chip">{projection.recommendation.status}</span>
          <small>{projection.disclosure}</small>
          <small>Prompt · {projection.recommendation.prompt_version}</small>
        </div>
      </section>

      {projection.recommendation.status === "RUNNING" ? (
        <section className="challenge-placeholder" aria-live="polite">
          <span className="challenge-index">AI</span>
          <div>
            <h2>Validating Stage A refs against the pinned Catalog…</h2>
            <p>The Candidate endpoint still receives no recommendation list.</p>
          </div>
        </section>
      ) : null}

      {projection.recommendation.status === "READY" ? (
        <section aria-labelledby="recommendation-heading">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">Equal-weight options</p>
              <h2 id="recommendation-heading">Three bounded ways to reduce uncertainty</h2>
            </div>
            <span className="privacy-chip">Evidence refs only · labels excluded</span>
          </div>
          <div className="recommendation-grid">
            {projection.recommendation.options.map((option) => (
              <article className="recommendation-card" key={option.challenge_ref}>
                <header>
                  <span className="state-chip">Catalog locked</span>
                  <h3>{option.challenge_ref}</h3>
                </header>
                <div>
                  <strong>Tests</strong>
                  <ul>
                    {option.tests.map((test) => (
                      <li key={test}>{test}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>Why</strong>
                  <p>{option.why}</p>
                </div>
                <div>
                  <strong>Sources</strong>
                  <p>{option.sources.join(" · ")}</p>
                </div>
                <div>
                  <strong>Still unknown</strong>
                  <p>{option.still_unknown.join(" ") || "No additional unknown recorded."}</p>
                </div>
                <button
                  className="authorize-button"
                  disabled={pendingChallenge !== null || projection.state !== "CHECKPOINT_PENDING"}
                  onClick={() => void authorize(option.challenge_ref)}
                  type="button"
                >
                  {pendingChallenge === option.challenge_ref
                    ? "Authorizing…"
                    : "Authorize this challenge"}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {["NEEDS_HUMAN", "FAILED", "SUPERSEDED"].includes(projection.recommendation.status) ? (
        <section className="challenge-placeholder" role="status">
          <span className="challenge-index">!</span>
          <div>
            <h2>{projection.recommendation.status.replace("_", " ")}</h2>
            <p>
              No free-text decision was substituted. A current Stage A Evidence ref is required for
              the manual Catalog command.
            </p>
            <small>{projection.recommendation.reason_code}</small>
          </div>
        </section>
      ) : null}

      {receipt !== null ? (
        <section className="authorization-receipt" aria-live="polite">
          <span className="state-chip">Human authorized</span>
          <strong>{receipt.challenge_ref}</strong>
          <small>
            Event {receipt.event_id} · aggregate v{receipt.aggregate_version}
          </small>
        </section>
      ) : null}
      {errorCode !== null ? (
        <p className="command-error" role="alert">
          Authorization was not committed · {errorCode}
        </p>
      ) : null}
    </div>
  );
}
