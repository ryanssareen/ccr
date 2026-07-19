import { create } from "zustand";
import type { QuotaState, SessionEvent } from "@ccr/core";
import type { CcrAuth, CcrConfig } from "@ccr/core";
import type { ProjectRootPickResult } from "../../common/ipc.js";
import { ccrIpcClient, type ListedSession } from "../ipc-client.js";
import { useRunStore } from "./run-store.js";

/**
 * Last segment of a path, or "" when the path has no segments (e.g. "/").
 *
 * Deliberately returns "" rather than echoing the input back: a filesystem
 * root has no basename, and the old `?? filepath` fallback is what rendered
 * bare "/" labels in the session rail (issue #19). Callers decide what to
 * show for the empty case.
 */
export function fileBasename(filepath: string): string {
  const parts = filepath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * Human label for a project group.
 *
 * Never invents a project name: a root we can't name is reported as unknown
 * rather than guessed at. The two degenerate cases both come from issue #19 —
 * sessions the packaged app rooted at "/" before the root-resolution fix, and
 * legacy sessions written before projectRoot was persisted (root === null).
 * The hash is retained for null roots purely to keep distinct unknown
 * projects distinguishable from one another in the rail.
 */
function projectDisplayName(projectRoot: string | null, projectIdHash: string): string {
  if (projectRoot === null) return `Unknown project (${projectIdHash.slice(0, 8)})`;
  return fileBasename(projectRoot) || "Filesystem root";
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
      displayName: projectDisplayName(pivot.projectRoot, pivot.projectIdHash),
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
  /**
   * The root new sessions default to. Seeded by bootstrap, then kept in step
   * with main's live root by pickProjectRoot() — a pick must not need a
   * restart to show up here (issue #21).
   */
  bootstrapDefaultProjectRoot: string;
  /**
   * True when the packaged app is running on a $HOME fallback the user never
   * chose. Drives the first-run prompt; cleared once they answer either way.
   */
  needsProjectRootChoice: boolean;
  /** @ccr/core's DEFAULT_MODEL, forwarded over IPC (the renderer can't import core). */
  bootstrapDefaultModel: string;
  /** Installed app version (`app.getVersion()`), from bootstrap. */
  appVersion: string;
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
  /** Opens the native folder picker; main validates, persists, and goes live. */
  pickProjectRoot: () => Promise<ProjectRootPickResult>;
  /** Dismiss the first-run prompt without picking — $HOME stays the root. */
  dismissProjectRootPrompt: () => void;
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
  needsProjectRootChoice: false,
  bootstrapDefaultModel: "",
  appVersion: "",
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
      needsProjectRootChoice: payload.needsProjectRootChoice ?? false,
      bootstrapDefaultModel: payload.defaultModel ?? "",
      appVersion: payload.appVersion ?? "",
      firebaseConfig: payload.firebaseConfig ?? null,
      authEndpoint: payload.authEndpoint ?? "",
    });
    await get().refreshIndex();
  },

  pickProjectRoot: async () => {
    const result = await ccrIpcClient.pickProjectRoot();
    // Only a successful pick moves anything. A cancel leaves the root, the
    // config, and the prompt exactly as they were.
    if (result.ok) {
      set((state) => ({
        bootstrapDefaultProjectRoot: result.projectRoot,
        config: { ...(state.config ?? {}), projectRoot: result.projectRoot },
        needsProjectRootChoice: false,
      }));
    }
    return result;
  },

  dismissProjectRootPrompt: () => set({ needsProjectRootChoice: false }),

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
