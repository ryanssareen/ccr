// Single source of truth for the main↔renderer IPC contract. Imported by:
// main process (registers handlers + sends), preload (exposes bridge),
// renderer (typed ipc-client wrappers + components/state).
import type {
  CcrAuth,
  CcrConfig,
  QuotaState,
  SessionEvent,
  SessionIndexEntry,
} from "@ccr/core";

// ─── Channel constants ──────────────────────────────────────────────────────

export const CHANNELS = {
  // bootstrap
  bootstrap: "bootstrap:state",

  // agent lifecycle
  agentStart: "agent:start",
  agentAbort: "agent:abort",
  agentToken: "agent:token",
  agentAssistantTurnEnd: "agent:assistant-turn-end",
  agentToolStart: "agent:tool-start",
  agentToolEnd: "agent:tool-end",
  agentApprovalRequest: "agent:approval-request",
  agentApprovalResponse: "agent:approval-response",
  agentAskRequest: "agent:ask-request",
  agentAskResponse: "agent:ask-response",
  agentDone: "agent:done",
  agentStatus: "agent:status",
  agentQuota: "agent:quota",
  agentError: "agent:error",

  // session io
  sessionsList: "sessions:list",
  sessionsLoad: "sessions:load",
  sessionsCreate: "sessions:create",
  sessionsDelete: "sessions:delete",
  sessionsTakeoverLock: "sessions:takeover-lock",
  sessionsEvent: "sessions:event",

  // settings
  settingsSave: "settings:save",

  // dialogs (main-only — Electron's dialog module is not reachable from the
  // renderer bundle, so the picker has to round-trip through main)
  dialogPickProjectRoot: "dialog:pick-project-root",

  // auth (in-app login)
  authSave: "auth:save",
  authClear: "auth:clear",

  // file upload
  fileRead: "file:read",

  // app / updates
  appCheckUpdate: "app:check-update",
  appOpenExternal: "app:open-external",
} as const;

// ─── Bootstrap ──────────────────────────────────────────────────────────────

export interface BootstrapPayload {
  auth: CcrAuth | null;
  config: CcrConfig;
  defaultProjectRoot: string;
  /**
   * True when the app is packaged *and* no usable `projectRoot` is pinned in
   * config — i.e. `defaultProjectRoot` is the $HOME fallback the user never
   * chose (issue #21). The renderer uses this to prompt on first run rather
   * than silently rooting a Finder-launched app at the home folder.
   *
   * False in dev: `cwd` is the repo, which is the root a developer wants.
   */
  needsProjectRootChoice: boolean;
  /**
   * `@ccr/core`'s DEFAULT_MODEL, forwarded from main. The renderer can't
   * import core directly (it pulls in node-only session/agent modules that
   * won't bundle), so the default has to arrive over IPC rather than as a
   * fourth hand-copied literal.
   */
  defaultModel: string;
  /**
   * Public Firebase web config used by the renderer to drive the in-app
   * sign-in flow. Mirrors the website's NEXT_PUBLIC_FIREBASE_* env vars.
   * Empty strings when the desktop app is built without auth credentials.
   */
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId: string;
  };
  /** Proxy endpoint used for /api/v1/exchangeFirebaseToken. */
  authEndpoint: string;
  /** Installed app version (`app.getVersion()`), shown in Settings and used
   * as the baseline for the update check. */
  appVersion: string;
}

export interface AuthSaveInput {
  /** Firebase ID token returned by the JS SDK after sign-in. */
  idToken: string;
  email: string;
}

export interface AuthSaveResult {
  ok: boolean;
  error?: string;
  auth?: CcrAuth;
}

export interface FileReadInput {
  path: string;
  /** Cap file size to keep agent context healthy. Default 64 KiB. */
  maxBytes?: number;
}

export interface FileReadResult {
  ok: boolean;
  path?: string;
  basename?: string;
  content?: string;
  truncated?: boolean;
  error?: string;
}

// ─── Agent ──────────────────────────────────────────────────────────────────

export type AgentMode = "ask" | "accept-edits" | "bypass";

export interface AgentStartInput {
  sessionId: string;
  model: string;
  mode: AgentMode;
  text: string;
  projectRoot?: string;
}

