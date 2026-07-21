import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ROLE_HOME_ARTWORK, RoleHomeArtwork } from "./role-home-artwork";

describe("role-specific Home artwork", () => {
  it("keeps Candidate and Employer illustrations and palettes in distinct assets", () => {
    const candidate = renderToStaticMarkup(createElement(RoleHomeArtwork, { role: "CANDIDATE" }));
    const employer = renderToStaticMarkup(createElement(RoleHomeArtwork, { role: "EMPLOYER" }));

    expect(candidate).toContain("candidate-intent-hero.webp");
    expect(candidate).toContain('data-role-artwork="candidate"');
    expect(candidate).not.toContain("employer-attention-hero.webp");
    expect(employer).toContain("employer-attention-hero.webp");
    expect(employer).toContain('data-role-artwork="employer"');
    expect(employer).not.toContain("candidate-intent-hero.webp");
    expect(ROLE_HOME_ARTWORK.CANDIDATE.src).not.toBe(ROLE_HOME_ARTWORK.EMPLOYER.src);
  });

  it("marks both generated role illustrations as decorative", () => {
    for (const role of ["CANDIDATE", "EMPLOYER"] as const) {
      const markup = renderToStaticMarkup(createElement(RoleHomeArtwork, { role }));
      expect(markup).toContain('aria-hidden="true"');
    }
  });

  it("ships both compressed assets from the Web public directory", () => {
    for (const artwork of Object.values(ROLE_HOME_ARTWORK)) {
      const assetPath = fileURLToPath(new URL(`../../../public${artwork.src}`, import.meta.url));
      expect(existsSync(assetPath)).toBe(true);
    }
  });
});
