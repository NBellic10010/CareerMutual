"use client";

import type { AttentionAllocationReceipt, EmployerMatchingProjection } from "@onlyboth/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface EmployerMatchingPanelProps {
  readonly initialProjection: EmployerMatchingProjection;
  readonly csrfToken: string;
}

export function EmployerMatchingPanel({
  initialProjection,
  csrfToken,
}: EmployerMatchingPanelProps) {
  const [projection, setProjection] = useState(initialProjection);
  const [selectedEdgeRef, setSelectedEdgeRef] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<AttentionAllocationReceipt | null>(null);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/v1/employer/opportunities/${projection.opportunity_ref}/matching`,
      { cache: "no-store" },
    );
    if (response.ok) {
      setProjection((await response.json()) as EmployerMatchingProjection);
    }
  }, [projection.opportunity_ref]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 600);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const cards = useMemo(
    () =>
      [...projection.cards].sort((left, right) => left.opaque_id.localeCompare(right.opaque_id)),
    [projection.cards],
  );

  async function reserve(): Promise<void> {
    if (selectedEdgeRef === null || projection.state !== "READY_FOR_DIRECT") return;
    setPending(true);
    setErrorCode(null);
    idempotencyKey.current ??= window.crypto.randomUUID();
    const response = await fetch(
      `/api/v1/opportunities/${projection.opportunity_ref}/reserve-attention`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
          "X-CSRF-Token": csrfToken,
          "X-Correlation-Id": `employer-matching-ui-${window.crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          schema_version: "reserve-matched-attention-command@1",
          direct_match_edge_ref: selectedEdgeRef,
          expected_matching_cycle_version: projection.matching_cycle_version,
          expected_commitment_version: projection.commitment_version,
        }),
      },
    );
    if (response.ok) {
      setReceipt((await response.json()) as AttentionAllocationReceipt);
      await refresh();
    } else {
      const body = (await response.json()) as { readonly error?: { readonly code?: string } };
      setErrorCode(body.error?.code ?? "COMMAND_FAILED");
      if (response.status === 409) await refresh();
    }
    setPending(false);
  }

  return (
    <div className="dashboard-stack" data-testid="employer-matching-panel">
      <section className="matching-metric-grid" aria-label="Matching cycle summary">
        <article className="matching-metric">
          <span>Hard eligible</span>
          <strong data-testid="eligible-count">{projection.eligible_count}</strong>
          <small>Typed predicates only</small>
        </article>
        <article className="matching-metric matching-metric-accent">
          <span>Bounded proof path</span>
          <strong data-testid="proofable-count">{projection.proofable_count}</strong>
          <small>Validated MatchEdges</small>
        </article>
        <article className="matching-metric">
          <span>No bounded proof</span>
          <strong data-testid="abstain-count">{projection.abstain_count}</strong>
          <small>Legal abstain, not rejection</small>
        </article>
        <article className="matching-metric">
          <span>Backed attention</span>
          <strong>{projection.attention_slots}</strong>
          <small>1 Direct + 1 Explore</small>
        </article>
      </section>

      <section className="contract-card">
        <div>
          <p className="section-kicker">Label-blind matching cycle</p>
          <h2>Choose one proof path. The allocator owes a second look.</h2>
          <p>
            Sarah sees frozen claims, sources, and testable uncertainty—not names, schools,
            employers, referrals, scores, or model rank.
          </p>
        </div>
        <div className="panel-provenance">
          <span className="state-chip" data-testid="matching-state">
            {projection.state}
          </span>
          <small>{projection.disclosure}</small>
          <small>Allocator · {projection.allocator_version}</small>
        </div>
      </section>

      {projection.state === "EVALUATING" ? (
        <section className="challenge-placeholder" aria-live="polite">
          <span className="challenge-index">20</span>
          <div>
            <h2>Building source-bounded edges…</h2>
            <p>Allocation stays locked until every candidate is propose or abstain.</p>
          </div>
        </section>
      ) : null}

      {projection.state === "NEEDS_HUMAN" ? (
        <section className="challenge-placeholder" role="alert">
          <span className="challenge-index">!</span>
          <div>
            <h2>Allocation blocked by a platform result.</h2>
            <p>{projection.needs_human_count} evaluation(s) require human resolution.</p>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="candidate-pool-title">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Opaque ID order · never model order</p>
            <h2 id="candidate-pool-title">Twenty eligible interests</h2>
          </div>
          <span className="privacy-chip">Private labels physically separated</span>
        </div>
        <div className="matching-card-grid">
          {cards.map((card) => {
            const selectable =
              projection.state === "READY_FOR_DIRECT" &&
              card.status === "PROOFABLE" &&
              card.match_edge_ref !== null;
            const selected = card.match_edge_ref === selectedEdgeRef;
            return (
              <article
                className={`matching-card${selected ? " selected" : ""}`}
                data-status={card.status}
                key={card.candidate_ref}
              >
                <header>
                  <div>
                    <span>Opaque interest</span>
                    <h3>{card.opaque_id}</h3>
                  </div>
                  <span className="state-chip">{card.status.replaceAll("_", " ")}</span>
                </header>
                {card.status === "PROOFABLE" ? (
                  <>
                    <p>{card.why}</p>
                    <dl className="matching-edge-details">
                      <div>
                        <dt>Uncertainty</dt>
                        <dd>{card.uncertainty_ref}</dd>
                      </div>
                      <div>
                        <dt>Proof template</dt>
                        <dd>{card.proof_template_ref}</dd>
                      </div>
                      <div>
                        <dt>Source coverage</dt>
                        <dd>{card.source_refs.join(" · ")}</dd>
                      </div>
                    </dl>
                    <button
                      aria-pressed={selected}
                      className="select-edge-button"
                      disabled={!selectable}
                      onClick={() => setSelectedEdgeRef(card.match_edge_ref)}
                      type="button"
                    >
                      {selected ? "Selected as Direct" : "Choose as Direct"}
                    </button>
                  </>
                ) : (
                  <div className="bounded-abstain">
                    <strong>No silent rejection</strong>
                    <p>{card.abstain_reason_code ?? "Evaluation in progress"}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {projection.state === "READY_FOR_DIRECT" ? (
        <section className="attention-reserve-bar">
          <div>
            <span>Sarah&apos;s human choice</span>
            <strong>{selectedEdgeRef ?? "Select one proofable MatchEdge"}</strong>
          </div>
          <button
            className="authorize-button"
            disabled={selectedEdgeRef === null || pending}
            onClick={() => void reserve()}
            type="button"
          >
            {pending ? "Reserving atomically…" : "Reserve 2 attention slots"}
          </button>
        </section>
      ) : null}

      {projection.state === "ALLOCATED" ? (
        <section className="allocation-receipt" aria-live="polite" data-testid="allocation-receipt">
          <div className="allocation-receipt-heading">
            <div>
              <p className="section-kicker">Attention Allocation Receipt</p>
              <h2>One human choice, one auditable Explore.</h2>
            </div>
            <span className="state-chip">20 credits held atomically</span>
          </div>
          <div className="allocation-pair">
            {projection.allocations.map((allocation) => (
              <article key={allocation.allocation_kind}>
                <span>{allocation.allocation_kind}</span>
                <strong>{allocation.candidate_ref}</strong>
                <small>{allocation.review_window_ref}</small>
                <small>
                  {allocation.credit_hold_ref} · {allocation.credits} credits
                </small>
                {allocation.public_hash !== null ? <code>{allocation.public_hash}</code> : null}
              </article>
            ))}
          </div>
          <p className="public-seed">
            Public seed <strong>{projection.public_seed}</strong> · hash ascending, then candidate
            ID
          </p>
          <a className="authorize-button allocation-next-link" href="/employer">
            Open Sarah&apos;s Challenge checkpoint
          </a>
          {receipt !== null ? (
            <small>
              Committed event {receipt.event_id} · cycle v{receipt.new_matching_cycle_version}
            </small>
          ) : null}
        </section>
      ) : null}

      {errorCode !== null ? (
        <p className="command-error" role="alert">
          Attention was not reserved · {errorCode}
        </p>
      ) : null}
    </div>
  );
}
