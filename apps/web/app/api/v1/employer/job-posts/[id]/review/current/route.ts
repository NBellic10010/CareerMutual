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
    const actor = await requireReadActor("EMPLOYER");
    const { id: encodedId } = await context.params;
    const id = decodeRouteRef(encodedId);
    const review = await getFunctionalServices().store.getCurrentEmployerReview(actor.actorId, id);
    if (review === null) {
      return NextResponse.json({ error: { code: "JOB_POST_NOT_FOUND" } }, { status: 422 });
    }
    return NextResponse.json(review, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return functionalErrorResponse(error);
  }
}
