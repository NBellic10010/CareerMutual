"use client";

import type { CandidateAnswerSessionProjection, CandidateJobDetailV2 } from "@onlyboth/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CriticalChallengeView } from "./critical-challenge-view";
import { AnswerSandbox } from "./answer-sandbox";
import { RolePageArtwork } from "./role-page-artwork";

type Credit = Readonly<{
  available_credits: number;
  version: number;
}>;

function key(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

export function CandidateJobDetailView({
  job,
  credit,
  csrfToken,
  candidateRef,
}: {
  readonly job: CandidateJobDetailV2;
  readonly credit: Credit;
  readonly csrfToken: string;
  readonly candidateRef: string;
}) {
  const router = useRouter();
  const [showConsent, setShowConsent] = useState(false);
  const [workAuthorization, setWorkAuthorization] = useState(false);
  const [timezoneOverlap, setTimezoneOverlap] = useState("");
  const [requiredLanguage, setRequiredLanguage] = useState("");
  const [checked, setChecked] = useState([false, false, false, false, false, false, false]);
  const [sandboxSession, setSandboxSession] = useState<CandidateAnswerSessionProjection | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function command(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": key("candidate-ui"),
      },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok)
      throw new Error(
        String((result.error as { code?: string } | undefined)?.code ?? "COMMAND_FAILED"),
      );
    return result;
  }

  async function registerInterest() {
    setBusy(true);
    setError(null);
    try {
      await command(`/api/v1/candidate/opportunities/${job.opportunity_ref}/interests`, {
        schema_version: "candidate-interest-command@2",
        hard_facts: [
          {
            fact_ref: `${candidateRef}:work-auth`,
            fact_type: "work_authorization",
            value: workAuthorization,
          },
          {
            fact_ref: `${candidateRef}:timezone`,
            fact_type: "timezone_overlap",
            value: timezoneOverlap,
          },
          {
            fact_ref: `${candidateRef}:language`,
            fact_type: "required_language",
            value: requiredLanguage,
          },
        ],
        consent_version: job.terms_version,
        expected_opportunity_version: job.opportunity_version,
        background_access_basis:
          job.eligibility_access.access_basis === "AI_POSITIVE_EVIDENCE"
            ? "AI_POSITIVE_EVIDENCE"
            : "OPEN_TO_ALL",
        eligibility_match_ref: job.eligibility_access.match_ref,
        eligibility_match_version: job.eligibility_access.match_version,
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Interest could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function acceptOffer() {
    if (job.backed_offer === null || checked.some((value) => !value)) return;
    setBusy(true);
    setError(null);
    try {
      const receipt = await command(
        `/api/v1/candidate/answer-invitations/${job.backed_offer.invitation_ref}/accept`,
        {
          schema_version: "start-backed-application-command@3",
          terms_version: job.terms_version,
          ai_disclosure_version: job.ai_disclosure_version,
          conditional_reveal_consent_version: job.conditional_reveal_consent_version,
          sandbox_focus_policy_version: job.sandbox_focus_policy_version,
          focus_tracking_disclosure_version: job.focus_tracking_disclosure_version,
          employer_ai_review_policy: job.employer_ai_review_policy,
          employer_ai_review_disclosure_version: job.employer_ai_review_disclosure_version,
          expected_obligation_version: job.backed_offer.expected_obligation_version,
          expected_slot_version: job.backed_offer.expected_slot_version,
          expected_candidate_credit_version: credit.version,
        },
      );
      setShowConsent(false);
      await openSandbox(String(receipt.answer_session_ref));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Offer could not be accepted.");
    } finally {
      setBusy(false);
    }
  }

  async function openSandbox(answerSessionRef: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/candidate/answer-sessions/${encodeURIComponent(answerSessionRef)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("ANSWER_SESSION_NOT_FOUND");
      setSandboxSession((await response.json()) as CandidateAnswerSessionProjection);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Answer Session could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="functional-shell candidate-workspace candidate-job-detail-workspace"
      data-role-theme="candidate"
    >
      <RolePageArtwork surface="CANDIDATE_ROLE" />
      <a className="back-link" href="/candidate">
        ← Matched opportunities
      </a>
      <section className="job-detail-hero">
        <div>
          <p className="eyebrow">{job.organization_public_name} / backed application</p>
          <h1>{job.title}</h1>
          <p>{job.public_role_summary}</p>
        </div>
        <aside className="commitment-ticket">
          <span>Human attention</span>
          <strong>{job.backed_offer?.reviewer_display_name ?? "Slot queue"}</strong>
          <small>
            {job.human_review_sla_hours}h review SLA · {job.maximum_candidate_minutes} min answer
          </small>
        </aside>
      </section>
      <div className="job-detail-grid">
        <div className="job-detail-primary">
          <section className="functional-card job-contract-card">
            <p className="section-kicker">Public contract</p>
            <h2>What the work asks for</h2>
            <ul className="clean-list">
              {job.public_hard_requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>Capability scope</h3>
            <div className="tag-row">
              {job.capability_areas.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="challenge-preview-callout">
              <span>Challenge formats</span>
              <strong>{job.challenge_part_kinds.join(" + ")}</strong>
              <p>
                The entire ordered Challenge is disclosed before you register Interest or spend a
                Credit.
              </p>
            </div>
          </section>
          <CriticalChallengeView challenge={job.critical_challenge} />
        </div>
        <aside className="functional-card action-card">
          <span className={`state-pill state-${job.interest_state.toLowerCase()}`}>
            {job.interest_state.replaceAll("_", " ")}
          </span>
          <h2>{credit.available_credits} Candidate Credits remain</h2>
          <p>
            Registering Interest costs nothing. Starting a backed answer costs exactly 1 Credit;
            that Credit cannot improve your position in the queue.
          </p>
          {job.interest_state === "NOT_REGISTERED" ? (
            <fieldset className="candidate-hard-facts">
              <legend>Eligibility declarations</legend>
              <div className="candidate-hard-facts-heading">
                <span>Hard constraints</span>
                <strong>Declare legal and logistical requirements</strong>
              </div>
              <label className="candidate-hard-fact-checkbox">
                <input
                  type="checkbox"
                  checked={workAuthorization}
                  onChange={(event) => setWorkAuthorization(event.target.checked)}
                />
                <span>I meet the stated work-authorization requirement</span>
              </label>
              <div className="candidate-hard-fact-fields">
                <label>
                  <span>Required time-zone overlap</span>
                  <input
                    value={timezoneOverlap}
                    placeholder="For example: ET"
                    onChange={(event) => setTimezoneOverlap(event.target.value)}
                  />
                </label>
                <label>
                  <span>Working language</span>
                  <input
                    value={requiredLanguage}
                    placeholder="For example: English"
                    onChange={(event) => setRequiredLanguage(event.target.value)}
                  />
                </label>
              </div>
              <small className="candidate-hard-facts-note">
                These declarations are checked by deterministic code, never inferred by GPT.
              </small>
            </fieldset>
          ) : null}
          {job.active_answer_session_ref !== null ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => void openSandbox(job.active_answer_session_ref!)}
            >
              Open Answer Sandbox
            </button>
          ) : job.interest_state === "NOT_REGISTERED" ? (
            <button
              className="primary-button"
              disabled={
                busy ||
                !workAuthorization ||
                timezoneOverlap.trim().length === 0 ||
                requiredLanguage.trim().length === 0
              }
              type="button"
              onClick={() => void registerInterest()}
            >
              {busy ? "Recording…" : "Register interest — free"}
            </button>
          ) : job.interest_state === "BACKED_OFFERED" ? (
            <button className="primary-button" type="button" onClick={() => setShowConsent(true)}>
              Apply with 1 Credit
            </button>
          ) : (
            <p className="queue-message">
              No work is required until a backed Attention Slot reaches you.
            </p>
          )}
          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </aside>
      </div>
      <section className="functional-card analyst-disclosure-card">
        <p className="section-kicker">Sealed review policy</p>
        <h2>Employer AI Evidence Analyst: {job.employer_ai_review_policy.replaceAll("_", " ")}</h2>
        <p>
          The Analyst may label this sealed response Good Answer or Bad Answer and describe its
          logic, clarity, consistency, and responsiveness with source-linked evidence. This is not a
          Candidate-wide score, rank, or automatic hiring decision; Sarah must still record her own
          independent review.
        </p>
        {job.employer_ai_review_policy === "ANSWER_PLUS_PROCESS" ? (
          <p>
            Server-recorded revision, platform GPT/Voice, and submission signals are classified
            green, yellow, or red under a sealed rule set. They may inform Sarah&apos;s bounded
            capability and honesty review, but do not prove intent or external AI use. Keystrokes,
            clipboard, camera, biometrics, and raw intermediate draft text are not collected for
            this profile.
          </p>
        ) : null}
        <ul className="clean-list">
          {job.review_criteria.map((criterion) => (
            <li key={criterion.criterion_ref}>{criterion.statement}</li>
          ))}
        </ul>
      </section>
      {showConsent && job.backed_offer !== null ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="consent-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-title"
          >
            <p className="eyebrow">One Credit · irreversible start</p>
            <h2 id="consent-title">Confirm this is a real application.</h2>
            {[
              "I genuinely want to be considered for this role.",
              "I authorize exactly 1 Candidate Credit to be consumed when this session starts.",
              `I accept ${job.terms_version} and conditional résumé reveal ${job.conditional_reveal_consent_version}.`,
              "I understand my answer, Voice Memo, and all platform GPT turns are disclosed to the Reviewer.",
              job.employer_ai_review_policy === "OFF"
                ? "I understand Employer AI Review is OFF for this sealed JobPost."
                : job.employer_ai_review_policy === "ANSWER_PLUS_PROCESS"
                  ? `I consent under ${job.employer_ai_review_disclosure_version} to source-linked Good/Bad answer and language analysis, plus red/yellow/green classification of disclosed server-recorded behavior signals. These signals may inform the Reviewer but do not prove intent or external AI use.`
                  : `I consent under ${job.employer_ai_review_disclosure_version} to source-linked Good/Bad analysis of this sealed answer and its language. It is not a Candidate-wide score, rank, or automatic decision.`,
              `I accept a server-timed ${job.maximum_candidate_minutes}-minute session and immutable final submission.`,
              "I understand this browser records page visibility and window focus. After a 2-second grace, the first departure warns me; the second or 15 seconds total automatically seals available work. This is not secure proctoring.",
            ].map((label, index) => (
              <label className="consent-row" key={label}>
                <input
                  type="checkbox"
                  checked={checked[index]}
                  onChange={(event) =>
                    setChecked((values) =>
                      values.map((value, item) => (item === index ? event.target.checked : value)),
                    )
                  }
                />
                <span>{label}</span>
              </label>
            ))}
            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowConsent(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || checked.some((value) => !value)}
                type="button"
                onClick={() => void acceptOffer()}
              >
                {busy ? "Starting…" : "Consume 1 Credit & start"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {sandboxSession === null ? null : (
        <AnswerSandbox
          csrfToken={csrfToken}
          initialSession={sandboxSession}
          onExit={() => {
            setSandboxSession(null);
            router.refresh();
          }}
          presentation="dialog"
        />
      )}
    </main>
  );
}
