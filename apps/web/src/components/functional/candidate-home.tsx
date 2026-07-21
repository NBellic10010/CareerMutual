"use client";

import type { CandidateOpportunityFeedV2, RoleCategory } from "@onlyboth/contracts";
import { useMemo, useState } from "react";

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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<RoleCategory | "ALL">("ALL");
  const categories = useMemo(
    () => [...new Set(feed.opportunities.map((job) => job.role_category))],
    [feed.opportunities],
  );
  const visibleJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return feed.opportunities.filter(
      (job) =>
        (category === "ALL" || job.role_category === category) &&
        (normalized.length === 0 ||
          [job.title, job.organization_public_name, job.public_role_summary, job.role_category]
            .join(" ")
            .toLowerCase()
            .includes(normalized)),
    );
  }, [category, feed.opportunities, query]);

  return (
    <main className="functional-shell">
      <section className="functional-hero compact-hero">
        <div>
          <p className="eyebrow">{candidateLabel} / matched opportunities</p>
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

      <section className="opportunity-controls" aria-label="Opportunity filters">
        <label>
          <span>Search all {feed.opportunities.length} open roles</span>
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
            All <span>{feed.opportunities.length}</span>
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

      <section className="opportunity-list" aria-label="Open jobs with discovery guidance">
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
            <strong>No role matches this local filter.</strong>
            <p>Clear the search or choose All. No open JobPost has been hidden by GPT.</p>
          </div>
        ) : null}
      </section>
      <p className="product-disclosure">
        Discovery guidance is not eligibility or Employer ranking. Credits are a rate limit, never a
        bid, and all open jobs remain visible.
      </p>
    </main>
  );
}
