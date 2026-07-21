import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmployerDashboard } from "@/src/components/functional/employer-dashboard";
import { resolveFunctionalActor } from "@/src/server/functional-auth";
import { getFunctionalServices } from "@/src/server/functional-services";

export const metadata: Metadata = { title: "Employer attention dashboard" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function EmployerPage() {
  const actor = await resolveFunctionalActor("EMPLOYER");
  if (actor === null) redirect("/login");
  const dashboard = await getFunctionalServices().store.getEmployerDashboard(actor.actorId);
  return <EmployerDashboard csrfToken={actor.csrfToken} initialDashboard={dashboard} />;
}
