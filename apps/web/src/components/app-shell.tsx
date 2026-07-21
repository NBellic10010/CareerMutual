import Link from "next/link";
import type { ReactNode } from "react";
import { findSyntheticDemoActor } from "@onlyboth/demo-fixtures";

import { SYNTHETIC_REPLAY_LABEL } from "../lib/demo-view-model";
import { CareerMutualTrademark } from "./career-mutual-trademark";
import { SessionLogoutButton } from "./functional/session-logout-button";
import { resolveFunctionalActor } from "../server/functional-auth";

export type HeaderRole = "CANDIDATE" | "EMPLOYER" | null;

export function RoleBreadcrumb({
  role,
  actorLabel,
}: {
  readonly role: HeaderRole;
  readonly actorLabel?: string;
}) {
  const roleLabel =
    actorLabel ??
    (role === "CANDIDATE" ? "Candidate" : role === "EMPLOYER" ? "Recruiter" : "Public");
  const homeHref = role === "CANDIDATE" ? "/candidate" : role === "EMPLOYER" ? "/employer" : "/";
  return (
    <Link className="brand" href={homeHref} aria-label={`CareerMutual ${roleLabel} home`}>
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-node brand-node-candidate" />
        <span className="brand-bridge" />
        <span className="brand-node brand-node-employer" />
        <span className="brand-offer-check">✓</span>
      </span>
      <span className="role-breadcrumb">
        <span className="brand-lockup">
          <strong>
            <CareerMutualTrademark />
          </strong>
          <small>Mutual-intent hiring</small>
        </span>
        <span className="breadcrumb-divider" aria-hidden="true">
          /
        </span>
        <span className="breadcrumb-role">{roleLabel}</span>
      </span>
    </Link>
  );
}

export function RoleNavigation({ role }: { readonly role: HeaderRole }) {
  const navigation =
    role === "CANDIDATE"
      ? [
          { href: "/candidate", label: "Opportunities" },
          { href: "/candidate/evidence-passport", label: "Evidence Passport" },
        ]
      : role === "EMPLOYER"
        ? [
            { href: "/employer", label: "JobPosts" },
            { href: "/employer/candidates", label: "Revealed Candidates" },
            { href: "/audit", label: "Audit" },
          ]
        : [{ href: "/login", label: "Sign in" }];
  return (
    <nav
      className="site-nav"
      aria-label={
        role === "CANDIDATE"
          ? "Candidate navigation"
          : role === "EMPLOYER"
            ? "Recruiter navigation"
            : "Public navigation"
      }
    >
      {navigation.map((item) => (
        <Link href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
      {role === null ? null : <SessionLogoutButton />}
    </nav>
  );
}

export async function SiteHeader() {
  const [candidate, employer] = await Promise.all([
    resolveFunctionalActor("CANDIDATE"),
    resolveFunctionalActor("EMPLOYER"),
  ]);
  const role: HeaderRole = candidate !== null ? "CANDIDATE" : employer !== null ? "EMPLOYER" : null;
  const actor = findSyntheticDemoActor(candidate?.actorId ?? employer?.actorId ?? "");
  const roleTheme =
    role === "CANDIDATE" ? "candidate" : role === "EMPLOYER" ? "employer" : "public";
  return (
    <header className={`site-header site-header-${roleTheme}`} data-role-theme={roleTheme}>
      <RoleBreadcrumb role={role} actorLabel={actor?.start_label} />
      <RoleNavigation role={role} />
    </header>
  );
}

export function SyntheticReplayBanner() {
  return (
    <div className="synthetic-banner" role="note">
      <span className="status-dot" aria-hidden="true" />
      <strong>{SYNTHETIC_REPLAY_LABEL}</strong>
      <span>No real candidate data</span>
    </div>
  );
}

type RolePageProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  boundary: string;
  children: ReactNode;
}>;

export function RolePage({ eyebrow, title, description, boundary, children }: RolePageProps) {
  return (
    <main className="page-shell">
      <SyntheticReplayBanner />
      <section className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="page-description">{description}</p>
        </div>
        <aside className="boundary-note">
          <span>Projection boundary</span>
          <strong>{boundary}</strong>
        </aside>
      </section>
      {children}
    </main>
  );
}
