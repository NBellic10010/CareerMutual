import { RefreshCandidateEligibilityCommandSchema } from "@onlyboth/contracts";
import { NextResponse } from "next/server";

import {
  functionalErrorResponse,
  readJson,
  requireCommandContext,
} from "@/src/server/functional-route";
import { getFunctionalServices } from "@/src/server/functional-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const context = await requireCommandContext(request, "CANDIDATE");
    const command = RefreshCandidateEligibilityCommandSchema.parse(await readJson(request));
    const projection = await getFunctionalServices().candidateEligibility.refresh(context, command);
    return NextResponse.json(projection, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return functionalErrorResponse(error);
  }
}
