import { submitCandidateInterestErrorDetails } from "@onlyboth/application";
import { CandidateInterestCommandSchema } from "@onlyboth/contracts";
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
    const command = CandidateInterestCommandSchema.parse(await readJson(request));
    const { id: encodedId } = await context.params;
    const id = decodeRouteRef(encodedId);
    const receipt = await getFunctionalServices().submitInterest.execute({
      opportunityRef: id,
      actor: commandContext.actor,
      idempotencyKey: commandContext.idempotencyKey,
      correlationId: commandContext.correlationId,
      command,
    });
    return NextResponse.json(receipt, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const details = submitCandidateInterestErrorDetails(error);
    return details === null
      ? functionalErrorResponse(error)
      : NextResponse.json({ error: { code: details.code } }, { status: details.httpStatus });
  }
}
