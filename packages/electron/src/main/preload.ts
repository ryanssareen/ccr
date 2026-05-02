import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentAbortInput,
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
  CcrBridgeApi,
  Listener,
  Unsubscribe,
} from "../shared/ipc.js";
import { CHANNELS } from "../shared/ipc.js";

function subscribe<T>(channel: string, listener: Listener<T>): Unsubscribe {
  const wrapped = (_event: unknown, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.off(channel, wrapped);
  };
}

const api: CcrBridgeApi = {
  startAgent: (input: AgentStartInput) =>
    ipcRenderer.invoke(CHANNELS.agentStart, input) as Promise<AgentStartResult>,
  abortAgent: (input: AgentAbortInput) => ipcRenderer.invoke(CHANNELS.agentAbort, input),
  respondToApproval: (input: AgentApprovalResponseInput) =>
    ipcRenderer.invoke(CHANNELS.agentApprovalResponse, input),
  respondToAsk: (input: AgentAskResponseInput) => ipcRenderer.invoke(CHANNELS.agentAskResponse, input),
  onAgentToken: (listener: Listener<AgentTokenPayload>) => subscribe(CHANNELS.agentToken, listener),
  onAssistantTurnEnd: (listener: Listener<AgentAssistantTurnEndPayload>) =>
    subscribe(CHANNELS.agentAssistantTurnEnd, listener),
  onToolStart: (listener: Listener<AgentToolStartPayload>) =>
    subscribe(CHANNELS.agentToolStart, listener),
  onToolEnd: (listener: Listener<AgentToolEndPayload>) => subscribe(CHANNELS.agentToolEnd, listener),
  onApprovalRequest: (listener: Listener<AgentApprovalRequestPayload>) =>
    subscribe(CHANNELS.agentApprovalRequest, listener),
  onAskRequest: (listener: Listener<AgentAskRequestPayload>) =>
    subscribe(CHANNELS.agentAskRequest, listener),
  onDone: (listener: Listener<AgentDonePayload>) => subscribe(CHANNELS.agentDone, listener),
  onStatus: (listener: Listener<AgentStatusPayload>) => subscribe(CHANNELS.agentStatus, listener),
  onQuota: (listener: Listener<AgentQuotaPayload>) => subscribe(CHANNELS.agentQuota, listener),
  onError: (listener: Listener<AgentErrorPayload>) => subscribe(CHANNELS.agentError, listener),
};

contextBridge.exposeInMainWorld("ccr", api);
