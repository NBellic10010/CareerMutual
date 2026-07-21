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
          <p className="eyebrow">Label-blind, attention-backed work proofs</p>
          <h1>
            Let the work earn
            <span>the conversation.</span>
          </h1>
          <p className="hero-description">
            OnlyBoth delays pedigree, locks named human review before candidate effort, and tests
            the job&apos;s real uncertainty instead of ranking people by polish.
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
        <aside className="hero-manifesto">
          <span>Runnable product slice</span>
          <strong>3 Candidate Credits</strong>
          <strong>1 funded Slot before work</strong>
          <div className="manifesto-divider" />
          <span>Blind answer obligation</span>
          <strong>6:00 server-timed answer</strong>
          <strong className="highlight">Next answer stays locked</strong>
          <blockquote>Every opened answer creates a review debt.</blockquote>
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
