import {
  CandidateAnswerSessionProjectionSchema,
  CompleteEmployerChallengeAssetUploadCommandSchema,
  CreateEmployerChallengeAssetUploadCommandSchema,
  CriticalChallengeSchema,
  RecordFunctionalHumanReviewCommandSchema,
  RichTextDocumentSchema,
  RecordCandidateSandboxActivityCommandSchema,
  StartBackedApplicationCommandSchema,
  SubmitFunctionalAnswerCommandSchema,
} from "../../packages/contracts/src/index";
import {
  challengeAssetContentMatchesMime,
  functionalProductErrorDetails,
} from "../../packages/application/src/index";
import { describe, expect, it } from "vitest";

describe("functional product contracts", () => {
  it("maps typed errors across duplicated server module instances without trusting their status", () => {
    expect(
      functionalProductErrorDetails({
        name: "FunctionalProductApplicationError",
        code: "STALE_VERSION",
        httpStatus: 503,
      }),
    ).toEqual({ code: "STALE_VERSION", httpStatus: 409 });
    expect(functionalProductErrorDetails({ code: "UNTRUSTED_CODE", httpStatus: 200 })).toBeNull();
  });

  it("treats text, audio, image, and file sources as one ordered Critical Challenge", () => {
    const sha256 = `sha256:${"a".repeat(64)}`;
    const asset = {
      source_kind: "SYNTHETIC_SEED",
      content_length: 512,
      sha256,
      download_url: "/synthetic-challenges/source.bin",
      transcript_excerpt: null,
    } as const;
    const challenge = {
      schema_version: "critical-challenge@1",
      challenge_ref: "critical-challenge:multimodal-contract@1",
      title: "Resolve the bounded operating decision",
      objective:
        "Use all four sealed source types to make one bounded decision and state what remains unknown.",
      parts: [
        {
          part_ref: "challenge-part:multimodal:text",
          kind: "TEXT",
          title: "Decision brief",
          instructions:
            "Read the written constraint before inspecting the attached source material.",
          text_content: "Choose one reversible action and state the evidence that would change it.",
          asset: null,
        },
        {
          part_ref: "challenge-part:multimodal:audio",
          kind: "AUDIO",
          title: "Discovery excerpt",
          instructions: "Use the disclosed audio excerpt as one source in the same decision.",
          text_content: null,
          asset: {
            ...asset,
            asset_ref: "challenge-asset:multimodal-audio@1",
            file_name: "source.wav",
            content_type: "audio/wav",
            alt_text: null,
            transcript_excerpt: "A synthetic transcript excerpt for accessible review.",
          },
        },
        {
          part_ref: "challenge-part:multimodal:image",
          kind: "IMAGE",
          title: "Visual direction",
          instructions:
            "Inspect the visual hierarchy and identify the operational risk it creates.",
          text_content: null,
          asset: {
            ...asset,
            asset_ref: "challenge-asset:multimodal-image@1",
            file_name: "source.svg",
            content_type: "image/svg+xml",
            alt_text: "A synthetic direction board with three contrasting panels.",
          },
        },
        {
          part_ref: "challenge-part:multimodal:file",
          kind: "FILE",
          title: "Source records",
          instructions: "Use the attached records without treating magnitude as proof of error.",
          text_content: null,
          asset: {
            ...asset,
            asset_ref: "challenge-asset:multimodal-file@1",
            file_name: "source.csv",
            content_type: "text/csv",
            alt_text: null,
          },
        },
      ],
    } as const;

    expect(CriticalChallengeSchema.parse(challenge).parts.map(({ kind }) => kind)).toEqual([
      "TEXT",
      "AUDIO",
      "IMAGE",
      "FILE",
    ]);
    expect(
      CriticalChallengeSchema.safeParse({
        ...challenge,
        parts: [challenge.parts[0], { ...challenge.parts[0] }],
      }).success,
    ).toBe(false);
    expect(
      CriticalChallengeSchema.safeParse({
        ...challenge,
        parts: [
          {
            ...challenge.parts[2],
            asset: { ...challenge.parts[2].asset, alt_text: null },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      CriticalChallengeSchema.safeParse({
        ...challenge,
        parts: [
          {
            ...challenge.parts[1],
            asset: { ...challenge.parts[1].asset, content_type: "text/plain" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates Recruiter Challenge Asset uploads and keeps video out of the MVP contract", () => {
    const image = {
      schema_version: "create-employer-challenge-asset-upload-command@1",
      part_kind: "IMAGE",
      file_name: "direction-board.png",
      content_type: "image/png",
      content_length: 4_096,
      alt_text: "A synthetic three-column visual direction board.",
      transcript_excerpt: null,
    } as const;
    expect(CreateEmployerChallengeAssetUploadCommandSchema.safeParse(image).success).toBe(true);
    expect(
      CreateEmployerChallengeAssetUploadCommandSchema.safeParse({
        ...image,
        content_type: "video/mp4",
      }).success,
    ).toBe(false);
    expect(
      CreateEmployerChallengeAssetUploadCommandSchema.safeParse({ ...image, alt_text: null })
        .success,
    ).toBe(false);
    expect(
      CreateEmployerChallengeAssetUploadCommandSchema.safeParse({
        ...image,
        content_length: 10 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
    expect(
      CreateEmployerChallengeAssetUploadCommandSchema.safeParse({
        ...image,
        part_kind: "AUDIO",
        file_name: "brief.mp3",
        content_type: "audio/mpeg",
        alt_text: null,
        transcript_excerpt: "A synthetic customer describes a delayed settlement problem.",
      }).success,
    ).toBe(true);
    expect(
      CompleteEmployerChallengeAssetUploadCommandSchema.safeParse({
        schema_version: "complete-employer-challenge-asset-upload-command@1",
        asset_ref: "challenge-asset:01",
        sha256: `sha256:${"b".repeat(64)}`,
      }).success,
    ).toBe(true);
    expect(
      CreateEmployerChallengeAssetUploadCommandSchema.safeParse({
        ...image,
        file_name: "direction-board\n.png",
      }).success,
    ).toBe(false);
  });

  it("sniffs Challenge Asset bodies instead of trusting the declared MIME type", () => {
    expect(
      challengeAssetContentMatchesMime(
        "image/png",
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true);
    expect(challengeAssetContentMatchesMime("image/png", new TextEncoder().encode("not png"))).toBe(
      false,
    );
    const audioMp4 = new Uint8Array(36);
    audioMp4.set(new TextEncoder().encode("ftyp"), 4);
    audioMp4.set(new TextEncoder().encode("hdlr"), 16);
    audioMp4.set(new TextEncoder().encode("soun"), 28);
    expect(challengeAssetContentMatchesMime("audio/mp4", audioMp4)).toBe(true);
    audioMp4.set(new TextEncoder().encode("vide"), 28);
    expect(challengeAssetContentMatchesMime("audio/mp4", audioMp4)).toBe(false);
  });

  it("requires all versioned declarations before consuming Candidate Credit", () => {
    const command = {
      schema_version: "start-backed-application-command@3",
      terms_version: "candidate-application-terms@1",
      ai_disclosure_version: "candidate-ai-disclosure@1",
      conditional_reveal_consent_version: "resume-reveal-consent@1",
      sandbox_focus_policy_version: "sandbox-focus-policy@1",
      focus_tracking_disclosure_version: "sandbox-focus-disclosure@1",
      employer_ai_review_policy: "ANSWER_PLUS_PROCESS",
      employer_ai_review_disclosure_version: "employer-ai-review-disclosure@1",
      expected_obligation_version: 1,
      expected_slot_version: 2,
      expected_candidate_credit_version: 3,
    } as const;

    expect(StartBackedApplicationCommandSchema.safeParse(command).success).toBe(true);
    expect(
      StartBackedApplicationCommandSchema.safeParse({
        ...command,
        ai_disclosure_version: undefined,
      }).success,
    ).toBe(false);
    expect(
      StartBackedApplicationCommandSchema.safeParse({ ...command, bid_amount: 50 }).success,
    ).toBe(false);
  });

  it("accepts only bounded focus activity telemetry", () => {
    const activity = {
      schema_version: "candidate-sandbox-activity-command@1",
      event_ref: "activity-event-42-0001",
      event_type: "VISIBILITY_HIDDEN",
      system_dialog_type: null,
      client_sequence: 12,
      client_monotonic_ms: 48_231,
      policy_version: "sandbox-focus-policy@1",
    } as const;

    expect(RecordCandidateSandboxActivityCommandSchema.safeParse(activity).success).toBe(true);
    expect(
      RecordCandidateSandboxActivityCommandSchema.safeParse({
        ...activity,
        destination_url: "https://mail.example.test/inbox",
      }).success,
    ).toBe(false);
    expect(
      RecordCandidateSandboxActivityCommandSchema.safeParse({
        ...activity,
        keystrokes: "candidate-private-answer",
      }).success,
    ).toBe(false);
    expect(
      RecordCandidateSandboxActivityCommandSchema.safeParse({
        ...activity,
        cheating_probability: 0.9,
      }).success,
    ).toBe(false);
  });

  it("accepts structured rich text while rejecting HTML and a non-document root", () => {
    expect(
      RichTextDocumentSchema.safeParse({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Preserve the payment-attempt invariant." }],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      RichTextDocumentSchema.safeParse({ type: "html", html: "<script>alert(1)</script>" }).success,
    ).toBe(false);
    expect(RichTextDocumentSchema.safeParse({ type: "paragraph" }).success).toBe(false);
  });

  it("requires a final Artifact manifest and a complete evidence-linked Human Review", () => {
    expect(
      SubmitFunctionalAnswerCommandSchema.safeParse({
        schema_version: "submit-functional-answer-command@1",
        final_artifact_refs: [],
        expected_session_version: 2,
      }).success,
    ).toBe(false);
    const review = {
      schema_version: "record-functional-human-review-command@2",
      decision: "INCONCLUSIVE",
      evidence_refs: ["artifact-answer-1"],
      review_comment: "The response identifies an invariant but leaves recovery ordering unclear.",
      still_unknown: ["Provider reconciliation ordering."],
      consulted_ai_output_ref: null,
      expected_obligation_version: 3,
      expected_cohort_version: 2,
    } as const;
    expect(RecordFunctionalHumanReviewCommandSchema.safeParse(review).success).toBe(true);
    expect(
      RecordFunctionalHumanReviewCommandSchema.safeParse({ ...review, evidence_refs: [] }).success,
    ).toBe(false);
    expect(
      RecordFunctionalHumanReviewCommandSchema.safeParse({ ...review, review_comment: "Viewed" })
        .success,
    ).toBe(false);
    expect(
      RecordFunctionalHumanReviewCommandSchema.safeParse({ ...review, still_unknown: [] }).success,
    ).toBe(false);
  });

  it("keeps Candidate sessions free of cohort, ranking, and other-Candidate fields", () => {
    const projection = {
      schema_version: "candidate-answer-session-projection@2",
      answer_session_ref: "answer-session-42",
      opportunity_ref: "opportunity-1",
      candidate_ref: "candidate-42",
      invitation_ref: "invitation-42",
      obligation_ref: "obligation-42",
      state: "ACTIVE",
      version: 1,
      title: "Senior Backend Engineer",
      organization_public_name: "Northstar Payments",
      reviewer_display_name: "Sarah Chen",
      critical_question: "Explain a safe retry design and the tests that would falsify it.",
      allowed_assumptions: ["At-least-once delivery"],
      proof_format: "A bounded design answer.",
      candidate_ai_policy: "PLATFORM_ASSISTANT_ALLOWED",
      started_at: "2026-07-20T12:00:00.000Z",
      answer_due_at: "2026-07-20T12:06:00.000Z",
      submitted_at: null,
      latest_document: null,
      latest_rich_text_artifact_ref: null,
      artifacts: [],
      assistant_turns: [],
      focus: {
        policy_version: "sandbox-focus-policy@1",
        disclosure_version: "sandbox-focus-disclosure@1",
        state: "ACTIVE",
        document_visibility: "VISIBLE",
        window_focus: "FOCUSED",
        countable_away_count: 0,
        cumulative_away_ms: 0,
        current_away_started_at: null,
        warning_required: false,
        telemetry_limitations:
          "Browser-reported focus activity is not secure proctoring and cannot detect a second device.",
      },
    } as const;
    expect(CandidateAnswerSessionProjectionSchema.safeParse(projection).success).toBe(true);
    expect(
      CandidateAnswerSessionProjectionSchema.safeParse({
        ...projection,
        cohort_members: ["candidate-17"],
        rank: 1,
      }).success,
    ).toBe(false);
  });
});
