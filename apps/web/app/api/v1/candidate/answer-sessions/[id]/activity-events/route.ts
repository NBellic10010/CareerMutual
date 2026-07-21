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

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
): Promise<NextResponse> {
  try {
    const commandContext = await requireCommandContext(request, "CANDIDATE");
    const { id: encodedId } = await context.params;
    const id = decodeRouteRef(encodedId);
    const receipt = await getFunctionalServices().service.recordSandboxActivity(
      commandContext,
      id,
      await readJson(request),
    );
    return NextResponse.json(receipt, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return functionalErrorResponse(error);
  }
}
