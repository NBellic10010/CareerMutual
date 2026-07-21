import type { Metadata } from "next";
import { cookies } from "next/headers";

import { RolePage } from "@/src/components/app-shell";
import { EmployerMatchingPanel } from "@/src/components/employer-matching-panel";
import { EMPLOYER_SESSION_COOKIE, verifyDemoSession } from "@/src/server/demo-auth";
import { getMatchingServices } from "@/src/server/matching-services";

export const metadata: Metadata = { title: "Employer matching" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function EmployerMatchingPage() {
  const cookieStore = await cookies();
  const session = verifyDemoSession(
    cookieStore.get(EMPLOYER_SESSION_COOKIE)?.value,
    "EMPLOYER",
    process.env,
  );
  if (session === null) {
    return (
      <RolePage
        boundary="Signed synthetic Employer session"
        description="The demo issuer binds this browser to Sarah. It is disabled outside DEMO_MODE."
        eyebrow="Matching projection · authentication required"
        title="Enter Sarah's label-blind matching cycle."
      >
        <form
          action="/api/v1/demo/session/employer/matching"
          className="demo-login-card"
          method="post"
        >
          <p>The session is HttpOnly, signed, SameSite=Strict, and scoped to Sarah.</p>
          <button className="authorize-button" type="submit">
            Continue as Sarah
          </button>
        </form>
      </RolePage>
    );
  }
  try {
    const projection =
      await getMatchingServices().store.getEmployerMatchingProjection("opp-senior-backend-1");
    if (projection === null || projection.reviewer.id !== session.actorId) {
      throw new Error("Matching projection is unavailable or unauthorized.");
    }
    return (
      <RolePage
        boundary="Sealed Contract + source-bounded MatchEdges only"
        description="Sarah chooses one Direct proof path. A public deterministic hash spends the second attention slot on Explore."
        eyebrow="Employer matching · Sarah Chen"
        title="Turn two units of attention into two real chances."
      >
        <EmployerMatchingPanel initialProjection={projection} csrfToken={session.csrfToken} />
      </RolePage>
    );
  } catch {
    return (
      <RolePage
        boundary="Fail closed"
        description="Interactive matching requires migrated, seeded PostgreSQL and the Matching Worker."
        eyebrow="Employer matching · unavailable"
        title="The local matching projection is not ready."
      >
        <section className="challenge-placeholder" role="alert">
          <span className="challenge-index">DB</span>
          <div>
            <h2>Run demo:reset:matching.</h2>
            <p>No candidate pool or in-memory fallback was substituted.</p>
          </div>
        </section>
      </RolePage>
    );
  }
}
