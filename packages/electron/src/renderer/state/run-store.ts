import { create } from "zustand";
import type { AskAnswer } from "@ccr/core";
import type { DesktopMode } from "../theme.js";

export type ChatPaneEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "system"; text: string; tone?: "info" | "warn" | "error" }
  | { kind: "tool"; name: string; argsPreview: string; result?: string; isError?: boolean };

function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "object" ? JSON.stringify(p) : String(p))).join("");
  return String(content ?? "");
}

/** Best-effort render of persisted session JSON for reopening transcripts. */
export function entriesFromStoredMessages(messages: unknown[]): ChatPaneEntry[] {
  const out: ChatPaneEntry[] = [];
  for (const m of messages) {
    const row = m as Record<string, unknown>;
    const role = row.role;
    if (role === "user") out.push({ kind: "user", text: contentToString(row.content) });
    else if (role === "assistant") {
      const txt = typeof row.content === "string" ? row.content : "";
      if (txt) out.push({ kind: "assistant", text: txt });
    }
  }
  return out;
}

function isPersistable(e: ChatPaneEntry): boolean {
  return e.kind === "user" || e.kind === "assistant";
}

function sameEntry(a: ChatPaneEntry, b: ChatPaneEntry): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "user" || a.kind === "assistant") {
    return a.text === (b as { text: string }).text;
  }
  return false;
}

/**
 * Merge a re-read of the *already active* session into the live transcript.
 *
 * A same-session refresh must never delete live rows. The transcript
 * legitimately runs ahead of disk: the optimistic user echo isn't persisted
 * until the run ends, and tool cards / system lines are never persisted in a
 * form `entriesFromStoredMessages` re-renders at all. So we only ever *append*,
 * and only when the live transcript's persistable projection is an exact prefix
 * of what's on disk — which means disk holds turns we've genuinely never seen
 * (another window wrote to this session).
 *
 * Any divergence means live is the richer view — e.g. the echo shows the text
 * the user typed while disk stores the composed prompt with attached file
 * blocks — so we keep live untouched rather than duplicate the turn.
 */
export function mergeStoredIntoLive(
  live: ChatPaneEntry[],
  incoming: ChatPaneEntry[],
): ChatPaneEntry[] {
  const projection = live.filter(isPersistable);
  // Live is ahead of disk (unpersisted echo, or disk was truncated) — trust live.
  if (projection.length > incoming.length) return live;
  for (let i = 0; i < projection.length; i++) {
    if (!sameEntry(projection[i]!, incoming[i]!)) return live; // diverged — trust live
  }
  const tail = incoming.slice(projection.length);
  return tail.length > 0 ? [...live, ...tail] : live;
}

interface ApprovalUI {
  requestId: string;
  kind: string;
  title: string;
  detail: string;
}

interface AskUI {
  requestId: string;
  questions: { question?: string; options?: string[] }[];
}

interface RunSlice {
  model: string;
  mode: DesktopMode;

  runningSessionId: string | null;
  streamingTail: string;
  entries: ChatPaneEntry[];
  statusLine: string | null;
  /** Session id the current `entries` were hydrated from; drives switch-vs-refresh. */
  hydratedSessionId: string | null;

  approval: ApprovalUI | null;
  askModal: AskUI | null;

  setModelMode: (m: string, mode: DesktopMode) => void;
  /**
   * Load a persisted transcript. Replaces the transcript and clears live state
   * only when the session actually *changes*; a refresh of the already-hydrated
   * session merges (append-only) so watcher ticks can't clobber the optimistic
   * echo or an in-flight stream.
   */
  hydrateFromStored: (sessionId: string | null, messages: unknown[]) => void;
  pushUserEcho: (text: string) => void;
  setStreamingTail: (s: string) => void;
  clearStreamingTail: () => void;
  commitAssistantDraft: () => void;
  finalizeAssistantTurn: (fullContent: string) => void;
  toolStart: (name: string, argsPreview: string) => void;
  toolEnd: (name: string, result: string, isError: boolean) => void;
  sysLine: (text: string, tone?: "info" | "warn" | "error") => void;
  setApproval: (a: ApprovalUI | null) => void;
  setAskModal: (a: AskUI | null) => void;
  setRunningSession: (sid: string | null) => void;
  resetLive: () => void;
}

export const useRunStore = create<RunSlice>((set, get) => ({
  model: "",
  mode: "ask",

  runningSessionId: null,
  streamingTail: "",
  entries: [],
  statusLine: null,
  hydratedSessionId: null,

  approval: null,
  askModal: null,

  setModelMode: (model, mode) => set({ model, mode }),

  hydrateFromStored: (sessionId, messages) => {
    const incoming = entriesFromStoredMessages(messages);
    const { hydratedSessionId, runningSessionId, entries } = get();

    // Genuinely switching sessions: the previous transcript and any live
    // stream belong to a session we're leaving, so blow it all away.
    if (sessionId !== hydratedSessionId) {
      set({
        hydratedSessionId: sessionId,
        runningSessionId: null,
        streamingTail: "",
        approval: null,
        askModal: null,
        entries: incoming,
      });
      return;
    }

    // Same session re-read (watcher tick, lock change, post-run reload).
    // Our own run is mid-flight: the live event stream is authoritative and
    // disk is stale by a whole turn (agent-host persists only once the run
    // ends), so there is nothing to learn from disk here.
    if (runningSessionId === sessionId) return;

    const merged = mergeStoredIntoLive(entries, incoming);
    if (merged !== entries) set({ entries: merged });
  },

  pushUserEcho: (text) =>
    set((s) => ({ entries: [...s.entries, { kind: "user", text }] })),

  setStreamingTail: (streamingTail) => set({ streamingTail }),

  clearStreamingTail: () => set({ streamingTail: "" }),

  /** Final assistant turn from Reporter.assistantTurnEnd (replaces streamed tail). */
  commitAssistantDraft: () => {
    const t = get().streamingTail.trim();
    if (!t) return;
    set((s) => ({
      streamingTail: "",
      entries: [...s.entries, { kind: "assistant", text: t }],
    }));
  },

  finalizeAssistantTurn: (fullContent: string) =>
    set((s) => ({
      streamingTail: "",
      entries: [...s.entries, ...(fullContent.trim() ? [{ kind: "assistant", text: fullContent } as ChatPaneEntry] : [])],
    })),

  toolStart: (name, argsPreview) =>
    set((s) => ({
      entries: [...s.entries, { kind: "tool", name, argsPreview }],
    })),

  toolEnd: (name, result, isError) =>
    set((s) => {
      const next = [...s.entries];
      for (let i = next.length - 1; i >= 0; i--) {
        const e = next[i];
        if (e.kind === "tool" && e.name === name && e.result === undefined) {
          next[i] = { ...e, result, isError };
          return { entries: next };
        }
      }
      return s;
    }),

  sysLine: (text, tone = "warn") =>
    set((s) => ({
      entries: [...s.entries, { kind: "system", text, tone }],
    })),

  setApproval: (approval) => set({ approval }),
  setAskModal: (askModal) => set({ askModal }),

  setRunningSession: (runningSessionId) => set({ runningSessionId }),

  resetLive: () =>
    set({
      streamingTail: "",
      approval: null,
      askModal: null,
      statusLine: null,
    }),
}));

