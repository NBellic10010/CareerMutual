import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CandidateJobDetailView } from "@/src/components/functional/candidate-job-detail";
import { resolveFunctionalActor } from "@/src/server/functional-auth";
import { getFunctionalServices } from "@/src/server/functional-services";
import { decodeRouteRef } from "@/src/server/route-ref";

export const metadata: Metadata = { title: "Backed job opportunity" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CandidateJobPage({
  params,
}: {
  readonly params: Promise<{ readonly opportunityRef: string }>;
}) {
  const actor = await resolveFunctionalActor("CANDIDATE");
  if (actor === null) redirect("/login");
  const { opportunityRef: encodedOpportunityRef } = await params;
  const opportunityRef = decodeRouteRef(encodedOpportunityRef);
  const [detail, feed] = await Promise.all([
    getFunctionalServices().store.getCandidateJobDetail(actor.actorId, opportunityRef),
    getFunctionalServices().store.getCandidateOpportunityFeed(actor.actorId),
  ]);
  if (detail === null) notFound();
  return (
    <CandidateJobDetailView
      candidateRef={actor.actorId}
      credit={feed.credit}
      csrfToken={actor.csrfToken}
      job={detail}
    />
  );
}
