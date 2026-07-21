import {
  AnswerArtifactUploadReceiptSchema,
  CandidateAssistantTurnCommandSchema,
  CandidateAssistantTurnReceiptSchema,
  CompleteAnswerArtifactUploadCommandSchema,
  CompleteAnswerArtifactUploadReceiptSchema,
  CompleteEmployerChallengeAssetUploadCommandSchema,
  CreateEmployerChallengeAssetUploadCommandSchema,
  EmployerChallengeAssetUploadReceiptSchema,
  EmployerChallengeAssetVerifiedReceiptSchema,
  CreateAnswerArtifactUploadCommandSchema,
  CreateJobPostDraftCommandSchema,
  FunctionalAnswerSubmissionReceiptSchema,
  FunctionalHumanReviewReceiptSchema,
  JobPostDraftProjectionSchema,
  PublishJobPostCommandSchema,
  PublishJobPostReceiptSchema,
  RecordFunctionalHumanReviewCommandSchema,
  RecordCandidateSandboxActivityCommandSchema,
  CandidateSandboxActivityReceiptSchema,
  SaveAnswerDraftCommandSchema,
  SaveAnswerDraftReceiptSchema,
  StartBackedApplicationCommandSchema,
  StartBackedApplicationReceiptSchema,
  SubmitFunctionalAnswerCommandSchema,
  UpdateJobPostDraftCommandSchema,
  type CandidateAssistantTurnCommand,
  type CompleteAnswerArtifactUploadCommand,
  type CompleteEmployerChallengeAssetUploadCommand,
  type CreateEmployerChallengeAssetUploadCommand,
  type CreateJobPostDraftCommand,
  type JobPostDraftProjection,
  type RichTextNode,
  type SaveAnswerDraftCommand,
  type SubmitFunctionalAnswerCommand,
  type UpdateJobPostDraftCommand,
} from "@onlyboth/contracts";

import type {
  FunctionalActor,
  FunctionalProductIdFactory,
  FunctionalProductStore,
} from "../ports/functional-product";
import type { ObjectStorePort } from "../ports/object-store";

export type FunctionalProductErrorCode =
  | "AUTH_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "RESOURCE_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "CREDIT_EXHAUSTED"
  | "ATTENTION_NOT_BACKED"
  | "DEADLINE_REACHED"
  | "ARTIFACT_INVALID"
  | "ARTIFACT_NOT_READY"
  | "REVIEW_EVIDENCE_INVALID"
  | "STORE_UNAVAILABLE";

const HTTP_STATUS = {
  AUTH_REQUIRED: 401,
  ROLE_FORBIDDEN: 403,
  RESOURCE_NOT_FOUND: 422,
  IDEMPOTENCY_CONFLICT: 409,
  STALE_VERSION: 409,
  INVALID_STATE: 422,
  CREDIT_EXHAUSTED: 409,
  ATTENTION_NOT_BACKED: 409,
  DEADLINE_REACHED: 409,
  ARTIFACT_INVALID: 422,
  ARTIFACT_NOT_READY: 409,
  REVIEW_EVIDENCE_INVALID: 422,
  STORE_UNAVAILABLE: 503,
} as const satisfies Record<FunctionalProductErrorCode, 401 | 403 | 409 | 422 | 503>;

export class FunctionalProductApplicationError extends Error {
  public override readonly name = "FunctionalProductApplicationError";

  public constructor(
    public readonly code: FunctionalProductErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }

  public get httpStatus(): 401 | 403 | 409 | 422 | 503 {
    return HTTP_STATUS[this.code];
  }
}

export function functionalProductErrorDetails(error: unknown): {
  readonly code: FunctionalProductErrorCode;
  readonly httpStatus: 401 | 403 | 409 | 422 | 503;
} | null {
  if (error instanceof FunctionalProductApplicationError) {
    return { code: error.code, httpStatus: error.httpStatus };
  }
  // Server bundlers may evaluate workspace modules in separate chunks. Preserve
  // the closed error contract when duplicate module instances make `instanceof`
  // false, and derive the status from our own table rather than the thrown value.
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = Reflect.get(error, "code");
  if (typeof code !== "string" || !Object.hasOwn(HTTP_STATUS, code)) return null;
  const typedCode = code as FunctionalProductErrorCode;
  return { code: typedCode, httpStatus: HTTP_STATUS[typedCode] };
}

