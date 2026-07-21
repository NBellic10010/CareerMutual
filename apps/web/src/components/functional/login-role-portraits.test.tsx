import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LOGIN_ROLE_PORTRAITS, LoginRolePortraits } from "./login-role-portraits";

describe("login role portraits", () => {
  it("renders distinct decorative Candidate and Recruiter background portraits", () => {
    const markup = renderToStaticMarkup(<LoginRolePortraits />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-login-role="candidate"');
    expect(markup).toContain("login-candidate-performance-v2.webp");
    expect(markup).toContain("writing on a whiteboard");
    expect(markup).toContain('data-login-role="recruiter"');
    expect(markup).toContain("login-recruiter-review-v2.webp");
    expect(markup).toContain("considering the Candidate&#x27;s work");
    expect(LOGIN_ROLE_PORTRAITS.CANDIDATE.src).not.toBe(LOGIN_ROLE_PORTRAITS.RECRUITER.src);
  });

  it("ships both compressed portraits from the Web public directory", () => {
    for (const portrait of Object.values(LOGIN_ROLE_PORTRAITS)) {
      const assetPath = fileURLToPath(new URL(`../../../public${portrait.src}`, import.meta.url));
      expect(existsSync(assetPath), portrait.src).toBe(true);
    }
  });
});
