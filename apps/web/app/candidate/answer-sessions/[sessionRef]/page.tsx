import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AnswerSandbox } from "@/src/components/functional/answer-sandbox";
import { resolveFunctionalActor } from "@/src/server/functional-auth";
import { getFunctionalServices } from "@/src/server/functional-services";
import { decodeRouteRef } from "@/src/server/route-ref";

export const metadata: Metadata = { title: "Answer sandbox" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AnswerSessionPage({
  params,
}: {
  readonly params: Promise<{ readonly sessionRef: string }>;
}) {
  const actor = await resolveFunctionalActor("CANDIDATE");
  if (actor === null) redirect("/login");
  const { sessionRef: encodedSessionRef } = await params;
  const sessionRef = decodeRouteRef(encodedSessionRef);
  const session = await getFunctionalServices().store.getCandidateAnswerSession(
    actor.actorId,
    sessionRef,
  );
  if (session === null) notFound();
  return <AnswerSandbox csrfToken={actor.csrfToken} initialSession={session} />;
}