function requireActor(actor: FunctionalActor, role: "CANDIDATE" | "EMPLOYER"): void {
  if (actor.role !== role || actor.actorId.trim().length === 0) {
    throw new FunctionalProductApplicationError(
      actor.actorId.trim().length === 0 ? "AUTH_REQUIRED" : "ROLE_FORBIDDEN",
      `${role} authentication is required.`,
    );
  }
}

function requireEnvelope(idempotencyKey: string, correlationId: string): void {
  for (const [label, value] of [
    ["Idempotency-Key", idempotencyKey],
    ["correlationId", correlationId],
  ] as const) {
    if (value.trim().length === 0 || value.length > 200) {
      throw new FunctionalProductApplicationError(
        "IDEMPOTENCY_CONFLICT",
        `${label} is missing or invalid.`,
      );
    }
  }
}

async function sha256(body: Uint8Array | string): Promise<string> {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const normalized = new Uint8Array(bytes.byteLength);
  normalized.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", normalized.buffer);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function startsWithBytes(body: Uint8Array, expected: readonly number[], offset = 0): boolean {
  return expected.every((value, index) => body[offset + index] === value);
}

function ascii(body: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...body.slice(start, start + length));
}

function mp4HandlerTypes(body: Uint8Array): ReadonlySet<string> {
  const handlers = new Set<string>();
  for (let index = 4; index + 16 <= body.length; index += 1) {
    if (ascii(body, index, 4) === "hdlr") handlers.add(ascii(body, index + 12, 4));
  }
  return handlers;
}

