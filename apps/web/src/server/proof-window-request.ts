import { proofWindowDecisionErrorDetails } from "@onlyboth/application";
import { ProofWindowDecisionCommandSchema } from "@onlyboth/contracts";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { CANDIDATE_SESSION_COOKIE, verifyDemoSession } from "./demo-auth";
import { getMatchingServices } from "./matching-services";

export async function handleProofWindowDecision(
  request: Request,
  reviewWindowRef: string,
  action: "ACCEPT" | "DECLINE",
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const session = verifyDemoSession(
    cookieStore.get(CANDIDATE_SESSION_COOKIE)?.value,
    "CANDIDATE",
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "COMMAND_SCHEMA_INVALID" } }, { status: 422 });
  }
  const parsed = ProofWindowDecisionCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "COMMAND_SCHEMA_INVALID" } }, { status: 422 });
  }
  try {
    const receipt = await getMatchingServices().decideProofWindow.execute({
      action,
      reviewWindowRef,
      actor: { role: "CANDIDATE", actorId: session.actorId },
      idempotencyKey,
      correlationId: request.headers.get("X-Correlation-Id") ?? `web-${randomUUID()}`,
      command: parsed.data,
    });
    return NextResponse.json(receipt, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const details = proofWindowDecisionErrorDetails(error);
    if (details !== null) {
      return NextResponse.json({ error: { code: details.code } }, { status: details.httpStatus });
    }
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "OPTIMISTIC_CONCURRENCY_CONFLICT"
    ) {
      return NextResponse.json({ error: { code: "STALE_AGGREGATE_VERSION" } }, { status: 409 });
    }
    return NextResponse.json({ error: { code: "COMMAND_FAILED" } }, { status: 503 });
  }
}
