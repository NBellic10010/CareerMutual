import type {
  CandidateAnswerSessionProjection,
  CandidateSandboxActivityReceipt,
  CandidateJobDetail,
  CandidateOpportunityFeed,
  CompleteAnswerArtifactUploadReceiptSchema,
  EmployerChallengeAssetVerifiedReceipt,
  EmployerChallengeAssetPartKind,
  EmployerCurrentReviewProjectionSchema,
  EmployerJobDashboardSchema,
  EmployerRevealedCandidatePage,
  FunctionalAnswerSubmissionReceipt,
  FunctionalHumanReviewReceipt,
  JobPostDraftInput,
  JobPostDraftProjection,
  PublishJobPostReceiptSchema,
  RecordFunctionalHumanReviewCommand,
  RecordCandidateSandboxActivityCommand,
  StartBackedApplicationCommand,
  StartBackedApplicationReceipt,
} from "@onlyboth/contracts";
import type { z } from "zod";

export type FunctionalActorRole = "CANDIDATE" | "EMPLOYER" | "SYSTEM";

export interface FunctionalActor {
  readonly role: FunctionalActorRole;
  readonly actorId: string;
}

export type PublishJobPostReceipt = z.infer<typeof PublishJobPostReceiptSchema>;
export type EmployerJobDashboard = z.infer<typeof EmployerJobDashboardSchema>;
export type EmployerCurrentReviewProjection = z.infer<typeof EmployerCurrentReviewProjectionSchema>;
export type CompleteAnswerArtifactUploadReceipt = z.infer<
  typeof CompleteAnswerArtifactUploadReceiptSchema
>;

export interface FunctionalProductIdFactory {
  nextId(
    kind:
      | "command"
      | "event"
      | "outbox"
      | "draft"
      | "opportunity"
      | "contract"
      | "label-policy"
      | "attention-commitment"
      | "blind-review-commitment"
      | "answer-review-slot"
      | "slot-credit-reservation"
      | "terms-acceptance"
      | "candidate-credit-ledger"
      | "answer-session"
      | "artifact"
      | "challenge-asset"
      | "assistant-exchange"
      | "answer-submission"
      | "process-evidence"
      | "human-review"
      | "resume-reveal"
      | "employer-review-breach",
  ): string;
}

export interface CommandEnvelope {
  readonly actor: FunctionalActor;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly trustedSyntheticFixtureWrite?: boolean;
}

export interface CreateJobPostDraftStoreInput extends CommandEnvelope {
  readonly draftRef: string;
  readonly draft: JobPostDraftInput;
  readonly expectedWalletVersion: number;
}

export interface UpdateJobPostDraftStoreInput extends CommandEnvelope {
  readonly draftRef: string;
  readonly draft: JobPostDraftInput;
  readonly expectedDraftVersion: number;
}

export interface PublishJobPostStoreInput extends CommandEnvelope {
  readonly draftRef: string;
  readonly expectedDraftVersion: number;
  readonly expectedWalletVersion: number;
  readonly ids: FunctionalProductIdFactory;
}

export interface StartBackedApplicationStoreInput extends CommandEnvelope {
  readonly invitationRef: string;
  readonly command: StartBackedApplicationCommand;
  readonly ids: FunctionalProductIdFactory;
}

export interface PersistRichTextDraftInput extends CommandEnvelope {
  readonly answerSessionRef: string;
  readonly artifactRef: string;
  readonly objectKey: string;
  readonly contentType: "application/vnd.onlyboth.rich-text+json";
  readonly contentLength: number;
  readonly sha256: string;
  readonly plainTextLength: number;
  readonly expectedSessionVersion: number;
}

export interface CreateArtifactUploadIntentInput extends CommandEnvelope {
  readonly answerSessionRef: string;
  readonly artifactRef: string;
  readonly objectKey: string;
  readonly kind: "VOICE_MEMO";
  readonly contentType: string;
  readonly contentLength: number;
  readonly expectedSessionVersion: number;
}

export interface VerifyArtifactUploadInput extends CommandEnvelope {
  readonly answerSessionRef: string;
  readonly artifactRef: string;
  readonly sha256: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly expectedSessionVersion: number;
  readonly eventId: string;
  readonly outboxId: string;
}

