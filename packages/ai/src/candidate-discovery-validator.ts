import type { CandidateJobDiscoveryInput, CandidateJobDiscoveryOutput } from "@onlyboth/contracts";

import { HiringIntelligenceError } from "./errors.js";

const PROHIBITED =
  /(?:\b(?:scores?|scoring|ranks?|ranking|hire|hires|hired|hiring recommendation|reject|rejects|rejected|rejection|direct|explore|queue|attention allocation|best candidate|top candidate|verified|proves|proven|confirms|confirmed)\b|\b\d{1,3}\s*%|<script|```|rm\s+-rf|\$\()/iu;

function policyText(output: CandidateJobDiscoveryOutput): string[] {
  return [
    output.explanation ?? "",
    ...output.opportunity_signals.flatMap((signal) =>
      signal.connections.flatMap((connection) => [
        connection.bounded_reason,
        ...connection.still_unknown,
      ]),
    ),
  ];
}

export function validateCandidateJobDiscoveryOutput(
  input: CandidateJobDiscoveryInput,
  output: CandidateJobDiscoveryOutput,
): CandidateJobDiscoveryOutput {
  if (policyText(output).some((value) => PROHIBITED.test(value))) {
    throw new HiringIntelligenceError(
      "AI_OUTPUT_POLICY_VIOLATION",
      "deriveCandidateJobSignals",
      false,
      "Candidate discovery output contains prohibited decision or executable language.",
    );
  }

  if (output.status === "abstain") return output;

  const opportunityRefs = new Set(input.opportunities.map((item) => item.opportunity_ref));
  const outputOpportunityRefs = output.opportunity_signals.map((item) => item.opportunity_ref);
  if (
    outputOpportunityRefs.length !== opportunityRefs.size ||
    new Set(outputOpportunityRefs).size !== outputOpportunityRefs.length ||
    outputOpportunityRefs.some((reference) => !opportunityRefs.has(reference)) ||
    [...opportunityRefs].some((reference) => !outputOpportunityRefs.includes(reference))
  ) {
    throw new HiringIntelligenceError(
      "AI_SOURCE_REF_INVALID",
      "deriveCandidateJobSignals",
      false,
      "Candidate discovery output must contain each input opportunity exactly once.",
    );
  }

  const evidenceRefs = new Set([
    input.education.education_ref,
    ...input.evidence.map((item) => item.evidence_ref),
  ]);
  const groupByEvidenceRef = new Map<string, "EDUCATION" | "WORK_AND_CREDENTIALS" | "OTHER">([
    [input.education.education_ref, "EDUCATION"],
    ...input.evidence.map(
      (item) =>
        [
          item.evidence_ref,
          item.kind === "CERTIFICATION" || item.kind === "EMPLOYMENT_VERIFICATION"
            ? "WORK_AND_CREDENTIALS"
            : "OTHER",
        ] as const,
    ),
  ]);
  const precedence = new Map(
    input.evidence_priority.ordered_evidence_groups.map((group, index) => [group, index]),
  );
  const opportunities = new Map(
    input.opportunities.map((item) => [
      item.opportunity_ref,
      new Set(item.capabilities.map((capability) => capability.capability_ref)),
    ]),
  );
  for (const signal of output.opportunity_signals) {
    const capabilityRefs = opportunities.get(signal.opportunity_ref);
    if (capabilityRefs === undefined) {
      throw new HiringIntelligenceError(
        "AI_SOURCE_REF_INVALID",
        "deriveCandidateJobSignals",
        false,
        "Candidate discovery output references an unknown opportunity.",
      );
    }
    let priorConnectionPrecedence = -1;
    for (const connection of signal.connections) {
      if (
        !capabilityRefs.has(connection.capability_ref) ||
        connection.evidence_refs.some((reference) => !evidenceRefs.has(reference))
      ) {
        throw new HiringIntelligenceError(
          "AI_SOURCE_REF_INVALID",
          "deriveCandidateJobSignals",
          false,
          "Candidate discovery output contains an invalid capability or evidence reference.",
        );
      }
      const connectionPrecedence = Math.min(
        ...connection.evidence_refs.map(
          (reference) => precedence.get(groupByEvidenceRef.get(reference) ?? "OTHER") ?? 2,
        ),
      );
      if (connectionPrecedence < priorConnectionPrecedence) {
        throw new HiringIntelligenceError(
          "AI_OUTPUT_POLICY_VIOLATION",
          "deriveCandidateJobSignals",
          false,
          "Candidate discovery connections violate the frozen evidence precedence policy.",
        );
      }
      priorConnectionPrecedence = connectionPrecedence;
    }
  }
  return output;
}

export class CandidateJobDiscoveryValidator {
  public validate(
    input: CandidateJobDiscoveryInput,
    output: CandidateJobDiscoveryOutput,
  ): CandidateJobDiscoveryOutput {
    return validateCandidateJobDiscoveryOutput(input, output);
  }
}
