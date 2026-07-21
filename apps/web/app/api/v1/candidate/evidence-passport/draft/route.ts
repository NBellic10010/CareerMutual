import { NextResponse } from "next/server";

import {
  functionalErrorResponse,
  readJson,
  requireCommandContext,
} from "@/src/server/functional-route";
import { getFunctionalServices } from "@/src/server/functional-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const context = await requireCommandContext(request, "CANDIDATE");
    const receipt = await getFunctionalServices().candidateEvidencePassport.saveDraft(
      context,
      (await readJson(request)) as never,
    );
    return NextResponse.json(receipt, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return functionalErrorResponse(error);
  }
}
