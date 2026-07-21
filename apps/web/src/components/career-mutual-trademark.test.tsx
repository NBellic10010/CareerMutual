import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CareerMutualTrademark } from "./career-mutual-trademark";

describe("CareerMutual trademark", () => {
  it("pairs the CareerMutual name with an accessible hired signal", () => {
    const markup = renderToStaticMarkup(<CareerMutualTrademark />);

    expect(markup).toContain("CareerMutual");
    expect(markup).toContain('aria-label="Hired"');
    expect(markup).toContain("Hired");
    expect(markup).toContain("career-mutual-hire-check");
    expect(markup).not.toContain("OnlyBoth");
  });
});
