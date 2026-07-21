import {
  AnswerProcessEvidenceV2Schema,
  AnswerProcessEvidenceV1Schema,
  type AnswerBehaviorSignal,
  type AnswerProcessEvidenceV1,
  type AnswerProcessEvidenceV2,
} from "@onlyboth/contracts";

export interface AnswerProcessEvidenceInput {
  readonly processEvidenceRef: string;
  readonly answerSessionRef: string;
  readonly answerSubmissionRef: string;
  readonly startedAt: string;
  readonly answerDueAt: string;
  readonly submittedAt: string;
  readonly submissionSource: "MANUAL" | "DEADLINE_AUTO" | "FOCUS_POLICY_AUTO";
  readonly revisions: readonly {
    readonly artifactRef: string;
    readonly revision: number;
    readonly sha256: string;
    readonly recordedAt: string;
    readonly plainTextLength: number;
    readonly final: boolean;
  }[];
  readonly platformGptTurnTimes: readonly string[];
  readonly voiceMemoTimes: readonly string[];
  readonly knownPlatformFailures: readonly string[];
}

function secondsBetween(left: string, right: string): number {
  return Math.max(0, Math.floor((Date.parse(right) - Date.parse(left)) / 1_000));
}

function ratio(value: number, total: number): number {
  return total <= 0 ? 0 : value / total;
}

function signal(
  processEvidenceRef: string,
  value: Omit<AnswerBehaviorSignal, "signal_ref"> & { readonly key: string },
): AnswerBehaviorSignal {
  const { key, ...fields } = value;
  return {
    signal_ref: `${processEvidenceRef}:${key}`,
    ...fields,
  };
}

