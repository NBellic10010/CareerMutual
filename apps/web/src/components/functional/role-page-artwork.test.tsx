import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ROLE_PAGE_ARTWORK, RolePageArtwork } from "./role-page-artwork";

describe("role detail artwork", () => {
  it("keeps the Candidate action and Recruiter scrutiny surfaces visually distinct", () => {
    const candidate = renderToStaticMarkup(
      createElement(RolePageArtwork, { surface: "CANDIDATE_ROLE" }),
    );
    const recruiter = renderToStaticMarkup(
      createElement(RolePageArtwork, { surface: "RECRUITER_OPERATIONS" }),
    );

    expect(candidate).toContain('data-role-page-artwork="candidate-role"');
    expect(candidate).toContain("candidate-roll-up-sleeves-v1.webp");
    expect(candidate).toContain("rolling up the sleeve");
    expect(candidate).not.toContain("recruiter-glasses-review-v1.webp");
    expect(recruiter).toContain('data-role-page-artwork="recruiter-operations"');
    expect(recruiter).toContain("recruiter-glasses-review-v1.webp");
    expect(recruiter).toContain("eyeglasses");
    expect(recruiter).not.toContain("candidate-roll-up-sleeves-v1.webp");
  });

  it("marks both local generated assets as decorative and ships them with the Web app", () => {
    for (const [surface, artwork] of Object.entries(ROLE_PAGE_ARTWORK)) {
      const markup = renderToStaticMarkup(
        createElement(RolePageArtwork, {
          surface: surface as keyof typeof ROLE_PAGE_ARTWORK,
        }),
      );
      const assetPath = fileURLToPath(new URL(`../../../public${artwork.src}`, import.meta.url));

      expect(markup).toContain('aria-hidden="true"');
      expect(existsSync(assetPath), artwork.src).toBe(true);
    }
  });
});
