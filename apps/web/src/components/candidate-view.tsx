import type { CandidateProjectionModel } from "../lib/demo-view-model";

type CandidateViewProps = Readonly<{
  projection: CandidateProjectionModel;
}>;

export function CandidateView({ projection }: CandidateViewProps) {
  return (
    <div className="dashboard-stack">
      <section className="candidate-status-card">
        <div className="candidate-status-topline">
          <span className="state-chip">{projection.status}</span>
          <span>{projection.alias}</span>
        </div>
        <h2>{projection.statusLabel}</h2>
        <p>
          The named reviewer selected a candidate-specific challenge, recorded an evidence-linked
          outcome, and settled this review window.
        </p>
        <div className="waiting-track" aria-label="Proof progress">
          <span className="complete">Review reserved</span>
          <span className="complete">Stage A submitted</span>
          <span className="complete">Human checkpoint</span>
          <span className="complete">Outcome recorded</span>
        </div>
      </section>

      <div className="two-column-layout">
        <section className="commitment-card">
          <p className="section-kicker">Your backed review window</p>
          <h2>{projection.opportunity}</h2>
          <dl className="stacked-definition">
            <div>
              <dt>Named reviewer</dt>
              <dd>{projection.reviewer}</dd>
            </div>
            <div>
              <dt>Review window</dt>
              <dd>{projection.status}</dd>
            </div>
            <div>
              <dt>Checkpoint SLA</dt>
              <dd>{projection.checkpointSla}</dd>
            </div>
            <div>
              <dt>Proof input</dt>
              <dd>{projection.proofDuration}</dd>
            </div>
          </dl>
          <div className="policy-callout">
            <strong>Closed Proof policy</strong>
            <span>{projection.candidateAiPolicy}</span>
            <small>
              A controlled remote workspace reduces access; it does not prove the room is AI-free.
            </small>
          </div>
        </section>

        <section className="profile-preview-card">
          <p className="section-kicker">Your outcome</p>
          <h2>{projection.outcome}</h2>
          <div className="candidate-outcome-copy">
            <span>Human-selected challenge</span>
            <strong>{projection.selectedChallenge.label}</strong>
            <small>{projection.selectedChallenge.id}</small>
          </div>
          <div className="candidate-outcome-copy">
            <span>Progressive reveal</span>
            <strong>
              {projection.labelsRevealedToEmployer
                ? "Authorized after mutual advance"
                : "Labels remain sealed"}
            </strong>
          </div>
          <div className="sealed-block">
            <span>Fields governed by the reveal policy</span>
            <ul>
              {projection.sealedFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="challenge-placeholder">
        <span className="challenge-index">Done</span>
        <div>
          <p className="section-kicker">Causal human checkpoint</p>
          <h2>Sarah chose {projection.selectedChallenge.label}.</h2>
          <p>
            This Candidate Projection is built from the same Golden Replay source as Sarah&apos;s
            view. It does not receive GPT&apos;s private recommendation list.
          </p>
        </div>
      </section>
    </div>
  );
}
