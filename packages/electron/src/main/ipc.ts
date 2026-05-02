// Main-process IPC handlers. Wires renderer invokes (`ipcMain.handle`) and
// push events (`webContents.send`) for every channel in common/ipc.ts.
//
// Boundary contract:
//   - All payload types come from ../common/ipc.ts (single source of truth).
//   - Handlers delegate work to AgentHost (agent flow) or @ccr/core (session
//     io, lock takeover, settings) — no fs/process logic inline.
//   - Session-watcher events are broadcast from registerSessionWatcher() so
//     every open BrowserWindow receives them.
import os from "node:os";
import path from "node:path";
import {
  acquireLock,
  configPath,
  listSessionsIndex,
  loadSessionByPath,
  newSessionId,
  readLock,
  saveConfig,
  sessionPath as coreSessionPath,
  watchSessions,
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
  type ListedSession,
  type MainToRendererChannel,
  type MainToRendererPayloads,
  type SessionsCreateInput,
  type SessionsCreateResult,
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

async function buildSessionsList(): Promise<SessionsListResult> {
  const entries = await listSessionsIndex();
  const sessions: ListedSession[] = await Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      foreignLockPid: await readForeignLockPid(entry.sessionPath),
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
  loadConfigOnce: () => Promise<{ groqApiKey?: string; model?: string }>;
}

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

  ipcMain.handle(CHANNELS.sessionsCreate, (_event, payload): SessionsCreateResult => {
    const input = (payload as SessionsCreateInput) ?? { projectRoot: options.defaultProjectRoot() };
    const root = input.projectRoot || options.defaultProjectRoot();
    const id = newSessionId();
    return {
      sessionId: id,
      sessionPath: coreSessionPath(root, id),
    };
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

  // ─── settings ─────────────────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.settingsSave, async (_event, payload) => {
    const incoming = (payload as SettingsSaveInput) ?? {};
    const current = await options.loadConfigOnce();
    await saveConfig({ ...current, ...incoming });
    void configPath; // suppress unused-import warning if added later
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
      CHANNELS.sessionsTakeoverLock,
      CHANNELS.settingsSave,
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
