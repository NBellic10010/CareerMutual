import { SYNTHETIC_DEMO_ACTORS } from "@onlyboth/demo-fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoginChooser } from "./login-chooser";

describe("synthetic actor chooser", () => {
  it("renders every registered actor in one Start as control", () => {
    const markup = renderToStaticMarkup(<LoginChooser actors={SYNTHETIC_DEMO_ACTORS} />);

    expect(markup).toContain('aria-label="Start as"');
    expect(markup).toContain("Candidate 17 · Maya Patel");
    expect(markup).toContain("Candidate 42 · Jordan Lee");
    expect(markup).toContain("Recruiter · Sarah Chen");
    expect(markup).toContain("Start as Jordan Lee");
    expect(markup).toContain("identity choices never enter the Recruiter");
  });
});
