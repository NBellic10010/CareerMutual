import {
  CandidateEducationRecordSchema,
  SaveCandidateEvidencePassportDraftCommandSchema,
} from "../../packages/contracts/src/index";
import { buildCandidateDiscoveryEvidencePriority } from "../../packages/db/src/postgres-candidate-discovery-store";
import { describe, expect, it } from "vitest";

const baseEducation = CandidateEducationRecordSchema.parse({
  education_ref: "education:policy-test",
  level: "BACHELOR",
  status: "GRADUATED",
  institution_label: "Synthetic Regional University",
  field_of_study: "Computer science",
  graduation_date: "2025-07-21",
  source_sha256: `sha256:${"a".repeat(64)}`,
  verification_state: "SYNTHETIC_SOURCE_ATTACHED",
  visibility: "CANDIDATE_ONLY",
});

describe("Candidate education precedence policy", () => {
  it("requires an explicit education record on Passport saves", () => {
    expect(
      SaveCandidateEvidencePassportDraftCommandSchema.safeParse({
        schema_version: "save-candidate-evidence-passport-draft-command@2",
        expected_draft_version: 0,
        evidence_items: [
          {
            evidence_ref: "evidence:policy-test",
            kind: "WORK_SAMPLE",
            display_title: "Synthetic policy work sample",
            bounded_summary:
              "A synthetic work sample with enough bounded material to satisfy the strict contract.",
            contribution_summary: "The Candidate states that they authored the bounded sample.",
            occurred_from: "2025-01-01",
            occurred_to: "2025-01-02",
            synthetic_locator_label: "synthetic://policy/work-sample",
            source_sha256: `sha256:${"b".repeat(64)}`,
            verification_state: "SYNTHETIC_SOURCE_ATTACHED",
            visibility: "CANDIDATE_ONLY",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("places education first through the inclusive two-year graduation boundary", () => {
    expect(
      buildCandidateDiscoveryEvidencePriority(
        { ...baseEducation, graduation_date: "2024-07-21" },
        new Date("2026-07-21T12:00:00.000Z"),
      ),
    ).toMatchObject({
      graduation_recency: "WITHIN_TWO_YEARS",
      ordered_evidence_groups: ["EDUCATION", "WORK_AND_CREDENTIALS", "OTHER"],
    });
  });

  it("places work and credentials before education after two years", () => {
    expect(
      buildCandidateDiscoveryEvidencePriority(
        { ...baseEducation, graduation_date: "2024-07-20" },
        new Date("2026-07-21T12:00:00.000Z"),
      ),
    ).toMatchObject({
      graduation_recency: "OVER_TWO_YEARS",
      ordered_evidence_groups: ["WORK_AND_CREDENTIALS", "OTHER", "EDUCATION"],
    });
  });

  it("records no formal degree without creating a negative quality signal", () => {
    const noDegree = CandidateEducationRecordSchema.parse({
      ...baseEducation,
      level: "NO_FORMAL_DEGREE",
      status: "NO_FORMAL_DEGREE",
      institution_label: null,
      field_of_study: null,
      graduation_date: null,
    });
    expect(
      buildCandidateDiscoveryEvidencePriority(noDegree, new Date("2026-07-21T12:00:00.000Z")),
    ).toMatchObject({
      graduation_recency: "NO_FORMAL_DEGREE",
      ordered_evidence_groups: ["WORK_AND_CREDENTIALS", "OTHER", "EDUCATION"],
    });
  });
});
