import { contextBridge, ipcRenderer } from "electron";
import {
  CHANNELS,
  type AgentAbortInput,
  type AgentApprovalResponseInput,
  type AgentAskResponseInput,
  type AgentStartInput,
  type AgentStartResult,
  type BootstrapPayload,
  type CcrBridgeApi,
  type Listener,
  type SessionsCreateInput,
  type SessionsCreateResult,
  type SessionsListResult,
  type SessionsLoadResult,
  type SessionsTakeoverLockResult,
  type SettingsSaveInput,
  type Unsubscribe,
} from "../common/ipc.js";

function invoke<T>(channel: string, arg?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, arg) as Promise<T>;
}

function subscribe<T>(channel: string, listener: Listener<T>): Unsubscribe {
  const handler = (_event: unknown, payload: unknown) => listener(payload as T);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: CcrBridgeApi = {
  bootstrap: () => invoke<BootstrapPayload>(CHANNELS.bootstrap),

  startAgent: (input: AgentStartInput) =>
    invoke<AgentStartResult>(CHANNELS.agentStart, input),
  abortAgent: (input: AgentAbortInput) => invoke<void>(CHANNELS.agentAbort, input),
  respondToApproval: (input: AgentApprovalResponseInput) =>
    invoke<void>(CHANNELS.agentApprovalResponse, input),
  respondToAsk: (input: AgentAskResponseInput) =>
    invoke<void>(CHANNELS.agentAskResponse, input),

  listSessions: () => invoke<SessionsListResult>(CHANNELS.sessionsList),
  loadSession: (sessionPath: string) =>
    invoke<SessionsLoadResult>(CHANNELS.sessionsLoad, sessionPath),
  createSession: (input: SessionsCreateInput) =>
    invoke<SessionsCreateResult>(CHANNELS.sessionsCreate, input),
  takeoverLock: (sessionPath: string) =>
    invoke<SessionsTakeoverLockResult>(CHANNELS.sessionsTakeoverLock, sessionPath),

  saveSettings: (input: SettingsSaveInput) =>
    invoke<void>(CHANNELS.settingsSave, input),

  onAgentToken: (listener) => subscribe(CHANNELS.agentToken, listener),
  onAssistantTurnEnd: (listener) =>
    subscribe(CHANNELS.agentAssistantTurnEnd, listener),
  onToolStart: (listener) => subscribe(CHANNELS.agentToolStart, listener),
  onToolEnd: (listener) => subscribe(CHANNELS.agentToolEnd, listener),
  onApprovalRequest: (listener) =>
    subscribe(CHANNELS.agentApprovalRequest, listener),
  onAskRequest: (listener) => subscribe(CHANNELS.agentAskRequest, listener),
  onDone: (listener) => subscribe(CHANNELS.agentDone, listener),
  onStatus: (listener) => subscribe(CHANNELS.agentStatus, listener),
  onQuota: (listener) => subscribe(CHANNELS.agentQuota, listener),
  onError: (listener) => subscribe(CHANNELS.agentError, listener),
  onSessionEvent: (listener) => subscribe(CHANNELS.sessionsEvent, listener),
};

contextBridge.exposeInMainWorld("ccr", api);
