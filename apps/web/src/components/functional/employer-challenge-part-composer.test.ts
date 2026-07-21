import { describe, expect, it } from "vitest";

import {
  validateEmployerChallengeFile,
  validateEmployerChallengePartCopy,
  verifiedChallengeParts,
  type EmployerChallengeMediaPartDraft,
} from "./employer-challenge-part-composer";

describe("Employer Critical Challenge Part Composer", () => {
  it("validates client files against the same bounded image, audio, file, and video policy", () => {
    expect(
      validateEmployerChallengeFile("IMAGE", {
        name: "board.png",
        type: "image/png",
        size: 2_048,
      }),
    ).toBeNull();
    expect(
      validateEmployerChallengeFile("IMAGE", {
        name: "unsafe.svg",
        type: "image/svg+xml",
        size: 2_048,
      }),
    ).toContain("not allowed");
    expect(
      validateEmployerChallengeFile("FILE", {
        name: "walkthrough.mp4",
        type: "video/mp4",
        size: 2_048,
      }),
    ).toBe("Video is not supported yet.");
    expect(
      validateEmployerChallengeFile("FILE", {
        name: "unsafe\n.csv",
        type: "text/csv",
        size: 2_048,
      }),
    ).toContain("valid local file name");
  });

  it("serializes only VERIFIED media Parts into the ordered Challenge manifest", () => {
    const verified = {
      local_ref: "visual-01",
      kind: "IMAGE",
      title: "Visual hierarchy",
      instructions: "Inspect the hierarchy and identify one bounded operational risk.",
      file: null,
      preview_url: null,
      alt_text: "A synthetic direction board.",
      transcript_excerpt: "",
      upload_state: "VERIFIED",
      error: null,
      verified: {
        schema_version: "employer-challenge-asset-verified-receipt@1",
        state: "VERIFIED",
        part_kind: "IMAGE",
        verified_at: "2026-07-21T12:00:00.000Z",
        asset: {
          asset_ref: "challenge-asset:visual-01",
          source_kind: "EMPLOYER_UPLOAD",
          file_name: "board.png",
          content_type: "image/png",
          content_length: 2_048,
          sha256: `sha256:${"c".repeat(64)}`,
          download_url: "/api/v1/challenge-assets/challenge-asset%3Avisual-01",
          alt_text: "A synthetic direction board.",
          transcript_excerpt: null,
        },
      },
    } satisfies EmployerChallengeMediaPartDraft;
    const local = {
      ...verified,
      local_ref: "file-02",
      kind: "FILE",
      upload_state: "LOCAL",
      verified: null,
    } satisfies EmployerChallengeMediaPartDraft;

    expect(verifiedChallengeParts([verified, local])).toEqual([
      expect.objectContaining({
        part_ref: "challenge-part:visual-01",
        kind: "IMAGE",
        asset: expect.objectContaining({ asset_ref: "challenge-asset:visual-01" }),
      }),
    ]);
  });

  it("rejects media Part copy that would invalidate the containing JobPost command", () => {
    expect(
      validateEmployerChallengePartCopy({ title: "", instructions: "Complete response." }),
    ).toBe("Part title must contain 2–200 characters.");
    expect(validateEmployerChallengePartCopy({ title: "Image", instructions: "short" })).toBe(
      "Candidate instructions must contain 10–2,000 characters.",
    );
    expect(
      validateEmployerChallengePartCopy({
        title: "Image",
        instructions: "Use the attached image in the bounded response.",
      }),
    ).toBeNull();
  });
});
