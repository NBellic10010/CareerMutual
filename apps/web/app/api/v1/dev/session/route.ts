import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findSyntheticDemoActor } from "@onlyboth/demo-fixtures";
import { z } from "zod";

import {
  CANDIDATE_SESSION_COOKIE,
  DEV_SESSION_COOKIE,
  EMPLOYER_SESSION_COOKIE,
  issueDemoSession,
  sessionCookieOptions,
} from "@/src/server/demo-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .union([
    z.object({ actor_ref: z.string().min(1).max(120) }).strict(),
    z.object({ role: z.enum(["CANDIDATE", "EMPLOYER"]) }).strict(),
  ])
  .transform((value) => {
    if ("actor_ref" in value) return value.actor_ref;
    return value.role === "EMPLOYER" ? "reviewer-sarah-chen" : "candidate-42";
  });

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "COMMAND_SCHEMA_INVALID" } }, { status: 422 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "COMMAND_SCHEMA_INVALID" } }, { status: 422 });
  }
  try {
    const actor = findSyntheticDemoActor(parsed.data);
    if (actor === null) {
      return NextResponse.json({ error: { code: "DEV_ACTOR_NOT_FOUND" } }, { status: 422 });
    }
    const issued = issueDemoSession(actor.role, process.env, new Date(), actor.actor_ref);
    const response = NextResponse.json(
      {
        session: {
          role: issued.session.role,
          actor_id: issued.session.actorId,
          csrf_token: issued.session.csrfToken,
          expires_at: new Date(issued.session.expiresAtEpochSeconds * 1_000).toISOString(),
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(DEV_SESSION_COOKIE, issued.token, sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: { code: "DEV_SESSION_ISSUER_DISABLED" } }, { status: 403 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  const cookieStore = await cookies();
  for (const name of [DEV_SESSION_COOKIE, CANDIDATE_SESSION_COOKIE, EMPLOYER_SESSION_COOKIE]) {
    cookieStore.set(name, "", { ...sessionCookieOptions(), maxAge: 0 });
  }
  return new NextResponse(null, { status: 204 });
}
