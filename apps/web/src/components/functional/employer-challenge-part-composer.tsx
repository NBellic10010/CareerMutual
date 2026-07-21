"use client";

import {
  EMPLOYER_CHALLENGE_AUDIO_MIME_TYPES,
  EMPLOYER_CHALLENGE_FILE_MIME_TYPES,
  EMPLOYER_CHALLENGE_IMAGE_MAX_BYTES,
  EMPLOYER_CHALLENGE_IMAGE_MIME_TYPES,
  EMPLOYER_CHALLENGE_MEDIA_MAX_BYTES,
  type CriticalChallengePart,
  type EmployerChallengeAssetPartKind,
  type EmployerChallengeAssetVerifiedReceipt,
} from "@onlyboth/contracts";

export type EmployerChallengeMediaPartDraft = Readonly<{
  local_ref: string;
  kind: EmployerChallengeAssetPartKind;
  title: string;
  instructions: string;
  file: File | null;
  preview_url: string | null;
  alt_text: string;
  transcript_excerpt: string;
  upload_state: "LOCAL" | "UPLOADING" | "VERIFIED" | "FAILED";
  verified: EmployerChallengeAssetVerifiedReceipt | null;
  error: string | null;
}>;

const MIME_TYPES: Record<EmployerChallengeAssetPartKind, readonly string[]> = {
  IMAGE: EMPLOYER_CHALLENGE_IMAGE_MIME_TYPES,
  AUDIO: EMPLOYER_CHALLENGE_AUDIO_MIME_TYPES,
  FILE: EMPLOYER_CHALLENGE_FILE_MIME_TYPES,
};

const DEFAULT_COPY: Record<
  EmployerChallengeAssetPartKind,
  { readonly title: string; readonly instructions: string }
> = {
  IMAGE: {
    title: "Visual source",
    instructions: "Inspect this sealed visual source as part of the complete Critical Challenge.",
  },
  AUDIO: {
    title: "Audio source",
    instructions: "Listen to this sealed audio source and use it in the same bounded response.",
  },
  FILE: {
    title: "Reference file",
    instructions: "Use this sealed reference file without treating it as independently verified.",
  },
};

function commandKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function bytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 * 1_024) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / (1_024 * 1_024)).toFixed(1)} MB`;
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

export function validateEmployerChallengeFile(
  kind: EmployerChallengeAssetPartKind,
  file: Pick<File, "name" | "type" | "size">,
): string | null {
  if (
    file.name.trim().length === 0 ||
    file.name.includes("/") ||
    file.name.includes("\\") ||
    hasControlCharacters(file.name)
  ) {
    return "Choose a file with a valid local file name.";
  }
  if (!MIME_TYPES[kind].includes(file.type)) {
    if (file.type.startsWith("video/")) return "Video is not supported yet.";
    return `${file.type || "Unknown MIME type"} is not allowed for ${kind}.`;
  }
  const maximum =
    kind === "IMAGE" ? EMPLOYER_CHALLENGE_IMAGE_MAX_BYTES : EMPLOYER_CHALLENGE_MEDIA_MAX_BYTES;
  if (file.size <= 0 || file.size > maximum) {
    return `${kind} files must be larger than 0 bytes and no more than ${bytes(maximum)}.`;
  }
  return null;
}

export function validateEmployerChallengePartCopy(
  part: Pick<EmployerChallengeMediaPartDraft, "title" | "instructions">,
): string | null {
  const titleLength = part.title.trim().length;
  if (titleLength < 2 || titleLength > 200) {
    return "Part title must contain 2–200 characters.";
  }
  const instructionsLength = part.instructions.trim().length;
  if (instructionsLength < 10 || instructionsLength > 2_000) {
    return "Candidate instructions must contain 10–2,000 characters.";
  }
  return null;
}

export function verifiedChallengeParts(
  parts: readonly EmployerChallengeMediaPartDraft[],
): readonly CriticalChallengePart[] {
  return parts.flatMap((part) => {
    if (part.upload_state !== "VERIFIED" || part.verified === null) return [];
    return [
      {
        part_ref: `challenge-part:${part.local_ref}`,
        kind: part.kind,
        title: part.title,
        instructions: part.instructions,
        text_content: null,
        asset: part.verified.asset,
      } satisfies CriticalChallengePart,
    ];
  });
}

async function fileSha256(file: File): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return `sha256:${[...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function createLocalChallengeMediaPart(
  kind: EmployerChallengeAssetPartKind,
): EmployerChallengeMediaPartDraft {
  return {
    local_ref: `composer-${crypto.randomUUID()}`,
    kind,
    ...DEFAULT_COPY[kind],
    file: null,
    preview_url: null,
    alt_text: "",
    transcript_excerpt: "",
    upload_state: "LOCAL",
    verified: null,
    error: null,
  };
}

export function EmployerChallengePartComposer({
  parts,
  onChange,
  csrfToken,
  disabled,
}: {
  readonly parts: readonly EmployerChallengeMediaPartDraft[];
  readonly onChange: (parts: readonly EmployerChallengeMediaPartDraft[]) => void;
  readonly csrfToken: string;
  readonly disabled: boolean;
}) {
  function update(localRef: string, patch: Partial<EmployerChallengeMediaPartDraft>): void {
    onChange(parts.map((part) => (part.local_ref === localRef ? { ...part, ...patch } : part)));
  }

  function remove(part: EmployerChallengeMediaPartDraft): void {
    if (part.preview_url !== null) URL.revokeObjectURL(part.preview_url);
    onChange(parts.filter(({ local_ref }) => local_ref !== part.local_ref));
  }

  function chooseFile(part: EmployerChallengeMediaPartDraft, file: File | null): void {
    if (part.preview_url !== null) URL.revokeObjectURL(part.preview_url);
    if (file === null) {
      update(part.local_ref, {
        file: null,
        preview_url: null,
        upload_state: "LOCAL",
        verified: null,
        error: null,
      });
      return;
    }
    update(part.local_ref, {
      file,
      preview_url: URL.createObjectURL(file),
      upload_state: "LOCAL",
      verified: null,
      error: validateEmployerChallengeFile(part.kind, file),
    });
  }

  async function upload(part: EmployerChallengeMediaPartDraft): Promise<void> {
    if (part.file === null) return;
    const validation =
      validateEmployerChallengePartCopy(part) ??
      validateEmployerChallengeFile(part.kind, part.file);
    if (validation !== null) {
      update(part.local_ref, { upload_state: "FAILED", error: validation });
      return;
    }
    if (part.kind === "IMAGE" && part.alt_text.trim().length < 3) {
      update(part.local_ref, {
        upload_state: "FAILED",
        error: "Add accessible alt text before uploading this image.",
      });
      return;
    }
    if (part.kind === "AUDIO" && part.transcript_excerpt.trim().length < 3) {
      update(part.local_ref, {
        upload_state: "FAILED",
        error: "Add an accessible transcript excerpt before uploading this audio.",
      });
      return;
    }
    update(part.local_ref, { upload_state: "UPLOADING", error: null });
    try {
      const presignResponse = await fetch("/api/v1/employer/challenge-assets/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Idempotency-Key": commandKey("challenge-asset-presign"),
        },
        body: JSON.stringify({
          schema_version: "create-employer-challenge-asset-upload-command@1",
          part_kind: part.kind,
          file_name: part.file.name,
          content_type: part.file.type,
          content_length: part.file.size,
          alt_text: part.kind === "IMAGE" ? part.alt_text.trim() : null,
          transcript_excerpt: part.kind === "AUDIO" ? part.transcript_excerpt.trim() : null,
        }),
      });
      const presign = (await presignResponse.json()) as {
        readonly asset_ref?: string;
        readonly upload_url?: string;
        readonly error?: { readonly code?: string };
      };
      if (
        !presignResponse.ok ||
        presign.asset_ref === undefined ||
        presign.upload_url === undefined
      ) {
        throw new Error(presign.error?.code ?? "CHALLENGE_ASSET_PRESIGN_FAILED");
      }
      const putResponse = await fetch(presign.upload_url, {
        method: "PUT",
        headers: { "Content-Type": part.file.type, "If-None-Match": "*" },
        body: part.file,
      });
      if (!putResponse.ok) throw new Error(`CHALLENGE_ASSET_UPLOAD_${putResponse.status}`);
      const completeResponse = await fetch("/api/v1/employer/challenge-assets/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Idempotency-Key": commandKey("challenge-asset-complete"),
        },
        body: JSON.stringify({
          schema_version: "complete-employer-challenge-asset-upload-command@1",
          asset_ref: presign.asset_ref,
          sha256: await fileSha256(part.file),
        }),
      });
      const completed = (await completeResponse.json()) as
        EmployerChallengeAssetVerifiedReceipt | { readonly error?: { readonly code?: string } };
      if (!completeResponse.ok || !("state" in completed) || completed.state !== "VERIFIED") {
        const code = "error" in completed ? completed.error?.code : undefined;
        throw new Error(code ?? "CHALLENGE_ASSET_VERIFY_FAILED");
      }
      update(part.local_ref, {
        upload_state: "VERIFIED",
        verified: completed,
        error: null,
      });
    } catch (cause: unknown) {
      update(part.local_ref, {
        upload_state: "FAILED",
        verified: null,
        error: cause instanceof Error ? cause.message : "CHALLENGE_ASSET_UPLOAD_FAILED",
      });
    }
  }

  return (
    <fieldset className="challenge-part-composer">
      <legend>Critical Challenge parts</legend>
      <header className="challenge-part-toolbar">
        <div>
          <strong>One ordered task, multiple sealed sources</strong>
          <small>TEXT is always first. Add up to 11 verified media or reference Parts.</small>
        </div>
        <div className="challenge-part-additions" aria-label="Add Challenge Part">
          {(["IMAGE", "AUDIO", "FILE"] as const).map((kind) => (
            <button
              className="secondary-button"
              disabled={disabled || parts.length >= 11}
              key={kind}
              type="button"
              onClick={() => onChange([...parts, createLocalChallengeMediaPart(kind)])}
            >
              + {kind.toLowerCase()}
            </button>
          ))}
          <button disabled type="button" title="Video Challenge Parts are planned but unsupported.">
            Video · later
          </button>
        </div>
      </header>
      <ol className="challenge-part-ledger">
        <li className="challenge-part-ledger-row text-part-fixed">
          <span className="challenge-part-ordinal">01</span>
          <div>
            <small>TEXT · fixed first Part</small>
            <strong>Critical Challenge objective</strong>
            <p>The objective above becomes the sealed text source.</p>
          </div>
          <span className="asset-state state-verified">READY</span>
        </li>
        {parts.map((part, index) => {
          const inputId = `challenge-file-${part.local_ref}`;
          const copyError = validateEmployerChallengePartCopy(part);
          return (
            <li className="challenge-part-ledger-row media-part-editor" key={part.local_ref}>
              <span className="challenge-part-ordinal">{String(index + 2).padStart(2, "0")}</span>
              <div className="media-part-fields">
                <header>
                  <div>
                    <small>{part.kind} · Employer upload</small>
                    <strong>{part.title}</strong>
                  </div>
                  <span className={`asset-state state-${part.upload_state.toLowerCase()}`}>
                    {part.upload_state}
                  </span>
                </header>
                <div className="media-part-copy-grid">
                  <label>
                    Part title
                    <input
                      disabled={disabled}
                      minLength={2}
                      maxLength={200}
                      aria-invalid={copyError?.startsWith("Part title") ?? false}
                      value={part.title}
                      onChange={(event) => update(part.local_ref, { title: event.target.value })}
                    />
                  </label>
                  <label className="span-two">
                    Candidate instructions
                    <textarea
                      disabled={disabled}
                      minLength={10}
                      maxLength={2_000}
                      aria-invalid={copyError?.startsWith("Candidate instructions") ?? false}
                      rows={2}
                      value={part.instructions}
                      onChange={(event) =>
                        update(part.local_ref, { instructions: event.target.value })
                      }
                    />
                  </label>
                  {part.kind === "IMAGE" ? (
                    <label className="span-two">
                      Accessible alt text
                      <textarea
                        disabled={disabled || part.upload_state === "VERIFIED"}
                        rows={2}
                        value={part.alt_text}
                        onChange={(event) =>
                          update(part.local_ref, { alt_text: event.target.value })
                        }
                      />
                    </label>
                  ) : null}
                  {part.kind === "AUDIO" ? (
                    <label className="span-two">
                      Accessible transcript excerpt
                      <textarea
                        disabled={disabled || part.upload_state === "VERIFIED"}
                        rows={3}
                        value={part.transcript_excerpt}
                        onChange={(event) =>
                          update(part.local_ref, { transcript_excerpt: event.target.value })
                        }
                      />
                    </label>
                  ) : null}
                </div>
                {copyError === null ? null : (
                  <p className="form-error" role="alert">
                    {copyError}
                  </p>
                )}
                <div className="challenge-file-zone">
                  <label className="challenge-file-trigger" htmlFor={inputId}>
                    <span>{part.file === null ? "Choose source" : "Replace local source"}</span>
                    <small>{MIME_TYPES[part.kind].join(" · ")}</small>
                  </label>
                  <input
                    accept={MIME_TYPES[part.kind].join(",")}
                    disabled={
                      disabled ||
                      part.upload_state === "UPLOADING" ||
                      part.upload_state === "VERIFIED"
                    }
                    id={inputId}
                    type="file"
                    onChange={(event) => chooseFile(part, event.target.files?.[0] ?? null)}
                  />
                  {part.preview_url === null || part.file === null ? null : (
                    <div className="challenge-local-preview">
                      {part.kind === "IMAGE" ? (
                        <img src={part.preview_url} alt={part.alt_text || "Local preview only"} />
                      ) : part.kind === "AUDIO" ? (
                        <audio controls preload="metadata" src={part.preview_url}>
                          Audio preview is unavailable in this browser.
                        </audio>
                      ) : (
                        <span className="file-preview-glyph" aria-hidden="true">
                          DOC
                        </span>
                      )}
                      <div>
                        <strong>{part.file.name}</strong>
                        <small>
                          {part.file.type} · {bytes(part.file.size)}
                        </small>
                        <small>Local preview · not sealed until VERIFIED</small>
                      </div>
                    </div>
                  )}
                </div>
                {part.verified === null ? null : (
                  <div className="challenge-asset-seal">
                    <span aria-hidden="true">✓</span>
                    <div>
                      <strong>Upload verified</strong>
                      <code>{part.verified.asset.sha256}</code>
                    </div>
                  </div>
                )}
                {part.error === null ? null : (
                  <p className="form-error" role="alert">
                    {part.error}
                  </p>
                )}
                <div className="media-part-actions">
                  <button
                    className="secondary-button"
                    disabled={
                      disabled ||
                      part.file === null ||
                      part.upload_state === "UPLOADING" ||
                      part.upload_state === "VERIFIED"
                    }
                    type="button"
                    onClick={() => void upload(part)}
                  >
                    {part.upload_state === "UPLOADING" ? "Uploading…" : "Validate & upload"}
                  </button>
                  <button disabled={disabled} type="button" onClick={() => remove(part)}>
                    Remove Part
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="challenge-part-status" aria-live="polite">
        {parts.filter(({ upload_state }) => upload_state === "VERIFIED").length}/{parts.length}{" "}
        uploaded Parts verified. Unverified Parts block Draft creation.
      </p>
    </fieldset>
  );
}
