import { NextResponse } from "next/server";

import {
  functionalErrorResponse,
  readJson,
  requireCommandContext,
} from "@/src/server/functional-route";
import { getFunctionalServices } from "@/src/server/functional-services";
import { decodeRouteRef } from "@/src/server/route-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
): Promise<NextResponse> {
  try {
    const commandContext = await requireCommandContext(request, "EMPLOYER");
    const { id: encodedId } = await context.params;
    const id = decodeRouteRef(encodedId);
    const projection = await getFunctionalServices().service.updateJobPostDraft(
      commandContext,
      id,
      (await readJson(request)) as never,
    );
    return NextResponse.json(projection, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return functionalErrorResponse(error);
  }
}
