import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { EMPLOYER_SESSION_COOKIE, verifyDemoSession } from "@/src/server/demo-auth";
import { getMatchingServices } from "@/src/server/matching-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const session = verifyDemoSession(
    cookieStore.get(EMPLOYER_SESSION_COOKIE)?.value,
    "EMPLOYER",
    process.env,
  );
  if (session === null) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const projection = await getMatchingServices().store.getEmployerMatchingProjection(id);
    if (projection === null) {
      return NextResponse.json({ error: { code: "OPPORTUNITY_NOT_FOUND" } }, { status: 404 });
    }
    if (projection.reviewer.id !== session.actorId) {
      return NextResponse.json({ error: { code: "REVIEWER_MISMATCH" } }, { status: 403 });
    }
    return NextResponse.json(projection, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: { code: "PROJECTION_UNAVAILABLE" } }, { status: 503 });
  }
}
