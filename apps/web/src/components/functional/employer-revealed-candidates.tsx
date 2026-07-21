import type { EmployerRevealedCandidatePage } from "@onlyboth/contracts";
import Link from "next/link";

function month(value: string | null): string {
  if (value === null) return "Present";
  return value.slice(0, 7);
}

export function EmployerRevealedCandidates({
  result,
}: {
  readonly result: EmployerRevealedCandidatePage;
}) {
  const candidate = result.items[0];
  return (
    <main className="functional-shell revealed-candidates-shell">
      <section className="functional-hero compact-hero recruiter-candidate-hero">
        <div>
          <p className="eyebrow">Recruiter / Candidate Passport</p>
          <h1>Work proof first. Resume second.</h1>
          <p>
            Only Candidates whose anonymous answer received an ADVANCE_ELIGIBLE Human Review appear
            here. Each page contains one independently revealed Resume.
          </p>
        </div>
        <div className="resume-page-count" aria-label="Resume pagination summary">
          <strong>{result.total_items}</strong>
          <span>revealed resumes</span>
        </div>
      </section>

      {candidate === undefined ? (
        <section className="resume-empty-state">
          <p className="section-kicker">Reveal boundary intact</p>
          <h2>No Candidate Resume is available yet.</h2>
          <p>
            Review an anonymous submission and record ADVANCE_ELIGIBLE before identity, education,
            employers, or contact details can enter this workspace.
          </p>
          <Link className="secondary-button" href="/employer">
            Return to JobPosts
          </Link>
        </section>
      ) : (
        <>
          <section className="resume-proof-receipt" aria-label="Reveal authorization receipt">
            <div>
              <p className="section-kicker">Answer passed before identity reveal</p>
              <h2>{candidate.opportunity_title}</h2>
              <p>{candidate.review_comment}</p>
            </div>
            <dl>
              <div>
                <dt>Human Review</dt>
                <dd>{candidate.human_review_ref}</dd>
              </div>
              <div>
                <dt>Submission</dt>
                <dd>{candidate.answer_submission_ref}</dd>
              </div>
              <div>
                <dt>Reveal</dt>
                <dd>{candidate.reveal_ref}</dd>
              </div>
            </dl>
          </section>

          <article className="candidate-resume-sheet">
            <header>
              <div>
                <p className="section-kicker">
                  Resume unlocked · sealed snapshot v{candidate.resume.snapshot_version}
                </p>
                <h2>{candidate.resume.display_name}</h2>
                <p className="resume-headline">{candidate.resume.headline}</p>
              </div>
              <address>
                <span>{candidate.resume.location}</span>
                <a href={`mailto:${candidate.resume.contact_email}`}>
                  {candidate.resume.contact_email}
                </a>
              </address>
            </header>
            <p className="resume-summary">{candidate.resume.summary}</p>

            <section className="resume-section">
              <h3>Experience</h3>
              {candidate.resume.experience.map((experience) => (
                <article
                  className="resume-entry"
                  key={`${experience.organization}:${experience.started_on}`}
                >
                  <div>
                    <strong>{experience.title}</strong>
                    <span>{experience.organization}</span>
                  </div>
                  <time>
                    {month(experience.started_on)} — {month(experience.ended_on)}
                  </time>
                  <ul>
                    {experience.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </section>

            <section className="resume-section resume-two-column">
              <div>
                <h3>Education</h3>
                {candidate.resume.education.map((education) => (
                  <div
                    className="resume-entry compact"
                    key={`${education.institution}:${education.graduation_date}`}
                  >
                    <strong>
                      {education.credential} · {education.field_of_study}
                    </strong>
                    <span>{education.institution}</span>
                    <time>{education.graduation_date}</time>
                  </div>
                ))}
              </div>
              <div>
                <h3>Credentials & skills</h3>
                <div className="resume-tags">
                  {[...candidate.resume.certifications, ...candidate.resume.skills].map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </section>
            <footer>
              Synthetic demo data · snapshot sealed{" "}
              {new Date(candidate.resume.sealed_at).toLocaleString("en-US")}
            </footer>
          </article>
        </>
      )}

      <nav className="resume-pagination" aria-label="Candidate Resume pages">
        {result.page > 1 ? (
          <Link href={`/employer/candidates?page=${result.page - 1}`}>← Previous</Link>
        ) : (
          <span />
        )}
        <span>{result.total_pages === 0 ? "0 / 0" : `${result.page} / ${result.total_pages}`}</span>
        {result.page < result.total_pages ? (
          <Link href={`/employer/candidates?page=${result.page + 1}`}>Next →</Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
