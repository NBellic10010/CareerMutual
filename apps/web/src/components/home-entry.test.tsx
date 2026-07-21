import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "../../app/page";

describe("primary home entry", () => {
  it("routes into the persistent product without promoting historical mocks", () => {
    const markup = renderToStaticMarkup(createElement(HomePage));

    expect(markup).toContain('href="/login"');
    expect(markup).toContain('href="/candidate"');
    expect(markup).toContain('href="/employer"');
    expect(markup).not.toContain('href="/prototype"');
    expect(markup).not.toContain('href="/demo"');
    expect(markup).toContain("Interest is mutual.");
    expect(markup).toContain("Attention is backed.");
    expect(markup).toContain("Signals genuine interest");
    expect(markup).toContain("Commits named attention");
  });
});
