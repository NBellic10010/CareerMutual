import type { Dispatch } from "react";

import { PROTOTYPE_OPPORTUNITY } from "./prototype-fixtures";
import styles from "./prototype.module.css";
import type { PrototypeAction, PrototypeState } from "./prototype-state";

interface CandidatePrototypeProps {
  readonly state: PrototypeState;
  readonly dispatch: Dispatch<PrototypeAction>;
}

const ANSWER_STARTER =
  "Persist the idempotency record and payment transition in one transaction, then return the stored payment result for every retry.";

export function CandidatePrototype({ state, dispatch }: CandidatePrototypeProps) {
  switch (state.phase) {
    case "OPPORTUNITY_OPEN":
      return <OpportunityScreen dispatch={dispatch} />;
    case "WAITING_FOR_BACKED_SLOT":
      return <QueueScreen dispatch={dispatch} />;
    case "BACKED_OFFERED":
      return <BackedOfferScreen dispatch={dispatch} />;
    case "ANSWER_ACTIVE":
      return <AnswerWorkspace dispatch={dispatch} state={state} />;
    case "REVIEW_PENDING":
    case "COHORT_READY":
      return <ReviewPendingScreen state={state} />;
    case "RESUME_REVEALED":
      return <CandidateAdvancedScreen />;
    case "OFFER_RELEASED":
      return <ReleasedScreen />;
  }
}

function OpportunityScreen({ dispatch }: Pick<CandidatePrototypeProps, "dispatch">) {
  return (
    <div className={styles.candidateOpportunity} data-testid="candidate-opportunity">
      <section className={styles.opportunityHero}>
        <div className={styles.opportunityMain}>
          <div className={styles.screenCoordinates}>
            <span>OPEN OPPORTUNITY</span>
            <code>OPP / BACKEND / 001</code>
          </div>
          <p className={styles.overline}>{PROTOTYPE_OPPORTUNITY.organization}</p>
          <h2>{PROTOTYPE_OPPORTUNITY.title}</h2>
          <p className={styles.opportunityLead}>
            One sealed production question. Six minutes of work. One named human review already
            funded before you answer.
          </p>
          <div className={styles.opportunityMeta}>
            <span>{PROTOTYPE_OPPORTUNITY.compensation}</span>
            <span>{PROTOTYPE_OPPORTUNITY.workMode}</span>
            <span>{PROTOTYPE_OPPORTUNITY.employmentType}</span>
          </div>
          <div className={styles.capabilityPanel}>
            <span>Capability area preview</span>
            <strong>{PROTOTYPE_OPPORTUNITY.capability}</strong>
            <p>The exact question stays sealed until a funded review Slot reaches you.</p>
          </div>
          <div className={styles.primaryActionRow}>
            <button
              className={styles.primaryButton}
              data-testid="register-interest"
              onClick={() => dispatch({ type: "REGISTER_INTEREST" })}
              type="button"
            >
              Register interest <span>→</span>
            </button>
            <p>Interest is not an Application. No cover letter. No candidate bid.</p>
          </div>
        </div>

        <aside className={styles.commitmentTicket}>
          <div className={styles.ticketCutout} aria-hidden="true" />
          <p>REVIEW COMMITMENT / ACTIVE</p>
          <strong>{PROTOTYPE_OPPORTUNITY.reviewer}</strong>
          <dl>
            <div>
              <dt>Review SLA</dt>
              <dd>{PROTOTYPE_OPPORTUNITY.reviewSla}</dd>
            </div>
            <div>
              <dt>Candidate effort</dt>
              <dd>{PROTOTYPE_OPPORTUNITY.effortLimit}</dd>
            </div>
            <div>
              <dt>Reusable WIP</dt>
              <dd>8 funded review Slots</dd>
            </div>
          </dl>
          <div className={styles.sealedResume}>
            <span aria-hidden="true">▧</span>
            <div>
              <strong>Resume v3 · sealed</strong>
              <small>Unavailable to Sarah before backed Advancement</small>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.hardRequirementStrip} aria-label="Public hard requirements">
        <span>Hard requirements / visible now</span>
        {PROTOTYPE_OPPORTUNITY.hardRequirements.map((requirement) => (
          <strong key={requirement}>✓ {requirement}</strong>
        ))}
      </section>
    </div>
  );
}

