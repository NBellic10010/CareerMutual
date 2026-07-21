"use client";

import type {
  CandidateAnswerSessionProjection,
  CandidateSandboxActivityReceipt,
  RichTextNode,
} from "@onlyboth/contracts";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";

import { CriticalChallengeView } from "./critical-challenge-view";

type ActivityEventType =
  | "VISIBILITY_HIDDEN"
  | "VISIBILITY_VISIBLE"
  | "WINDOW_BLURRED"
  | "WINDOW_FOCUSED"
  | "SYSTEM_DIALOG_STARTED"
  | "SYSTEM_DIALOG_ENDED";

function commandKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

async function digest(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer();
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function secondsRemaining(deadline: string) {
  return Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1_000));
}

function preferredRecorderType(): { readonly recorderType: string; readonly uploadType: string } {
  const candidates = [
    ["audio/webm;codecs=opus", "audio/webm"],
    ["audio/webm", "audio/webm"],
    ["audio/mp4", "audio/mp4"],
    ["audio/ogg;codecs=opus", "audio/ogg"],
  ] as const;
  const selected = candidates.find(([type]) => MediaRecorder.isTypeSupported(type));
  return selected === undefined
    ? { recorderType: "", uploadType: "audio/webm" }
    : { recorderType: selected[0], uploadType: selected[1] };
}