export function buildAnswerProcessEvidence(
  input: AnswerProcessEvidenceInput,
): AnswerProcessEvidenceV2 {
  const revisions = [...input.revisions].sort(
    (left, right) =>
      Date.parse(left.recordedAt) - Date.parse(right.recordedAt) || left.revision - right.revision,
  );
  const gaps = [
    secondsBetween(input.startedAt, revisions[0]?.recordedAt ?? input.submittedAt),
    ...revisions
      .slice(1)
      .map((revision, index) => secondsBetween(revisions[index]!.recordedAt, revision.recordedAt)),
    secondsBetween(revisions.at(-1)?.recordedAt ?? input.startedAt, input.submittedAt),
  ];
  let growth = 0;
  let shrink = 0;
  let maximumChange = 0;
  for (let index = 1; index < revisions.length; index += 1) {
    const change = revisions[index]!.plainTextLength - revisions[index - 1]!.plainTextLength;
    if (change > 0) growth += 1;
    if (change < 0) shrink += 1;
    maximumChange = Math.max(maximumChange, Math.abs(change));
  }
  const allowedDurationSeconds = secondsBetween(input.startedAt, input.answerDueAt);
  const firstNonEmptyRevisionAt =
    revisions.find(({ plainTextLength }) => plainTextLength > 0)?.recordedAt ?? null;
  const firstContentDelaySeconds = secondsBetween(
    input.startedAt,
    firstNonEmptyRevisionAt ?? input.submittedAt,
  );
  const longestRevisionGapSeconds = Math.max(0, ...gaps);
  const secondsRemainingAtSubmit = Math.floor(
    (Date.parse(input.answerDueAt) - Date.parse(input.submittedAt)) / 1_000,
  );
  const maximumObservedLength = Math.max(
    0,
    ...revisions.map(({ plainTextLength }) => plainTextLength),
  );
  const firstContentRatio = ratio(firstContentDelaySeconds, allowedDurationSeconds);
  const gapRatio = ratio(longestRevisionGapSeconds, allowedDurationSeconds);
  const maximumChangeRatio = ratio(maximumChange, maximumObservedLength);
  const remainingRatio = ratio(Math.max(0, secondsRemainingAtSubmit), allowedDurationSeconds);
  const behaviorSignals: AnswerBehaviorSignal[] = [
    signal(input.processEvidenceRef, {
      key: "first-content-delay",
      kind: "FIRST_CONTENT_DELAY",
      severity:
        firstNonEmptyRevisionAt === null || firstContentRatio > 0.6
          ? "RED"
          : firstContentRatio > 0.25
            ? "YELLOW"
            : "GREEN",
      title: "First recorded content",
      observed_value:
        firstNonEmptyRevisionAt === null
          ? "No non-empty server revision was recorded before submission."
          : `${firstContentDelaySeconds} seconds after the session started.`,
      applied_rule: "Green ≤25%; yellow >25–60%; red >60% of the sealed answer window or none.",
      reviewer_caveat: "A delayed server revision does not prove the Candidate was idle.",
      attribution: "CANDIDATE_SESSION",
    }),
    signal(input.processEvidenceRef, {
      key: "revision-gap",
      kind: "REVISION_GAP",
      severity: gapRatio > 0.65 ? "RED" : gapRatio > 0.35 ? "YELLOW" : "GREEN",
      title: "Longest revision gap",
      observed_value: `${longestRevisionGapSeconds} seconds with no server-recorded revision.`,
      applied_rule: "Green ≤35%; yellow >35–65%; red >65% of the sealed answer window.",
      reviewer_caveat: "This measures persisted revisions, not attention, thinking, or activity.",
      attribution: "CANDIDATE_SESSION",
    }),
    signal(input.processEvidenceRef, {
      key: "revision-volatility",
      kind: "REVISION_VOLATILITY",
      severity:
        shrink >= 4 || maximumChangeRatio >= 0.6
          ? "RED"
          : shrink >= 2 || maximumChangeRatio >= 0.3
            ? "YELLOW"
            : "GREEN",
      title: "Revision volatility",
      observed_value: `${growth} net-growth and ${shrink} net-shrink revisions; largest net length change ${maximumChange} characters.`,
      applied_rule:
        "Green <2 shrink revisions and <30% maximum change; yellow 2–3 or 30–59%; red ≥4 or ≥60%.",
      reviewer_caveat:
        "Editing volume describes the submitted session, not writing ability by itself.",
      attribution: "CANDIDATE_SESSION",
    }),
    signal(input.processEvidenceRef, {
      key: "submission-pressure",
      kind: "SUBMISSION_PRESSURE",
      severity:
        input.submissionSource !== "MANUAL" || remainingRatio < 0.05
          ? "RED"
          : remainingRatio < 0.2
            ? "YELLOW"
            : "GREEN",
      title: "Submission pressure",
      observed_value: `${input.submissionSource}; ${secondsRemainingAtSubmit} seconds remained.`,
      applied_rule:
        "Green ≥20% remaining; yellow 5–19%; red <5% or a deadline/focus-policy automatic submission.",
      reviewer_caveat:
        "Submission timing is context for review, not an automatic capability conclusion.",
      attribution: "CANDIDATE_SESSION",
    }),
    signal(input.processEvidenceRef, {
      key: "disclosed-assistance",
      kind: "DISCLOSED_PLATFORM_ASSISTANCE",
      severity:
        input.platformGptTurnTimes.length > 5
          ? "RED"
          : input.platformGptTurnTimes.length > 2
            ? "YELLOW"
            : "GREEN",
      title: "Disclosed platform assistance",
      observed_value: `${input.platformGptTurnTimes.length} platform GPT turn(s) and ${input.voiceMemoTimes.length} Voice Memo(s).`,
      applied_rule: "Green 0–2; yellow 3–5; red >5 disclosed platform GPT turns.",
      reviewer_caveat:
        "Allowed and disclosed assistance is not cheating; external-tool use cannot be inferred here.",
      attribution: "CANDIDATE_SESSION",
    }),
    signal(input.processEvidenceRef, {
      key: "platform-reliability",
      kind: "PLATFORM_RELIABILITY",
      severity: input.knownPlatformFailures.length === 0 ? "GREEN" : "YELLOW",
      title: "Platform reliability",
      observed_value:
        input.knownPlatformFailures.length === 0
          ? "No known platform failure was recorded."
          : `${new Set(input.knownPlatformFailures).size} known platform failure code(s) were recorded.`,
      applied_rule:
        "Green when none are recorded; yellow when one or more platform failures exist.",
      reviewer_caveat:
        "Platform failures are never attributed to the Candidate and never become red.",
      attribution: "PLATFORM_CONDITION",
    }),
  ];
  return AnswerProcessEvidenceV2Schema.parse({
    schema_version: "answer-process-evidence@2",
    process_evidence_ref: input.processEvidenceRef,
    answer_session_ref: input.answerSessionRef,
    answer_submission_ref: input.answerSubmissionRef,
    started_at: input.startedAt,
    submitted_at: input.submittedAt,
    answer_due_at: input.answerDueAt,
    allowed_duration_seconds: allowedDurationSeconds,
    elapsed_seconds: secondsBetween(input.startedAt, input.submittedAt),
    first_non_empty_revision_at: firstNonEmptyRevisionAt,
    draft_revision_count: revisions.length,
    longest_no_server_recorded_revision_seconds: longestRevisionGapSeconds,
    net_growth_revision_count: growth,
    net_shrink_revision_count: shrink,
    maximum_absolute_net_length_change: maximumChange,
    platform_gpt_turn_count: input.platformGptTurnTimes.length,
    platform_gpt_turn_times: input.platformGptTurnTimes,
    voice_memo_count: input.voiceMemoTimes.length,
    voice_memo_times: input.voiceMemoTimes,
    submission_source: input.submissionSource,
    seconds_remaining_at_submit: secondsRemainingAtSubmit,
    known_platform_failures: [...new Set(input.knownPlatformFailures)].sort(),
    revision_manifest: revisions.map((revision) => ({
      artifact_ref: revision.artifactRef,
      revision: revision.revision,
      sha256: revision.sha256,
      recorded_at: revision.recordedAt,
      plain_text_length: revision.plainTextLength,
      final: revision.final,
    })),
    wording_guard: "no server-recorded revision",
    created_at: input.submittedAt,
    behavior_rule_set_ref: "onlyboth.answer-behavior-severity@1",
    behavior_signals: behaviorSignals,
    interpretation_boundary:
      "Severity is a review signal for this disclosed answer session, not proof of intent or external AI use.",
  });
}

export function buildLegacyAnswerProcessEvidence(
  input: AnswerProcessEvidenceInput,
): AnswerProcessEvidenceV1 {
  const current = buildAnswerProcessEvidence(input);
  const {
    behavior_rule_set_ref: behaviorRuleSetRef,
    behavior_signals: behaviorSignals,
    interpretation_boundary: interpretationBoundary,
    schema_version: schemaVersion,
    ...legacyFields
  } = current;
  void behaviorRuleSetRef;
  void behaviorSignals;
  void interpretationBoundary;
  void schemaVersion;
  return AnswerProcessEvidenceV1Schema.parse({
    ...legacyFields,
    schema_version: "answer-process-evidence@1",
  });
}
