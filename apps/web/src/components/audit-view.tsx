import type { AuditProjectionModel } from "../lib/demo-view-model";

type AuditViewProps = Readonly<{
  projection: AuditProjectionModel;
}>;

export function AuditView({ projection }: AuditViewProps) {
  return (
    <div className="dashboard-stack">
      <section className="audit-warning">
        <span>Judge-only counterfactual</span>
        <strong>{projection.accessBoundary}</strong>
        <p>
          These synthetic profile signals are never serialized into Sarah&apos;s first-round
          projection.
        </p>
      </section>

      <section aria-labelledby="crosswalk-heading">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Prediction crosswalk</p>
            <h2 id="crosswalk-heading">Profile signal versus work evidence</h2>
          </div>
          <span className="audit-chip">Synthetic data only</span>
        </div>
        <div className="crosswalk-grid">
          {projection.candidates.map((candidate) => (
            <article className="crosswalk-card" key={candidate.counterfactualAlias}>
              <div className="crosswalk-profile">
                <span>{candidate.counterfactualAlias}</span>
                <strong>{candidate.profileSignal}</strong>
                <p>
                  Traditional rank <b>{candidate.traditionalRank}</b>
                </p>
                <small>{candidate.traditionalOutcome}</small>
              </div>
              <div className="crosswalk-arrow" aria-hidden="true">
                →
              </div>
              <div className="crosswalk-evidence">
                <span>{candidate.veiledAlias}</span>
                <strong>{candidate.challenge}</strong>
                <p>
                  Common Verifier <b>{candidate.verification}</b>
                </p>
                <small>{candidate.disagreement}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="two-column-layout">
        <section className="invariant-card">
          <p className="section-kicker">Mechanism invariants</p>
          <h2>What the product must enforce</h2>
          <ol className="invariant-list">
            {projection.invariants.map((invariant) => (
              <li key={invariant}>{invariant}</li>
            ))}
          </ol>
        </section>

        <section className="timeline-card">
          <p className="section-kicker">Cold-open sources</p>
          <h2>30-second audit timeline</h2>
          <ol className="audit-timeline">
            {projection.timeline.map((entry) => (
              <li key={`${entry.at}-${entry.event}`}>
                <time>{entry.at}</time>
                <div>
                  <strong>{entry.event}</strong>
                  <span>{entry.source}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
