import { randomUUID } from "node:crypto";

import {
  FunctionalProductApplicationError,
  functionalProductErrorDetails,
  type FunctionalActor,
} from "@onlyboth/application";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { resolveFunctionalActor } from "./functional-auth";

export class FunctionalRouteError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: 401 | 403 | 409 | 422 | 503,
  ) {
    super(code);
  }
}

export async function requireReadActor(role: "CANDIDATE" | "EMPLOYER"): Promise<FunctionalActor> {
  const actor = await resolveFunctionalActor(role);
  if (actor === null) throw new FunctionalRouteError("UNAUTHENTICATED", 401);
  return { role: actor.role, actorId: actor.actorId };
}

export async function requireCommandContext<TRole extends "CANDIDATE" | "EMPLOYER">(
  request: Request,
  role: TRole,
) {
  const actor = await resolveFunctionalActor(role);
  if (actor === null) throw new FunctionalRouteError("UNAUTHENTICATED", 401);
  if (request.headers.get("X-CSRF-Token") !== actor.csrfToken) {
    throw new FunctionalRouteError("CSRF_INVALID", 403);
  }
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey === null || idempotencyKey.trim().length === 0) {
    throw new FunctionalRouteError("IDEMPOTENCY_KEY_REQUIRED", 422);
  }
  return {
    actor: { role, actorId: actor.actorId } as { readonly role: TRole; readonly actorId: string },
    idempotencyKey,
    correlationId: request.headers.get("X-Correlation-Id") ?? `web:${randomUUID()}`,
  } as const;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new FunctionalRouteError("COMMAND_SCHEMA_INVALID", 422);
  }
}

export function functionalErrorResponse(error: unknown): NextResponse {
  if (error instanceof FunctionalRouteError) {
    return NextResponse.json({ error: { code: error.code } }, { status: error.status });
  }
  const details = functionalProductErrorDetails(error);
  if (details !== null) {
    return NextResponse.json({ error: { code: details.code } }, { status: details.httpStatus });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "COMMAND_SCHEMA_INVALID", issues: error.issues } },
      { status: 422 },
    );
  }
  if (error instanceof FunctionalProductApplicationError) {
    return NextResponse.json({ error: { code: error.code } }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503 });
}
