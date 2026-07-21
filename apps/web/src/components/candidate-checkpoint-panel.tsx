"use client";

import type { CandidateReviewWindowProjection } from "@onlyboth/contracts";
import { useEffect, useState } from "react";

interface CandidateCheckpointPanelProps {
  readonly initialProjection: CandidateReviewWindowProjection;
}

export function CandidateCheckpointPanel({ initialProjection }: CandidateCheckpointPanelProps) {
  const [projection, setProjection] = useState(initialProjection);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetch(`/api/v1/candidate/review-windows/${projection.review_window_id}`, {
        cache: "no-store",
      }).then(async (response) => {
        if (response.ok) {
          setProjection((await response.json()) as CandidateReviewWindowProjection);
        }
      });
    }, 600);
    return () => window.clearInterval(timer);
  }, [projection.review_window_id]);

  return (
    <div className="dashboard-stack" data-testid="candidate-checkpoint-panel">
      <section className="candidate-status-card" aria-live="polite">
        <div className="candidate-status-topline">
          <span className="state-chip">{projection.state}</span>
          <span>Candidate 42</span>
        </div>
        <h2>{projection.message}</h2>
        <div className="waiting-track" aria-label="Proof progress">
          <span className="complete">Review reserved</span>
          <span className="complete">Stage A submitted</span>
          <span className={projection.state === "CHECKPOINT_PENDING" ? "active" : "complete"}>
            Human checkpoint
          </span>
          <span className={projection.state === "STAGE_B_ACTIVE" ? "active" : ""}>Stage B</span>
        </div>
      </section>

      <section className="commitment-card">
        <p className="section-kicker">Backed review window</p>
        <h2>Senior Backend Engineer</h2>
        <dl className="stacked-definition">
          <div>
            <dt>Named reviewer</dt>
            <dd>{projection.reviewer.display_name}</dd>
          </div>
          <div>
            <dt>Projection polling</dt>
            <dd>600ms · server state is authoritative</dd>
          </div>
          <div>
            <dt>Recommendation privacy</dt>
            <dd>Employer-only list, never sent here</dd>
          </div>
        </dl>
      </section>

      {projection.state === "CHECKPOINT_PENDING" ? (
        <section className="challenge-placeholder">
          <span className="challenge-index">…</span>
          <div>
            <p className="section-kicker">Checkpoint pending</p>
            <h2>Sarah is reviewing your initial artifact.</h2>
            <p>No Challenge ID is exposed until her authenticated command commits.</p>
          </div>
        </section>
      ) : null}

      {projection.state === "STAGE_B_ACTIVE" ? (
        <section className="selected-branch-card">
          <span className="state-chip">Replay branch loaded</span>
          <p className="section-kicker">Sarah&apos;s causal intervention</p>
          <h2>{projection.selected_challenge.challenge_ref}</h2>
          <p>{projection.selected_challenge.candidate_notice}</p>
          <small>Sandbox branch · {projection.selected_challenge.sandbox_branch_ref}</small>
        </section>
      ) : null}

      {projection.state === "PLATFORM_ABORT" ? (
        <section className="challenge-placeholder">
          <span className="challenge-index">×</span>
          <div>
            <h2>Platform Abort</h2>
            <p>{projection.message}</p>
          </div>
        </section>
      ) : null}

      <p className="synthetic-inline">Synthetic — Pre-recorded external inputs</p>
    </div>
  );
}
