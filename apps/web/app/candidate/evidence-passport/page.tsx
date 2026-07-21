import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CandidateEvidencePassport } from "@/src/components/functional/candidate-evidence-passport";
import { resolveFunctionalActor } from "@/src/server/functional-auth";
import { getFunctionalServices } from "@/src/server/functional-services";

export const metadata: Metadata = { title: "Candidate Evidence Passport" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CandidateEvidencePassportPage() {
  const actor = await resolveFunctionalActor("CANDIDATE");
  if (actor === null) redirect("/login");
  const [projection, eligibility] = await Promise.all([
    getFunctionalServices().candidateEvidencePassport.getProjection(actor),
    getFunctionalServices().candidateEligibility.getProjection(actor),
  ]);
  return (
    <CandidateEvidencePassport
      key={projection.projection_version}
      csrfToken={actor.csrfToken}
      projection={projection}
      eligibility={eligibility}
    />
  );
}