export function AnswerSandbox({
  initialSession,
  csrfToken,
  presentation = "page",
  onExit,
}: {
  readonly initialSession: CandidateAnswerSessionProjection;
  readonly csrfToken: string;
  readonly presentation?: "page" | "dialog";
  readonly onExit?: (() => void) | undefined;
}) {
  const [session, setSession] = useState(initialSession);
  const [remaining, setRemaining] = useState(() => secondsRemaining(initialSession.answer_due_at));
  const [saveState, setSaveState] = useState<"SAVED" | "DIRTY" | "SAVING" | "ERROR">("SAVED");
  const [busy, setBusy] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activitySyncError, setActivitySyncError] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcripts, setTranscripts] = useState<Readonly<Record<string, string>>>({});
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const activitySequence = useRef(0);
  const sessionRef = session.answer_session_ref;
  const policyEnabled = session.focus.policy_version === "sandbox-focus-policy@1";
  const isActive = session.state === "ACTIVE" && session.focus.state !== "AUTO_SUBMIT_PENDING";

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: (initialSession.latest_document ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    }) as never,
    editable: isActive,
    editorProps: {
      attributes: {
        class: "answer-editor-surface",
        "aria-label": "Rich-text answer",
      },
    },
    onUpdate: () => setSaveState("DIRTY"),
  });

  const call = useCallback(
    async (path: string, body: unknown, method = "POST", options?: { keepalive?: boolean }) => {
      const response = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Idempotency-Key": commandKey("answer-sandbox"),
        },
        body: JSON.stringify(body),
        keepalive: options?.keepalive,
      });
      const result = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          String((result.error as { code?: string } | undefined)?.code ?? "COMMAND_FAILED"),
        );
      }
      return result;
    },
    [csrfToken],
  );

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/v1/candidate/answer-sessions/${sessionRef}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const next = (await response.json()) as CandidateAnswerSessionProjection;
    setSession(next);
    editor?.setEditable(next.state === "ACTIVE" && next.focus.state !== "AUTO_SUBMIT_PENDING");
    return next;
  }, [editor, sessionRef]);

  const sendActivity = useCallback(
    async (
      eventType: ActivityEventType,
      systemDialogType: "MIC_PERMISSION" | null = null,
    ): Promise<CandidateSandboxActivityReceipt | null> => {
      if (!policyEnabled || session.state !== "ACTIVE") return null;
      const eventRef = `sandbox-activity:${crypto.randomUUID()}`;
      const body = {
        schema_version: "candidate-sandbox-activity-command@1",
        event_ref: eventRef,
        event_type: eventType,
        system_dialog_type: systemDialogType,
        client_sequence: activitySequence.current++,
        client_monotonic_ms: performance.now(),
        policy_version: "sandbox-focus-policy@1",
      } as const;
      try {
        const response = await fetch(
          `/api/v1/candidate/answer-sessions/${sessionRef}/activity-events`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken,
              "Idempotency-Key": eventRef,
            },
            body: JSON.stringify(body),
            keepalive: true,
          },
        );
        if (!response.ok) throw new Error("FOCUS_ACTIVITY_SYNC_FAILED");
        const receipt = (await response.json()) as CandidateSandboxActivityReceipt;
        setActivitySyncError(false);
        setSession((current) => ({
          ...current,
          state:
            receipt.focus.state === "AUTO_SUBMIT_PENDING"
              ? "FOCUS_POLICY_AUTO_SUBMIT_PENDING"
              : current.state,
          focus: receipt.focus,
        }));
        if (receipt.focus.state === "WARNED") setWarningAcknowledged(false);
        return receipt;
      } catch {
        setActivitySyncError(true);
        window.setTimeout(() => {
          void fetch(`/api/v1/candidate/answer-sessions/${sessionRef}/activity-events`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken,
              "Idempotency-Key": eventRef,
            },
            body: JSON.stringify(body),
            keepalive: true,
          }).then((response) => {
            if (response.ok) setActivitySyncError(false);
          });
        }, 750);
        return null;
      }
    },
    [csrfToken, policyEnabled, session.state, sessionRef],
  );

  const saveNow = useCallback(async () => {
    if (editor === null || !isActive || saveState !== "DIRTY") return session;
    setSaveState("SAVING");
    try {
      await call(`/api/v1/candidate/answer-sessions/${sessionRef}/drafts`, {
        schema_version: "save-answer-draft-command@1",
        document: editor.getJSON() as RichTextNode,
        expected_session_version: session.version,
      });
      const next = await refresh();
      setSaveState("SAVED");
      return next ?? session;
    } catch (cause) {
      setSaveState("ERROR");
      setError(cause instanceof Error ? cause.message : "Draft could not be saved.");
      return session;
    }
  }, [call, editor, isActive, refresh, saveState, session, sessionRef]);

  useEffect(() => {
    const clock = window.setInterval(
      () => setRemaining(secondsRemaining(session.answer_due_at)),
      1_000,
    );
    return () => window.clearInterval(clock);
  }, [session.answer_due_at]);

  useEffect(() => {
    const autosave = window.setInterval(() => void saveNow(), 2_000);
    return () => window.clearInterval(autosave);
  }, [saveNow]);

  useEffect(() => {
    if (session.state !== "ACTIVE" && session.state !== "FOCUS_POLICY_AUTO_SUBMIT_PENDING") return;
    const polling = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(polling);
  }, [refresh, session.state]);

  useEffect(() => {
    if (!policyEnabled || session.state !== "ACTIVE") return;
    const visibility = () =>
      void sendActivity(document.hidden ? "VISIBILITY_HIDDEN" : "VISIBILITY_VISIBLE");
    const blur = () => void sendActivity("WINDOW_BLURRED");
    const focus = () => void sendActivity("WINDOW_FOCUSED");
    const pageHide = () => void sendActivity("VISIBILITY_HIDDEN");
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    window.addEventListener("pagehide", pageHide);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", pageHide);
    };
  }, [policyEnabled, sendActivity, session.state]);

  useEffect(() => {
    if (presentation !== "dialog") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const containFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isActive) {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], textarea:not([disabled]), [contenteditable="true"], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", containFocus);
    };
  }, [isActive, presentation]);

  useEffect(() => {
    const refs = session.artifacts
      .filter(
        ({ kind, transcription_status, transcript_artifact_ref }) =>
          kind === "VOICE_MEMO" &&
          transcription_status === "COMPLETED" &&
          transcript_artifact_ref !== null &&
          transcripts[transcript_artifact_ref] === undefined,
      )
      .map(({ transcript_artifact_ref }) => transcript_artifact_ref!);
    for (const ref of refs) {
      void fetch(`/api/v1/artifacts/${encodeURIComponent(ref)}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("TRANSCRIPT_READ_FAILED");
          const text = await response.text();
          setTranscripts((current) => ({ ...current, [ref]: text }));
        })
        .catch(() => setError("A completed transcript could not be loaded."));
    }
  }, [session.artifacts, transcripts]);

  async function startRecording() {
    setError(null);
    const suppression = await sendActivity("SYSTEM_DIALOG_STARTED", "MIC_PERMISSION");
    if (policyEnabled && suppression === null) {
      setError(
        "Focus activity could not be synchronized, so microphone permission was not opened.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = preferredRecorderType();
      const nextRecorder =
        types.recorderType.length === 0
          ? new MediaRecorder(stream)
          : new MediaRecorder(stream, { mimeType: types.recorderType });
      chunks.current = [];
      nextRecorder.ondataavailable = (event) =>
        event.data.size > 0 && chunks.current.push(event.data);
      nextRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void uploadVoice(new Blob(chunks.current, { type: types.uploadType }));
      };
      recorder.current = nextRecorder;
      nextRecorder.start();
      setRecording(true);
    } catch {
      setError("Microphone permission or MediaRecorder is unavailable. Text remains available.");
    } finally {
      await sendActivity("SYSTEM_DIALOG_ENDED", "MIC_PERMISSION");
    }
  }

  function stopRecording() {
    recorder.current?.stop();
    setRecording(false);
  }

  async function uploadVoice(blob: Blob) {
    setBusy(true);
    setError(null);
    try {
      const current = (await refresh()) ?? session;
      const contentType = blob.type.split(";", 1)[0] || "audio/webm";
      const presign = await call(
        `/api/v1/candidate/answer-sessions/${sessionRef}/artifacts/presign`,
        {
          schema_version: "create-answer-artifact-upload-command@1",
          kind: "VOICE_MEMO",
          content_type: contentType,
          content_length: blob.size,
          expected_session_version: current.version,
        },
      );
      const upload = await fetch(String(presign.upload_url), {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "If-None-Match": String(
            (presign.required_upload_headers as Record<string, unknown>)["If-None-Match"],
          ),
        },
        body: blob,
      });
      if (!upload.ok) throw new Error("VOICE_UPLOAD_FAILED");
      await call(`/api/v1/candidate/answer-sessions/${sessionRef}/artifacts/complete`, {
        schema_version: "complete-answer-artifact-upload-command@1",
        artifact_ref: presign.artifact_ref,
        sha256: await digest(blob),
        expected_session_version: current.version,
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Voice Memo upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function askAssistant() {
    if (assistantInput.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const current = await saveNow();
      await call(`/api/v1/candidate/answer-sessions/${sessionRef}/assistant-turns`, {
        schema_version: "candidate-assistant-turn-command@1",
        message: assistantInput,
        expected_session_version: current.version,
      });
      setAssistantInput("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assistant request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const current = await saveNow();
      const refreshed = (await refresh()) ?? current;
      const finalRefs = refreshed.artifacts
        .filter(
          (artifact) =>
            artifact.state === "VERIFIED" &&
            (artifact.artifact_ref === refreshed.latest_rich_text_artifact_ref ||
              artifact.kind === "VOICE_MEMO"),
        )
        .map(({ artifact_ref }) => artifact_ref);
      await call(`/api/v1/candidate/answer-sessions/${sessionRef}/submit`, {
        schema_version: "submit-functional-answer-command@1",
        final_artifact_refs: finalRefs,
        expected_session_version: refreshed.version,
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Final submission failed.");
    } finally {
      setBusy(false);
    }
  }

  const pendingAssistantWork = session.assistant_turns.some(
    ({ status }) => status === "QUEUED" || status === "RUNNING",
  );
  const pendingVoiceWork = session.artifacts.some(
    ({ kind, transcription_status }) =>
      kind === "VOICE_MEMO" &&
      (transcription_status === "QUEUED" || transcription_status === "RUNNING"),
  );
  const pendingPlatformWork = pendingAssistantWork || pendingVoiceWork;
  const hasAnswer = session.artifacts.some(
    (artifact) =>
      artifact.state === "VERIFIED" &&
      (artifact.artifact_ref === session.latest_rich_text_artifact_ref ||
        artifact.kind === "VOICE_MEMO"),
  );
  const focusPending =
    session.state === "FOCUS_POLICY_AUTO_SUBMIT_PENDING" ||
    session.focus.state === "AUTO_SUBMIT_PENDING";
  const terminal = !["ACTIVE", "FOCUS_POLICY_AUTO_SUBMIT_PENDING"].includes(session.state);

  const content = (
    <main className={`sandbox-shell ${presentation === "dialog" ? "sandbox-shell-dialog" : ""}`}>
      <header className="sandbox-header">
        <div>
          <p className="eyebrow">Server-timed blind answer / {session.organization_public_name}</p>
          <h1 id="answer-sandbox-title">{session.title}</h1>
        </div>
        <div className="sandbox-status-rail">
          <div
            className={`focus-status focus-${session.focus.state.toLowerCase().replaceAll("_", "-")}`}
            aria-live="polite"
          >
            <span>Focus record</span>
            <strong>{session.focus.state.replaceAll("_", " ")}</strong>
            <small>
              {session.focus.countable_away_count}/2 away ·{" "}
              {Math.round(session.focus.cumulative_away_ms / 1_000)}s counted
            </small>
          </div>
          <div className={`timer ${remaining < 60 ? "timer-critical" : ""}`} aria-live="polite">
            <span>Server deadline</span>
            <strong>
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:
              {String(remaining % 60).padStart(2, "0")}
            </strong>
          </div>
        </div>
      </header>

      <section className="focus-disclosure" aria-label="Focus activity disclosure">
        <strong>Browser focus is recorded — this is not secure proctoring.</strong>
        <span>
          A switch longer than 2s counts. The first returns a warning; the second or 15s total seals
          available work automatically. No sites, apps, keystrokes, or pointer paths are collected.
        </span>
      </section>

      {activitySyncError ? (
        <p className="focus-sync-warning" role="status">
          Focus activity sync is temporarily unavailable. The browser is retrying; a platform
          failure is not treated as Candidate behavior.
        </p>
      ) : null}

      {session.focus.state === "WARNED" && !warningAcknowledged ? (
        <section className="focus-warning-panel" role="alertdialog" aria-modal="true">
          <span>FOCUS NOTICE 01 / 02</span>
          <h2>Your browser left the Answer Sandbox for more than 2 seconds.</h2>
          <p>
            Your draft remains active. A second counted departure, or 15 seconds total away, will
            automatically seal the latest persisted work.
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={() => setWarningAcknowledged(true)}
          >
            I understand — return to the challenge
          </button>
        </section>
      ) : null}

      {focusPending ? (
        <section className="focus-auto-submit-panel" aria-live="assertive">
          <span>AUTO-SUBMIT REQUESTED</span>
          <h2>The Sandbox is frozen.</h2>
          <p>
            The Worker is sealing the latest persisted rich text, verified Voice Memo, transcript
            status, and disclosed GPT trace. Platform work receives at most 30 seconds to settle.
          </p>
        </section>
      ) : terminal ? (
        <section className="submission-seal">
          <span>
            {session.state === "FOCUS_POLICY_TERMINATED_EMPTY" ? "CLOSED EMPTY" : "SEALED"}
          </span>
          <h2>
            {session.state === "FOCUS_POLICY_TERMINATED_EMPTY"
              ? "The Focus Policy closed an empty session."
              : "Your answer is immutable."}
          </h2>
          <p>
            {session.state === "FOCUS_POLICY_TERMINATED_EMPTY"
              ? "No answer or ability conclusion was created. The Reviewer Slot has been released; the consumed application Credit remains used because the answer session started."
              : `Submitted ${session.submitted_at ?? "at the server deadline"}. The named Reviewer now owes a recorded review before the Slot can recycle.`}
          </p>
          {session.process_evidence !== null ? (
            <section className="candidate-process-summary" aria-labelledby="process-summary-title">
              <div>
                <span>YOUR SERVER RECORD</span>
                <h3 id="process-summary-title">Process summary</h3>
                <p>
                  {session.process_evidence.schema_version === "answer-process-evidence@2"
                    ? "These server observations are disclosed under your accepted terms. Versioned severity may inform the Reviewer's bounded assessment, but does not prove intent, integrity, or external AI use. Intermediate draft text is not disclosed."
                    : "This historical policy records neutral server observations without behavior severity. Intermediate draft text is not disclosed to the Employer."}
                </p>
              </div>
              <dl>
                <div>
                  <dt>Recorded revisions</dt>
                  <dd>{session.process_evidence.draft_revision_count}</dd>
                </div>
                <div>
                  <dt>Longest no server-recorded revision</dt>
                  <dd>{session.process_evidence.longest_no_server_recorded_revision_seconds}s</dd>
                </div>
                <div>
                  <dt>Platform GPT turns</dt>
                  <dd>{session.process_evidence.platform_gpt_turn_count}</dd>
                </div>
                <div>
                  <dt>Voice Memos</dt>
                  <dd>{session.process_evidence.voice_memo_count}</dd>
                </div>
                <div>
                  <dt>Submission source</dt>
                  <dd>{session.process_evidence.submission_source.replaceAll("_", " ")}</dd>
                </div>
                <div>
                  <dt>Seconds remaining</dt>
                  <dd>{session.process_evidence.seconds_remaining_at_submit}</dd>
                </div>
              </dl>
              {session.process_evidence.known_platform_failures.length > 0 ? (
                <p>
                  Known platform failures:{" "}
                  {session.process_evidence.known_platform_failures.join(", ")}
                </p>
              ) : null}
              {session.process_evidence.schema_version === "answer-process-evidence@2" ? (
                <div className="candidate-behavior-signals">
                  {session.process_evidence.behavior_signals.map((signal) => (
                    <article
                      className={`severity-card severity-card--${signal.severity.toLowerCase()}`}
                      key={signal.signal_ref}
                    >
                      <div className="severity-card__header">
                        <strong>{signal.title}</strong>
                        <span>{signal.severity}</span>
                      </div>
                      <p>{signal.observed_value}</p>
                      <small>{signal.applied_rule}</small>
                      <small>{signal.reviewer_caveat}</small>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          {presentation === "dialog" && onExit !== undefined ? (
            <button className="primary-button" type="button" onClick={onExit}>
              Return to the JobPost
            </button>
          ) : (
            <a className="primary-button" href="/candidate">
              Return to opportunities
            </a>
          )}
        </section>
      ) : (
        <div className="sandbox-grid">
          <section className="challenge-rail">
            <p className="section-kicker">01 / Sealed challenge</p>
            <CriticalChallengeView challenge={session.critical_challenge} compact />
            <details>
              <summary>Allowed assumptions</summary>
              <ul>
                {session.allowed_assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
            <div className="sandbox-boundary-note">
              <strong>Focus boundary</strong>
              <p>{session.focus.telemetry_limitations}</p>
            </div>
          </section>

          <section className="answer-workbench">
            <div className="editor-toolbar" role="toolbar" aria-label="Answer formatting">
              <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}>
                Bold
              </button>
              <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}>
                Italic
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
              >
                Bullets
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              >
                Steps
              </button>
              <span className={`save-indicator save-${saveState.toLowerCase()}`}>{saveState}</span>
            </div>
            <div className="answer-editor-frame" onBlur={() => void saveNow()}>
              <EditorContent editor={editor} />
            </div>

            <section className="voice-station" aria-labelledby="voice-station-title">
              <div>
                <p className="section-kicker">02 / Optional voice</p>
                <h2 id="voice-station-title">Record the reasoning in your own voice.</h2>
                <p>The original audio remains authoritative; transcription is a derived aid.</p>
              </div>
              <button
                className={recording ? "danger-button" : "secondary-button"}
                disabled={busy}
                type="button"
                onClick={recording ? stopRecording : () => void startRecording()}
              >
                {recording ? "Stop & upload Voice Memo" : "Record Voice Memo"}
              </button>
              <div className="voice-artifact-list" aria-live="polite">
                {session.artifacts
                  .filter(({ kind }) => kind === "VOICE_MEMO")
                  .map((artifact, index) => {
                    const transcript =
                      artifact.transcript_artifact_ref === null
                        ? undefined
                        : transcripts[artifact.transcript_artifact_ref];
                    return (
                      <article key={artifact.artifact_ref}>
                        <span>VOICE {String(index + 1).padStart(2, "0")}</span>
                        <strong>
                          Transcript {artifact.transcription_status ?? "NOT REQUESTED"}
                        </strong>
                        {transcript === undefined ? null : <p>{transcript}</p>}
                        {transcript === undefined ? null : (
                          <button
                            type="button"
                            onClick={() =>
                              editor
                                ?.chain()
                                .focus()
                                .insertContent({
                                  type: "paragraph",
                                  content: [{ type: "text", text: transcript }],
                                })
                                .run()
                            }
                          >
                            Insert transcript into answer
                          </button>
                        )}
                        {artifact.transcription_error_code === null ? null : (
                          <small>
                            Transcript unavailable: {artifact.transcription_error_code}. Original
                            audio can still be submitted.
                          </small>
                        )}
                      </article>
                    );
                  })}
              </div>
            </section>
          </section>

          <aside className="assistant-sidecar">
            <div>
              <p className="section-kicker">03 / Disclosed platform GPT</p>
              <h2>Think with the trace visible.</h2>
              <p>Every turn freezes with the answer. GPT cannot submit for you.</p>
            </div>
            <div className="assistant-thread" aria-live="polite">
              {session.assistant_turns.map((turn) => (
                <article
                  className={`assistant-turn role-${turn.role.toLowerCase()}`}
                  key={turn.turn_ref}
                >
                  <span>
                    {turn.role} · {turn.status}
                  </span>
                  <p>
                    {turn.content ??
                      (turn.status === "FAILED" ? `Unavailable: ${turn.error_code}` : "Working…")}
                  </p>
                  {turn.role === "ASSISTANT" && turn.content !== null ? (
                    <button
                      type="button"
                      onClick={() =>
                        editor
                          ?.chain()
                          .focus()
                          .insertContent({
                            type: "paragraph",
                            content: [{ type: "text", text: turn.content ?? "" }],
                          })
                          .run()
                      }
                    >
                      Insert into draft
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
            <textarea
              aria-label="Message the disclosed platform GPT"
              value={assistantInput}
              onChange={(event) => setAssistantInput(event.target.value)}
              placeholder="Ask for critique, alternatives, or a clearer structure…"
              maxLength={4000}
            />
            <button
              className="secondary-button"
              disabled={busy || pendingAssistantWork}
              type="button"
              onClick={() => void askAssistant()}
            >
              Ask disclosed GPT
            </button>
            <div className="final-submit-block">
              <p>
                Final submit seals rich text, Voice Memo, transcript status, and the complete GPT
                trace.
              </p>
              <button
                className="primary-button"
                disabled={busy || pendingPlatformWork || (!hasAnswer && saveState !== "DIRTY")}
                type="button"
                onClick={() => void submit()}
              >
                Submit immutable answer
              </button>
            </div>
            {error === null ? null : (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </aside>
        </div>
      )}
    </main>
  );

  if (presentation === "page") return content;
  return (
    <div className="sandbox-modal-backdrop">
      <div
        aria-labelledby="answer-sandbox-title"
        aria-modal="true"
        className="sandbox-modal"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {content}
      </div>
    </div>
  );
}
