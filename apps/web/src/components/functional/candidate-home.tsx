"use client";

import type { CandidateOpportunityFeedV2, RoleCategory } from "@onlyboth/contracts";
import { useMemo, useState } from "react";

export type CandidateFeedLayer = "MATCHED" | "ALL";

type CandidateJobCard = CandidateOpportunityFeedV2["opportunities"][number];

const ACTIVE_JOURNEY_STATES = new Set<CandidateJobCard["interest_state"]>([
  "WAITING_FOR_BACKED_SLOT",
  "BACKED_OFFERED",
  "APPLICATION_ACTIVE",
  "APPLICATION_SUBMITTED",
  "REVIEWED",
  "EMPLOYER_BREACH",
]);

export function belongsToMatchedCandidateFeed(job: CandidateJobCard): boolean {
  const hasCurrentConnection = ["EVIDENCE_CONNECTED", "ADJACENT"].includes(job.discovery.status);
  const hasStaleConnection =
    job.discovery.status === "STALE" &&
    (job.discovery.evidence_refs.length > 0 || job.discovery.capability_refs.length > 0);
  return (
    hasCurrentConnection ||
    hasStaleConnection ||
    ACTIVE_JOURNEY_STATES.has(job.interest_state) ||
    job.active_answer_session_ref !== null
  );
}

