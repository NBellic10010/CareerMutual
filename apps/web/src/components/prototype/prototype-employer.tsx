import type { Dispatch, FormEvent } from "react";

import {
  ADVANCEMENT_ANSWERS,
  PROTOTYPE_OPPORTUNITY,
  REVIEW_EVIDENCE,
  SLOT_FIXTURES,
  getExploreAnswerRef,
  getResumeForAnswer,
} from "./prototype-fixtures";
import styles from "./prototype.module.css";
import type { PrototypeAction, PrototypeState } from "./prototype-state";

interface EmployerPrototypeProps {
  readonly state: PrototypeState;
  readonly dispatch: Dispatch<PrototypeAction>;
}

export function EmployerPrototype({ state, dispatch }: EmployerPrototypeProps) {
  if (state.phase === "REVIEW_PENDING") {
    return <HumanReviewWorkspace dispatch={dispatch} state={state} />;
  }
  if (state.phase === "COHORT_READY") {
    return <AdvancementBoard dispatch={dispatch} state={state} />;
  }
  if (state.phase === "RESUME_REVEALED") {
    return <EmployerReveal state={state} />;
  }
  return <CommitmentDashboard state={state} />;
}

function CommitmentDashboard({ state }: Pick<EmployerPrototypeProps, "state">) {
  const waiting = state.phase === "WAITING_FOR_BACKED_SLOT" ? 13 : 12;
  return (
    <div className={styles.employerDashboard} data-testid="employer-commitment-dashboard">
      <section className={styles.employerMetricGrid} aria-label="Blind Review Commitment metrics">
        <article>
          <span>Eligible interests</span>
          <strong>20</strong>
          <small>Typed hard facts only</small>
        </article>
        <article className={styles.metricAccent}>
          <span>Reusable review Slots</span>
          <strong>8</strong>
          <small>Concurrent WIP · not a total cap</small>
        </article>
        <article>
          <span>Waiting for backing</span>
          <strong>{waiting}</strong>
          <small>No ability conclusion</small>
        </article>
        <article>
          <span>Candidate profiles received</span>
          <strong>0</strong>
          <small>Unavailable before answers</small>
        </article>
      </section>

      <section className={styles.commitmentHeader}>
        <div>
          <p className={styles.overline}>BLIND REVIEW COMMITMENT / ACTIVE</p>
          <h2>Eight obligations. Zero pre-answer candidates.</h2>
          <p>
            Sarah funds a rolling review lane. Every settled Slot immediately returns to the public
            non-profile Queue.
          </p>
        </div>
        <dl>
          <div>
            <dt>Reviewer</dt>
            <dd>Sarah Chen</dd>
          </div>
          <div>
            <dt>Review SLA</dt>
            <dd>24 hours</dd>
          </div>
          <div>
            <dt>Queue policy</dt>
            <dd>interest-queue@1</dd>
          </div>
          <div>
            <dt>Credit account</dt>
            <dd>8 reserved · 0 breached</dd>
          </div>
        </dl>
      </section>

      <section className={styles.slotBoard}>
        <header>
          <div>
            <p className={styles.overline}>LIVE WIP COORDINATES</p>
            <h3>Reusable Answer Review Slots</h3>
          </div>
          <span className={styles.privacyBadge}>PROFILE ACCESS / DISABLED</span>
        </header>
        <div className={styles.slotGrid}>
          {SLOT_FIXTURES.map(({ slot, state: slotState, deadline }) => {
            const currentState =
              slot === "08" && state.phase === "BACKED_OFFERED" ? "OFFERED" : slotState;
            return (
              <article data-state={currentState} key={slot}>
                <span>SLOT / {slot}</span>
                <strong>{currentState}</strong>
                <small>{deadline}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.noCandidatePanel}>
        <div aria-hidden="true" className={styles.lockedProfileStack}>
          <span /> <span /> <span />
        </div>
        <div>
          <p className={styles.overline}>PRE-ANSWER PROJECTION BOUNDARY</p>
          <h3>There is no candidate browsing screen here.</h3>
          <p>
            Queue order cannot read a Resume, Claim, MatchEdge, GPT rationale, score, rank, or
            Employer preference.
          </p>
        </div>
      </section>
    </div>
  );
}

function HumanReviewWorkspace({ state, dispatch }: EmployerPrototypeProps) {
  const reviewReady =
    state.reviewDecision !== null &&
    state.selectedEvidenceRefs.length > 0 &&
    state.stillUnknown.trim().length > 0;

  function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewReady) dispatch({ type: "RECORD_HUMAN_REVIEW" });
  }

  return (
    <div className={styles.reviewWorkspace} data-testid="employer-review-workspace">
      <header className={styles.reviewHeader}>
        <div>
          <p className={styles.overline}>Evidence-linked human review / 08 OF 08</p>
          <h2>Anonymous Answer 08</h2>
          <p>One Application. One named Receipt. Opening or scrolling does not settle the Slot.</p>
        </div>
        <div className={styles.reviewDeadline}>
          <span>Review obligation</span>
          <strong>01:18:42</strong>
          <small>Credit Hold · HELD</small>
        </div>
      </header>

      <div className={styles.reviewColumns}>
        <section className={styles.anonymousAnswerCard}>
          <div className={styles.answerIdentityRow}>
            <span>ANON / 4F2A</span>
            <strong>RESUME LOCKED</strong>
          </div>
          <h3>{PROTOTYPE_OPPORTUNITY.criticalQuestion}</h3>
          <blockquote>
            “Persist the idempotency record and payment transition in one transaction, then return
            the stored Payment Intent result for every retry. A pending state needs a recovery path
            that never invokes the provider twice for the same key.”
          </blockquote>
          <div className={styles.artifactStrip}>
            <div>
              <span>Artifact</span>
              <strong>answer-snapshot-08</strong>
            </div>
            <div>
              <span>Visible verifier</span>
              <strong>4 / 4 passed</strong>
            </div>
            <div>
              <span>Question version</span>
              <strong>payment-retry@1</strong>
            </div>
          </div>
        </section>

        <section className={styles.evidenceMap}>
          <div className={styles.panelLabel}>
            <span>GPT</span> Evidence map · no score
          </div>
          {REVIEW_EVIDENCE.map((evidence) => (
            <article key={evidence.ref}>
              <code>{evidence.ref}</code>
              <strong>{evidence.label}</strong>
              <p>{evidence.detail}</p>
            </article>
          ))}
          <div className={styles.unknownCallout}>
            <span>Still unknown</span>
            <p>Cross-region replay and provider-side acknowledgement loss were not tested.</p>
          </div>
        </section>

        <form className={styles.reviewForm} onSubmit={submitReview}>
          <div className={styles.panelLabel}>
            <span>HUMAN</span> Sarah&apos;s accountable action
          </div>
          <fieldset>
            <legend>Does this answer merit deeper verification?</legend>
            {(
              [
                ["ADVANCE_ELIGIBLE", "Advance eligible", "Worth a bounded next proof"],
                ["NO_FURTHER_PROOF", "No further proof", "This answer does not justify Stage B"],
                ["INCONCLUSIVE", "Inconclusive", "Evidence is insufficient or conflicting"],
              ] as const
            ).map(([value, label, help]) => (
              <label className={styles.decisionOption} key={value}>
                <input
                  checked={state.reviewDecision === value}
                  name="review-decision"
                  onChange={() => dispatch({ type: "SET_REVIEW_DECISION", decision: value })}
                  type="radio"
                  value={value}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{help}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Evidence supporting this review</legend>
            {REVIEW_EVIDENCE.map((evidence) => (
              <label className={styles.evidenceCheckbox} key={evidence.ref}>
                <input
                  checked={state.selectedEvidenceRefs.includes(evidence.ref)}
                  onChange={() => dispatch({ type: "TOGGLE_EVIDENCE", evidenceRef: evidence.ref })}
                  type="checkbox"
                />
                <span>{evidence.ref}</span>
                {evidence.label}
              </label>
            ))}
          </fieldset>

          <label className={styles.unknownInput} htmlFor="prototype-still-unknown">
            Still unknown
            <textarea
              id="prototype-still-unknown"
              onChange={(event) =>
                dispatch({ type: "SET_STILL_UNKNOWN", value: event.target.value })
              }
              placeholder="Name one bounded uncertainty that remains…"
              value={state.stillUnknown}
            />
          </label>

          <button
            className={styles.primaryButton}
            data-testid="record-review"
            disabled={!reviewReady}
            type="submit"
          >
            Record review &amp; release this Slot <span>→</span>
          </button>
          <p className={styles.formBoundary}>No bulk action · no Skip · no Resume access</p>
        </form>
      </div>
    </div>
  );
}

function AdvancementBoard({ state, dispatch }: EmployerPrototypeProps) {
  return (
    <div className={styles.advancementLayout} data-testid="employer-advancement-board">
      <section className={styles.settlementFlash} aria-live="polite">
        <div>
          <span>01</span>
          <strong>Human Review Receipt recorded</strong>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>02</span>
          <strong>Slot 08 released</strong>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>03</span>
          <strong>Next queued Interest offered</strong>
        </div>
      </section>

      <header className={styles.advancementHeader}>
        <div>
          <p className={styles.overline}>POST-ANSWER ADVANCEMENT / UNLOCKED</p>
          <h2>Eight reviews complete. Now choose from work.</h2>
          <p>Every card below is an anonymous Answer with a named Human Review Receipt.</p>
        </div>
        <div className={styles.cohortGauge}>
          <span>Review barrier</span>
          <strong>
            {state.cohortReviewed} / {state.cohortSize}
          </strong>
          <small>COMPLETE</small>
        </div>
      </header>

      <section className={styles.answerGrid} aria-label="Reviewed anonymous answers">
        {ADVANCEMENT_ANSWERS.map((answer) => {
          const decision =
            answer.ref === "answer-08"
              ? (state.reviewDecision ?? answer.decision)
              : answer.decision;
          const selectable = decision === "ADVANCE_ELIGIBLE";
          return (
            <article
              className={selectable ? styles.answerAdvanceable : styles.answerClosed}
              key={answer.ref}
            >
              <header>
                <span>{answer.label}</span>
                <code>{answer.verifier}</code>
              </header>
              <p>{answer.evidence}</p>
              <small>{decision?.replaceAll("_", " ")}</small>
              {selectable ? (
                <button
                  data-testid={answer.ref === "answer-08" ? "advance-answer-08" : undefined}
                  onClick={() =>
                    dispatch({ type: "OPEN_ADVANCEMENT_CONFIRMATION", answerRef: answer.ref })
                  }
                  type="button"
                >
                  Advance this anonymous answer →
                </button>
              ) : (
                <span className={styles.sealedMini}>Resume remains sealed</span>
              )}
            </article>
          );
        })}
      </section>

      {state.advancementConfirmationOpen ? (
        <div className={styles.modalBackdrop}>
          <section
            aria-labelledby="advance-confirm-title"
            aria-modal="true"
            className={styles.confirmModal}
            role="dialog"
          >
            <span className={styles.modalIndex}>COMMIT / BEFORE REVEAL</span>
            <h2 id="advance-confirm-title">
              Your choice becomes irreversible before you see the Resume.
            </h2>
            <p>
              Confirming atomically holds one Deep Proof Slot, pins the payment-retry Challenge
              scope, commits the Advancement Receipt, and only then authorizes Resume Reveal.
            </p>
            <dl>
              <div>
                <dt>Selected evidence</dt>
                <dd>{state.selectedAnswerRef}</dd>
              </div>
              <div>
                <dt>Deep Proof Slot</dt>
                <dd>DP-SLOT-01</dd>
              </div>
              <div>
                <dt>Credit Hold</dt>
                <dd>10 CREDITS · READY</dd>
              </div>
              <div>
                <dt>Resume access</dt>
                <dd>LOCKED UNTIL COMMIT</dd>
              </div>
            </dl>
            <div className={styles.modalActions}>
              <button
                className={styles.primaryButton}
                data-testid="confirm-advancement"
                onClick={() => dispatch({ type: "CONFIRM_ADVANCEMENT" })}
                type="button"
              >
                Commit Advancement, then Reveal <span>→</span>
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => dispatch({ type: "CLOSE_ADVANCEMENT_CONFIRMATION" })}
                type="button"
              >
                Return to evidence
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function EmployerReveal({ state }: Pick<EmployerPrototypeProps, "state">) {
  const directRef = state.advancedAnswerRef ?? "answer-08";
  const exploreRef = getExploreAnswerRef(directRef);
  const directResume = getResumeForAnswer(directRef);
  const exploreResume = getResumeForAnswer(exploreRef);

  if (directResume === null || exploreResume === null) {
    return <p role="alert">Synthetic Resume fixture unavailable.</p>;
  }

  return (
    <div className={styles.revealLayout} data-testid="employer-resume-reveal">
      <header className={styles.revealHeader}>
        <div>
          <p className={styles.overline}>POST-ANSWER REVEAL / AUTHORIZED</p>
          <h2>Selection committed before reveal.</h2>
          <p>
            Two Deep Proof attention Holds exist. Only their authorized Resume snapshots appear.
          </p>
        </div>
        <span className={styles.revealStatus}>2 / 2 ATTENTION HOLDS · HELD</span>
      </header>

      <section className={styles.revealCausalRail} aria-label="Reveal causal order">
        <span>Anonymous evidence</span>
        <i>→</i>
        <span>Human Advancement</span>
        <i>→</i>
        <span>Attention held</span>
        <i>→</i>
        <strong>Resume revealed</strong>
      </section>

      <div className={styles.revealGrid}>
        <article className={styles.pinnedEvidence}>
          <div className={styles.evidencePin}>PINNED / DECISION SOURCE</div>
          <p className={styles.overline}>Evidence stays first</p>
          <h3>Anonymous Answer 08</h3>
          <blockquote>
            “Commit the replay record and payment transition atomically; return the stored result
            for every retry.”
          </blockquote>
          {REVIEW_EVIDENCE.map((evidence) => (
            <div className={styles.pinnedEvidenceRow} key={evidence.ref}>
              <code>{evidence.ref}</code>
              <span>{evidence.label}</span>
            </div>
          ))}
          <footer>
            <span>Human Review</span>
            <strong>ADVANCE ELIGIBLE</strong>
          </footer>
        </article>

        <section className={styles.resumeStack} aria-label="Authorized synthetic Resume snapshots">
          <ResumeDocument allocation="HUMAN ADVANCE" answerRef={directRef} resume={directResume} />
          <ResumeDocument
            allocation="PUBLIC-SEED EXPLORE"
            answerRef={exploreRef}
            resume={exploreResume}
            compact
          />
        </section>
      </div>

      <section className={styles.attentionReceipt}>
        <div>
          <span>Selection receipt</span>
          <strong>ADV-COHORT-01</strong>
        </div>
        <div>
          <span>Deep Proof attention held</span>
          <strong>DP-SLOT-01 + DP-SLOT-02</strong>
        </div>
        <div>
          <span>Challenge scope</span>
          <strong>payment-retry@1 · PINNED</strong>
        </div>
        <div>
          <span>Reveal policy</span>
          <strong>post-answer-advancement@1</strong>
        </div>
      </section>
    </div>
  );
}

type ResumeFixture = NonNullable<ReturnType<typeof getResumeForAnswer>>;

function ResumeDocument({
  allocation,
  answerRef,
  resume,
  compact = false,
}: Readonly<{
  allocation: string;
  answerRef: string;
  resume: ResumeFixture;
  compact?: boolean;
}>) {
  return (
    <article className={compact ? styles.resumeDocumentCompact : styles.resumeDocument}>
      <div className={styles.resumeRevealStamp}>REVEALED AFTER COMMIT</div>
      <header>
        <span>
          {allocation} · {answerRef}
        </span>
        <strong>{resume.version}</strong>
      </header>
      <h3>{resume.name}</h3>
      <p>{resume.headline}</p>
      <dl>
        <div>
          <dt>Previous employer</dt>
          <dd>{resume.previousEmployer}</dd>
        </div>
        <div>
          <dt>Education</dt>
          <dd>{resume.school}</dd>
        </div>
        <div>
          <dt>Experience</dt>
          <dd>{resume.experience}</dd>
        </div>
      </dl>
      <small>Synthetic private labels · authorized prototype view</small>
    </article>
  );
}