function QueueScreen({ dispatch }: Pick<CandidatePrototypeProps, "dispatch">) {
  return (
    <div className={styles.queueLayout} data-testid="candidate-queue">
      <section className={styles.queueStatusCard}>
        <div className={styles.queueOrdinal}>03</div>
        <div>
          <p className={styles.overline}>WAITING FOR A BACKED REVIEW SLOT</p>
          <h2>No work required yet.</h2>
          <p>
            Your hard requirements passed. You are waiting for funded human capacity—not an Employer
            ranking and not an unread Application.
          </p>
        </div>
        <span className={styles.statusPill}>WAITING_FOR_BACKED_SLOT</span>
      </section>

      <section className={styles.queueTrackCard}>
        <header>
          <div>
            <span>Public Queue Receipt</span>
            <strong>Interest receipt · INT-42-001</strong>
          </div>
          <code>policy@1</code>
        </header>
        <div className={styles.queueTrack} aria-label="Candidate Queue position">
          <div className={styles.queueAhead}>
            <span>01</span>
          </div>
          <div className={styles.queueAhead}>
            <span>02</span>
          </div>
          <div className={styles.queueYou}>
            <span>YOU</span>
          </div>
          <div className={styles.queueAfter}>
            <span>04</span>
          </div>
          <div className={styles.queueAfter}>
            <span>05</span>
          </div>
        </div>
        <dl className={styles.queueFacts}>
          <div>
            <dt>Eligible interests ahead</dt>
            <dd>2</dd>
          </div>
          <div>
            <dt>Commitment</dt>
            <dd>ACTIVE</dd>
          </div>
          <div>
            <dt>Queue rule</dt>
            <dd>Eligibility time → Interest time → public tie-break</dd>
          </div>
        </dl>
      </section>

      <aside className={styles.simulationControl}>
        <span>Prototype system control</span>
        <strong>Simulate the next settled Slot</strong>
        <p>In production, a Worker reacts to a real Human Review Settlement.</p>
        <button
          data-testid="simulate-slot"
          onClick={() => dispatch({ type: "SIMULATE_SLOT_AVAILABLE" })}
          type="button"
        >
          Make the backed Slot available →
        </button>
      </aside>
    </div>
  );
}

