import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmployerRevealedCandidates } from "@/src/components/functional/employer-revealed-candidates";
import { resolveFunctionalActor } from "@/src/server/functional-auth";
import { getFunctionalServices } from "@/src/server/functional-services";

export const metadata: Metadata = { title: "Revealed Candidate Resumes" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function EmployerCandidatesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ page?: string }>;
}) {
  const actor = await resolveFunctionalActor("EMPLOYER");
  if (actor === null) redirect("/login");
  const rawPage = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const result = await getFunctionalServices().store.getEmployerRevealedCandidates(
    actor.actorId,
    page,
  );
  return <EmployerRevealedCandidates result={result} />;
}
