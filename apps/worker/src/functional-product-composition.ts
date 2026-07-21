import { createHash, randomUUID } from "node:crypto";

import {
  CandidateJobDiscoveryValidator,
  LiveCandidateAnswerAssistantAdapter,
  LiveCandidateJobDiscoveryAdapter,
  LiveEmployerReviewAnalystAdapter,
  SyntheticEmployerReviewAnalystAdapter,
  LiveVoiceTranscriptionAdapter,
  PROMPT_REGISTRY,
  hashCanonicalJson,
  validateAnswerEvidenceEdge,
} from "@onlyboth/ai";
import type {
  CandidateAnswerAssistantPort,
  CandidateDiscoveryIdFactory,
  CandidateDiscoveryWorker,
  FunctionalProductIdFactory,
  VoiceTranscriptionPort,
} from "@onlyboth/application";
import {
  CandidateDiscoveryWorker as CandidateDiscoveryWorkerRuntime,
  EmployerReviewAnalystWorker,
} from "@onlyboth/application";
import {
  PostgresCandidateDiscoveryStore,
  PostgresEmployerReviewAnalystStore,
  PostgresFunctionalProductStore,
  createPostgresPool,
} from "@onlyboth/db";
import { S3ObjectStore } from "@onlyboth/storage";

import { loadEmployerReviewAnalystRuntimePolicy } from "./employer-review-analyst-policy.js";

const ids: FunctionalProductIdFactory = {
  nextId: (kind) => `${kind}:${randomUUID()}`,
};

const discoveryIds: CandidateDiscoveryIdFactory = {
  nextId: (kind) => `${kind}:${randomUUID()}`,
};

