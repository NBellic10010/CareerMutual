import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { findSyntheticDemoActor } from "@onlyboth/demo-fixtures";

export const EMPLOYER_SESSION_COOKIE = "onlyboth_employer_session";
export const CANDIDATE_SESSION_COOKIE = "onlyboth_candidate_session";
export const DEV_SESSION_COOKIE = "onlyboth_dev_session";

export type DemoSessionRole = "EMPLOYER" | "CANDIDATE";

export interface DemoSession {
  readonly version: 1;
  readonly role: DemoSessionRole;
  readonly actorId: string;
  readonly csrfToken: string;
  readonly expiresAtEpochSeconds: number;
}

export type DemoAuthEnvironment = Readonly<Record<string, string | undefined>>;

export class DemoAuthConfigurationError extends Error {
  public override readonly name = "DemoAuthConfigurationError";
  public readonly code = "DEMO_AUTH_UNAVAILABLE";
}

function secret(environment: DemoAuthEnvironment): string {
  if (
    environment.DEMO_MODE !== "true" ||
    environment.DEMO_SESSION_SECRET === undefined ||
    environment.DEMO_SESSION_SECRET.length < 32
  ) {
    throw new DemoAuthConfigurationError(
      "Demo identity issuer is available only in DEMO_MODE with a 32-character secret.",
    );
  }
  return environment.DEMO_SESSION_SECRET;
}

function signature(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload, "utf8").digest("base64url");
}

function isSession(value: unknown): value is DemoSession {
  return (
    value !== null &&
    typeof value === "object" &&
    "version" in value &&
    value.version === 1 &&
    "role" in value &&
    (value.role === "EMPLOYER" || value.role === "CANDIDATE") &&
    "actorId" in value &&
    typeof value.actorId === "string" &&
    "csrfToken" in value &&
    typeof value.csrfToken === "string" &&
    "expiresAtEpochSeconds" in value &&
    typeof value.expiresAtEpochSeconds === "number"
  );
}

export function issueDemoSession(
  role: DemoSessionRole,
  environment: DemoAuthEnvironment,
  now = new Date(),
  actorId = role === "EMPLOYER" ? "reviewer-sarah-chen" : "candidate-42",
): { readonly token: string; readonly session: DemoSession } {
  const key = secret(environment);
  const actor = findSyntheticDemoActor(actorId);
  if (actor === null || actor.role !== role) {
    throw new DemoAuthConfigurationError("The requested synthetic actor is not registered.");
  }
  const session: DemoSession = {
    version: 1,
    role,
    actorId,
    csrfToken: randomBytes(24).toString("base64url"),
    expiresAtEpochSeconds: Math.floor(now.getTime() / 1_000) + 60 * 60 * 24 * 365,
  };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return { token: `${payload}.${signature(payload, key)}`, session };
}

export function verifyDemoSession(
  token: string | undefined,
  expectedRole: DemoSessionRole,
  environment: DemoAuthEnvironment,
  now = new Date(),
): DemoSession | null {
  let key: string;
  try {
    key = secret(environment);
  } catch {
    return null;
  }
  if (token === undefined) {
    return null;
  }
  const separator = token.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }
  const payload = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);
  const expectedSignature = signature(payload, key);
  const provided = Buffer.from(providedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (
      !isSession(parsed) ||
      parsed.role !== expectedRole ||
      parsed.expiresAtEpochSeconds <= Math.floor(now.getTime() / 1_000)
    ) {
      return null;
    }
    const actor = findSyntheticDemoActor(parsed.actorId);
    if (actor === null || actor.role !== expectedRole) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): {
  readonly httpOnly: true;
  readonly sameSite: "strict";
  readonly secure: boolean;
  readonly path: "/";
  readonly maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}
