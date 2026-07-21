import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SequentialReviewWorkspace } from "@/src/components/functional/sequential-review-workspace";
import { resolveFunctionalActor } from "@/src/server/functional-auth";
import { getFunctionalServices } from "@/src/server/functional-services";
import { decodeRouteRef } from "@/src/server/route-ref";

export const metadata: Metadata = { title: "Sequential answer review" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function EmployerReviewPage({
  params,
}: {
  readonly params: Promise<{ readonly opportunityRef: string }>;
}) {
  const actor = await resolveFunctionalActor("EMPLOYER");
  if (actor === null) redirect("/login");
  const { opportunityRef: encodedOpportunityRef } = await params;
  const opportunityRef = decodeRouteRef(encodedOpportunityRef);
  const review = await getFunctionalServices().store.getCurrentEmployerReview(
    actor.actorId,
    opportunityRef,
  );
  if (review === null) notFound();
  return <SequentialReviewWorkspace csrfToken={actor.csrfToken} initialReview={review} />;
}
