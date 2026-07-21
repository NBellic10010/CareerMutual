"use client";

import type { CandidateOpportunityFeedV3, RoleCategory } from "@onlyboth/contracts";
import { useMemo, useState } from "react";

import { RoleHomeArtwork } from "./role-home-artwork";

export type CandidateFeedLayer = "MATCHED" | "ALL";
export type CandidateOpportunitySignalState = "OPEN" | "QUEUED" | "BACKED" | "SEALED";

type CandidateJobCard = CandidateOpportunityFeedV3["opportunities"][number];

const ACTIVE_JOURNEY_STATES = new Set<CandidateJobCard["interest_state"]>([
  "WAITING_FOR_BACKED_SLOT",
  "BACKED_OFFERED",
  "APPLICATION_ACTIVE",
  "APPLICATION_SUBMITTED",
  "REVIEWED",
  "EMPLOYER_BREACH",
]);

export function belongsToMatchedCandidateFeed(job: CandidateJobCard): boolean {
  return (
    job.eligibility_access.access_basis === "AI_POSITIVE_EVIDENCE" ||
    job.eligibility_access.access_basis === "OPEN_TO_ALL" ||
    ACTIVE_JOURNEY_STATES.has(job.interest_state) ||
    job.active_answer_session_ref !== null
  );
}

export function candidateJobsForFeedLayer(
  jobs: readonly CandidateJobCard[],
  _layer: CandidateFeedLayer,
): readonly CandidateJobCard[] {
  return jobs.filter(belongsToMatchedCandidateFeed);
}

export function candidateOpportunitySignal(job: CandidateJobCard): {
  readonly state: CandidateOpportunitySignalState;
  readonly label: string;
} {
  switch (job.interest_state) {
    case "WAITING_FOR_BACKED_SLOT":
      return { state: "QUEUED", label: "Interest seen · awaiting backed attention" };
    case "BACKED_OFFERED":
    case "APPLICATION_ACTIVE":
      return { state: "BACKED", label: "Mutual intent locked" };
    case "APPLICATION_SUBMITTED":
    case "REVIEWED":
      return { state: "SEALED", label: "Answer sealed into human review" };
    case "EMPLOYER_BREACH":
      return { state: "SEALED", label: "Attention breach settled" };
    case "OFFER_DECLINED":
      return { state: "OPEN", label: "Offer declined · role remains visible" };
    case "OFFER_EXPIRED":
      return { state: "OPEN", label: "Offer expired · role remains visible" };
    case "NOT_REGISTERED":
      return { state: "OPEN", label: "Open to your intent" };
  }
}

const CATEGORY_LABELS: Record<RoleCategory, string> = {
  TECHNOLOGY: "Technology",
  FINANCE: "Finance",
  BUSINESS_DEVELOPMENT: "Business development",
  CREATIVE: "Creative",
  SALES: "Sales",
  MARKETING: "Marketing",
  PRODUCT: "Product",
  OPERATIONS: "Operations",
  PEOPLE: "People",
  LEGAL: "Legal & privacy",
  HEALTHCARE: "Healthcare",
  SUSTAINABILITY: "Sustainability",
};

