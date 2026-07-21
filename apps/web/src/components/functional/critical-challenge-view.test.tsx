import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CriticalChallengeView } from "./critical-challenge-view";

describe("CriticalChallengeView", () => {
  it("renders the ordered text, audio, image, and file manifest as one Challenge", () => {
    const baseAsset = {
      source_kind: "SYNTHETIC_SEED" as const,
      content_length: 512,
      sha256: `sha256:${"b".repeat(64)}`,
      download_url: "/synthetic-challenges/source",
      transcript_excerpt: null,
    };
    const html = renderToStaticMarkup(
      <CriticalChallengeView
        challenge={{
          schema_version: "critical-challenge@1",
          challenge_ref: "critical-challenge:render-test@1",
          title: "One decision, four source formats",
          objective:
            "Synthesize every sealed source into one bounded response with explicit unknowns.",
          parts: [
            {
              part_ref: "challenge-part:render:text",
              kind: "TEXT",
              title: "Written brief",
              instructions: "Read the written constraint before opening the other source material.",
              text_content:
                "Choose a reversible action and name the evidence that could change it.",
              asset: null,
            },
            {
              part_ref: "challenge-part:render:audio",
              kind: "AUDIO",
              title: "Discovery excerpt",
              instructions: "Listen to the disclosed synthetic source and retain its uncertainty.",
              text_content: null,
              asset: {
                ...baseAsset,
                asset_ref: "challenge-asset:render-audio@1",
                file_name: "source.wav",
                content_type: "audio/wav",
                alt_text: null,
                transcript_excerpt: "Synthetic accessible transcript.",
              },
            },
            {
              part_ref: "challenge-part:render:image",
              kind: "IMAGE",
              title: "Direction board",
              instructions: "Inspect the synthetic board and explain the relevant visual decision.",
              text_content: null,
              asset: {
                ...baseAsset,
                asset_ref: "challenge-asset:render-image@1",
                file_name: "source.svg",
                content_type: "image/svg+xml",
                alt_text: "A synthetic visual direction board.",
              },
            },
            {
              part_ref: "challenge-part:render:file",
              kind: "FILE",
              title: "Source records",
              instructions: "Use the attached records as bounded evidence for the same decision.",
              text_content: null,
              asset: {
                ...baseAsset,
                asset_ref: "challenge-asset:render-file@1",
                file_name: "source.csv",
                content_type: "text/csv",
                alt_text: null,
              },
            },
          ],
        }}
      />,
    );

    expect(html).toContain("4 part manifest");
    expect(html).toContain("<audio");
    expect(html).toContain("<img");
    expect(html).toContain("Download sealed source file");
    expect(html).toContain("Ordered parts are sealed together");
    expect(html.indexOf("Written brief")).toBeLessThan(html.indexOf("Discovery excerpt"));
    expect(html.indexOf("Discovery excerpt")).toBeLessThan(html.indexOf("Direction board"));
    expect(html.indexOf("Direction board")).toBeLessThan(html.indexOf("Source records"));
  });
});
