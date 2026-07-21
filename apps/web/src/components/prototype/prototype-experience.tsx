"use client";

import { useReducer, type Dispatch } from "react";

import { CandidatePrototype } from "./prototype-candidate";
import { EmployerPrototype } from "./prototype-employer";
import { CareerMutualTrademark } from "../career-mutual-trademark";
import styles from "./prototype.module.css";
import {
  INITIAL_PROTOTYPE_STATE,
  prototypeReducer,
  type PrototypeAction,
  type PrototypePhase,
  type PrototypeState,
} from "./prototype-state";

const JOURNEY = ["Interest", "Backed slot", "Answer", "Human review", "Reveal"] as const;

const PHASE_PROGRESS: Record<PrototypePhase, number> = {
  OPPORTUNITY_OPEN: 0,
  WAITING_FOR_BACKED_SLOT: 0,
  BACKED_OFFERED: 1,
  ANSWER_ACTIVE: 2,
  REVIEW_PENDING: 3,
  COHORT_READY: 3,
  RESUME_REVEALED: 4,
  OFFER_RELEASED: 1,
};

export interface PrototypeCanvasProps {
  readonly state: PrototypeState;
  readonly dispatch: Dispatch<PrototypeAction>;
}

export function PrototypeExperience() {
  const [state, dispatch] = useReducer(prototypeReducer, INITIAL_PROTOTYPE_STATE);
  return <PrototypeCanvas state={state} dispatch={dispatch} />;
}

export function PrototypeCanvas({ state, dispatch }: PrototypeCanvasProps) {
  const progress = PHASE_PROGRESS[state.phase];

  return (
    <main className={styles.prototypeShell} data-testid="prototype-canvas" id="prototype-main">
      <a className={styles.skipLink} href="#prototype-content">
        Skip to prototype content
      </a>

      <section className={styles.prototypeBanner} role="note">
        <span className={styles.liveGlyph} aria-hidden="true" />
        <strong>UI Prototype</strong>
        <span>Local simulated state · no backend connected</span>
        <code>NO API / NO DB / NO OPENAI</code>
      </section>

      <header className={styles.prototypeHeader}>
        <div className={styles.prototypeTitle}>
          <p>
            <CareerMutualTrademark />
            <span> / Attention before labor</span>
          </p>
          <h1>
            Work earns the reveal.
            <span>Not pedigree.</span>
          </h1>
        </div>

        <div className={styles.prototypeControls}>
          <div aria-label="Prototype role" className={styles.roleTabs} role="tablist">
            {(["CANDIDATE", "EMPLOYER"] as const).map((role) => (
              <button
                aria-controls="prototype-content"
                aria-selected={state.role === role}
                className={state.role === role ? styles.roleTabActive : styles.roleTab}
                data-testid={`role-${role.toLowerCase()}`}
                key={role}
                onClick={() => dispatch({ type: "SET_ROLE", role })}
                role="tab"
                type="button"
              >
                <span>{role === "CANDIDATE" ? "01" : "02"}</span>
                {role === "CANDIDATE" ? "Candidate" : "Sarah · Employer"}
              </button>
            ))}
          </div>
          <button
            className={styles.resetButton}
            data-testid="prototype-reset"
            onClick={() => dispatch({ type: "RESET" })}
            type="button"
          >
            Reset prototype ↺
          </button>
        </div>
      </header>

      <nav aria-label="Prototype journey" className={styles.journeyRail}>
        {JOURNEY.map((label, index) => (
          <div
            className={
              index < progress
                ? styles.journeyDone
                : index === progress
                  ? styles.journeyNow
                  : styles.journeyNext
            }
            key={label}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </nav>

      <section aria-live="polite" className={styles.prototypeNotice} data-testid="prototype-notice">
        <span>{state.role === "CANDIDATE" ? "Candidate projection" : "Employer projection"}</span>
        <p>{state.notice}</p>
      </section>

      <div className={styles.prototypeContent} id="prototype-content" role="tabpanel">
        {state.role === "CANDIDATE" ? (
          <CandidatePrototype dispatch={dispatch} state={state} />
        ) : (
          <EmployerPrototype dispatch={dispatch} state={state} />
        )}
      </div>

      <footer className={styles.prototypeFooter}>
        <span>Synthetic hiring data only</span>
        <span>Refresh clears every interaction</span>
        <span>Visual prototype ≠ privacy or audit enforcement</span>
      </footer>
    </main>
  );
}
