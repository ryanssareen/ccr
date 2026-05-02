// Main-process IPC handlers. Wires renderer invokes (`ipcMain.handle`) and
// push events (`webContents.send`) for every channel in common/ipc.ts.
//
// Boundary contract:
//   - All payload types come from ../common/ipc.ts (single source of truth).
//   - Handlers delegate work to AgentHost (agent flow) or @ccr/core (session
//     io, lock takeover, settings) — no fs/process logic inline.
//   - Session-watcher events are broadcast from registerSessionWatcher() so
//     every open BrowserWindow receives them.
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  acquireLock,
  authPath,
  clearAuth as coreClearAuth,
  configPath,
  listSessionsIndex,
  loadSessionByPath,
  newSessionId,
  readLock,
  saveAuth,
  saveConfig,
  saveSession,
  sessionPath as coreSessionPath,
  watchSessions,
  type CcrAuth,
  type LockOwnedElsewhereError,
  type SessionEvent,
} from "@ccr/core";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import {
  CHANNELS,
  type AgentAbortInput,
  type AgentApprovalResponseInput,
  type AgentAskResponseInput,
  type AgentStartInput,
  type AuthSaveInput,
  type AuthSaveResult,
  type FileReadInput,
  type FileReadResult,
  type ListedSession,
  type MainToRendererChannel,
  type MainToRendererPayloads,
  type SessionsCreateInput,
  type SessionsCreateResult,
  type SessionsDeleteResult,
  type SessionsListResult,
  type SessionsLoadResult,
  type SessionsTakeoverLockResult,
  type SettingsSaveInput,
} from "../common/ipc.js";
import { AgentHost } from "./agent-host.js";

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, payload: unknown) => unknown | Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

export interface WebContentsLike {
  send<K extends MainToRendererChannel>(channel: K, payload: MainToRendererPayloads[K]): void;
  isDestroyed?(): boolean;
}

export function createRendererSender(webContents: WebContents | WebContentsLike): WebContentsLike {
  return {
    send<K extends MainToRendererChannel>(
      channel: K,
      payload: MainToRendererPayloads[K],
    ): void {
      if (typeof webContents.isDestroyed === "function" && webContents.isDestroyed()) return;
      webContents.send(channel, payload as never);
    },
  };
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return false;
  }
}

async function readForeignLockPid(sessionPathAbs: string): Promise<number | null> {
  const lock = await readLock(sessionPathAbs).catch(() => null);
  if (!lock) return null;
  if (lock.host !== os.hostname()) return null;
  if (lock.pid === process.pid) return null;
  return isPidAlive(lock.pid) ? lock.pid : null;
}

/**
 * Pull a friendly title out of a session JSON: the first user message
 * trimmed and truncated. Falls back to the sessionId for empty sessions.
 */
async function deriveTitle(sessionPathAbs: string, sessionId: string): Promise<string> {
  try {
    const text = await fs.readFile(sessionPathAbs, "utf8");
    const data = JSON.parse(text) as { messages?: unknown[] };
    if (Array.isArray(data.messages)) {
      for (const m of data.messages) {
        const row = m as { role?: unknown; content?: unknown };
        if (row.role !== "user") continue;
        const c = row.content;
        const raw = typeof c === "string" ? c : "";
        const cleaned = raw.replace(/\s+/g, " ").trim();
        if (!cleaned) continue;
        return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned;
      }
    }
  } catch {
    // ignore — fall through
  }
  return sessionId;
}

async function buildSessionsList(): Promise<SessionsListResult> {
  const entries = await listSessionsIndex();
  const sessions: ListedSession[] = await Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      foreignLockPid: await readForeignLockPid(entry.sessionPath),
      title: await deriveTitle(entry.sessionPath, entry.sessionId),
    })),
  );
  return { sessions };
}

async function buildSessionLoad(sessionPathAbs: string): Promise<SessionsLoadResult> {
  const data = await loadSessionByPath(sessionPathAbs);
  return {
    id: data.id,
    messages: data.messages,
    projectRoot: data.projectRoot ?? null,
    foreignLockPid: await readForeignLockPid(sessionPathAbs),
  };
}

