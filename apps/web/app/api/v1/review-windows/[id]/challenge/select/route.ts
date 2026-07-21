import { challengeSelectionErrorDetails } from "@onlyboth/application";
import { SelectHumanChallengeCommandSchema } from "@onlyboth/contracts";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { EMPLOYER_SESSION_COOKIE, verifyDemoSession } from "@/src/server/demo-auth";
import { getChallengeServices } from "@/src/server/challenge-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const session = verifyDemoSession(
    cookieStore.get(EMPLOYER_SESSION_COOKIE)?.value,
    "EMPLOYER",
    process.env,
  );
  if (session === null) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  if (request.headers.get("X-CSRF-Token") !== session.csrfToken) {
    return NextResponse.json({ error: { code: "CSRF_INVALID" } }, { status: 403 });
  }
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey === null) {
    return NextResponse.json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED" } }, { status: 422 });
  }
  let requestPayload: unknown;
  try {
    requestPayload = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "COMMAND_SCHEMA_INVALID" } }, { status: 422 });
  }
  const commandResult = SelectHumanChallengeCommandSchema.safeParse(requestPayload);
  if (!commandResult.success) {
    return NextResponse.json({ error: { code: "COMMAND_SCHEMA_INVALID" } }, { status: 422 });
  }
  try {
    const { id } = await context.params;
    const receipt = await getChallengeServices().selectChallenge.execute({
      reviewWindowId: id,
      actor: { role: "EMPLOYER", actorId: session.actorId },
      idempotencyKey,
      correlationId: request.headers.get("X-Correlation-Id") ?? `web-${randomUUID()}`,
      command: commandResult.data,
    });
    return NextResponse.json(receipt, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const applicationError = challengeSelectionErrorDetails(error);
    if (applicationError !== null) {
      return NextResponse.json(
        { error: { code: applicationError.code } },
        { status: applicationError.httpStatus },
      );
    }
    return NextResponse.json({ error: { code: "COMMAND_FAILED" } }, { status: 503 });
  }
}
