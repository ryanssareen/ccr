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

  approval: ApprovalUI | null;
  askModal: AskUI | null;

  setModelMode: (m: string, mode: DesktopMode) => void;
  /** Replace transcript + clear live stream when swapping sessions */
  hydrateFromStored: (_sessionId: string | null, messages: unknown[]) => void;
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

  approval: null,
  askModal: null,

  setModelMode: (model, mode) => set({ model, mode }),

  hydrateFromStored: (_sessionId, messages) =>
    set({
      runningSessionId: null,
      streamingTail: "",
      approval: null,
      askModal: null,
      entries: entriesFromStoredMessages(messages),
    }),

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

