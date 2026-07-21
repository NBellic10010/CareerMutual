import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { findSyntheticDemoActor } from "@onlyboth/demo-fixtures";

import { CandidateHome } from "@/src/components/functional/candidate-home";
import { resolveFunctionalActor } from "@/src/server/functional-auth";
import { getFunctionalServices } from "@/src/server/functional-services";

export const metadata: Metadata = { title: "Candidate opportunities" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CandidatePage() {
  const actor = await resolveFunctionalActor("CANDIDATE");
  if (actor === null) redirect("/login");
  const feed = await getFunctionalServices().candidateEligibilityStore.getCandidateOpportunityFeed(
    actor.actorId,
  );
  const identity = findSyntheticDemoActor(actor.actorId);
  return <CandidateHome candidateLabel={identity?.start_label ?? actor.actorId} feed={feed} />;
}
