import { NextResponse } from "next/server";

import { functionalErrorResponse, requireReadActor } from "@/src/server/functional-route";
import { getFunctionalServices } from "@/src/server/functional-services";
import { decodeRouteRef } from "@/src/server/route-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
): Promise<NextResponse> {
  try {
    const role =
      new URL(request.url).searchParams.get("role") === "employer" ? "EMPLOYER" : "CANDIDATE";
    const actor = await requireReadActor(role);
    const { id: encodedId } = await context.params;
    const id = decodeRouteRef(encodedId);
    const result = await getFunctionalServices().service.readArtifact(actor, id);
    return new NextResponse(Buffer.from(result.body), {
      headers: {
        "Content-Type": result.artifact.contentType,
        "Content-Length": String(result.body.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; media-src 'self'",
      },
    });
  } catch (error: unknown) {
    return functionalErrorResponse(error);
  }
}
