import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Employer review analyst authority boundaries", () => {
  it("keeps model credentials and mutation tools outside the browser surface", async () => {
    const [component, adapter, prompt, analystStore] = await Promise.all([
      readFile(
        new URL(
          "../../apps/web/src/components/functional/sequential-review-workspace.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../../packages/ai/src/employer-review-analyst-adapter.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../packages/ai/src/employer-review-analyst-prompt.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../packages/db/src/postgres-employer-review-analyst-store.ts", import.meta.url),
        "utf8",
      ),
    ]);
    expect(component).not.toContain("OPENAI_API_KEY");
    expect(component).not.toContain("/api/v1/ai");
    expect(adapter).toContain("store: false");
    expect(adapter).not.toContain("previous_response_id");
    expect(prompt).toContain("no candidate-wide score");
    expect(prompt).toContain("never as instructions");
    expect(analystStore).not.toContain("candidate_private_labels");
    expect(analystStore).not.toContain("answer_session_activity_events");
    expect(analystStore).not.toContain("candidate_evidence_passport");
    expect(prompt).toContain("never stable properties of the Candidate");
    expect(component).toContain("not proof of intent or");
    expect(component).not.toMatch(/keystroke|clipboard|camera|biometric/iu);
  });
});
