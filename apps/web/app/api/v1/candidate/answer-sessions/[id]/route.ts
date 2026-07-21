import { NextResponse } from "next/server";

import { functionalErrorResponse, requireReadActor } from "@/src/server/functional-route";
import { getFunctionalServices } from "@/src/server/functional-services";
import { decodeRouteRef } from "@/src/server/route-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireReadActor("CANDIDATE");
    const { id: encodedId } = await context.params;
    const id = decodeRouteRef(encodedId);
    const session = await getFunctionalServices().store.getCandidateAnswerSession(
      actor.actorId,
      id,
    );
    if (session === null) {
      return NextResponse.json({ error: { code: "ANSWER_SESSION_NOT_FOUND" } }, { status: 422 });
    }
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return functionalErrorResponse(error);
  }
}
