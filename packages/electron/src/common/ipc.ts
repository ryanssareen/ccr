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
  sessionsTakeoverLock: "sessions:takeover-lock",
  sessionsEvent: "sessions:event",

  // settings
  settingsSave: "settings:save",
} as const;

// ─── Bootstrap ──────────────────────────────────────────────────────────────

export interface BootstrapPayload {
  auth: CcrAuth | null;
  config: CcrConfig;
  defaultProjectRoot: string;
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

// ─── Settings ───────────────────────────────────────────────────────────────

export type SettingsSaveInput = Partial<CcrConfig>;

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

  // settings
  saveSettings(input: SettingsSaveInput): Promise<void>;

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
