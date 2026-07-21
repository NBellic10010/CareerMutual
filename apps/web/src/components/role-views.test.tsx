import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuditView } from "./audit-view";
import { CandidateView } from "./candidate-view";
import { EmployerView } from "./employer-view";
import {
  loadCandidateProjection,
  loadEmployerProjection,
  loadSyntheticAuditProjection,
} from "../lib/demo-source";

const SYNTHETIC_PRIVATE_LABEL_VALUES = [
  "Alex Mercer",
  "Northstar Institute of Technology",
  "Atlas Systems",
  "Executive referral",
  "Jordan Lee",
  "Riverside Community College",
  "Cedar Local Commerce",
  "Open application",
] as const;

function expectNoPrivateLabels(value: string) {
  for (const privateValue of SYNTHETIC_PRIVATE_LABEL_VALUES) {
    expect(value).not.toContain(privateValue);
  }
}

describe("role-specific server rendering", () => {
  it("keeps synthetic private labels out of the Employer Projection and markup", async () => {
    const projection = await loadEmployerProjection();
    const serializedProjection = JSON.stringify(projection);
    const markup = renderToStaticMarkup(createElement(EmployerView, { projection }));

    expectNoPrivateLabels(serializedProjection);
    expectNoPrivateLabels(markup);
    expect(markup).toContain("Candidate 17");
    expect(markup).toContain("Candidate 42");
    expect(markup).toContain("Common Verifier");
    expect(markup).not.toContain("Traditional rank");
  });

  it("keeps other candidates and private labels out of Candidate rendering", async () => {
    const projection = await loadCandidateProjection();
    const serializedProjection = JSON.stringify(projection);
    const markup = renderToStaticMarkup(createElement(CandidateView, { projection }));

    expectNoPrivateLabels(serializedProjection);
    expectNoPrivateLabels(markup);
    expect(markup).toContain("Candidate 42");
    expect(markup).toContain("Sarah Chen");
    expect(markup).not.toContain("Candidate 17");
    expect(markup).not.toContain("Duplicate webhook delivery");
  });

  it("shows the counterfactual only in the explicitly synthetic Audit view", async () => {
    const projection = await loadSyntheticAuditProjection();
    const markup = renderToStaticMarkup(createElement(AuditView, { projection }));

    expect(projection.runtimeLabel).toBe("Synthetic — Pre-recorded external inputs");
    expect(projection.accessBoundary).toContain("synthetic replay data");
    expect(markup).toContain("Northstar Institute of Technology");
    expect(markup).toContain("Riverside Community College");
    expect(markup).toContain("Traditional rank");
    expect(markup).toContain("Common Verifier");
  });
});
