import type { EmployerProjectionModel } from "../lib/demo-view-model";

type EmployerViewProps = Readonly<{
  projection: EmployerProjectionModel;
}>;

export function EmployerView({ projection }: EmployerViewProps) {
  return (
    <div className="dashboard-stack">
      <section className="metric-grid" aria-label="Opportunity summary">
        <article className="metric-card metric-card-accent">
          <span>Active proof windows</span>
          <strong>{projection.activeWindows}</strong>
          <small>Next candidate access · {projection.nextCandidateAccess}</small>
        </article>
        <article className="metric-card">
          <span>Named reviewer</span>
          <strong className="metric-text">{projection.reviewer}</strong>
          <small>Human checkpoint required</small>
        </article>
        <article className="metric-card">
          <span>Checkpoint SLA</span>
          <strong className="metric-text">90 sec</strong>
          <small>{projection.checkpointSla}</small>
        </article>
      </section>

      <section className="contract-card">
        <div>
          <p className="section-kicker">Capability contract</p>
          <h2>{projection.opportunity}</h2>
        </div>
        <dl className="contract-definition">
          <div>
            <dt>Critical failure</dt>
            <dd>{projection.criticalFailure}</dd>
          </div>
          <div>
            <dt>Decision uncertainty</dt>
            <dd>{projection.decisionUncertainty}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="veiled-candidates-heading">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Label-blind queue</p>
            <h2 id="veiled-candidates-heading">Evidence before pedigree</h2>
          </div>
          <span className="privacy-chip">Private labels excluded server-side</span>
        </div>

        <div className="candidate-grid">
          {projection.candidates.map((candidate) => (
            <article className="candidate-card" key={candidate.alias}>
              <header className="candidate-card-header">
                <div>
                  <span className="allocation-chip">{candidate.allocation}</span>
                  <h3>{candidate.alias}</h3>
                </div>
                <span className="eligible-chip">{candidate.eligibility}</span>
              </header>

              <div className="fact-grid">
                {candidate.hardFacts.map((fact) => (
                  <div key={fact.label}>
                    <span>{fact.label}</span>
                    <strong>{fact.value}</strong>
                  </div>
                ))}
              </div>

              <div className="claim-block">
                <span>Verifiable claim</span>
                {candidate.claims.map((claim) => (
                  <div key={claim.claimId}>
                    <strong>{claim.capability}</strong>
                    <p>{claim.statement}</p>
                    <small>Claim ref · {claim.claimId}</small>
                  </div>
                ))}
              </div>

              <div className="sealed-block">
                <span>Sealed for first-round review</span>
                <ul>
                  {candidate.sealedFields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              </div>

              <div className="proof-summary">
                <span>Human-selected challenge</span>
                <strong>{candidate.selectedChallenge.label}</strong>
                <small>{candidate.selectedChallenge.id}</small>
                <div className="proof-summary-result">
                  <b>
                    {candidate.commonVerifier.passed} / {candidate.commonVerifier.total}
                  </b>
                  <span>Common Verifier · {candidate.scenarioFinding}</span>
                </div>
              </div>

              <footer className="card-footer">
                <span className="state-chip">{candidate.reviewWindowState}</span>
                <span>
                  Outcome · {candidate.outcome} · Labels{" "}
                  {candidate.revealAuthorized ? "authorized" : "sealed"}
                </span>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
