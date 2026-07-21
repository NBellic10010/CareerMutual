import { answerInvitationDecisionErrorDetails } from "@onlyboth/application";
import { AnswerInvitationDecisionCommandSchema } from "@onlyboth/contracts";
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
    const raw = AnswerInvitationDecisionCommandSchema.parse(await readJson(request));
    if (raw.decision !== "DECLINE") {
      return NextResponse.json({ error: { code: "COMMAND_SCHEMA_INVALID" } }, { status: 422 });
    }
    const { id: encodedId } = await context.params;
    const id = decodeRouteRef(encodedId);
    const receipt = await getFunctionalServices().decideInvitation.execute({
      invitationRef: id,
      actor: commandContext.actor,
      idempotencyKey: commandContext.idempotencyKey,
      correlationId: commandContext.correlationId,
      command: raw,
    });
    return NextResponse.json(receipt, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const details = answerInvitationDecisionErrorDetails(error);
    return details === null
      ? functionalErrorResponse(error)
      : NextResponse.json({ error: { code: details.code } }, { status: details.httpStatus });
  }
}
