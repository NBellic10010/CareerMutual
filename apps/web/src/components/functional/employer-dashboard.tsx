"use client";

import {
  ELIGIBILITY_BACKGROUND_TAG_CATALOG,
  type EligibilityBackgroundTag,
  type EmployerJobDashboard,
  type RoleCategory,
} from "@onlyboth/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { RoleHomeArtwork } from "./role-home-artwork";
import {
  EmployerChallengePartComposer,
  verifiedChallengeParts,
  type EmployerChallengeMediaPartDraft,
} from "./employer-challenge-part-composer";
import { commandResponseError, parseCreateJobPostDraftCommand } from "./employer-job-post-command";

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

const ROLE_CATEGORIES = Object.keys(CATEGORY_LABELS) as RoleCategory[];

type AttentionCapacityJob = Pick<
  EmployerJobDashboard["job_posts"][number],
  "answer_review_wip" | "available_slot_count" | "waiting_interest_count" | "pending_review_count"
>;

export function summarizeEmployerAttention(jobs: readonly AttentionCapacityJob[]) {
  return jobs.reduce(
    (summary, job) => ({
      slots: summary.slots + job.answer_review_wip,
      available: summary.available + job.available_slot_count,
      waiting: summary.waiting + job.waiting_interest_count,
      reviewDebt: summary.reviewDebt + job.pending_review_count,
    }),
    { slots: 0, available: 0, waiting: 0, reviewDebt: 0 },
  );
}

function publishedDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function commandKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

const DEFAULT_DRAFT = {
  organization_public_name: "Northstar Payments",
  title: "Senior Backend Reliability Engineer",
  role_category: "TECHNOLOGY",
  public_role_summary:
    "Own the reliability boundary for payment retries, idempotency, and failure recovery in a high-volume event-driven platform.",
  employment_type: "FULL_TIME",
  seniority_band: "SENIOR",
  compensation_range: "$185k–$225k + equity",
  location_and_work_mode: "Remote · Americas time zones",
  public_hard_requirements: [
    "Authorized to work in the hiring region",
    "English working proficiency",
    "At least four hours overlap with ET",
  ],
  hard_predicates: [
    {
      predicate_ref: "hard-work-auth",
      fact_type: "work_authorization",
      operator: "EQUALS",
      expected: true,
    },
    {
      predicate_ref: "hard-language",
      fact_type: "required_language",
      operator: "EQUALS",
      expected: "English",
    },
    {
      predicate_ref: "hard-timezone",
      fact_type: "timezone_overlap",
      operator: "EQUALS",
      expected: "ET",
    },
  ],
  capability_areas: ["Distributed systems", "Payment idempotency", "Operational reasoning"],
  eligibility_match_policy: {
    schema_version: "eligibility-match-policy@1",
    access_mode: "EVIDENCE_MATCH_REQUIRED",
    taxonomy_version: "eligibility-background-tags@1",
    accepted_tags: ELIGIBILITY_BACKGROUND_TAG_CATALOG.filter((tag) =>
      [
        "Computer Science",
        "Mathematics",
        "Information Systems",
        "Data Engineering",
        "Backend Engineering",
      ].includes(tag.public_name),
    ),
  },
  critical_question:
    "A payment retry worker can lose Redis during a failover after a provider charge succeeds but before local acknowledgement. Explain the smallest safe recovery design, the invariants you would preserve, and the tests that would falsify your approach.",
  critical_challenge: {
    schema_version: "critical-challenge@1",
    challenge_ref: "critical-challenge:composer-default@1",
    title: "Recover a charged payment without duplicating it",
    objective:
      "Design the smallest safe recovery path and make the reasoning falsifiable under a bounded payment-retry failure.",
    parts: [
      {
        part_ref: "challenge-part:composer-default:text",
        kind: "TEXT",
        title: "Failure scenario",
        instructions:
          "State the invariants, smallest safe recovery design, and tests that would falsify the approach.",
        text_content:
          "A payment retry worker can lose Redis during a failover after a provider charge succeeds but before local acknowledgement. Explain the smallest safe recovery design, the invariants you would preserve, and the tests that would falsify your approach.",
        asset: null,
      },
    ],
  },
  allowed_assumptions: [
    "At-least-once message delivery",
    "Provider idempotency keys are supported",
    "PostgreSQL remains available",
  ],
  proof_format:
    "A bounded design answer with explicit invariants, failure modes, and falsifiable tests.",
  maximum_candidate_minutes: 6,
  answer_review_sla_hours: 24,
  offer_expiry_hours: 24,
  answer_review_wip: 2,
  advancement_cohort_size: 8,
  credit_per_answer_review: 1,
  candidate_ai_policy: "PLATFORM_ASSISTANT_ALLOWED",
  employer_ai_review_policy: "OFF",
  employer_ai_review_disclosure_version: "employer-ai-review-disclosure@2",
  review_criteria: [
    {
      criterion_ref: "criterion:reliability-invariants",
      capability_ref: "capability:operational-reasoning",
      statement:
        "The answer defines concrete reliability invariants and a falsifiable recovery design.",
      support_indicators: [
        "Names invariants and ties them to tests or observable failure outcomes.",
      ],
      contradiction_indicators: [
        "Proposes a recovery path that permits duplicate payment capture.",
      ],
      bounded_limitations: [
        "This challenge cannot establish performance across unrelated systems.",
      ],
    },
  ],
  terms_version: "candidate-application-terms@2",
  ai_disclosure_version: "candidate-ai-disclosure@1",
  conditional_reveal_consent_version: "resume-reveal-consent@1",
} as const;

