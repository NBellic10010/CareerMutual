import {
  SYNTHETIC_CANDIDATES,
  SYNTHETIC_DEMO_ACTORS,
  findSyntheticDemoActor,
} from "@onlyboth/demo-fixtures";
import { describe, expect, it } from "vitest";

describe("synthetic multi-Candidate fixtures", () => {
  it("provides seven distinct signed Candidate identities plus Sarah", () => {
    expect(SYNTHETIC_CANDIDATES).toHaveLength(7);
    expect(new Set(SYNTHETIC_DEMO_ACTORS.map(({ actor_ref }) => actor_ref)).size).toBe(8);
    expect(new Set(SYNTHETIC_CANDIDATES.map(({ actor }) => actor.display_name)).size).toBe(7);
    expect(findSyntheticDemoActor("candidate-17")).toMatchObject({
      role: "CANDIDATE",
      display_name: "Maya Patel",
    });
    expect(findSyntheticDemoActor("reviewer-sarah-chen")).toMatchObject({ role: "EMPLOYER" });
    expect(findSyntheticDemoActor("candidate-27")).toMatchObject({
      role: "CANDIDATE",
      display_name: "Avery Stone",
    });
    expect(findSyntheticDemoActor("candidate-unregistered")).toBeNull();
  });

  it("keeps every synthetic résumé materially distinct and complete", () => {
    expect(new Set(SYNTHETIC_CANDIDATES.map(({ headline }) => headline)).size).toBe(7);
    expect(new Set(SYNTHETIC_CANDIDATES.map(({ education }) => education.institution)).size).toBe(
      7,
    );
    expect(new Set(SYNTHETIC_CANDIDATES.map(({ evidence_theme }) => evidence_theme)).size).toBe(7);
    for (const fixture of SYNTHETIC_CANDIDATES) {
      expect(fixture.experience.length).toBeGreaterThan(0);
      expect(fixture.skills.length).toBeGreaterThan(0);
      expect(fixture.contact_email.endsWith(".synthetic@example.com")).toBe(true);
    }
    expect(
      SYNTHETIC_CANDIDATES.find(({ actor }) => actor.actor_ref === "candidate-27")
        ?.discovery_target_title,
    ).toBe("Senior Brand Illustrator");
  });
});
