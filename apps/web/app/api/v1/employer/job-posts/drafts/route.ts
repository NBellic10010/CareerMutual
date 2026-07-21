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
    const commandContext = await requireCommandContext(request, "EMPLOYER");
    const projection = await getFunctionalServices().service.createJobPostDraft(
      commandContext,
      (await readJson(request)) as never,
    );
    return NextResponse.json(projection, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return functionalErrorResponse(error);
  }
}