export function candidateJobsForFeedLayer(
  jobs: readonly CandidateJobCard[],
  layer: CandidateFeedLayer,
): readonly CandidateJobCard[] {
  return layer === "MATCHED" ? jobs.filter(belongsToMatchedCandidateFeed) : jobs;
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
  readonly feed: CandidateOpportunityFeedV2;
  readonly candidateLabel: string;
}) {
  const [feedLayer, setFeedLayer] = useState<CandidateFeedLayer>("MATCHED");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<RoleCategory | "ALL">("ALL");
  const matchedJobs = useMemo(
    () => candidateJobsForFeedLayer(feed.opportunities, "MATCHED"),
    [feed.opportunities],
  );
  const layerJobs = feedLayer === "MATCHED" ? matchedJobs : feed.opportunities;
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

  function chooseFeedLayer(layer: CandidateFeedLayer) {
    setFeedLayer(layer);
    setCategory("ALL");
  }

  return (
    <main className="functional-shell">
      <section className="functional-hero compact-hero">
        <div>
          <p className="eyebrow">
            {candidateLabel} / {feedLayer === "MATCHED" ? "matched for you" : "explore all jobs"}
          </p>
          <h1>Apply only when attention is already there.</h1>
          <p>
            Registering interest is free. One Candidate Credit is consumed only after a backed
            review Slot is offered and you explicitly start the bounded answer.
          </p>
        </div>
        <aside className="credit-orbit" aria-label="Candidate Credit balance">
          <span>Application Credits</span>
          <strong>{feed.credit.available_credits}</strong>
          <small>of {feed.credit.allowance} this cycle</small>
        </aside>
      </section>

      <section className="discovery-banner" aria-label="Candidate discovery status">
        <div>
          <p className="section-kicker">Private discovery guidance</p>
          <h2>Why these roles may connect to your evidence</h2>
          <p>
            GPT links your Candidate-only Snapshot to public capability statements. It never hides
            an open job, changes queue order, or sends these reasons to the Employer.
          </p>
        </div>
        <div className="discovery-banner-action">
          <span className={`discovery-state state-${feed.discovery_status.toLowerCase()}`}>
            {feed.discovery_status.replaceAll("_", " ")}
          </span>
          <a className="secondary-button" href="/candidate/evidence-passport">
            Open Evidence Passport
          </a>
        </div>
      </section>

      <section className="candidate-feed-router" aria-labelledby="candidate-feed-title">
        <div className="candidate-feed-copy">
          <p className="section-kicker">Two-layer opportunity feed</p>
          <h2 id="candidate-feed-title">
            {feedLayer === "MATCHED" ? "Start with a bounded connection." : "Keep the market open."}
          </h2>
          <p>
            {feedLayer === "MATCHED"
              ? "Evidence-linked roles appear here first. Any active Interest or Application stays pinned even when discovery becomes stale."
              : "Browse every funded, open JobPost. A missing discovery signal never removes your right to express Interest."}
          </p>
        </div>
        <div className="candidate-feed-tabs" role="tablist" aria-label="Opportunity feed layer">
          <button
            id="matched-feed-tab"
            type="button"
            role="tab"
            aria-controls="candidate-feed-panel"
            aria-selected={feedLayer === "MATCHED"}
            tabIndex={feedLayer === "MATCHED" ? 0 : -1}
            onClick={() => chooseFeedLayer("MATCHED")}
          >
            <span>Matched for you</span>
            <strong>{matchedJobs.length}</strong>
            <small>Evidence-linked</small>
          </button>
          <button
            id="all-jobs-feed-tab"
            type="button"
            role="tab"
            aria-controls="candidate-feed-panel"
            aria-selected={feedLayer === "ALL"}
            tabIndex={feedLayer === "ALL" ? 0 : -1}
            onClick={() => chooseFeedLayer("ALL")}
          >
            <span>Explore all jobs</span>
            <strong>{feed.opportunities.length}</strong>
            <small>Nothing hidden</small>
          </button>
        </div>
      </section>

      <section className="opportunity-controls" aria-label="Opportunity filters">
        <label>
          <span>
            Search {feedLayer === "MATCHED" ? matchedJobs.length : feed.opportunities.length}{" "}
            {feedLayer === "MATCHED" ? "matched" : "open"} roles
          </span>
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
        className={`opportunity-list feed-layer-${feedLayer.toLowerCase()}`}
        id="candidate-feed-panel"
        key={feedLayer}
        role="tabpanel"
        aria-labelledby={feedLayer === "MATCHED" ? "matched-feed-tab" : "all-jobs-feed-tab"}
        aria-label={
          feedLayer === "MATCHED"
            ? "Jobs matched through Candidate-only discovery"
            : "All open jobs"
        }
      >
        {visibleJobs.map((job, index) => (
          <article className="job-row" key={job.opportunity_ref}>
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
                  <strong>{job.discovery.status.replaceAll("_", " ")}</strong>
                </header>
                <p>
                  {job.discovery.why ??
                    "No bounded source connection is available yet. This open role remains fully visible."}
                </p>
                {job.discovery.evidence_refs.length === 0 ? null : (
                  <div className="discovery-ref-row">
                    {job.discovery.evidence_refs.map((reference) => (
                      <code key={reference}>{reference}</code>
                    ))}
                  </div>
                )}
                {job.discovery.still_unknown.length === 0 ? null : (
                  <details>
                    <summary>Still unknown ({job.discovery.still_unknown.length})</summary>
                    <ul>
                      {job.discovery.still_unknown.map((unknown) => (
                        <li key={unknown}>{unknown}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            </div>
            <div className="job-action">
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
        ))}
        {visibleJobs.length === 0 ? (
          <div className="empty-opportunity-filter">
            <strong>
              {feedLayer === "MATCHED"
                ? "No bounded connection is ready for this view."
                : "No role matches this local filter."}
            </strong>
            <p>
              {feedLayer === "MATCHED"
                ? "Your access is unchanged. Explore every open JobPost while discovery refreshes."
                : "Clear the search or choose All. No open JobPost has been hidden by GPT."}
            </p>
            {feedLayer === "MATCHED" ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => chooseFeedLayer("ALL")}
              >
                Explore all jobs
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
      <p className="product-disclosure">
        Matched for you is private discovery guidance, not eligibility or Employer ranking. Every
        open JobPost remains accessible in Explore all jobs; Credits are a rate limit, never a bid.
      </p>
    </main>
  );
}
