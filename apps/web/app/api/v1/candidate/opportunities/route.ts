import { NextResponse } from "next/server";

import { functionalErrorResponse, requireReadActor } from "@/src/server/functional-route";
import { getFunctionalServices } from "@/src/server/functional-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const actor = await requireReadActor("CANDIDATE");
    const feed =
      await getFunctionalServices().candidateEligibilityStore.getCandidateOpportunityFeed(
        actor.actorId,
      );
    return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return functionalErrorResponse(error);
  }
}