function BackedOfferScreen({ dispatch }: Pick<CandidatePrototypeProps, "dispatch">) {
  return (
    <div className={styles.offerLayout} data-testid="candidate-backed-offer">
      <section className={styles.offerHeadline}>
        <div className={styles.offerSeal} aria-hidden="true">
          OB
        </div>
        <div>
          <p className={styles.overline}>BACKED ANSWER OFFER / SLOT 08</p>
          <h2>Sarah committed before asking you to work.</h2>
          <p>
            Submit this six-minute answer and Sarah must record one evidence-linked review within 24
            hours—or the obligation becomes a visible breach.
          </p>
        </div>
        <span className={styles.offerExpiry}>Accept by {PROTOTYPE_OPPORTUNITY.offerExpiry}</span>
      </section>

      <div className={styles.offerGrid}>
        <section className={styles.workPacket}>
          <div className={styles.panelLabel}>
            <span>01</span> Sealed work packet
          </div>
          <h3>{PROTOTYPE_OPPORTUNITY.criticalQuestion}</h3>
          <p>
            A payment attempt succeeds, the acknowledgement is lost, and the client retries the same
            request. Explain the smallest safe state transition.
          </p>
          <div className={styles.packetRows}>
            <div>
              <span>Allowed assumptions</span>
              <strong>PostgreSQL transaction · at-least-once delivery</strong>
            </div>
            <div>
              <span>Visible tests</span>
              <strong>Duplicate request · post-charge crash · replay response</strong>
            </div>
            <div>
              <span>Candidate AI policy</span>
              <strong>No platform GPT · external AI prohibited</strong>
            </div>
            <div>
              <span>Workspace</span>
              <strong>Prototype only · no code execution or monitoring</strong>
            </div>
          </div>
        </section>

        <aside className={styles.backingLedger}>
          <div className={styles.panelLabel}>
            <span>02</span> Attention backing
          </div>
          <dl>
            <div>
              <dt>Named reviewer</dt>
              <dd>Sarah Chen</dd>
            </div>
            <div>
              <dt>Review deadline</dt>
              <dd>24h after submission</dd>
            </div>
            <div>
              <dt>Credit hold</dt>
              <dd>HELD · CH-ANSWER-08</dd>
            </div>
            <div>
              <dt>Review Slot</dt>
              <dd>SLOT-08 · OFFERED</dd>
            </div>
          </dl>
          <div className={styles.consentNotice}>
            <span aria-hidden="true">◈</span>
            <p>
              <strong>Conditional Reveal consent</strong>
              If this anonymous answer receives backed Advancement, Resume v3 will unlock to Sarah.
              A review result alone does not Reveal it.
            </p>
          </div>
        </aside>
      </div>

      <div className={styles.offerActions}>
        <button
          className={styles.primaryButton}
          data-testid="accept-offer"
          onClick={() => dispatch({ type: "ACCEPT_BACKED_OFFER" })}
          type="button"
        >
          Accept &amp; start the 6-minute answer <span>→</span>
        </button>
        <button
          className={styles.secondaryButton}
          data-testid="decline-offer"
          onClick={() => dispatch({ type: "DECLINE_BACKED_OFFER" })}
          type="button"
        >
          Decline without penalty
        </button>
      </div>
    </div>
  );
}

function AnswerWorkspace({ state, dispatch }: CandidatePrototypeProps) {
  return (
    <div className={styles.workspaceLayout} data-testid="candidate-answer-workspace">
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.overline}>ANSWER SESSION / SYNTHETIC</p>
          <h2>Find the failure boundary.</h2>
        </div>
        <div className={styles.prototypeTimer}>
          <span>Non-authoritative prototype timer</span>
          <strong>05:42</strong>
        </div>
      </header>

      <div className={styles.workspaceGrid}>
        <section className={styles.ticketPanel}>
          <div className={styles.panelLabel}>
            <span>TKT</span> PAY-271
          </div>
          <h3>Duplicate charge after retry</h3>
          <p>
            The provider accepts a charge, but the acknowledgement is lost before the local Payment
            Intent is finalized. The client retries with the same idempotency key.
          </p>
          <pre>
            <code>{`POST /payments\nIdempotency-Key: order-8842\n\ncharge() → 200\ncommit intent → timeout\nclient retries → ?`}</code>
          </pre>
          <div className={styles.assumptionList}>
            <span>Assume</span>
            <p>Provider calls are at-least-once</p>
            <p>PostgreSQL is available</p>
            <p>No distributed transaction with the provider</p>
          </div>
        </section>

        <section className={styles.answerPanel}>
          <label htmlFor="prototype-answer">Your proposed state transition</label>
          <textarea
            id="prototype-answer"
            onChange={(event) => dispatch({ type: "EDIT_ANSWER", value: event.target.value })}
            placeholder="Explain the smallest safe transition and how a retry gets the original result…"
            value={state.answerText}
          />
          <button
            className={styles.loadAnswerButton}
            onClick={() => dispatch({ type: "EDIT_ANSWER", value: ANSWER_STARTER })}
            type="button"
          >
            Load synthetic answer
          </button>
        </section>

        <aside className={styles.visibleTestsPanel}>
          <div className={styles.panelLabel}>
            <span>VIS</span> Visible tests
          </div>
          {[
            "Same key returns one Payment Intent",
            "Post-charge crash does not re-execute",
            "Stored response survives a retry",
          ].map((test) => (
            <div className={styles.testRow} key={test}>
              <span>{state.visibleTestsPassed ? "PASS" : "WAIT"}</span>
              <p>{test}</p>
            </div>
          ))}
          <button
            data-testid="run-visible-tests"
            onClick={() => dispatch({ type: "RUN_VISIBLE_TESTS" })}
            type="button"
          >
            {state.visibleTestsPassed ? "Visible tests simulated ✓" : "Run simulated visible tests"}
          </button>
          <small>No code is executed in this UI prototype.</small>
        </aside>
      </div>

      <div className={styles.submitRail}>
        <div>
          <span>What Sarah receives</span>
          <strong>Anonymous answer + evidence refs. No Resume.</strong>
        </div>
        <button
          className={styles.primaryButton}
          data-testid="submit-answer"
          disabled={state.answerText.trim().length < 40 || !state.visibleTestsPassed}
          onClick={() => dispatch({ type: "SUBMIT_ANSWER" })}
          type="button"
        >
          Submit immutable answer <span>→</span>
        </button>
      </div>
    </div>
  );
}