export type AgentStartResult =
  | { ok: true; sessionId: string; startedAt: string }
  | { ok: false; error: string; lockPid?: number };

export interface AgentAbortInput {
  sessionId: string;
}

export interface AgentApprovalResponseInput {
  requestId: string;
  approved: boolean;
}

export interface AskQuestionPayload {
  question: string;
  options: string[];
}

export interface AgentAskResponseInput {
  requestId: string;
  answers: Array<{ answer: string }>;
}

export interface AgentTokenPayload {
  sessionId: string;
  token: string;
}

export interface AgentAssistantTurnEndPayload {
  sessionId: string;
  content: string;
}

export interface AgentToolStartPayload {
  sessionId: string;
  name: string;
  argsPreview: string;
}

export interface AgentToolEndPayload {
  sessionId: string;
  name: string;
  result: string;
  isError: boolean;
}

export interface AgentApprovalRequestPayload {
  sessionId: string;
  requestId: string;
  kind: "edit" | "bash";
  title: string;
  detail: string;
}

export interface AgentAskRequestPayload {
  sessionId: string;
  requestId: string;
  questions: AskQuestionPayload[];
}

export interface AgentDonePayload {
  sessionId: string;
}

export interface AgentStatusPayload {
  sessionId: string;
  text: string | null;
}

export interface AgentQuotaPayload {
  used: number;
  limit: number;
  resetAt: string;
}

export interface AgentErrorPayload {
  sessionId: string;
  message: string;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

/**
 * Session row as displayed in the renderer's session rail. Augments
 * core's SessionIndexEntry with the live foreign-lock state populated
 * by the main process at list-time.
 */
export interface ListedSession extends SessionIndexEntry {
  /** Live owner pid of <session>.lock when held by another process. null when free. */
  foreignLockPid: number | null;
  /**
   * Human-friendly session title derived from the first user message,
   * truncated. Falls back to the sessionId for empty / new sessions.
   */
  title: string;
}

export interface SessionsListResult {
  sessions: ListedSession[];
}

export interface SessionsLoadResult {
  id: string;
  messages: any[];
  projectRoot: string | null;
  foreignLockPid: number | null;
}

export interface SessionsCreateInput {
  projectRoot: string;
}

export interface SessionsCreateResult {
  sessionId: string;
  sessionPath: string;
}

export type SessionsTakeoverLockResult =
  | { ok: true }
  | { ok: false; error: string; pid?: number };

export type SessionsDeleteResult =
  | { ok: true }
  | { ok: false; error: string; pid?: number };

// ─── Settings ───────────────────────────────────────────────────────────────

export type SettingsSaveInput = Partial<CcrConfig>;

// ─── Project root picker ────────────────────────────────────────────────────

/**
 * Outcome of `dialog:pick-project-root`.
 *
 * The three cases are kept distinct because the renderer treats them
 * differently: a cancel is not an error and must leave everything alone
 * (issue #21), whereas a rejected pick — "/" being the one that matters —
 * has to say why.
 */
export type ProjectRootPickResult =
  | { ok: true; projectRoot: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string };

// ─── App / updates ──────────────────────────────────────────────────────────

/**
 * Outcome of `app:check-update` — a GitHub-Releases lookup, not an installer.
 *
 * The desktop builds are unsigned (see packages/electron/RELEASING.md), so
 * macOS won't let an updater self-install them. Instead the app checks the
 * repo's latest `desktop-v*` release and, when it's newer, points the user at
 * the release page to download the DMG themselves.
 */
export interface UpdateCheckResult {
  /** False only when the check itself failed (offline, GitHub error). */
  ok: boolean;
  /** The running version, always echoed back. */
  current: string;
  /** Latest published desktop version (`x.y.z`), when a release was found. */
  latest?: string;
  /** True when `latest` is strictly newer than `current`. */
  updateAvailable?: boolean;
  /** GitHub Release page for `latest` — where the installers live. */
  releaseUrl?: string;
  /** ISO timestamp the latest release was published. */
  publishedAt?: string;
  /** Present when `ok` is false. */
  error?: string;
}

export interface OpenExternalResult {
  ok: boolean;
  error?: string;
}

// ─── Renderer-bound payloads (main → renderer push channels) ────────────────

export interface MainToRendererPayloads {
  [CHANNELS.agentToken]: AgentTokenPayload;
  [CHANNELS.agentAssistantTurnEnd]: AgentAssistantTurnEndPayload;
  [CHANNELS.agentToolStart]: AgentToolStartPayload;
  [CHANNELS.agentToolEnd]: AgentToolEndPayload;
  [CHANNELS.agentApprovalRequest]: AgentApprovalRequestPayload;
  [CHANNELS.agentAskRequest]: AgentAskRequestPayload;
  [CHANNELS.agentDone]: AgentDonePayload;
  [CHANNELS.agentStatus]: AgentStatusPayload;
  [CHANNELS.agentQuota]: AgentQuotaPayload;
  [CHANNELS.agentError]: AgentErrorPayload;
  [CHANNELS.sessionsEvent]: SessionEvent;
}

export type MainToRendererChannel = keyof MainToRendererPayloads;
export type Listener<T> = (payload: T) => void;
export type Unsubscribe = () => void;

// ─── Bridge contract ────────────────────────────────────────────────────────

/**
 * Surface preload exposes to the renderer via contextBridge as `window.ccr`.
 * Renderer code never references electron/ipcRenderer directly.
 */
export interface CcrBridgeApi {
  // bootstrap
  bootstrap(): Promise<BootstrapPayload>;

