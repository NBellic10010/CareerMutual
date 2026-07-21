import type { SessionActor, SessionActorPort } from "@onlyboth/application";
import { cookies } from "next/headers";

import {
  CANDIDATE_SESSION_COOKIE,
  DEV_SESSION_COOKIE,
  EMPLOYER_SESSION_COOKIE,
  type DemoAuthEnvironment,
  type DemoSessionRole,
  verifyDemoSession,
} from "./demo-auth";

interface CookieSessionContext {
  readonly token: string | undefined;
  readonly role: DemoSessionRole;
  readonly environment: DemoAuthEnvironment;
}

export class DemoCookieSessionActorAdapter implements SessionActorPort<CookieSessionContext> {
  public async resolve(context: CookieSessionContext): Promise<SessionActor | null> {
    const session = verifyDemoSession(context.token, context.role, context.environment);
    return session === null
      ? null
      : {
          role: session.role,
          actorId: session.actorId,
          csrfToken: session.csrfToken,
        };
  }
}

const adapter = new DemoCookieSessionActorAdapter();

export async function resolveFunctionalActor(role: DemoSessionRole): Promise<SessionActor | null> {
  const cookieStore = await cookies();
  const roleCookie = role === "CANDIDATE" ? CANDIDATE_SESSION_COOKIE : EMPLOYER_SESSION_COOKIE;
  return (
    (await adapter.resolve({
      token: cookieStore.get(DEV_SESSION_COOKIE)?.value,
      role,
      environment: process.env,
    })) ??
    adapter.resolve({
      token: cookieStore.get(roleCookie)?.value,
      role,
      environment: process.env,
    })
  );
}
