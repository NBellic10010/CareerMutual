import type { Metadata } from "next";

import { PrototypeExperience } from "@/src/components/prototype/prototype-experience";

export const metadata: Metadata = {
  title: "No-backend UI prototype",
  description:
    "A synthetic, local-only walkthrough of CareerMutual's blind Answer Review and post-answer Resume Reveal experience.",
};

export const dynamic = "force-static";

export default function PrototypePage() {
  return <PrototypeExperience />;
}