export interface CreateEmployerChallengeAssetUploadIntentInput extends CommandEnvelope {
  readonly assetRef: string;
  readonly objectKey: string;
  readonly partKind: EmployerChallengeAssetPartKind;
  readonly fileName: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly altText: string | null;
  readonly transcriptExcerpt: string | null;
}

export interface VerifyEmployerChallengeAssetUploadInput extends CommandEnvelope {
  readonly assetRef: string;
  readonly sha256: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly eventId: string;
}

export interface QueueAssistantExchangeInput extends CommandEnvelope {
  readonly answerSessionRef: string;
  readonly exchangeRef: string;
  readonly userArtifactRef: string;
  readonly userObjectKey: string;
  readonly userContentLength: number;
  readonly userSha256: string;
  readonly expectedSessionVersion: number;
  readonly eventId: string;
  readonly outboxId: string;
}

export interface SubmitFunctionalAnswerStoreInput extends CommandEnvelope {
  readonly answerSessionRef: string;
  readonly finalArtifactRefs: readonly string[];
  readonly expectedSessionVersion: number;
  readonly submissionSource: "MANUAL" | "DEADLINE_AUTO" | "FOCUS_POLICY_AUTO";
  readonly ids: FunctionalProductIdFactory;
}

export interface RecordSandboxActivityStoreInput extends CommandEnvelope {
  readonly answerSessionRef: string;
  readonly command: RecordCandidateSandboxActivityCommand;
  readonly ids: FunctionalProductIdFactory;
}

export interface RecordFunctionalReviewStoreInput extends CommandEnvelope {
  readonly obligationRef: string;
  readonly command: RecordFunctionalHumanReviewCommand;
  readonly ids: FunctionalProductIdFactory;
}

