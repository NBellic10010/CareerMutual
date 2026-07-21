import type { Metadata } from "next";

import { RolePage } from "@/src/components/app-shell";
import { AuditView } from "@/src/components/audit-view";
import { loadSyntheticAuditProjection } from "@/src/lib/demo-source";

export const metadata: Metadata = {
  title: "Synthetic audit view",
};

export default async function AuditPage() {
  const projection = await loadSyntheticAuditProjection();

  return (
    <RolePage
      boundary="Synthetic counterfactual data only"
      description="This instrumentation layer explains the résumé–evidence disagreement and audits data boundaries. It is not an employer hiring screen."
      eyebrow="Judge / auditor projection"
      title="See what Sarah is deliberately not shown."
    >
      <AuditView projection={projection} />
    </RolePage>
  );
}
