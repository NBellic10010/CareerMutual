"use client";

import type {
  CandidateEducationRecord,
  CandidateEvidenceItem,
  CandidateEvidencePassportProjection,
} from "@onlyboth/contracts";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const KIND_LABELS = {
  GITHUB_REPOSITORY: "GitHub repository",
  CERTIFICATION: "Certification",
  WORK_SAMPLE: "Work sample",
  ONLINE_WORK_PROOF: "Online work proof",
  EMPLOYMENT_VERIFICATION: "Employment verification — redacted synthetic mock",
} as const;

const EDUCATION_LEVEL_LABELS: Record<CandidateEducationRecord["level"], string> = {
  NO_FORMAL_DEGREE: "No formal degree / alternative pathway",
  HIGH_SCHOOL: "High school",
  ASSOCIATE: "Associate degree",
  BACHELOR: "Bachelor’s degree",
  MASTER: "Master’s degree",
  DOCTORATE: "Doctorate",
  PROFESSIONAL: "Professional degree",
  OTHER: "Other credential",
};

function commandKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function randomSha256(): `sha256:${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `sha256:${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function newEvidence(): CandidateEvidenceItem {
  return {
    evidence_ref: `evidence:${crypto.randomUUID()}`,
    kind: "WORK_SAMPLE",
    display_title: "Synthetic bounded work sample",
    bounded_summary:
      "A synthetic source describing a bounded piece of work relevant to technical job discovery.",
    contribution_summary: "I authored the documented approach and the included trade-off notes.",
    occurred_from: null,
    occurred_to: null,
    synthetic_locator_label: "synthetic://candidate-only/work-sample",
    source_sha256: randomSha256(),
    verification_state: "SYNTHETIC_SOURCE_ATTACHED",
    visibility: "CANDIDATE_ONLY",
  };
}

function newEducation(): CandidateEducationRecord {
  return {
    education_ref: `education:${crypto.randomUUID()}`,
    level: "BACHELOR",
    status: "GRADUATED",
    institution_label: "Synthetic Regional University",
    field_of_study: "Computer science",
    graduation_date: "2025-05-15",
    source_sha256: randomSha256(),
    verification_state: "SYNTHETIC_SOURCE_ATTACHED",
    visibility: "CANDIDATE_ONLY",
  };
}

export function CandidateEvidencePassport({
  projection,
  csrfToken,
}: {
  readonly projection: CandidateEvidencePassportProjection;
  readonly csrfToken: string;
}) {
  const router = useRouter();
  const [education, setEducation] = useState<CandidateEducationRecord>(
    projection.current_draft.education ?? newEducation,
  );
  const [items, setItems] = useState<CandidateEvidenceItem[]>([
    ...projection.current_draft.evidence_items,
  ]);
  const [busy, setBusy] = useState<"save" | "publish" | "refresh" | null>(null);
  const [announcement, setAnnouncement] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const edited = useMemo(
    () =>
      JSON.stringify({ education, items }) !==
      JSON.stringify({
        education: projection.current_draft.education,
        items: projection.current_draft.evidence_items,
      }),
    [education, items, projection.current_draft.education, projection.current_draft.evidence_items],
  );

  async function send(path: string, method: "PUT" | "POST", body: unknown, prefix: string) {
    const response = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": commandKey(prefix),
      },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as {
      readonly error?: { readonly code?: string };
      readonly draft_version?: number;
    };
    if (!response.ok) throw new Error(result.error?.code ?? "PASSPORT_COMMAND_FAILED");
    return result;
  }

  async function saveDraft(): Promise<number> {
    const result = await send(
      "/api/v1/candidate/evidence-passport/draft",
      "PUT",
      {
        schema_version: "save-candidate-evidence-passport-draft-command@2",
        expected_draft_version: projection.current_draft.draft_version,
        education,
        evidence_items: items,
      },
      "passport-save",
    );
    if (typeof result.draft_version !== "number") throw new Error("PASSPORT_RECEIPT_INVALID");
    return result.draft_version;
  }

  async function handleSave() {
    setBusy("save");
    setError(null);
    try {
      await saveDraft();
      setAnnouncement("Draft saved to the Candidate-only Evidence Ledger.");
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "PASSPORT_SAVE_FAILED");
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish() {
    setBusy("publish");
    setError(null);
    try {
      const draftVersion = await saveDraft();
      await send(
        "/api/v1/candidate/evidence-passport/publish",
        "POST",
        {
          schema_version: "publish-candidate-evidence-passport-command@1",
          expected_draft_version: draftVersion,
          discovery_consent_version: "candidate-discovery-consent@1",
        },
        "passport-publish",
      );
      setAnnouncement(
        "Immutable Snapshot published. Candidate-only discovery generation was requested.",
      );
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "PASSPORT_PUBLISH_FAILED");
    } finally {
      setBusy(null);
    }
  }

  async function handleRefresh() {
    setBusy("refresh");
    setError(null);
    try {
      await send(
        "/api/v1/candidate/evidence-passport/discovery/refresh",
        "POST",
        {
          schema_version: "refresh-candidate-discovery-command@1",
          expected_projection_version: projection.projection_version,
        },
        "passport-refresh",
      );
      setAnnouncement("Discovery refresh requested. The Worker must complete it through LIVE AI.");
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "DISCOVERY_REFRESH_FAILED");
    } finally {
      setBusy(null);
    }
  }

  function updateItem(index: number, patch: Partial<CandidateEvidenceItem>) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }

  return (
    <main className="functional-shell passport-shell">
      <a className="back-link" href="/candidate">
        ← Candidate opportunities
      </a>
      <section className="passport-hero">
        <div>
          <p className="eyebrow">Candidate 42 / private discovery workspace</p>
          <h1>Evidence, without turning your résumé into a gate.</h1>
          <p>
            Publish a Candidate-only Snapshot so GPT can connect bounded source material to public
            job capabilities. You still see every open role and decide where to register Interest.
          </p>
        </div>
        <aside className="passport-privacy-seal" aria-label="Evidence Passport privacy boundary">
          <span>Visibility boundary</span>
          <strong>Candidate only</strong>
          <small>Never shown to Sarah before anonymous advancement</small>
        </aside>
      </section>

      <section className="passport-status-rail" aria-label="Evidence Passport processing status">
        <div data-active="true">
          <span>01</span>
          <strong>Draft</strong>
          <small>v{projection.current_draft.draft_version}</small>
        </div>
        <div data-active={projection.last_published_snapshot !== null}>
          <span>02</span>
          <strong>Immutable Snapshot</strong>
          <small>
            {projection.last_published_snapshot === null
              ? "Not published"
              : `v${projection.last_published_snapshot.snapshot_version}`}
          </small>
        </div>
        <div data-active={projection.discovery.status === "READY"}>
          <span>03</span>
          <strong>Discovery signals</strong>
          <small>{projection.discovery.status.replaceAll("_", " ")}</small>
        </div>
        <div data-active={projection.discovery.last_ready_signal_set_ref !== null}>
          <span>04</span>
          <strong>Candidate feed</strong>
          <small>Guidance only</small>
        </div>
      </section>

      <div className="passport-layout">
        <section className="evidence-ledger" aria-labelledby="evidence-ledger-title">
          <article className="passport-education" aria-labelledby="passport-education-title">
            <header>
              <div>
                <p className="section-kicker">Required profile context</p>
                <h2 id="passport-education-title">Highest education</h2>
              </div>
              <span>Required</span>
            </header>
            <p>
              This remains Candidate-only before your answer advances. For discovery guidance,
              education leads work evidence only within two years of graduation; after that, current
              work and credentials take precedence.
            </p>
            <div className="evidence-form-grid">
              <label>
                Education level
                <select
                  required
                  value={education.level}
                  onChange={(event) => {
                    const level = event.target.value as CandidateEducationRecord["level"];
                    setEducation((current) =>
                      level === "NO_FORMAL_DEGREE"
                        ? {
                            ...current,
                            level,
                            status: "NO_FORMAL_DEGREE",
                            institution_label: null,
                            field_of_study: null,
                            graduation_date: null,
                          }
                        : {
                            ...current,
                            level,
                            status:
                              current.status === "NO_FORMAL_DEGREE" ? "GRADUATED" : current.status,
                            institution_label: current.institution_label ?? "Synthetic institution",
                            field_of_study: current.field_of_study ?? "Undeclared field",
                            graduation_date: current.graduation_date ?? "2025-05-15",
                          },
                    );
                  }}
                >
                  {Object.entries(EDUCATION_LEVEL_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  required
                  disabled={education.level === "NO_FORMAL_DEGREE"}
                  value={education.status}
                  onChange={(event) =>
                    setEducation((current) => ({
                      ...current,
                      status: event.target.value as CandidateEducationRecord["status"],
                    }))
                  }
                >
                  <option value="GRADUATED">Graduated</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="NO_FORMAL_DEGREE">No formal degree</option>
                </select>
              </label>
              <label>
                Institution
                <input
                  required={education.level !== "NO_FORMAL_DEGREE"}
                  disabled={education.level === "NO_FORMAL_DEGREE"}
                  value={education.institution_label ?? ""}
                  onChange={(event) =>
                    setEducation((current) => ({
                      ...current,
                      institution_label: event.target.value || null,
                    }))
                  }
                />
              </label>
              <label>
                Field of study
                <input
                  required={education.level !== "NO_FORMAL_DEGREE"}
                  disabled={education.level === "NO_FORMAL_DEGREE"}
                  value={education.field_of_study ?? ""}
                  onChange={(event) =>
                    setEducation((current) => ({
                      ...current,
                      field_of_study: event.target.value || null,
                    }))
                  }
                />
              </label>
              <label>
                Graduation / expected date
                <input
                  required={education.level !== "NO_FORMAL_DEGREE"}
                  disabled={education.level === "NO_FORMAL_DEGREE"}
                  type="date"
                  value={education.graduation_date ?? ""}
                  onChange={(event) =>
                    setEducation((current) => ({
                      ...current,
                      graduation_date: event.target.value || null,
                    }))
                  }
                />
              </label>
            </div>
          </article>
          <header className="evidence-ledger-heading">
            <div>
              <p className="section-kicker">Private Evidence Ledger</p>
              <h2 id="evidence-ledger-title">Bounded sources</h2>
            </div>
            <button
              className="secondary-button"
              disabled={busy !== null || items.length >= 20}
              type="button"
              onClick={() => setItems((current) => [...current, newEvidence()])}
            >
              Add synthetic evidence
            </button>
          </header>
          {items.map((item, index) => (
            <article className="evidence-ledger-row" key={item.evidence_ref}>
              <div className="evidence-row-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="evidence-form-grid">
                <label>
                  Evidence type
                  <select
                    value={item.kind}
                    onChange={(event) =>
                      updateItem(index, {
                        kind: event.target.value as CandidateEvidenceItem["kind"],
                      })
                    }
                  >
                    {Object.entries(KIND_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Display title
                  <input
                    value={item.display_title}
                    onChange={(event) => updateItem(index, { display_title: event.target.value })}
                  />
                </label>
                <label className="span-two">
                  What this source contains
                  <textarea
                    rows={3}
                    value={item.bounded_summary}
                    onChange={(event) => updateItem(index, { bounded_summary: event.target.value })}
                  />
                </label>
                <label className="span-two">
                  Your bounded contribution
                  <textarea
                    rows={2}
                    value={item.contribution_summary}
                    onChange={(event) =>
                      updateItem(index, { contribution_summary: event.target.value })
                    }
                  />
                </label>
                <label>
                  From
                  <input
                    type="date"
                    value={item.occurred_from ?? ""}
                    onChange={(event) =>
                      updateItem(index, { occurred_from: event.target.value || null })
                    }
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={item.occurred_to ?? ""}
                    onChange={(event) =>
                      updateItem(index, { occurred_to: event.target.value || null })
                    }
                  />
                </label>
                <label className="span-two">
                  Synthetic source locator
                  <input
                    value={item.synthetic_locator_label}
                    onChange={(event) =>
                      updateItem(index, { synthetic_locator_label: event.target.value })
                    }
                  />
                </label>
              </div>
              <footer className="evidence-row-footer">
                <span>{item.verification_state.replaceAll("_", " ")}</span>
                <code>{item.source_sha256}</code>
                {items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                ) : null}
              </footer>
            </article>
          ))}
        </section>

        <aside className="passport-control-panel">
          <p className="section-kicker">Snapshot control</p>
          <h2>Publish the sources, not a self-score.</h2>
          <p>
            The Snapshot is immutable. GPT may produce evidence-linked discovery hypotheses and
            unknowns; it cannot call this evidence verified or affect Employer review order.
          </p>
          <dl className="passport-facts">
            <div>
              <dt>Draft</dt>
              <dd>{edited ? "Local edits pending" : "Saved"}</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>{items.length} synthetic items</dd>
            </div>
            <div>
              <dt>Last Snapshot</dt>
              <dd>{projection.last_published_snapshot?.snapshot_ref ?? "None"}</dd>
            </div>
            <div>
              <dt>Signal source</dt>
              <dd>
                {projection.discovery.synthetic_preloaded
                  ? "Synthetic preloaded snapshot"
                  : "LIVE Worker only"}
              </dd>
            </div>
          </dl>
          <div className="passport-actions">
            <button
              className="secondary-button"
              disabled={busy !== null}
              type="button"
              onClick={() => void handleSave()}
            >
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            <button
              className="primary-button"
              disabled={busy !== null || items.length === 0}
              type="button"
              onClick={() => void handlePublish()}
            >
              {busy === "publish" ? "Publishing…" : "Publish & generate discovery signals"}
            </button>
            <button
              className="secondary-button"
              disabled={busy !== null || projection.last_published_snapshot === null}
              type="button"
              onClick={() => void handleRefresh()}
            >
              {busy === "refresh" ? "Requesting…" : "Refresh against current jobs"}
            </button>
          </div>
          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="passport-announcement" aria-live="polite">
            {announcement}
          </p>
          <p className="product-disclosure">{projection.disclosure}</p>
        </aside>
      </div>
    </main>
  );
}