export interface AnswerArtifactRecord {
  readonly artifactRef: string;
  readonly answerSessionRef: string;
  readonly candidateRef: string;
  readonly kind: "RICH_TEXT" | "VOICE_MEMO" | "VOICE_TRANSCRIPT" | "GPT_TURN" | "GPT_TRACE";
  readonly objectKey: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly sha256: string | null;
  readonly state: "UPLOAD_ISSUED" | "VERIFIED" | "SEALED" | "FAILED";
  readonly revision: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface EmployerChallengeAssetRecord {
  readonly assetRef: string;
  readonly ownerRef: string;
  readonly draftRef: string | null;
  readonly opportunityRef: string | null;
  readonly partKind: EmployerChallengeAssetPartKind;
  readonly fileName: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly sha256: string | null;
  readonly altText: string | null;
  readonly transcriptExcerpt: string | null;
  readonly state: "UPLOAD_ISSUED" | "VERIFIED" | "SEALED" | "FAILED";
  readonly createdAt: string;
  readonly verifiedAt: string | null;
  readonly sealedAt: string | null;
}

export interface FunctionalProductStore {
  getCandidateOpportunityFeed(candidateRef: string): Promise<CandidateOpportunityFeed>;
  getCandidateJobDetail(
    candidateRef: string,
    opportunityRef: string,
  ): Promise<CandidateJobDetail | null>;
  getCandidateAnswerSession(
    candidateRef: string,
    answerSessionRef: string,
  ): Promise<CandidateAnswerSessionProjection | null>;
  getEmployerDashboard(reviewerRef: string): Promise<EmployerJobDashboard>;
  getCurrentEmployerReview(
    reviewerRef: string,
    opportunityRef: string,
  ): Promise<EmployerCurrentReviewProjection | null>;
  getEmployerRevealedCandidates(
    reviewerRef: string,
    page: number,
  ): Promise<EmployerRevealedCandidatePage>;
  getAuthorizedArtifact(
    actor: FunctionalActor,
    artifactRef: string,
  ): Promise<AnswerArtifactRecord | null>;
  getAuthorizedEmployerChallengeAsset(
    actor: FunctionalActor,
    assetRef: string,
  ): Promise<EmployerChallengeAssetRecord | null>;
  createJobPostDraft(input: CreateJobPostDraftStoreInput): Promise<JobPostDraftProjection>;
  updateJobPostDraft(input: UpdateJobPostDraftStoreInput): Promise<JobPostDraftProjection>;
  publishJobPost(input: PublishJobPostStoreInput): Promise<PublishJobPostReceipt>;
  startBackedApplication(
    input: StartBackedApplicationStoreInput,
  ): Promise<StartBackedApplicationReceipt>;
  persistRichTextDraft(input: PersistRichTextDraftInput): Promise<{
    readonly artifactRef: string;
    readonly sha256: string;
    readonly savedAt: string;
    readonly sessionVersion: number;
  }>;
  createArtifactUploadIntent(input: CreateArtifactUploadIntentInput): Promise<{
    readonly artifactRef: string;
    readonly objectKey: string;
  }>;
  verifyArtifactUpload(
    input: VerifyArtifactUploadInput,
  ): Promise<CompleteAnswerArtifactUploadReceipt>;
  createEmployerChallengeAssetUploadIntent(
    input: CreateEmployerChallengeAssetUploadIntentInput,
  ): Promise<{ readonly assetRef: string; readonly objectKey: string }>;
  verifyEmployerChallengeAssetUpload(
    input: VerifyEmployerChallengeAssetUploadInput,
  ): Promise<EmployerChallengeAssetVerifiedReceipt>;
  queueAssistantExchange(input: QueueAssistantExchangeInput): Promise<{
    readonly ordinal: number;
    readonly createdAt: string;
  }>;
  recordSandboxActivity(
    input: RecordSandboxActivityStoreInput,
  ): Promise<CandidateSandboxActivityReceipt>;
  submitAnswer(input: SubmitFunctionalAnswerStoreInput): Promise<FunctionalAnswerSubmissionReceipt>;
  recordHumanReview(input: RecordFunctionalReviewStoreInput): Promise<FunctionalHumanReviewReceipt>;
  expireOneAnswerSession(ids: FunctionalProductIdFactory): Promise<boolean>;
  settleOneFocusPolicyAnswer(ids: FunctionalProductIdFactory): Promise<boolean>;
}

export interface CandidateAssistantContext {
  readonly exchangeRef: string;
  readonly answerSessionRef: string;
  readonly candidateRef: string;
  readonly userArtifact: AnswerArtifactRecord;
  readonly question: string;
  readonly allowedAssumptions: readonly string[];
  readonly currentDraftArtifact: AnswerArtifactRecord | null;
  readonly priorArtifacts: readonly AnswerArtifactRecord[];
}

export interface VoiceTranscriptionContext {
  readonly artifact: AnswerArtifactRecord;
  readonly candidateRef: string;
  readonly answerSessionRef: string;
}

export interface FunctionalProductWorkerStore {
  claimAssistantExchange(workerId: string): Promise<CandidateAssistantContext | null>;
  completeAssistantExchange(input: {
    readonly exchangeRef: string;
    readonly artifactRef: string;
    readonly objectKey: string;
    readonly contentLength: number;
    readonly sha256: string;
    readonly providerResponseId: string;
    readonly completedAt: Date;
  }): Promise<void>;
  failAssistantExchange(exchangeRef: string, errorCode: string, completedAt: Date): Promise<void>;
  claimVoiceTranscription(workerId: string): Promise<VoiceTranscriptionContext | null>;
  completeVoiceTranscription(input: {
    readonly sourceArtifactRef: string;
    readonly transcriptArtifactRef: string;
    readonly objectKey: string;
    readonly contentLength: number;
    readonly sha256: string;
    readonly completedAt: Date;
  }): Promise<void>;
  failVoiceTranscription(
    sourceArtifactRef: string,
    errorCode: string,
    completedAt: Date,
  ): Promise<void>;
  settleOneOverdueEmployerReview(ids: FunctionalProductIdFactory): Promise<boolean>;
  cleanupOrphanArtifact(before: Date): Promise<string | null>;
}

export interface CandidateAnswerAssistantPort {
  answer(input: {
    readonly candidateRef: string;
    readonly question: string;
    readonly allowedAssumptions: readonly string[];
    readonly currentDraft: string | null;
    readonly priorTurns: readonly {
      readonly role: "user" | "assistant";
      readonly content: string;
    }[];
    readonly message: string;
  }): Promise<{ readonly text: string; readonly providerResponseId: string }>;
}

export interface VoiceTranscriptionPort {
  transcribe(input: {
    readonly audio: Uint8Array;
    readonly fileName: string;
    readonly contentType: string;
  }): Promise<{ readonly text: string; readonly providerResponseId: string | null }>;
}