export function CandidateHome({
  feed,
  candidateLabel,
}: {
  readonly feed: CandidateOpportunityFeedV3;
  readonly candidateLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<RoleCategory | "ALL">("ALL");
  const layerJobs = feed.opportunities;
  const categories = useMemo(
    () => [...new Set(layerJobs.map((job) => job.role_category))],
    [layerJobs],
  );
  const visibleJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return layerJobs.filter(
      (job) =>
        (category === "ALL" || job.role_category === category) &&
        (normalized.length === 0 ||
          [job.title, job.organization_public_name, job.public_role_summary, job.role_category]
            .join(" ")
            .toLowerCase()
            .includes(normalized)),
    );
  }, [category, layerJobs, query]);
  const registeredInterestCount = feed.opportunities.filter((job) =>
    [
      "WAITING_FOR_BACKED_SLOT",
      "BACKED_OFFERED",
      "APPLICATION_ACTIVE",
      "APPLICATION_SUBMITTED",
      "REVIEWED",
      "EMPLOYER_BREACH",
    ].includes(job.interest_state),
  ).length;
  const backedAttentionCount = feed.opportunities.filter((job) =>
    ["BACKED_OFFERED", "APPLICATION_ACTIVE", "APPLICATION_SUBMITTED", "REVIEWED"].includes(
      job.interest_state,
    ),
  ).length;

  return (
    <main className="functional-shell candidate-workspace" data-role-theme="candidate">
      <section className="functional-hero compact-hero role-home-hero candidate-role-hero">
        <div>
          <p className="eyebrow">{candidateLabel} / career opportunity exchange</p>
          <h1>
            Signal intent. <span>Get seen.</span>
          </h1>
          <p>
            Find work connected to where you want to go, register genuine interest for free, and
            start the work only after a named Recruiter has committed review attention.
          </p>
        </div>
        <aside className="credit-orbit" aria-label="Candidate Credit balance">
          <span>Application Credits</span>
          <strong>{feed.credit.available_credits}</strong>
          <small>of {feed.credit.allowance} this cycle</small>
        </aside>
        <RoleHomeArtwork role="CANDIDATE" />
      </section>

      <section className="mutual-intent-system" aria-label="Mutual intent application status">
        <header>
          <div>
            <p className="section-kicker">Your application exchange</p>
            <h2>Candidate intent meets backed human attention.</h2>
          </div>
          <span>Credits begin after the lock</span>
        </header>
        <div className="mutual-intent-lanes">
          <div className="intent-lane intent-lane-candidate">
            <span>Candidate intent</span>
            <strong>{registeredInterestCount} signaled</strong>
            <i aria-hidden="true" />
          </div>
          <div className="intent-lock" data-active={backedAttentionCount > 0}>
            <span aria-hidden="true" />
            <strong>{backedAttentionCount > 0 ? "Attention locked" : "Awaiting both"}</strong>
          </div>
          <div className="intent-lane intent-lane-employer">
            <i aria-hidden="true" />
            <span>Recruiter attention</span>
            <strong>{backedAttentionCount} backed</strong>
          </div>
        </div>
        <p>
          Interest can enter the queue without spending a Credit. The six-minute answer opens only
          when the Recruiter side of the exchange is funded.
        </p>
      </section>

      <section className="discovery-banner" aria-label="Candidate eligibility matching status">
        <div>
          <p className="section-kicker">Private eligibility matching</p>
          <h2>Roles unlocked by a positive Evidence connection</h2>
          <p>
            GPT links your Candidate-only Snapshot to Recruiter-sealed background tags. It never
            ranks Candidates, changes queue order, or sends these reasons to the Recruiter.
          </p>
        </div>
        <div className="discovery-banner-action">
          <span className={`discovery-state state-${feed.eligibility_status.toLowerCase()}`}>
            {feed.eligibility_status.replaceAll("_", " ")}
          </span>
          <a className="secondary-button" href="/candidate/evidence-passport">
            Open Evidence Passport
          </a>
        </div>
      </section>

      <section className="candidate-feed-router" aria-labelledby="candidate-feed-title">
        <div className="candidate-feed-copy">
          <p className="section-kicker">Eligibility-controlled opportunity feed</p>
          <h2 id="candidate-feed-title">A source connection unlocks the right to apply.</h2>
          <p>
            Evidence-gated roles appear only after a validated positive connection. OPEN_TO_ALL
            roles and every existing Interest or Application remain visible.
          </p>
        </div>
        <div className="candidate-feed-tabs" aria-label="Accessible opportunities">
          <div>
            <span>Accessible now</span>
            <strong>{feed.opportunities.length}</strong>
            <small>Positive match, open access, or pinned journey</small>
          </div>
        </div>
      </section>

      <section className="opportunity-controls" aria-label="Opportunity filters">
        <label>
          <span>Search {feed.opportunities.length} accessible roles</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Role, organization, or domain"
          />
        </label>
        <div className="category-filter" role="group" aria-label="Filter by role category">
          <button
            type="button"
            aria-pressed={category === "ALL"}
            onClick={() => setCategory("ALL")}
          >
            All <span>{layerJobs.length}</span>
          </button>
          {categories.map((value) => (
            <button
              type="button"
              aria-pressed={category === value}
              key={value}
              onClick={() => setCategory(value)}
            >
              {CATEGORY_LABELS[value]}
            </button>
          ))}
        </div>
        <p aria-live="polite">
          Showing <strong>{visibleJobs.length}</strong> role{visibleJobs.length === 1 ? "" : "s"}
        </p>
      </section>

      <section
        className="opportunity-list feed-layer-matched"
        id="candidate-feed-panel"
        aria-label="Jobs accessible through Candidate eligibility"
      >
        {visibleJobs.map((job, index) => {
          const signal = candidateOpportunitySignal(job);
          return (
            <article
              className="job-row"
              data-signal-state={signal.state.toLowerCase()}
              key={job.opportunity_ref}
            >
              <span className="job-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="job-main">
                <div className="job-meta">
                  <span>{CATEGORY_LABELS[job.role_category]}</span>
                  <span>{job.organization_public_name}</span>
                  <span>{job.location_and_work_mode}</span>
                  <span>{job.compensation_range}</span>
                </div>
                <h2>{job.title}</h2>
                <p>{job.public_role_summary}</p>
                <div className="job-facts">
                  <span>{job.maximum_candidate_minutes} minute answer</span>
                  <span>{job.human_review_sla_hours}h named review SLA</span>
                  <span>{job.challenge_part_kinds.join(" + ")} Challenge</span>
                  <span>
                    {job.candidate_ai_policy === "PLATFORM_ASSISTANT_ALLOWED"
                      ? "Disclosed GPT allowed"
                      : "No AI"}
                  </span>
                </div>
                <section className="job-discovery-note" aria-label="Why this role reached you">
                  <header>
                    <span>Why this role reached you</span>
                    <strong>{job.eligibility_access.access_basis.replaceAll("_", " ")}</strong>
                  </header>
                  {job.eligibility_access.recorded_live ? (
                    <small className="recorded-live-disclosure">
                      RECORDED_LIVE · generated by a real Responses API call over synthetic Demo
                      evidence, then validated and pinned for offline replay
                    </small>
                  ) : null}
                  <p>{job.eligibility_access.why}</p>
                  {job.eligibility_access.evidence_refs.length === 0 ? null : (
                    <div className="discovery-ref-row">
                      {job.eligibility_access.evidence_refs.map((reference) => (
                        <code key={reference}>{reference}</code>
                      ))}
                    </div>
                  )}
                  {job.eligibility_access.still_unknown.length === 0 ? null : (
                    <details>
                      <summary>
                        Still unknown ({job.eligibility_access.still_unknown.length})
                      </summary>
                      <ul>
                        {job.eligibility_access.still_unknown.map((unknown) => (
                          <li key={unknown}>{unknown}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </section>
              </div>
              <div className="job-action">
                <div
                  className="job-mutual-signal"
                  data-state={signal.state.toLowerCase()}
                  aria-label={`Mutual intent status: ${signal.label}`}
                >
                  <div aria-hidden="true">
                    <i />
                    <span />
                    <i />
                  </div>
                  <small>{signal.label}</small>
                </div>
                <span className={`state-pill state-${job.interest_state.toLowerCase()}`}>
                  {job.interest_state.replaceAll("_", " ")}
                </span>
                <a className="primary-button" href={`/candidate/jobs/${job.opportunity_ref}`}>
                  {job.interest_state === "BACKED_OFFERED"
                    ? "Open backed offer"
                    : job.active_answer_session_ref !== null
                      ? "Open answer"
                      : "View role"}
                </a>
              </div>
            </article>
          );
        })}
        {visibleJobs.length === 0 ? (
          <div className="empty-opportunity-filter">
            <strong>No accessible role matches this local filter.</strong>
            <p>
              Clear the search or choose All. Publish or refresh your Evidence Passport to evaluate
              evidence-gated roles; OPEN_TO_ALL roles remain available during AI failure.
            </p>
          </div>
        ) : null}
      </section>
      <p className="product-disclosure">
        Eligibility matching controls Candidate-side JobPost visibility only. It never ranks the
        queue or reveals your Passport to the Recruiter; Credits remain a rate limit, never a bid.
      </p>
    </main>
  );
}
