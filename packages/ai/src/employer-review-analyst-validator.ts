import {
  AnswerEvidenceEdgeDraftSchema,
  BuildAnswerEvidenceEdgeInputSchema,
  type AnswerEvidenceEdgeDraft,
  type BuildAnswerEvidenceEdgeInput,
} from "@onlyboth/contracts";

import { HiringIntelligenceError } from "./errors.js";

const PROHIBITED = [
  { code: "SCORE", pattern: /\b(candidate|match|overall)\s+score\b/i },
  { code: "RANK", pattern: /\brank(?:ing|ed)?\b/i },
  { code: "HIRE_REJECT", pattern: /\b(?:hire|reject)\b/i },
  {
    code: "DECISION_RECOMMENDATION",
    pattern: /\brecommend(?:s|ed|ation)?\s+(?:advanc|clos|reject|hir)/i,
  },
  {
    code: "BEHAVIORAL_INFERENCE",
    pattern: /\b(?:suspicious|lazy|dishonest|cheat(?:ing)?|personality|emotion)\b/i,
  },
  { code: "INACTIVE", pattern: /\binactive\b/i },
  {
    code: "INTEGRITY_ACTIVITY_INFERENCE",
    pattern: /\b(?:integrity|activity)\s+(?:assessment|judg(?:e|ment)|score|inference)\b/i,
  },
] as const;

function fail(message: string): never {
  throw new HiringIntelligenceError(
    "AI_SCHEMA_MISMATCH",
    "buildAnswerEvidenceEdge",
    false,
    message,
  );
}

function occurrenceCount(text: string, quote: string): number {
  let count = 0;
  let start = 0;
  while (start <= text.length - quote.length) {
    const index = text.indexOf(quote, start);
    if (index < 0) break;
    count += 1;
    start = index + Math.max(quote.length, 1);
  }
  return count;
}

export function validateAnswerEvidenceEdge(
  rawInput: BuildAnswerEvidenceEdgeInput,
  rawOutput: AnswerEvidenceEdgeDraft,
): AnswerEvidenceEdgeDraft {
  const input = BuildAnswerEvidenceEdgeInputSchema.parse(rawInput);
  const output = AnswerEvidenceEdgeDraftSchema.parse(rawOutput);
  const serialized = JSON.stringify(output);
  const prohibited = PROHIBITED.find(({ pattern }) => pattern.test(serialized));
  if (prohibited !== undefined) {
    fail(
      `The analyst output contains prohibited scoring, decision, or behavioral inference language (${prohibited.code}).`,
    );
  }
  const blocks = new Map(input.source_blocks.map((block) => [block.source_block_ref, block]));
  const validateQuote = (
    quote: { source_block_ref: string; exact_quote: string; occurrence_index: number },
    processAllowed: boolean,
  ) => {
    const block = blocks.get(quote.source_block_ref);
    if (block === undefined)
      fail("An evidence quote references a source outside the frozen input.");
    if (!processAllowed && block.source_kind === "PROCESS") {
      fail("Process evidence cannot support answer summary or criterion findings.");
    }
    const count = occurrenceCount(block.text, quote.exact_quote);
    if (count === 0 || quote.occurrence_index >= count) {
      fail("An exact quote cannot be resolved at its declared occurrence index.");
    }
  };
  for (const sentence of output.summary) {
    for (const source of sentence.sources) validateQuote(source, false);
  }
  const expectedCriteria = input.review_criteria.map(({ criterion_ref }) => criterion_ref).sort();
  const actualCriteria = output.criterion_findings.map(({ criterion_ref }) => criterion_ref).sort();
  if (
    expectedCriteria.length !== actualCriteria.length ||
    expectedCriteria.some((criterion, index) => criterion !== actualCriteria[index])
  ) {
    fail("Every sealed Review Criterion must appear exactly once.");
  }
  for (const finding of output.criterion_findings) {
    for (const source of finding.supporting_evidence) validateQuote(source, false);
    for (const source of finding.contradicting_evidence) validateQuote(source, false);
    if (finding.status === "SUPPORTED" && finding.supporting_evidence.length === 0) {
      fail("SUPPORTED requires source-linked supporting evidence.");
    }
    if (finding.status === "CONTRADICTED" && finding.contradicting_evidence.length === 0) {
      fail("CONTRADICTED requires source-linked contradicting evidence.");
    }
    if (
      finding.status === "NOT_ADDRESSED" &&
      (finding.supporting_evidence.length > 0 || finding.contradicting_evidence.length > 0)
    ) {
      fail("NOT_ADDRESSED cannot carry supporting or contradicting evidence.");
    }
  }
  for (const question of output.reviewer_questions) {
    for (const source of question.sources) validateQuote(source, true);
  }
  for (const item of output.process_timeline) {
    const block = blocks.get(item.source_block_ref);
    if (block === undefined || block.source_kind !== "PROCESS") {
      fail("Process timeline items must reference frozen PROCESS evidence.");
    }
    if (/\binactive\b/i.test(item.statement)) {
      fail("Process context must use no-server-recorded-revision wording, not inactivity claims.");
    }
  }
  if (input.policy === "ANSWER_ONLY" && output.process_timeline.length > 0) {
    fail("ANSWER_ONLY output cannot expose process context.");
  }
  if (output.schema_version === "answer-evidence-edge-draft@2") {
    for (const source of output.answer_verdict.evidence) validateQuote(source, false);
    const expectedDimensions = [
      "CLARITY",
      "INTERNAL_CONSISTENCY",
      "LOGICAL_STRUCTURE",
      "RESPONSIVENESS",
    ];
    const actualDimensions = output.language_findings.map(({ dimension }) => dimension).sort();
    if (
      actualDimensions.length !== expectedDimensions.length ||
      expectedDimensions.some((dimension, index) => dimension !== actualDimensions[index])
    ) {
      fail("Every bounded language dimension must appear exactly once.");
    }
    const severityByStatus = { CLEAR: "GREEN", MIXED: "YELLOW", CONCERN: "RED" } as const;
    for (const finding of output.language_findings) {
      if (finding.severity !== severityByStatus[finding.status]) {
        fail("Language severity must match the versioned CLEAR/MIXED/CONCERN mapping.");
      }
      for (const source of finding.evidence) validateQuote(source, false);
    }
    const hasSupportedCriterion = output.criterion_findings.some(
      ({ status }) => status === "SUPPORTED",
    );
    const hasContradictedCriterion = output.criterion_findings.some(
      ({ status }) => status === "CONTRADICTED",
    );
    const hasLanguageConcern = output.language_findings.some(({ status }) => status === "CONCERN");
    const allNotAddressed = output.criterion_findings.every(
      ({ status }) => status === "NOT_ADDRESSED",
    );
    if (
      output.answer_verdict.verdict === "GOOD_ANSWER" &&
      (!hasSupportedCriterion || hasContradictedCriterion || hasLanguageConcern)
    ) {
      fail(
        "GOOD_ANSWER requires supported task evidence with no contradiction or red language concern.",
      );
    }
    if (
      output.answer_verdict.verdict === "BAD_ANSWER" &&
      !hasContradictedCriterion &&
      !hasLanguageConcern &&
      !allNotAddressed
    ) {
      fail(
        "BAD_ANSWER requires a contradiction, red language concern, or wholly unaddressed task.",
      );
    }
  }
  return output;
}