export interface RegisterIpcOptions {
  /** Returns the resolved project root used when creating sessions without one. */
  defaultProjectRoot: () => string;
  /** Where renderer settings:save calls should land. */
  loadConfigOnce: () => Promise<import("@ccr/core").CcrConfig>;
  /** Public Firebase config used by the renderer login flow. */
  firebaseConfig: () => {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId: string;
  };
  /** Proxy endpoint used to mint a CCR token from a Firebase ID token. */
  authEndpoint: () => string;
}

const DEFAULT_FILE_READ_BYTES = 64 * 1024;
const MAX_FILE_READ_BYTES = 256 * 1024;

/**
 * Registers all renderer↔main handlers. Returns a dispose function the app
 * lifecycle should call on `will-quit`.
 */
export function registerIpcHandlers(
  ipcMain: IpcMainLike,
  host: AgentHost,
  options: RegisterIpcOptions,
): () => void {
  // ─── bootstrap ────────────────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.bootstrap, async () => {
    const [{ loadAuth }, { loadConfig }] = await Promise.all([
      import("@ccr/core"),
      import("@ccr/core"),
    ]);
    const [auth, config] = await Promise.all([loadAuth(), loadConfig()]);
    return {
      auth,
      config: config ?? {},
      defaultProjectRoot: options.defaultProjectRoot(),
      firebaseConfig: options.firebaseConfig(),
      authEndpoint: options.authEndpoint(),
    };
  });

  // ─── agent flow ───────────────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.agentStart, (event, payload) =>
    host.start(createRendererSender(event.sender), payload as AgentStartInput),
  );
  ipcMain.handle(CHANNELS.agentAbort, (_event, payload) =>
    host.abort(payload as AgentAbortInput),
  );
  ipcMain.handle(CHANNELS.agentApprovalResponse, (_event, payload) =>
    host.respondToApproval(payload as AgentApprovalResponseInput),
  );
  ipcMain.handle(CHANNELS.agentAskResponse, (_event, payload) =>
    host.respondToAsk(payload as AgentAskResponseInput),
  );

  // ─── sessions ─────────────────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.sessionsList, () => buildSessionsList());

  ipcMain.handle(CHANNELS.sessionsLoad, (_event, payload) => {
    if (typeof payload !== "string") throw new Error("sessions:load expects a string path");
    return buildSessionLoad(payload);
  });

  ipcMain.handle(CHANNELS.sessionsCreate, async (_event, payload): Promise<SessionsCreateResult> => {
    const input = (payload as SessionsCreateInput) ?? { projectRoot: options.defaultProjectRoot() };
    const root = input.projectRoot || options.defaultProjectRoot();
    const id = newSessionId();
    const sp = coreSessionPath(root, id);
    // Pre-create the file so loadSession works immediately and so the
    // watcher emits a session-changed event the rail can pick up.
    await saveSession(root, id, []);
    return { sessionId: id, sessionPath: sp };
  });

  ipcMain.handle(CHANNELS.sessionsTakeoverLock, async (_event, payload): Promise<SessionsTakeoverLockResult> => {
    if (typeof payload !== "string") {
      return { ok: false, error: "sessions:takeover-lock expects a string path" };
    }
    try {
      const lock = await readLock(payload);
      const sessionId = lock?.sessionId ?? path.basename(payload, ".json");
      await acquireLock(payload, sessionId);
      return { ok: true };
    } catch (err) {
      if ((err as LockOwnedElsewhereError)?.name === "LockOwnedElsewhereError") {
        const lockErr = err as LockOwnedElsewhereError;
        return {
          ok: false,
          error: `Foreign lock is still alive. Close that window first.`,
          pid: lockErr.pid,
        };
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(CHANNELS.sessionsDelete, async (_event, payload): Promise<SessionsDeleteResult> => {
    if (typeof payload !== "string" || !payload) {
      return { ok: false, error: "sessions:delete expects a session path." };
    }
    const sessionPathAbs = payload;
    const livePid = await readForeignLockPid(sessionPathAbs);
    if (livePid) {
      return {
        ok: false,
        error: "Another window is using this session. Close it first or take it over.",
        pid: livePid,
      };
    }
    try {
      await fs.unlink(sessionPathAbs).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
      });
      const lockPath = sessionPathAbs.replace(/\.json$/, "") + ".lock";
      await fs.unlink(lockPath).catch(() => {
        // best-effort — stale lock without a session is fine
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // ─── settings ─────────────────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.settingsSave, async (_event, payload) => {
    const incoming = (payload as SettingsSaveInput) ?? {};
    const current = await options.loadConfigOnce();
    await saveConfig({ ...current, ...incoming });
    void configPath; // suppress unused-import warning if added later
  });

  // ─── auth (in-app login) ──────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.authSave, async (_event, payload): Promise<AuthSaveResult> => {
    const input = payload as AuthSaveInput;
    if (!input?.idToken || typeof input.idToken !== "string") {
      return { ok: false, error: "Missing Firebase ID token." };
    }
    const endpoint = options.authEndpoint();
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/v1/exchangeFirebaseToken`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: input.idToken }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: `Token exchange failed (${res.status}). ${text}`.trim() };
      }
      const data = (await res.json()) as { token?: string; email?: string };
      if (!data?.token) return { ok: false, error: "Exchange endpoint returned no token." };

      const auth: CcrAuth = {
        token: data.token,
        endpoint,
        email: data.email ?? input.email ?? "",
      };
      await saveAuth(auth);
      void authPath;
      return { ok: true, auth };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(CHANNELS.authClear, async () => {
    await coreClearAuth();
  });

  // ─── file read (for chat attachment) ──────────────────────────────────────
  ipcMain.handle(CHANNELS.fileRead, async (_event, payload): Promise<FileReadResult> => {
    const input = (payload ?? {}) as FileReadInput;
    if (!input.path || typeof input.path !== "string") {
      return { ok: false, error: "Missing path." };
    }
    const cap = Math.min(
      Math.max(input.maxBytes ?? DEFAULT_FILE_READ_BYTES, 1024),
      MAX_FILE_READ_BYTES,
    );
    try {
      const stat = await fs.stat(input.path);
      const size = stat.size;
      const fh = await fs.open(input.path, "r");
      try {
        const len = Math.min(size, cap);
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, 0);
        const content = buf.toString("utf8");
        return {
          ok: true,
          path: input.path,
          basename: path.basename(input.path),
          content,
          truncated: size > cap,
        };
      } finally {
        await fh.close();
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  return () => {
    for (const channel of [
      CHANNELS.bootstrap,
      CHANNELS.agentStart,
      CHANNELS.agentAbort,
      CHANNELS.agentApprovalResponse,
      CHANNELS.agentAskResponse,
      CHANNELS.sessionsList,
      CHANNELS.sessionsLoad,
      CHANNELS.sessionsCreate,
      CHANNELS.sessionsDelete,
      CHANNELS.sessionsTakeoverLock,
      CHANNELS.settingsSave,
      CHANNELS.authSave,
      CHANNELS.authClear,
      CHANNELS.fileRead,
    ]) {
      ipcMain.removeHandler(channel);
    }
  };
}

// ─── Session watcher ────────────────────────────────────────────────────────

const SESSIONS_DIR = path.join(os.homedir(), ".ccr", "sessions");

export interface BroadcastTarget {
  send(channel: string, payload: unknown): void;
}

/**
 * Start a single chokidar watcher on ~/.ccr/sessions/ and forward typed
 * SessionEvents to every renderer registered via the broadcaster. Returns
 * a dispose function to stop watching.
 */
export function registerSessionWatcher(
  getWindows: () => readonly BroadcastTarget[],
): () => Promise<void> {
  const watcher = watchSessions(SESSIONS_DIR, (evt: SessionEvent) => {
    for (const wc of getWindows()) {
      try {
        wc.send(CHANNELS.sessionsEvent, evt);
      } catch {
        // best-effort — don't let a dead webContents break the watcher
      }
    }
  });
  return async () => {
    await watcher.close();
  };
}
