"use client";

import type {
  CandidateOpportunityProjection,
  CandidateReviewWindowProjection,
  ProofWindowDecisionReceipt,
} from "@onlyboth/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { CandidateCheckpointPanel } from "./candidate-checkpoint-panel";

interface CandidateMatchingPanelProps {
  readonly initialProjection: CandidateOpportunityProjection;
  readonly csrfToken: string;
}

export function CandidateMatchingPanel({
  initialProjection,
  csrfToken,
}: CandidateMatchingPanelProps) {
  const [projection, setProjection] = useState(initialProjection);
  const [checkpoint, setCheckpoint] = useState<CandidateReviewWindowProjection | null>(null);
  const [receipt, setReceipt] = useState<ProofWindowDecisionReceipt | null>(null);
  const [pendingAction, setPendingAction] = useState<"ACCEPT" | "DECLINE" | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const idempotencyKeys = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/v1/candidate/opportunities/${projection.opportunity_ref}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const next = (await response.json()) as CandidateOpportunityProjection;
    setProjection(next);
    if (
      next.review_window_ref !== null &&
      ["CHECKPOINT_PENDING", "STAGE_B_ACTIVE", "PLATFORM_ABORT"].includes(next.state)
    ) {
      const checkpointResponse = await fetch(
        `/api/v1/candidate/review-windows/${next.review_window_ref}`,
        { cache: "no-store" },
      );
      if (checkpointResponse.ok) {
        setCheckpoint((await checkpointResponse.json()) as CandidateReviewWindowProjection);
      }
    }
  }, [projection.opportunity_ref]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 600);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function decide(action: "ACCEPT" | "DECLINE"): Promise<void> {
    if (projection.review_window_ref === null || projection.review_window_version === null) return;
    setPendingAction(action);
    setErrorCode(null);
    const mapKey = `${action}:${projection.review_window_ref}`;
    const idempotencyKey = idempotencyKeys.current.get(mapKey) ?? window.crypto.randomUUID();
    idempotencyKeys.current.set(mapKey, idempotencyKey);
    const response = await fetch(
      `/api/v1/review-windows/${projection.review_window_ref}/${action.toLowerCase()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-CSRF-Token": csrfToken,
          "X-Correlation-Id": `candidate-matching-ui-${window.crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          schema_version: "proof-window-decision-command@1",
          expected_version: projection.review_window_version,
        }),
      },
    );
    if (response.ok) {
      setReceipt((await response.json()) as ProofWindowDecisionReceipt);
      await refresh();
    } else {
      const body = (await response.json()) as { readonly error?: { readonly code?: string } };
      setErrorCode(body.error?.code ?? "COMMAND_FAILED");
      if (response.status === 409) await refresh();
    }
    setPendingAction(null);
  }

  if (checkpoint !== null) {
    return <CandidateCheckpointPanel initialProjection={checkpoint} />;
  }

  return (
    <div className="dashboard-stack" data-testid="candidate-matching-panel">
      <section className="candidate-status-card" aria-live="polite">
        <div className="candidate-status-topline">
          <span className="state-chip" data-testid="candidate-matching-state">
            {projection.state}
          </span>
          <span>Candidate 42</span>
        </div>
        <h2>{projection.message}</h2>
        <div className="waiting-track" aria-label="Backed proof progress">
          <span className="complete">Interest recorded</span>
          <span className={projection.review_window_ref !== null ? "complete" : "active"}>
            Human attention
          </span>
          <span className={projection.state === "STAGE_A_ACTIVE" ? "active" : ""}>Stage A</span>
          <span>Human checkpoint</span>
        </div>
      </section>

      {projection.state === "INTEREST_RECEIVED" ? (
        <section className="challenge-placeholder">
          <span className="challenge-index">✓</span>
          <div>
            <p className="section-kicker">Interest received</p>
            <h2>No interview claim has been made.</h2>
            <p>You cannot see the candidate pool, its size, or Employer matching data.</p>
          </div>
        </section>
      ) : null}

      {projection.state === "HUMAN_REVIEW_RESERVED" ? (
        <section className="candidate-window-offer">
          <div className="candidate-window-offer-heading">
            <div>
              <p className="section-kicker">真人担保的有限接触机会</p>
              <h2>Sarah has put ten attention credits behind this window.</h2>
            </div>
            <span className="state-chip">Accept by {formatTime(projection.accept_by)}</span>
          </div>
          <dl className="window-policy-grid">
            <div>
              <dt>Named reviewer</dt>
              <dd>{projection.reviewer?.display_name}</dd>
            </div>
            <div>
              <dt>Candidate effort cap</dt>
              <dd>{projection.candidate_effort_limit_minutes} minutes</dd>
            </div>
            <div>
              <dt>Checkpoint SLA</dt>
              <dd>{projection.checkpoint_sla_seconds} seconds</dd>
            </div>
            <div>
              <dt>AI policy</dt>
              <dd>{projection.candidate_ai_policy}</dd>
            </div>
          </dl>
          <p>
            Declining or expiring returns the credit and slot. Neither creates a negative capability
            inference.
          </p>
          <div className="candidate-window-actions">
            <button
              className="authorize-button"
              disabled={pendingAction !== null}
              onClick={() => void decide("ACCEPT")}
              type="button"
            >
              {pendingAction === "ACCEPT" ? "Accepting…" : "Accept six-minute proof"}
            </button>
            <button
              className="secondary-control"
              disabled={pendingAction !== null}
              onClick={() => void decide("DECLINE")}
              type="button"
            >
              {pendingAction === "DECLINE" ? "Releasing…" : "Decline without penalty"}
            </button>
          </div>
        </section>
      ) : null}

      {projection.state === "STAGE_A_ACTIVE" ? (
        <section className="challenge-placeholder">
          <span className="challenge-index">6m</span>
          <div>
            <p className="section-kicker">Recorded Stage A</p>
            <h2>The replay sandbox is producing a patch, visible tests, and snapshot.</h2>
            <p>Sarah cannot substitute a résumé judgment for this artifact.</p>
          </div>
        </section>
      ) : null}

      {projection.state === "RELEASED" ? (
        <section className="challenge-placeholder">
          <span className="challenge-index">↩</span>
          <div>
            <h2>The backed window was released.</h2>
            <p>The slot and ten credits were returned with no candidate failure event.</p>
          </div>
        </section>
      ) : null}

      {projection.state === "PLATFORM_ABORT" ? (
        <section className="challenge-placeholder">
          <span className="challenge-index">×</span>
          <div>
            <h2>Platform Abort</h2>
            <p>No Candidate Failure or Employer Breach was recorded.</p>
          </div>
        </section>
      ) : null}

      {receipt !== null ? (
        <section className="authorization-receipt" aria-live="polite">
          <span className="state-chip">Candidate command committed</span>
          <strong>{receipt.state}</strong>
          <small>
            Event {receipt.event_id} · window v{receipt.new_version}
          </small>
        </section>
      ) : null}
      {errorCode !== null ? (
        <p className="command-error" role="alert">
          Decision was not committed · {errorCode}
        </p>
      ) : null}
      <p className="synthetic-inline">Synthetic — Pre-recorded external inputs</p>
    </div>
  );
}

function formatTime(value: string | null): string {
  if (value === null) return "unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