function ReviewPendingScreen({ state }: Pick<CandidatePrototypeProps, "state">) {
  return (
    <div className={styles.pendingLayout} data-testid="candidate-review-pending">
      <section className={styles.pendingReceipt}>
        <div className={styles.pendingPulse} aria-hidden="true" />
        <p className={styles.overline}>APPLICATION / REVIEW PENDING</p>
        <h2>Sarah is completing the backed review.</h2>
        <p>
          Your immutable answer was delivered without your Resume. The named review obligation
          remains open until Sarah records evidence, one bounded decision, and what is still
          unknown.
        </p>
        <dl>
          <div>
            <dt>Application</dt>
            <dd>APP-ANSWER-08</dd>
          </div>
          <div>
            <dt>Reviewer</dt>
            <dd>Sarah Chen</dd>
          </div>
          <div>
            <dt>Review due</dt>
            <dd>Tomorrow · 2:14 PM ET</dd>
          </div>
          <div>
            <dt>Resume</dt>
            <dd>SEALED · v3</dd>
          </div>
        </dl>
      </section>
      <aside className={styles.pendingAside}>
        <span>No ghosting state</span>
        <strong>Human Review Receipt—or visible Employer breach.</strong>
        <p>
          {state.slotRecycled
            ? "Your review is recorded; the first-layer Slot has recycled."
            : "The review obligation is still backed by held Credit."}
        </p>
      </aside>
    </div>
  );
}

function CandidateAdvancedScreen() {
  return (
    <div className={styles.candidateAdvanced} data-testid="candidate-advanced">
      <section className={styles.advanceHero}>
        <span className={styles.advanceMark} aria-hidden="true">
          ↗
        </span>
        <div>
          <p className={styles.overline}>BACKED NEXT STEP</p>
          <h2>Your anonymous work earned the conversation.</h2>
          <p>
            Sarah committed a Deep Proof review before Resume v3 was revealed. Your Candidate view
            does not expose allocation labels or anyone else&apos;s answer.
          </p>
        </div>
      </section>
      <div className={styles.candidateAdvanceGrid}>
        <article>
          <span>Deep Proof attention</span>
          <strong>HELD</strong>
          <small>Named reviewer · Sarah Chen</small>
        </article>
        <article>
          <span>Resume v3</span>
          <strong>REVEALED</strong>
          <small>Reason · backed post-answer Advancement</small>
        </article>
        <article>
          <span>Next interaction</span>
          <strong>READY</strong>
          <small>Challenge scope pinned before Reveal</small>
        </article>
      </div>
      <section className={styles.revealReceipt}>
        <span>Reveal Receipt · RR-ANSWER-08</span>
        <p>Anonymous Answer 08 → Human Review Receipt → Attention Hold → Resume v3</p>
        <strong>Selection committed before reveal ✓</strong>
      </section>
    </div>
  );
}

function ReleasedScreen() {
  return (
    <section className={styles.releasedCard} data-testid="candidate-offer-released">
      <span aria-hidden="true">↩</span>
      <div>
        <p className={styles.overline}>OFFER RELEASED</p>
        <h2>No penalty. No Candidate failure.</h2>
        <p>The Review Slot and held Credit returned to the public Queue.</p>
      </div>
    </section>
  );
}