export function EmployerDashboard({
  initialDashboard,
  csrfToken,
}: {
  readonly initialDashboard: EmployerJobDashboard;
  readonly csrfToken: string;
}) {
  const router = useRouter();
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState<string>(DEFAULT_DRAFT.title);
  const [draftCategory, setDraftCategory] = useState<RoleCategory>(DEFAULT_DRAFT.role_category);
  const [question, setQuestion] = useState<string>(DEFAULT_DRAFT.critical_question);
  const [challengeMediaParts, setChallengeMediaParts] = useState<
    readonly EmployerChallengeMediaPartDraft[]
  >([]);
  const [slots, setSlots] = useState(2);
  const [aiReviewPolicy, setAiReviewPolicy] = useState<
    "OFF" | "ANSWER_ONLY" | "ANSWER_PLUS_PROCESS"
  >("OFF");
  const [criterion, setCriterion] = useState<string>(DEFAULT_DRAFT.review_criteria[0].statement);
  const [accessMode, setAccessMode] = useState<"OPEN_TO_ALL" | "EVIDENCE_MATCH_REQUIRED">(
    "EVIDENCE_MATCH_REQUIRED",
  );
  const [selectedTagRefs, setSelectedTagRefs] = useState<string[]>(
    DEFAULT_DRAFT.eligibility_match_policy.accepted_tags.map((tag) => tag.tag_ref),
  );
  const [tagQuery, setTagQuery] = useState("");
  const [customTags, setCustomTags] = useState<EligibilityBackgroundTag[]>([]);
  const [customTagName, setCustomTagName] = useState("");
  const [customTagKind, setCustomTagKind] = useState<"EDUCATION_FIELD" | "WORK_DOMAIN">(
    "WORK_DOMAIN",
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<RoleCategory | "ALL">("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = useMemo(
    () => [...new Set(initialDashboard.job_posts.map((job) => job.role_category))],
    [initialDashboard.job_posts],
  );
  const visibleJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return initialDashboard.job_posts.filter(
      (job) =>
        (category === "ALL" || job.role_category === category) &&
        (normalized.length === 0 ||
          [job.title, job.organization_public_name, job.role_category]
            .join(" ")
            .toLowerCase()
            .includes(normalized)),
    );
  }, [category, initialDashboard.job_posts, query]);
  const attentionCapacity = summarizeEmployerAttention(initialDashboard.job_posts);
  const visibleEligibilityTags = ELIGIBILITY_BACKGROUND_TAG_CATALOG.filter((tag) =>
    `${tag.public_name} ${tag.tag_kind}`.toLowerCase().includes(tagQuery.trim().toLowerCase()),
  );
  const challengeUploadsReady = challengeMediaParts.every(
    ({ upload_state }) => upload_state === "VERIFIED",
  );

  function closeComposer(): void {
    for (const part of challengeMediaParts) {
      if (part.preview_url !== null) URL.revokeObjectURL(part.preview_url);
    }
    setChallengeMediaParts([]);
    setComposer(false);
  }

  async function call(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": commandKey("employer-ui"),
      },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(commandResponseError(result));
    return result;
  }

  async function createDraft() {
    setBusy(true);
    setError(null);
    try {
      if (!challengeUploadsReady) throw new Error("CHALLENGE_PART_UPLOAD_INCOMPLETE");
      const challengeId = crypto.randomUUID();
      const command = parseCreateJobPostDraftCommand({
        schema_version: "create-job-post-draft-command@1",
        expected_wallet_version: initialDashboard.wallet.version,
        draft: {
          ...DEFAULT_DRAFT,
          title,
          role_category: draftCategory,
          critical_question: question,
          critical_challenge: {
            ...DEFAULT_DRAFT.critical_challenge,
            challenge_ref: `critical-challenge:composer-${challengeId}`,
            objective: question,
            parts: [
              {
                ...DEFAULT_DRAFT.critical_challenge.parts[0],
                part_ref: `challenge-part:composer-${challengeId}:text`,
                text_content: question,
              },
              ...verifiedChallengeParts(challengeMediaParts),
            ],
          },
          answer_review_wip: slots,
          eligibility_match_policy:
            accessMode === "OPEN_TO_ALL"
              ? {
                  schema_version: "eligibility-match-policy@1",
                  access_mode: "OPEN_TO_ALL",
                  open_reasons: ["NO_BACKGROUND_REQUIRED"],
                }
              : {
                  schema_version: "eligibility-match-policy@1",
                  access_mode: "EVIDENCE_MATCH_REQUIRED",
                  taxonomy_version: "eligibility-background-tags@1",
                  accepted_tags: [
                    ...ELIGIBILITY_BACKGROUND_TAG_CATALOG.filter((tag) =>
                      selectedTagRefs.includes(tag.tag_ref),
                    ),
                    ...customTags,
                  ],
                },
          employer_ai_review_policy: aiReviewPolicy,
          review_criteria: [
            {
              ...DEFAULT_DRAFT.review_criteria[0],
              statement: criterion,
            },
          ],
        },
      });
      await call("/api/v1/employer/job-posts/drafts", command);
      closeComposer();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draft could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function publish(draftRef: string, version: number) {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/v1/employer/job-posts/drafts/${draftRef}/publish`, {
        schema_version: "publish-job-post-command@1",
        expected_draft_version: version,
        expected_wallet_version: initialDashboard.wallet.version,
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "JobPost could not be published.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="functional-shell employer-workspace" data-role-theme="employer">
      <section className="functional-hero compact-hero employer-hero role-home-hero employer-role-hero">
        <div>
          <p className="eyebrow">Recruiter / Sarah Chen · mutual-intent hiring</p>
          <h1>
            Commit attention. <span>See the work.</span>
          </h1>
          <p>
            Turn genuine Candidate interest into bounded work evidence. Every opened answer creates
            a named review debt that must be settled before the next answer appears.
          </p>
        </div>
        <div className="employer-hero-actions">
          <Link className="secondary-button" href="/employer/candidates">
            Revealed Candidates
          </Link>
          <button className="primary-button" type="button" onClick={() => setComposer(true)}>
            Create JobPost
          </button>
        </div>
        <RoleHomeArtwork role="EMPLOYER" />
      </section>
      <section className="wallet-strip" aria-label="Employer Attention wallet">
        <div>
          <span>Available Attention</span>
          <strong>{initialDashboard.wallet.available_credits}</strong>
        </div>
        <div>
          <span>Committed to Slots</span>
          <strong>{initialDashboard.wallet.committed_credits}</strong>
        </div>
        <div>
          <span>Wallet version</span>
          <strong>v{initialDashboard.wallet.version}</strong>
        </div>
        <p>Credits stake review capacity. They are never shown to Candidates as a bid.</p>
      </section>
      <section className="attention-exchange" aria-label="Backed attention capacity">
        <header>
          <div>
            <p className="section-kicker">Live mutual-intent exchange</p>
            <h2>Attention turns waiting intent into visible work.</h2>
          </div>
          <strong>
            {attentionCapacity.available}/{attentionCapacity.slots} Slots ready
          </strong>
        </header>
        <div className="attention-exchange-flow">
          <div className="attention-flow-end attention-flow-candidate">
            <span>Candidate intent</span>
            <strong>{attentionCapacity.waiting} waiting</strong>
          </div>
          <div className="attention-flow-track" data-active={attentionCapacity.available > 0}>
            <i aria-hidden="true" />
            <span>Backed attention gate</span>
            <i aria-hidden="true" />
          </div>
          <div className="attention-flow-end attention-flow-employer">
            <span>Human review debt</span>
            <strong>{attentionCapacity.reviewDebt} open</strong>
          </div>
        </div>
        <p>
          Available Slots pull the next Interest forward. Opening an anonymous answer converts that
          capacity into review debt until your evidence-linked opinion commits.
        </p>
      </section>
      {initialDashboard.drafts.filter(({ state }) => state === "DRAFT").length > 0 ? (
        <section className="draft-rail">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">Unpublished</p>
              <h2>Draft JobPosts</h2>
            </div>
          </div>
          {initialDashboard.drafts
            .filter(({ state }) => state === "DRAFT")
            .map((draft) => (
              <article className="draft-row" key={draft.draft_ref}>
                <div>
                  <span>v{draft.version}</span>
                  <h3>{draft.draft.title}</h3>
                  <p>
                    {CATEGORY_LABELS[draft.draft.role_category]} ·{" "}
                    {draft.draft.critical_challenge.title}
                  </p>
                </div>
                <button
                  className="primary-button"
                  disabled={busy}
                  type="button"
                  onClick={() => void publish(draft.draft_ref, draft.version)}
                >
                  Stake {draft.draft.answer_review_wip * draft.draft.credit_per_answer_review}{" "}
                  Credits & publish
                </button>
              </article>
            ))}
        </section>
      ) : null}
      <section className="job-operations">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Live commitments</p>
            <h2>Review queues</h2>
          </div>
          <p>{initialDashboard.job_posts.length} sealed JobPost(s)</p>
        </div>
        <div className="opportunity-controls employer-job-controls" aria-label="JobPost filters">
          <label>
            <span>Search all {initialDashboard.job_posts.length} JobPosts</span>
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
              All <span>{initialDashboard.job_posts.length}</span>
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
            Showing <strong>{visibleJobs.length}</strong> JobPost
            {visibleJobs.length === 1 ? "" : "s"}
          </p>
        </div>
        {visibleJobs.map((job) => (
          <article className="operation-row" key={job.opportunity_ref}>
            <div className="operation-title">
              <span>
                {CATEGORY_LABELS[job.role_category]} · {job.organization_public_name}
              </span>
              <h3>{job.title}</h3>
              <small>Published {publishedDate(job.published_at)} UTC</small>
            </div>
            <div className="operation-metrics">
              <div>
                <span>Slots available</span>
                <strong>
                  {job.available_slot_count}/{job.answer_review_wip}
                </strong>
              </div>
              <div>
                <span>Review debt</span>
                <strong>{job.pending_review_count}</strong>
              </div>
              <div>
                <span>Waiting interests</span>
                <strong>{job.waiting_interest_count}</strong>
              </div>
            </div>
            <a
              className={job.pending_review_count > 0 ? "primary-button" : "secondary-button"}
              href={`/employer/job-posts/${job.opportunity_ref}/review`}
            >
              {job.pending_review_count > 0 ? "Review current answer" : "Open operations"}
            </a>
          </article>
        ))}
        {visibleJobs.length === 0 ? (
          <div className="empty-opportunity-filter">
            <strong>No JobPost matches this local filter.</strong>
            <p>Clear the search or choose All. No published JobPost has been hidden.</p>
          </div>
        ) : null}
      </section>
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {composer ? (
        <div className="modal-backdrop job-composer-backdrop">
          <section
            className="job-composer"
            data-job-composer="new-job-post"
            role="dialog"
            aria-modal="true"
            aria-labelledby="composer-title"
          >
            <p className="eyebrow">Seal the bounded work test</p>
            <h2 id="composer-title">New JobPost</h2>
            <label>
              Public role title
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              Role domain
              <select
                value={draftCategory}
                onChange={(event) => setDraftCategory(event.target.value as RoleCategory)}
              >
                {ROLE_CATEGORIES.map((value) => (
                  <option value={value} key={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Critical Challenge objective
              <textarea
                rows={7}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </label>
            <EmployerChallengePartComposer
              parts={challengeMediaParts}
              onChange={setChallengeMediaParts}
              csrfToken={csrfToken}
              disabled={busy}
            />
            <label>
              Reusable concurrent review Slots
              <input
                type="number"
                min={1}
                max={8}
                value={slots}
                onChange={(event) => setSlots(Number(event.target.value))}
              />
            </label>
            <fieldset className="eligibility-policy-composer">
              <legend>Candidate-side background access</legend>
              <label>
                Access mode
                <select
                  value={accessMode}
                  onChange={(event) => setAccessMode(event.target.value as typeof accessMode)}
                >
                  <option value="EVIDENCE_MATCH_REQUIRED">
                    Evidence match required — GPT validates a positive connection
                  </option>
                  <option value="OPEN_TO_ALL">Open to all — no background required</option>
                </select>
              </label>
              {accessMode === "EVIDENCE_MATCH_REQUIRED" ? (
                <>
                  <label>
                    Search 100 sealed background tags
                    <input
                      type="search"
                      value={tagQuery}
                      onChange={(event) => setTagQuery(event.target.value)}
                      placeholder="Education field or work domain"
                    />
                  </label>
                  <div className="eligibility-tag-selector">
                    {visibleEligibilityTags.slice(0, 24).map((tag) => (
                      <label key={tag.tag_ref}>
                        <input
                          type="checkbox"
                          checked={selectedTagRefs.includes(tag.tag_ref)}
                          disabled={
                            !selectedTagRefs.includes(tag.tag_ref) &&
                            selectedTagRefs.length + customTags.length >= 20
                          }
                          onChange={(event) =>
                            setSelectedTagRefs((current) =>
                              event.target.checked
                                ? [...current, tag.tag_ref]
                                : current.filter((reference) => reference !== tag.tag_ref),
                            )
                          }
                        />
                        <span>{tag.public_name}</span>
                        <small>{tag.tag_kind.replaceAll("_", " ")}</small>
                      </label>
                    ))}
                  </div>
                  <div className="custom-eligibility-tag">
                    <input
                      value={customTagName}
                      onChange={(event) => setCustomTagName(event.target.value)}
                      placeholder="Custom public tag"
                    />
                    <select
                      value={customTagKind}
                      onChange={(event) =>
                        setCustomTagKind(event.target.value as typeof customTagKind)
                      }
                    >
                      <option value="WORK_DOMAIN">Work domain</option>
                      <option value="EDUCATION_FIELD">Education field</option>
                    </select>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={
                        customTagName.trim().length < 2 ||
                        customTags.length >= 5 ||
                        selectedTagRefs.length + customTags.length >= 20
                      }
                      onClick={() => {
                        const normalized = customTagName
                          .trim()
                          .toLowerCase()
                          .replaceAll(/[^a-z0-9]+/gu, "-")
                          .replaceAll(/^-|-$/gu, "");
                        setCustomTags((current) => [
                          ...current,
                          {
                            tag_ref: `eligibility-tag:custom:${normalized}@1`,
                            tag_kind: customTagKind,
                            public_name: customTagName.trim(),
                            capability_ref: `background-capability:custom:${normalized}@1`,
                            source: "RECRUITER_CUSTOM",
                          },
                        ]);
                        setCustomTagName("");
                      }}
                    >
                      Add custom tag
                    </button>
                  </div>
                  <small>
                    {selectedTagRefs.length + customTags.length}/20 tags · up to 5 custom. These
                    tags control Candidate-side visibility only; they never rank the queue.
                  </small>
                </>
              ) : (
                <p>No Passport is required. Every Candidate can see and register Interest.</p>
              )}
            </fieldset>
            <label>
              Optional Employer AI Evidence Analyst
              <select
                value={aiReviewPolicy}
                onChange={(event) =>
                  setAiReviewPolicy(
                    event.target.value as "OFF" | "ANSWER_ONLY" | "ANSWER_PLUS_PROCESS",
                  )
                }
              >
                <option value="OFF">Off — human review only</option>
                <option value="ANSWER_ONLY">Answer verdict + language evidence</option>
                <option value="ANSWER_PLUS_PROCESS">Answer + behavior severity profile</option>
              </select>
            </label>
            <label>
              Sealed review criterion
              <textarea
                rows={4}
                minLength={10}
                value={criterion}
                onChange={(event) => setCriterion(event.target.value)}
              />
            </label>
            <p className="review-lock-note">
              Sealed at Publish. Good/Bad applies only to this answer. Behavior severity follows a
              disclosed rule set; neither surface ranks Candidates, proves external AI use, or
              completes Sarah&apos;s review form.
            </p>
            <div className="commitment-preview">
              <span>
                Publish commitment · TEXT
                {challengeMediaParts.map(({ kind }) => ` + ${kind}`).join("")} Challenge manifest
              </span>
              <strong>{slots} Attention Credits held</strong>
              <small>
                6 minute answer · 24h human review SLA · no résumé before answer review · media
                parts are sealed into the same ordered Challenge manifest
              </small>
            </div>
            {error === null ? null : (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeComposer}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !challengeUploadsReady}
                type="button"
                onClick={() => void createDraft()}
              >
                {busy ? "Saving…" : "Save Draft"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