export function challengeAssetContentMatchesMime(contentType: string, body: Uint8Array): boolean {
  switch (contentType) {
    case "image/png":
      return startsWithBytes(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return startsWithBytes(body, [0xff, 0xd8, 0xff]);
    case "image/webp":
      return ascii(body, 0, 4) === "RIFF" && ascii(body, 8, 4) === "WEBP";
    case "image/gif":
      return ["GIF87a", "GIF89a"].includes(ascii(body, 0, 6));
    case "audio/mpeg":
      return (
        ascii(body, 0, 3) === "ID3" ||
        (body[0] === 0xff && body[1] !== undefined && (body[1] & 0xe0) === 0xe0)
      );
    case "audio/wav":
    case "audio/x-wav":
      return ascii(body, 0, 4) === "RIFF" && ascii(body, 8, 4) === "WAVE";
    case "audio/ogg":
      return ascii(body, 0, 4) === "OggS";
    case "audio/webm":
      return startsWithBytes(body, [0x1a, 0x45, 0xdf, 0xa3]);
    case "audio/mp4": {
      if (ascii(body, 4, 4) !== "ftyp") return false;
      const handlers = mp4HandlerTypes(body);
      return handlers.has("soun") && !handlers.has("vide");
    }
    case "application/pdf":
      return ascii(body, 0, 5) === "%PDF-";
    case "application/zip":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return startsWithBytes(body, [0x50, 0x4b, 0x03, 0x04]);
    case "application/json":
      try {
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
        return true;
      } catch {
        return false;
      }
    case "text/plain":
    case "text/csv":
      try {
        return !new TextDecoder("utf-8", { fatal: true }).decode(body).includes("\0");
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function richTextPlainText(node: RichTextNode): string {
  const own = node.text ?? "";
  const children = (node.content ?? []).map(richTextPlainText).filter(Boolean).join("\n");
  return [own, children]
    .filter(Boolean)
    .join(node.type === "text" ? "" : "\n")
    .trim();
}

export interface FunctionalCommandContext {
  readonly actor: FunctionalActor;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  /** Internal reset/seed authority. Public Web command contexts never set this capability. */
  readonly trustedSyntheticFixtureWrite?: boolean;
}

export class FunctionalProductService {
  public constructor(
    private readonly store: FunctionalProductStore,
    private readonly objectStore: ObjectStorePort,
    private readonly ids: FunctionalProductIdFactory,
  ) {}

  public async createJobPostDraft(
    context: FunctionalCommandContext,
    commandInput: CreateJobPostDraftCommand,
  ): Promise<JobPostDraftProjection> {
    requireActor(context.actor, "EMPLOYER");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = CreateJobPostDraftCommandSchema.parse(commandInput);
    return JobPostDraftProjectionSchema.parse(
      await this.store.createJobPostDraft({
        ...context,
        draftRef: this.ids.nextId("draft"),
        draft: command.draft,
        expectedWalletVersion: command.expected_wallet_version,
      }),
    );
  }

  public async updateJobPostDraft(
    context: FunctionalCommandContext,
    draftRef: string,
    commandInput: UpdateJobPostDraftCommand,
  ): Promise<JobPostDraftProjection> {
    requireActor(context.actor, "EMPLOYER");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = UpdateJobPostDraftCommandSchema.parse(commandInput);
    return JobPostDraftProjectionSchema.parse(
      await this.store.updateJobPostDraft({
        ...context,
        draftRef,
        draft: command.draft,
        expectedDraftVersion: command.expected_draft_version,
      }),
    );
  }

  public async createEmployerChallengeAssetUpload(
    context: FunctionalCommandContext,
    commandInput: CreateEmployerChallengeAssetUploadCommand,
  ) {
    requireActor(context.actor, "EMPLOYER");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = CreateEmployerChallengeAssetUploadCommandSchema.parse(commandInput);
    const assetRef = this.ids.nextId("challenge-asset");
    const objectKey = `job-challenges/${context.actor.actorId}/${assetRef}`;
    const persisted = await this.store.createEmployerChallengeAssetUploadIntent({
      ...context,
      assetRef,
      objectKey,
      partKind: command.part_kind,
      fileName: command.file_name,
      contentType: command.content_type,
      contentLength: command.content_length,
      altText: command.alt_text,
      transcriptExcerpt: command.transcript_excerpt,
    });
    const expiresInSeconds = 300;
    let uploadUrl: string;
    try {
      uploadUrl = await this.objectStore.createUploadUrl({
        objectKey: persisted.objectKey,
        contentType: command.content_type,
        contentLength: command.content_length,
        expiresInSeconds,
      });
    } catch (error: unknown) {
      throw new FunctionalProductApplicationError(
        "STORE_UNAVAILABLE",
        "A private Challenge Asset upload URL could not be created.",
        { cause: error },
      );
    }
    return EmployerChallengeAssetUploadReceiptSchema.parse({
      schema_version: "employer-challenge-asset-upload-receipt@1",
      asset_ref: persisted.assetRef,
      part_kind: command.part_kind,
      upload_url: uploadUrl,
      required_upload_headers: { "If-None-Match": "*" },
      upload_expires_at: new Date(Date.now() + expiresInSeconds * 1_000).toISOString(),
      file_name: command.file_name,
      content_type: command.content_type,
      content_length: command.content_length,
    });
  }

  public async completeEmployerChallengeAssetUpload(
    context: FunctionalCommandContext,
    commandInput: CompleteEmployerChallengeAssetUploadCommand,
  ) {
    requireActor(context.actor, "EMPLOYER");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = CompleteEmployerChallengeAssetUploadCommandSchema.parse(commandInput);
    const asset = await this.store.getAuthorizedEmployerChallengeAsset(
      context.actor,
      command.asset_ref,
    );
    if (asset === null || asset.state === "FAILED") {
      throw new FunctionalProductApplicationError(
        "RESOURCE_NOT_FOUND",
        "Challenge Asset upload intent not found.",
      );
    }
    let body: Uint8Array;
    let metadata;
    try {
      [body, metadata] = await Promise.all([
        this.objectStore.getObject(asset.objectKey),
        this.objectStore.headObject(asset.objectKey),
      ]);
    } catch (error: unknown) {
      throw new FunctionalProductApplicationError(
        "STORE_UNAVAILABLE",
        "The uploaded Challenge Asset could not be verified.",
        { cause: error },
      );
    }
    if (
      metadata === null ||
      metadata.contentLength !== asset.contentLength ||
      metadata.contentType !== asset.contentType ||
      body.byteLength !== asset.contentLength ||
      (await sha256(body)) !== command.sha256 ||
      !challengeAssetContentMatchesMime(asset.contentType, body)
    ) {
      throw new FunctionalProductApplicationError(
        "ARTIFACT_INVALID",
        "The Challenge Asset does not match its declared MIME type, size, or checksum.",
      );
    }
    return EmployerChallengeAssetVerifiedReceiptSchema.parse(
      await this.store.verifyEmployerChallengeAssetUpload({
        ...context,
        assetRef: asset.assetRef,
        sha256: command.sha256,
        contentType: metadata.contentType,
        contentLength: metadata.contentLength,
        eventId: this.ids.nextId("event"),
      }),
    );
  }

  public async publishJobPost(
    context: FunctionalCommandContext,
    draftRef: string,
    commandInput: unknown,
  ) {
    requireActor(context.actor, "EMPLOYER");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = PublishJobPostCommandSchema.parse(commandInput);
    return PublishJobPostReceiptSchema.parse(
      await this.store.publishJobPost({
        ...context,
        draftRef,
        expectedDraftVersion: command.expected_draft_version,
        expectedWalletVersion: command.expected_wallet_version,
        ids: this.ids,
      }),
    );
  }

  public async startBackedApplication(
    context: FunctionalCommandContext,
    invitationRef: string,
    commandInput: unknown,
  ) {
    requireActor(context.actor, "CANDIDATE");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = StartBackedApplicationCommandSchema.parse(commandInput);
    return StartBackedApplicationReceiptSchema.parse(
      await this.store.startBackedApplication({
        ...context,
        invitationRef,
        command,
        ids: this.ids,
      }),
    );
  }

  public async saveAnswerDraft(
    context: FunctionalCommandContext,
    answerSessionRef: string,
    commandInput: SaveAnswerDraftCommand,
  ) {
    requireActor(context.actor, "CANDIDATE");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = SaveAnswerDraftCommandSchema.parse(commandInput);
    const artifactRef = this.ids.nextId("artifact");
    const objectKey = `answers/${context.actor.actorId}/${answerSessionRef}/rich-text/${artifactRef}.json`;
    const body = new TextEncoder().encode(JSON.stringify(command.document));
    const digest = await sha256(body);
    try {
      await this.objectStore.putObject({
        objectKey,
        contentType: "application/vnd.onlyboth.rich-text+json",
        body,
        checksumSha256: digest,
      });
    } catch (error: unknown) {
      throw new FunctionalProductApplicationError(
        "STORE_UNAVAILABLE",
        "The answer draft could not be persisted to private object storage.",
        { cause: error },
      );
    }
    const result = await this.store.persistRichTextDraft({
      ...context,
      answerSessionRef,
      artifactRef,
      objectKey,
      contentType: "application/vnd.onlyboth.rich-text+json",
      contentLength: body.byteLength,
      sha256: digest,
      plainTextLength: richTextPlainText(command.document).length,
      expectedSessionVersion: command.expected_session_version,
    });
    return SaveAnswerDraftReceiptSchema.parse({
      schema_version: "save-answer-draft-receipt@1",
      artifact_ref: result.artifactRef,
      sha256: result.sha256,
      saved_at: result.savedAt,
      session_version: result.sessionVersion,
    });
  }

  public async createArtifactUpload(
    context: FunctionalCommandContext,
    answerSessionRef: string,
    commandInput: unknown,
  ) {
    requireActor(context.actor, "CANDIDATE");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = CreateAnswerArtifactUploadCommandSchema.parse(commandInput);
    const artifactRef = this.ids.nextId("artifact");
    const objectKey = `answers/${context.actor.actorId}/${answerSessionRef}/voice/${artifactRef}`;
    const persisted = await this.store.createArtifactUploadIntent({
      ...context,
      answerSessionRef,
      artifactRef,
      objectKey,
      kind: command.kind,
      contentType: command.content_type,
      contentLength: command.content_length,
      expectedSessionVersion: command.expected_session_version,
    });
    const expiresInSeconds = 300;
    let uploadUrl: string;
    try {
      uploadUrl = await this.objectStore.createUploadUrl({
        objectKey: persisted.objectKey,
        contentType: command.content_type,
        contentLength: command.content_length,
        expiresInSeconds,
      });
    } catch (error: unknown) {
      throw new FunctionalProductApplicationError(
        "STORE_UNAVAILABLE",
        "A private upload URL could not be created.",
        { cause: error },
      );
    }
    return AnswerArtifactUploadReceiptSchema.parse({
      schema_version: "answer-artifact-upload-receipt@1",
      artifact_ref: persisted.artifactRef,
      upload_url: uploadUrl,
      required_upload_headers: { "If-None-Match": "*" },
      upload_expires_at: new Date(Date.now() + expiresInSeconds * 1_000).toISOString(),
      content_type: command.content_type,
      content_length: command.content_length,
    });
  }

  public async completeArtifactUpload(
    context: FunctionalCommandContext,
    answerSessionRef: string,
    commandInput: CompleteAnswerArtifactUploadCommand,
  ) {
    requireActor(context.actor, "CANDIDATE");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = CompleteAnswerArtifactUploadCommandSchema.parse(commandInput);
    const artifact = await this.store.getAuthorizedArtifact(context.actor, command.artifact_ref);
    if (artifact === null || artifact.answerSessionRef !== answerSessionRef) {
      throw new FunctionalProductApplicationError("RESOURCE_NOT_FOUND", "Artifact not found.");
    }
    let body: Uint8Array;
    let metadata;
    try {
      [body, metadata] = await Promise.all([
        this.objectStore.getObject(artifact.objectKey),
        this.objectStore.headObject(artifact.objectKey),
      ]);
    } catch (error: unknown) {
      throw new FunctionalProductApplicationError(
        "STORE_UNAVAILABLE",
        "The uploaded object could not be verified.",
        { cause: error },
      );
    }
    if (
      metadata === null ||
      metadata.contentLength !== artifact.contentLength ||
      metadata.contentType !== artifact.contentType ||
      (await sha256(body)) !== command.sha256
    ) {
      throw new FunctionalProductApplicationError(
        "ARTIFACT_INVALID",
        "The uploaded object does not match its declared type, size, or checksum.",
      );
    }
    return CompleteAnswerArtifactUploadReceiptSchema.parse(
      await this.store.verifyArtifactUpload({
        ...context,
        answerSessionRef,
        artifactRef: artifact.artifactRef,
        sha256: command.sha256,
        contentType: metadata.contentType,
        contentLength: metadata.contentLength,
        expectedSessionVersion: command.expected_session_version,
        eventId: this.ids.nextId("event"),
        outboxId: this.ids.nextId("outbox"),
      }),
    );
  }

  public async queueAssistantTurn(
    context: FunctionalCommandContext,
    answerSessionRef: string,
    commandInput: CandidateAssistantTurnCommand,
  ) {
    requireActor(context.actor, "CANDIDATE");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = CandidateAssistantTurnCommandSchema.parse(commandInput);
    const exchangeRef = this.ids.nextId("assistant-exchange");
    const artifactRef = this.ids.nextId("artifact");
    const objectKey = `answers/${context.actor.actorId}/${answerSessionRef}/assistant/${artifactRef}.txt`;
    const body = new TextEncoder().encode(command.message);
    const digest = await sha256(body);
    try {
      await this.objectStore.putObject({
        objectKey,
        contentType: "text/plain; charset=utf-8",
        body,
        checksumSha256: digest,
      });
    } catch (error: unknown) {
      throw new FunctionalProductApplicationError(
        "STORE_UNAVAILABLE",
        "The assistant message could not be persisted.",
        { cause: error },
      );
    }
    const result = await this.store.queueAssistantExchange({
      ...context,
      answerSessionRef,
      exchangeRef,
      userArtifactRef: artifactRef,
      userObjectKey: objectKey,
      userContentLength: body.byteLength,
      userSha256: digest,
      expectedSessionVersion: command.expected_session_version,
      eventId: this.ids.nextId("event"),
      outboxId: this.ids.nextId("outbox"),
    });
    return CandidateAssistantTurnReceiptSchema.parse({
      schema_version: "candidate-assistant-turn-receipt@1",
      exchange_ref: exchangeRef,
      user_turn_ref: artifactRef,
      status: "QUEUED",
      created_at: result.createdAt,
    });
  }

  public async submitAnswer(
    context: FunctionalCommandContext,
    answerSessionRef: string,
    commandInput: SubmitFunctionalAnswerCommand,
  ) {
    requireActor(context.actor, "CANDIDATE");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = SubmitFunctionalAnswerCommandSchema.parse(commandInput);
    return FunctionalAnswerSubmissionReceiptSchema.parse(
      await this.store.submitAnswer({
        ...context,
        answerSessionRef,
        finalArtifactRefs: command.final_artifact_refs,
        expectedSessionVersion: command.expected_session_version,
        submissionSource: "MANUAL",
        ids: this.ids,
      }),
    );
  }

  public async recordSandboxActivity(
    context: FunctionalCommandContext,
    answerSessionRef: string,
    commandInput: unknown,
  ) {
    requireActor(context.actor, "CANDIDATE");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = RecordCandidateSandboxActivityCommandSchema.parse(commandInput);
    return CandidateSandboxActivityReceiptSchema.parse(
      await this.store.recordSandboxActivity({
        ...context,
        answerSessionRef,
        command,
        ids: this.ids,
      }),
    );
  }

  public async recordHumanReview(
    context: FunctionalCommandContext,
    obligationRef: string,
    commandInput: unknown,
  ) {
    requireActor(context.actor, "EMPLOYER");
    requireEnvelope(context.idempotencyKey, context.correlationId);
    const command = RecordFunctionalHumanReviewCommandSchema.parse(commandInput);
    return FunctionalHumanReviewReceiptSchema.parse(
      await this.store.recordHumanReview({
        ...context,
        obligationRef,
        command,
        ids: this.ids,
      }),
    );
  }

  public async readArtifact(actor: FunctionalActor, artifactRef: string) {
    const artifact = await this.store.getAuthorizedArtifact(actor, artifactRef);
    if (artifact === null || artifact.state === "UPLOAD_ISSUED") {
      throw new FunctionalProductApplicationError("RESOURCE_NOT_FOUND", "Artifact not found.");
    }
    try {
      return { artifact, body: await this.objectStore.getObject(artifact.objectKey) };
    } catch (error: unknown) {
      throw new FunctionalProductApplicationError(
        "STORE_UNAVAILABLE",
        "The private Artifact could not be read.",
        { cause: error },
      );
    }
  }

  public async readEmployerChallengeAsset(actor: FunctionalActor, assetRef: string) {
    const asset = await this.store.getAuthorizedEmployerChallengeAsset(actor, assetRef);
    if (asset === null || !["VERIFIED", "SEALED"].includes(asset.state)) {
      throw new FunctionalProductApplicationError(
        "RESOURCE_NOT_FOUND",
        "Challenge Asset not found.",
      );
    }
    try {
      return { asset, body: await this.objectStore.getObject(asset.objectKey) };
    } catch (error: unknown) {
      throw new FunctionalProductApplicationError(
        "STORE_UNAVAILABLE",
        "The private Challenge Asset could not be read.",
        { cause: error },
      );
    }
  }
}
