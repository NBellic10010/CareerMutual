import { NextResponse } from "next/server";

import {
  EMPLOYER_SESSION_COOKIE,
  issueDemoSession,
  sessionCookieOptions,
} from "@/src/server/demo-auth";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  try {
    const { token } = issueDemoSession("EMPLOYER", process.env);
    const response = new NextResponse(null, {
      status: 303,
      headers: { Location: "/employer/matching" },
    });
    response.cookies.set(EMPLOYER_SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      { error: { code: "DEMO_IDENTITY_ISSUER_UNAVAILABLE" } },
      { status: 404 },
    );
  }
}
