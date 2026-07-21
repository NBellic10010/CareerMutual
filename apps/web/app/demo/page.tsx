import type { Metadata } from "next";

import { SyntheticReplayBanner } from "@/src/components/app-shell";
import { ColdOpenStoryboard } from "@/src/components/cold-open-storyboard";
import { loadColdOpenProjection } from "@/src/lib/demo-source";

export const metadata: Metadata = {
  title: "30-second demo",
};

export default async function DemoPage() {
  const projection = await loadColdOpenProjection();

  return (
    <main className="demo-page-shell">
      <SyntheticReplayBanner />
      <ColdOpenStoryboard projection={projection} />
    </main>
  );
}
