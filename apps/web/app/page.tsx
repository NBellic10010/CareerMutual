import Link from "next/link";

const invariants = [
  "No funded review Slot → No Candidate Credit consumed",
  "No immutable answer → No Employer judgment",
  "No recorded human review → No next answer unlock",
] as const;

const roleViews = [
  {
    href: "/employer",
    index: "01",
    title: "Recruiter",
    description:
      "Publish a funded JobPost, review one anonymous answer, and settle each attention debt.",
  },
  {
    href: "/candidate",
    index: "02",
    title: "Candidate",
    description:
      "Open a backed opportunity, spend one Application Credit, and submit an immutable answer.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Mutual-intent hiring · label-blind work proofs</p>
          <h1>
            Interest is mutual.
            <span>Attention is backed.</span>
          </h1>
          <p className="hero-description">
            Candidates signal where they want to go. Recruiters commit named review attention. Only
            then does a bounded, anonymous answer earn the conversation—before pedigree can distort
            the judgment.
          </p>
          <div className="hero-actions">
            <Link className="primary-link" href="/login">
              Enter the product
            </Link>
            <Link className="text-link" href="/candidate">
              Candidate opportunities →
            </Link>
            <Link className="text-link" href="/employer">
              Recruiter JobPosts →
            </Link>
          </div>
        </div>
        <aside className="hero-manifesto mutual-intent-manifesto" aria-label="Mutual intent model">
          <span>How a real application begins</span>
          <div className="manifesto-signal manifesto-signal-candidate">
            <i aria-hidden="true" />
            <div>
              <small>Candidate</small>
              <strong>Signals genuine interest</strong>
            </div>
          </div>
          <div className="manifesto-lock" aria-hidden="true">
            <span>Backed Slot</span>
          </div>
          <div className="manifesto-signal manifesto-signal-employer">
            <i aria-hidden="true" />
            <div>
              <small>Recruiter</small>
              <strong>Commits named attention</strong>
            </div>
          </div>
          <blockquote>
            Only after both signals meet does the six-minute blind answer open.
          </blockquote>
        </aside>
      </section>

      <section className="invariant-strip" aria-label="Product invariants">
        {invariants.map((invariant, index) => (
          <div key={invariant}>
            <span>0{index + 1}</span>
            <strong>{invariant}</strong>
          </div>
        ))}
      </section>

      <section className="role-index" aria-labelledby="role-index-heading">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Two roles, one enforced obligation</p>
            <h2 id="role-index-heading">Choose a role-specific view</h2>
          </div>
          <p>
            The Candidate spends Credit only against funded attention. The Recruiter sees one
            anonymous answer and must record its evidence-linked review before continuing.
          </p>
        </div>
        <div className="role-card-grid">
          {roleViews.map((role) => (
            <Link className="role-card" href={role.href} key={role.href}>
              <span>{role.index}</span>
              <h3>{role.title}</h3>
              <p>{role.description}</p>
              <strong>Open view →</strong>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