  // agent
  startAgent(input: AgentStartInput): Promise<AgentStartResult>;
  abortAgent(input: AgentAbortInput): Promise<void>;
  respondToApproval(input: AgentApprovalResponseInput): Promise<void>;
  respondToAsk(input: AgentAskResponseInput): Promise<void>;

  // sessions
  listSessions(): Promise<SessionsListResult>;
  loadSession(sessionPath: string): Promise<SessionsLoadResult>;
  createSession(input: SessionsCreateInput): Promise<SessionsCreateResult>;
  takeoverLock(sessionPath: string): Promise<SessionsTakeoverLockResult>;
  deleteSession(sessionPath: string): Promise<SessionsDeleteResult>;

  // settings
  saveSettings(input: SettingsSaveInput): Promise<void>;

  /**
   * Opens the OS directory picker, validates and persists the choice, and
   * makes it the live default root — no restart. Resolves to the new root on
   * success. Main owns validation; the renderer never sees an unvetted path.
   */
  pickProjectRoot(): Promise<ProjectRootPickResult>;

  // auth (in-app login)
  saveAuthFromFirebase(input: AuthSaveInput): Promise<AuthSaveResult>;
  clearAuth(): Promise<void>;

  // file upload (read attached file from disk)
  readFile(input: FileReadInput): Promise<FileReadResult>;

  // app / updates
  /** Check GitHub Releases for a newer desktop version. */
  checkForUpdate(): Promise<UpdateCheckResult>;
  /** Open an allowlisted https URL (the release page) in the OS browser. */
  openExternal(url: string): Promise<OpenExternalResult>;

  // push streams (main → renderer)
  onAgentToken(listener: Listener<AgentTokenPayload>): Unsubscribe;
  onAssistantTurnEnd(listener: Listener<AgentAssistantTurnEndPayload>): Unsubscribe;
  onToolStart(listener: Listener<AgentToolStartPayload>): Unsubscribe;
  onToolEnd(listener: Listener<AgentToolEndPayload>): Unsubscribe;
  onApprovalRequest(listener: Listener<AgentApprovalRequestPayload>): Unsubscribe;
  onAskRequest(listener: Listener<AgentAskRequestPayload>): Unsubscribe;
  onDone(listener: Listener<AgentDonePayload>): Unsubscribe;
  onStatus(listener: Listener<AgentStatusPayload>): Unsubscribe;
  onQuota(listener: Listener<AgentQuotaPayload>): Unsubscribe;
  onError(listener: Listener<AgentErrorPayload>): Unsubscribe;
  onSessionEvent(listener: Listener<SessionEvent>): Unsubscribe;
}

export type { CcrAuth, CcrConfig, QuotaState, SessionEvent, SessionIndexEntry };
