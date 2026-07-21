import type { NextResponse } from "next/server";

import { handleProofWindowDecision } from "@/src/server/proof-window-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  return handleProofWindowDecision(request, id, "DECLINE");
}
