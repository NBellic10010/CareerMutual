export const SANDBOX_FOCUS_GRACE_MS = 2_000;
export const SANDBOX_FOCUS_AUTO_SUBMIT_MS = 15_000;
export const SANDBOX_FOCUS_MAX_AWAY_EVENTS = 2;
export const SANDBOX_SYSTEM_DIALOG_GRACE_MS = 30_000;

export type SandboxActivityEventType =
  | "VISIBILITY_HIDDEN"
  | "VISIBILITY_VISIBLE"
  | "WINDOW_BLURRED"
  | "WINDOW_FOCUSED"
  | "SYSTEM_DIALOG_STARTED"
  | "SYSTEM_DIALOG_ENDED";

export type SandboxFocusPolicyState = "ACTIVE" | "WARNED" | "AUTO_SUBMIT_PENDING";

export interface SandboxFocusState {
  readonly policyState: SandboxFocusPolicyState;
  readonly documentVisibility: "VISIBLE" | "HIDDEN";
  readonly windowFocus: "FOCUSED" | "BLURRED";
  readonly awayStartedAtMs: number | null;
  readonly countableAwayCount: number;
  readonly cumulativeAwayMs: number;
  readonly systemDialogUsed: boolean;
  readonly systemDialogUntilMs: number | null;
}

export function initialSandboxFocusState(): SandboxFocusState {
  return Object.freeze({
    policyState: "ACTIVE",
    documentVisibility: "VISIBLE",
    windowFocus: "FOCUSED",
    awayStartedAtMs: null,
    countableAwayCount: 0,
    cumulativeAwayMs: 0,
    systemDialogUsed: false,
    systemDialogUntilMs: null,
  });
}

function isAway(state: SandboxFocusState): boolean {
  return state.documentVisibility === "HIDDEN" || state.windowFocus === "BLURRED";
}

function systemDialogIsActive(state: SandboxFocusState, atMs: number): boolean {
  return state.systemDialogUntilMs !== null && atMs < state.systemDialogUntilMs;
}

function closeAwayInterval(state: SandboxFocusState, atMs: number): SandboxFocusState {
  if (state.awayStartedAtMs === null) return state;
  const duration = Math.max(0, atMs - state.awayStartedAtMs);
  if (duration <= SANDBOX_FOCUS_GRACE_MS) {
    return Object.freeze({ ...state, awayStartedAtMs: null });
  }
  const countableAwayCount = state.countableAwayCount + 1;
  const cumulativeAwayMs = state.cumulativeAwayMs + duration;
  const policyState =
    countableAwayCount >= SANDBOX_FOCUS_MAX_AWAY_EVENTS ||
    cumulativeAwayMs >= SANDBOX_FOCUS_AUTO_SUBMIT_MS
      ? "AUTO_SUBMIT_PENDING"
      : "WARNED";
  return Object.freeze({
    ...state,
    awayStartedAtMs: null,
    countableAwayCount,
    cumulativeAwayMs,
    policyState,
  });
}

export function sandboxFocusEffectiveCumulativeMs(state: SandboxFocusState, atMs: number): number {
  if (state.awayStartedAtMs === null) return state.cumulativeAwayMs;
  return state.cumulativeAwayMs + Math.max(0, atMs - state.awayStartedAtMs);
}

export function sandboxFocusThresholdReached(state: SandboxFocusState, atMs: number): boolean {
  return (
    state.policyState === "AUTO_SUBMIT_PENDING" ||
    sandboxFocusEffectiveCumulativeMs(state, atMs) >= SANDBOX_FOCUS_AUTO_SUBMIT_MS
  );
}

export function applySandboxActivity(
  current: SandboxFocusState,
  eventType: SandboxActivityEventType,
  atMs: number,
): SandboxFocusState {
  if (!Number.isFinite(atMs)) throw new Error("Sandbox activity time must be finite.");
  if (current.policyState === "AUTO_SUBMIT_PENDING") return current;

  if (eventType === "SYSTEM_DIALOG_STARTED") {
    if (current.systemDialogUsed) return current;
    return Object.freeze({
      ...current,
      awayStartedAtMs: null,
      systemDialogUsed: true,
      systemDialogUntilMs: atMs + SANDBOX_SYSTEM_DIALOG_GRACE_MS,
    });
  }

  if (eventType === "SYSTEM_DIALOG_ENDED") {
    const ended = Object.freeze({ ...current, systemDialogUntilMs: null });
    const awayStartedAtMs =
      current.systemDialogUntilMs !== null && atMs > current.systemDialogUntilMs
        ? current.systemDialogUntilMs
        : atMs;
    return isAway(ended) ? Object.freeze({ ...ended, awayStartedAtMs }) : ended;
  }

  const next: SandboxFocusState = Object.freeze({
    ...current,
    documentVisibility:
      eventType === "VISIBILITY_HIDDEN"
        ? "HIDDEN"
        : eventType === "VISIBILITY_VISIBLE"
          ? "VISIBLE"
          : current.documentVisibility,
    windowFocus:
      eventType === "WINDOW_BLURRED"
        ? "BLURRED"
        : eventType === "WINDOW_FOCUSED"
          ? "FOCUSED"
          : current.windowFocus,
  });

  if (systemDialogIsActive(next, atMs)) return Object.freeze({ ...next, awayStartedAtMs: null });
  if (isAway(next)) {
    return next.awayStartedAtMs === null ? Object.freeze({ ...next, awayStartedAtMs: atMs }) : next;
  }
  return closeAwayInterval(next, atMs);
}
