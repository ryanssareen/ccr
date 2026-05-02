import { create } from "zustand";
import type { QuotaState, SessionEvent } from "@ccr/core";
import type { CcrAuth, CcrConfig } from "@ccr/core";
import { ccrIpcClient, type ListedSession } from "../ipc-client.js";
import { useRunStore } from "./run-store.js";

function fileBasename(filepath: string): string {
  const parts = filepath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? filepath;
}

export interface ProjectGroup {
  key: string;
  displayName: string;
  projectRoot: string | null;
  projectIdHash: string;
  sessions: ListedSession[];
}

export function groupSessionsByProject(sessions: ListedSession[]): ProjectGroup[] {
  const map = new Map<string, ListedSession[]>();
  for (const s of sessions) {
    const keyRoot = s.projectRoot ?? `_hash:${s.projectIdHash}`;
    const bucket = map.get(keyRoot);
    if (bucket) bucket.push(s);
    else map.set(keyRoot, [s]);
  }
  const rows: ProjectGroup[] = [];
  for (const [key, sess] of map) {
    const sorted = [...sess].sort((a, b) => b.updatedAt - a.updatedAt);
    const pivot = sorted[0];
    rows.push({
      key,
      displayName:
        pivot.projectRoot === null ? `(${pivot.projectIdHash.slice(0, 8)}…)` : fileBasename(pivot.projectRoot),
      projectRoot: pivot.projectRoot,
      projectIdHash: pivot.projectIdHash,
      sessions: sorted,
    });
  }
  rows.sort(
    (a, b) => (b.sessions[0]?.updatedAt ?? 0) - (a.sessions[0]?.updatedAt ?? 0),
  );
  return rows;
}

export type DateSubgroup =
  | "Today"
  | "Yesterday"
  | "This week"
  | "This month"
  | "Older";

export function dateSubgroupLabel(ts: number): DateSubgroup {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ageDays = Math.floor((startOfToday - d.getTime()) / 86400000);
  if (ageDays <= 0) return "Today";
  if (ageDays === 1) return "Yesterday";
  if (ageDays <= 7) return "This week";
  if (ageDays <= 31) return "This month";
  return "Older";
}

type DebTimers = Map<string, ReturnType<typeof setTimeout>>;
const PATCH_DEBOUNCE_MS = 140;

interface SessionSlice {
  bootstrapDefaultProjectRoot: string;
  auth: CcrAuth | null;
  config: CcrConfig | null;
  quota: QuotaState | null;
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId: string;
  } | null;
  authEndpoint: string;

  indexed: ListedSession[];

  activeSessionPath: string | null;
  activeSessionId: string | null;
  activeProjectRoot: string | null;
  activeMessages: unknown[] | null;
  foreignLockPid: number | null;
  lastLoadError: string | null;

  setQuota: (q: QuotaState | null) => void;

  hydrateBootstrap: () => Promise<void>;
  refreshIndex: () => Promise<void>;
  selectSessionPath: (p: string) => Promise<void>;
  patchLocalIndexed: (row: ListedSession) => void;
  deleteSession: (p: string) => Promise<{ ok: boolean; error?: string }>;

  subscribeSessionWatcher: () => () => void;
}

const debouncers: DebTimers = new Map();

function schedulePatch(key: string, fn: () => void | Promise<void>) {
  const prev = debouncers.get(key);
  if (prev) clearTimeout(prev);
  debouncers.set(
    key,
    setTimeout(() => {
      debouncers.delete(key);
      void fn();
    }, PATCH_DEBOUNCE_MS),
  );
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export const useSessionStore = create<SessionSlice>((set, get) => ({
  bootstrapDefaultProjectRoot: "",
  auth: null,
  config: null,
  quota: null,
  firebaseConfig: null,
  authEndpoint: "",
  indexed: [],

  activeSessionPath: null,
  activeSessionId: null,
  activeProjectRoot: null,
  activeMessages: null,
  foreignLockPid: null,
  lastLoadError: null,

  setQuota: (q) => set({ quota: q }),

  hydrateBootstrap: async () => {
    const payload = await ccrIpcClient.bootstrap();
    set({
      auth: payload.auth,
      config: payload.config ?? {},
      bootstrapDefaultProjectRoot: payload.defaultProjectRoot,
      firebaseConfig: payload.firebaseConfig ?? null,
      authEndpoint: payload.authEndpoint ?? "",
    });
    await get().refreshIndex();
  },

  refreshIndex: async () => {
    const { sessions } = await ccrIpcClient.listSessions();
    set({ indexed: sessions });
  },

  patchLocalIndexed: (row) => {
    set((state) => {
      const rest = state.indexed.filter((s) => s.sessionPath !== row.sessionPath);
      return {
        indexed: [...rest, { ...row, foreignLockPid: row.foreignLockPid ?? null }].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
      };
    });
  },

  selectSessionPath: async (sessionPath: string) => {
    set({ lastLoadError: null });
    try {
      const snap = await ccrIpcClient.loadSession(sessionPath);
      const id = snap.id ?? fileBasename(sessionPath).replace(/\.json$/, "");
      const messages = Array.isArray(snap.messages) ? snap.messages : [];
      set({
        activeSessionPath: sessionPath,
        activeSessionId: id,
        activeProjectRoot: snap.projectRoot ?? null,
        activeMessages: messages,
        foreignLockPid: snap.foreignLockPid ?? null,
      });
      // Replay persisted transcript into the chat pane store so the
      // ChatStage shows the prior conversation instead of an empty pane.
      useRunStore.getState().hydrateFromStored(id, messages);
    } catch (e: any) {
      set({ lastLoadError: e?.message ?? String(e) });
    }
  },

  deleteSession: async (sessionPath: string) => {
    const res = await ccrIpcClient.deleteSession(sessionPath);
    if (!res.ok) return { ok: false, error: res.error };
    set((state) => {
      const wasActive =
        normalizePath(state.activeSessionPath ?? "") === normalizePath(sessionPath);
      return {
        indexed: state.indexed.filter(
          (s) => normalizePath(s.sessionPath) !== normalizePath(sessionPath),
        ),
        ...(wasActive
          ? {
              activeSessionPath: null,
              activeSessionId: null,
              activeProjectRoot: null,
              activeMessages: null,
              foreignLockPid: null,
            }
          : {}),
      };
    });
    return { ok: true };
  },

  subscribeSessionWatcher: () => {
    return ccrIpcClient.subscribeSessionEvent((evt: SessionEvent) => {
      const ap = get().activeSessionPath;
      const normAp = ap ? normalizePath(ap) : null;

      const refreshDebounced = () =>
        schedulePatch("__index_refresh", async () => {
          await get().refreshIndex();
        });

      refreshDebounced();

      if (evt.type === "session-changed" || evt.type === "session-removed") {
        const p = normalizePath(evt.path);
        if (normAp && p === normAp) {
          schedulePatch("__active_reload_" + normAp, () => get().selectSessionPath(ap!));
        }
        return;
      }

      if (evt.type === "lock-acquired" || evt.type === "lock-released") {
        const sp = normalizePath(evt.sessionPath);
        if (normAp && sp === normAp) {
          schedulePatch("__active_lock_reload_" + sp, () => get().selectSessionPath(ap!));
        }
      }
    });
  },
}));