function sha256(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function objectStore(environment: Readonly<Record<string, string | undefined>>) {
  return new S3ObjectStore({
    endpoint: environment.OBJECT_STORE_ENDPOINT ?? "http://127.0.0.1:9000",
    region: environment.OBJECT_STORE_REGION ?? "us-east-1",
    bucket: environment.OBJECT_STORE_BUCKET ?? "onlyboth-private",
    accessKeyId: environment.OBJECT_STORE_ACCESS_KEY_ID ?? "onlyboth-local",
    secretAccessKey:
      environment.OBJECT_STORE_SECRET_ACCESS_KEY ?? "onlyboth-local-development-secret",
    forcePathStyle: true,
  });
}

export type FunctionalWorkerOutcome =
  | "ASSISTANT_COMPLETED"
  | "ASSISTANT_FAILED"
  | "VOICE_TRANSCRIBED"
  | "VOICE_TRANSCRIPTION_FAILED"
  | "DISCOVERY_PROCESSED"
  | "DISCOVERY_RETRY_SCHEDULED"
  | "EMPLOYER_ANALYSIS_PROCESSED"
  | "EMPLOYER_ANALYSIS_RETRY_SCHEDULED"
  | "FOCUS_POLICY_PROGRESS"
  | "ANSWER_DEADLINE_SETTLED"
  | "EMPLOYER_REVIEW_BREACH_SETTLED"
  | "ORPHAN_DELETED"
  | "IDLE";

export class FunctionalProductWorker {
  public constructor(
    private readonly store: PostgresFunctionalProductStore,
    private readonly objects: S3ObjectStore,
    private readonly assistant: CandidateAnswerAssistantPort | null,
    private readonly transcription: VoiceTranscriptionPort | null,
    private readonly discovery: CandidateDiscoveryWorker,
    private readonly employerAnalysis: EmployerReviewAnalystWorker,
  ) {}

  public async runOnce(workerId: string): Promise<FunctionalWorkerOutcome> {
    const assistantJob = await this.store.claimAssistantExchange(workerId);
    if (assistantJob !== null) {
      if (this.assistant === null) {
        await this.store.failAssistantExchange(
          assistantJob.exchangeRef,
          "OPENAI_KEY_UNAVAILABLE",
          new Date(),
        );
        return "ASSISTANT_FAILED";
      }
      try {
        const [message, draft, ...prior] = await Promise.all([
          this.objects.getObject(assistantJob.userArtifact.objectKey),
          assistantJob.currentDraftArtifact === null
            ? Promise.resolve(null)
            : this.objects.getObject(assistantJob.currentDraftArtifact.objectKey),
          ...assistantJob.priorArtifacts.map((artifact) =>
            this.objects.getObject(artifact.objectKey),
          ),
        ]);
        const priorTurns = assistantJob.priorArtifacts.map((artifact, index) => ({
          role: artifact.metadata.role === "ASSISTANT" ? ("assistant" as const) : ("user" as const),
          content: Buffer.from(prior[index] ?? []).toString("utf8"),
        }));
        const response = await this.assistant.answer({
          candidateRef: assistantJob.candidateRef,
          question: assistantJob.question,
          allowedAssumptions: assistantJob.allowedAssumptions,
          currentDraft: draft === null ? null : Buffer.from(draft).toString("utf8"),
          priorTurns,
          message: Buffer.from(message).toString("utf8"),
        });
        const body = Buffer.from(response.text, "utf8");
        const artifactRef = ids.nextId("artifact");
        const objectKey = `answers/${assistantJob.candidateRef}/${assistantJob.answerSessionRef}/assistant/${artifactRef}.txt`;
        const digest = sha256(body);
        await this.objects.putObject({
          objectKey,
          contentType: "text/plain; charset=utf-8",
          body,
          checksumSha256: digest,
        });
        await this.store.completeAssistantExchange({
          exchangeRef: assistantJob.exchangeRef,
          artifactRef,
          objectKey,
          contentLength: body.byteLength,
          sha256: digest,
          providerResponseId: response.providerResponseId,
          completedAt: new Date(),
        });
        return "ASSISTANT_COMPLETED";
      } catch (error: unknown) {
        await this.store.failAssistantExchange(
          assistantJob.exchangeRef,
          error instanceof Error ? error.name : "CANDIDATE_ASSISTANT_FAILED",
          new Date(),
        );
        return "ASSISTANT_FAILED";
      }
    }

    const voiceJob = await this.store.claimVoiceTranscription(workerId);
    if (voiceJob !== null) {
      if (this.transcription === null) {
        await this.store.failVoiceTranscription(
          voiceJob.artifact.artifactRef,
          "OPENAI_KEY_UNAVAILABLE",
          new Date(),
        );
        return "VOICE_TRANSCRIPTION_FAILED";
      }
      try {
        const audio = await this.objects.getObject(voiceJob.artifact.objectKey);
        const transcript = await this.transcription.transcribe({
          audio,
          fileName: `${voiceJob.artifact.artifactRef}.webm`,
          contentType: voiceJob.artifact.contentType,
        });
        const body = Buffer.from(transcript.text, "utf8");
        const transcriptArtifactRef = ids.nextId("artifact");
        const objectKey = `answers/${voiceJob.candidateRef}/${voiceJob.answerSessionRef}/transcripts/${transcriptArtifactRef}.txt`;
        const digest = sha256(body);
        await this.objects.putObject({
          objectKey,
          contentType: "text/plain; charset=utf-8",
          body,
          checksumSha256: digest,
        });
        await this.store.completeVoiceTranscription({
          sourceArtifactRef: voiceJob.artifact.artifactRef,
          transcriptArtifactRef,
          objectKey,
          contentLength: body.byteLength,
          sha256: digest,
          completedAt: new Date(),
        });
        return "VOICE_TRANSCRIBED";
      } catch (error: unknown) {
        await this.store.failVoiceTranscription(
          voiceJob.artifact.artifactRef,
          error instanceof Error ? error.name : "VOICE_TRANSCRIPTION_FAILED",
          new Date(),
        );
        return "VOICE_TRANSCRIPTION_FAILED";
      }
    }

    const discoveryOutcome = await this.discovery.runOnce(`${workerId}:candidate-discovery`);
    if (discoveryOutcome === "PROCESSED") return "DISCOVERY_PROCESSED";
    if (discoveryOutcome === "RETRY_SCHEDULED") return "DISCOVERY_RETRY_SCHEDULED";

    const analysisOutcome = await this.employerAnalysis.runOnce(`${workerId}:employer-analysis`);
    if (analysisOutcome === "PROCESSED") return "EMPLOYER_ANALYSIS_PROCESSED";
    if (analysisOutcome === "RETRY_SCHEDULED") return "EMPLOYER_ANALYSIS_RETRY_SCHEDULED";

    if (await this.store.settleOneFocusPolicyAnswer(ids)) return "FOCUS_POLICY_PROGRESS";
    if (await this.store.expireOneAnswerSession(ids)) return "ANSWER_DEADLINE_SETTLED";
    if (await this.store.settleOneOverdueEmployerReview(ids)) {
      return "EMPLOYER_REVIEW_BREACH_SETTLED";
    }
    const orphanKey = await this.store.cleanupOrphanArtifact(
      new Date(Date.now() - 24 * 60 * 60 * 1_000),
    );
    if (orphanKey !== null) {
      await this.objects.deleteObject(orphanKey);
      return "ORPHAN_DELETED";
    }
    return "IDLE";
  }
}

export function createFunctionalProductWorkerComposition(
  databaseUrl: string,
  environment: Readonly<Record<string, string | undefined>>,
) {
  const pool = createPostgresPool(databaseUrl);
  const objects = objectStore(environment);
  const apiKey = environment.OPENAI_API_KEY;
  const assistant =
    apiKey === undefined ? null : new LiveCandidateAnswerAssistantAdapter({ apiKey });
  const transcription = apiKey === undefined ? null : new LiveVoiceTranscriptionAdapter({ apiKey });
  const store = new PostgresFunctionalProductStore(pool, objects);
  const discoveryStore = new PostgresCandidateDiscoveryStore(pool, store);
  const discovery = new CandidateDiscoveryWorkerRuntime(
    discoveryStore,
    apiKey === undefined ? null : new LiveCandidateJobDiscoveryAdapter({ apiKey }),
    new CandidateJobDiscoveryValidator(),
    { hash: hashCanonicalJson },
    discoveryIds,
    {
      promptId: "onlyboth.derive-candidate-job-signals",
      promptVersion: PROMPT_REGISTRY.deriveCandidateJobSignals.promptVersion,
      promptHash: PROMPT_REGISTRY.deriveCandidateJobSignals.promptHash,
      inputSchemaVersion: "candidate-job-discovery-input@2",
      outputSchemaVersion: "candidate-job-discovery-output@1",
    },
    3,
    () => new Date(),
    randomUUID,
  );
  const analystPolicy = loadEmployerReviewAnalystRuntimePolicy(environment);
  const analyst = !analystPolicy.enabled
    ? null
    : analystPolicy.mode === "SYNTHETIC"
      ? new SyntheticEmployerReviewAnalystAdapter()
      : apiKey === undefined
        ? null
        : new LiveEmployerReviewAnalystAdapter({ apiKey, model: analystPolicy.model });
  const analystStore = new PostgresEmployerReviewAnalystStore(pool, objects, {
    promptId: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptId,
    promptVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptVersion,
    promptHash: PROMPT_REGISTRY.buildAnswerEvidenceEdge.promptHash,
    inputSchemaVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.inputSchemaVersion,
    outputSchemaVersion: PROMPT_REGISTRY.buildAnswerEvidenceEdge.outputSchemaVersion,
    runtimeMode: analystPolicy.mode === "SYNTHETIC" ? "GOLDEN_REPLAY" : "LIVE",
    adapterId:
      analystPolicy.mode === "SYNTHETIC"
        ? "synthetic-employer-review-analyst@1"
        : "openai-responses@1",
    requestedModel: analystPolicy.mode === "SYNTHETIC" ? "synthetic@1" : analystPolicy.model,
  });
  const employerAnalysis = new EmployerReviewAnalystWorker(
    analystStore,
    analyst,
    validateAnswerEvidenceEdge,
    randomUUID,
    analystPolicy.mode === "SYNTHETIC",
    3,
    analystPolicy.enabled ? "OPENAI_KEY_UNAVAILABLE" : "PLATFORM_KILL_SWITCH_OFF",
  );
  return {
    pool,
    worker: new FunctionalProductWorker(
      store,
      objects,
      assistant,
      transcription,
      discovery,
      employerAnalysis,
    ),
  };
}
