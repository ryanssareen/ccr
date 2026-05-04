// Renderer-side typed wrapper over `window.ccr` (the contextBridge surface).
// All renderer code routes through this — no direct window.ccr access in
// components/state, no string channel names in callers.
import type {
  AgentApprovalRequestPayload,
  AgentApprovalResponseInput,
  AgentAskRequestPayload,
  AgentAskResponseInput,
  AgentAssistantTurnEndPayload,
  AgentDonePayload,
  AgentErrorPayload,
  AgentQuotaPayload,
  AgentStartInput,
  AgentStartResult,
  AgentStatusPayload,
  AgentTokenPayload,
  AgentToolEndPayload,
  AgentToolStartPayload,
  AuthSaveInput,
  AuthSaveResult,
  BootstrapPayload,
  CcrBridgeApi,
  FileReadInput,
  FileReadResult,
  Listener,
  ListedSession,
  SessionEvent,
  SessionsCreateInput,
  SessionsCreateResult,
  SessionsDeleteResult,
  SessionsListResult,
  SessionsLoadResult,
  SessionsTakeoverLockResult,
  SettingsSaveInput,
  Unsubscribe,
} from "../common/ipc.js";

function bridge(): CcrBridgeApi {
  if (typeof window === "undefined" || !window.ccr) {
    throw new Error(
      "CCR bridge was not found on window. Either preload script failed to load, or this code is running outside Electron's renderer.",
    );
  }
  return window.ccr;
}

/**
 * Canonical client used by components and state. Methods are grouped by
 * area: bootstrap → agent → sessions → settings → subscribe* push streams.
 * Subscriptions return an Unsubscribe function.
 */
export const ccrIpcClient = {
  // bootstrap
  bootstrap: (): Promise<BootstrapPayload> => bridge().bootstrap(),

  // agent control
  startAgent: (input: AgentStartInput): Promise<AgentStartResult> =>
    bridge().startAgent(input),
  abortAgent: (sessionId: string): Promise<void> =>
    bridge().abortAgent({ sessionId }),
  approvalResponse: (requestId: string, approved: boolean): Promise<void> =>
    bridge().respondToApproval({ requestId, approved }),
  askResponse: (
    requestId: string,
    answers: AgentAskResponseInput["answers"],
  ): Promise<void> => bridge().respondToAsk({ requestId, answers }),

  // sessions
  listSessions: (): Promise<SessionsListResult> => bridge().listSessions(),
  loadSession: (sessionPath: string): Promise<SessionsLoadResult> =>
    bridge().loadSession(sessionPath),
  createSession: (input: SessionsCreateInput): Promise<SessionsCreateResult> =>
    bridge().createSession(input),
  takeoverLock: (
    sessionPath: string,
    _sessionIdHint?: string,
  ): Promise<SessionsTakeoverLockResult> => bridge().takeoverLock(sessionPath),
  deleteSession: (sessionPath: string): Promise<SessionsDeleteResult> =>
    bridge().deleteSession(sessionPath),

  // settings
  saveSettings: (input: SettingsSaveInput): Promise<void> =>
    bridge().saveSettings(input),

  // auth (in-app login)
  saveAuthFromFirebase: (input: AuthSaveInput): Promise<AuthSaveResult> =>
    bridge().saveAuthFromFirebase(input),
  clearAuth: (): Promise<void> => bridge().clearAuth(),

  // file read
  readFile: (input: FileReadInput): Promise<FileReadResult> =>
    bridge().readFile(input),

  // push streams
  subscribeAgentTokens: (listener: Listener<AgentTokenPayload>): Unsubscribe =>
    bridge().onAgentToken(listener),
  subscribeAgentAssistantEnd: (
    listener: Listener<AgentAssistantTurnEndPayload>,
  ): Unsubscribe => bridge().onAssistantTurnEnd(listener),
  subscribeToolStart: (listener: Listener<AgentToolStartPayload>): Unsubscribe =>
    bridge().onToolStart(listener),
  subscribeToolEnd: (listener: Listener<AgentToolEndPayload>): Unsubscribe =>
    bridge().onToolEnd(listener),
  subscribeApprovalRequest: (
    listener: Listener<AgentApprovalRequestPayload>,
  ): Unsubscribe => bridge().onApprovalRequest(listener),
  subscribeAskRequest: (
    listener: Listener<AgentAskRequestPayload>,
  ): Unsubscribe => bridge().onAskRequest(listener),
  subscribeAgentDone: (listener: Listener<AgentDonePayload>): Unsubscribe =>
    bridge().onDone(listener),
  subscribeAgentStatus: (listener: Listener<AgentStatusPayload>): Unsubscribe =>
    bridge().onStatus(listener),
  subscribeAgentQuota: (listener: Listener<AgentQuotaPayload>): Unsubscribe =>
    bridge().onQuota(listener),
  subscribeAgentError: (listener: Listener<AgentErrorPayload>): Unsubscribe =>
    bridge().onError(listener),
  subscribeSessionEvent: (listener: Listener<SessionEvent>): Unsubscribe =>
    bridge().onSessionEvent(listener),
};

/**
 * Legacy alias — older code uses `ipcClient` with renamed methods. Kept
 * for the original App.tsx; new code uses ccrIpcClient.
 */
export const ipcClient = {
  start: ccrIpcClient.startAgent,
  abort: (input: { sessionId: string }) => ccrIpcClient.abortAgent(input.sessionId),
  respondToApproval: (input: AgentApprovalResponseInput) =>
    ccrIpcClient.approvalResponse(input.requestId, input.approved),
  respondToAsk: (input: AgentAskResponseInput) =>
    ccrIpcClient.askResponse(input.requestId, input.answers),
  onToken: ccrIpcClient.subscribeAgentTokens,
  onAssistantTurnEnd: ccrIpcClient.subscribeAgentAssistantEnd,
  onToolStart: ccrIpcClient.subscribeToolStart,
  onToolEnd: ccrIpcClient.subscribeToolEnd,
  onApprovalRequest: ccrIpcClient.subscribeApprovalRequest,
  onAskRequest: ccrIpcClient.subscribeAskRequest,
  onDone: ccrIpcClient.subscribeAgentDone,
  onStatus: ccrIpcClient.subscribeAgentStatus,
  onQuota: ccrIpcClient.subscribeAgentQuota,
  onError: ccrIpcClient.subscribeAgentError,
};

export type { ListedSession };
