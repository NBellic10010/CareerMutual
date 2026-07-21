import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { CANDIDATE_SESSION_COOKIE, verifyDemoSession } from "@/src/server/demo-auth";
import { getChallengeServices } from "@/src/server/challenge-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const session = verifyDemoSession(
    cookieStore.get(CANDIDATE_SESSION_COOKIE)?.value,
    "CANDIDATE",
    process.env,
  );
  if (session === null) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const projection = await getChallengeServices().store.getCandidateProjection(id);
    if (projection === null) {
      return NextResponse.json({ error: { code: "REVIEW_WINDOW_NOT_FOUND" } }, { status: 404 });
    }
    if (projection.candidate_ref !== session.actorId) {
      return NextResponse.json({ error: { code: "CANDIDATE_MISMATCH" } }, { status: 403 });
    }
    return NextResponse.json(projection, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: { code: "PROJECTION_UNAVAILABLE" } }, { status: 503 });
  }
}
