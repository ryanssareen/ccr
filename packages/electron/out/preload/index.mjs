import { contextBridge, ipcRenderer } from "electron";
const CHANNELS = {
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
  settingsSave: "settings:save"
};
function invoke(channel, arg) {
  return ipcRenderer.invoke(channel, arg);
}
function subscribe(channel, listener) {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
const api = {
  bootstrap: () => invoke(CHANNELS.bootstrap),
  startAgent: (input) => invoke(CHANNELS.agentStart, input),
  abortAgent: (input) => invoke(CHANNELS.agentAbort, input),
  respondToApproval: (input) => invoke(CHANNELS.agentApprovalResponse, input),
  respondToAsk: (input) => invoke(CHANNELS.agentAskResponse, input),
  listSessions: () => invoke(CHANNELS.sessionsList),
  loadSession: (sessionPath) => invoke(CHANNELS.sessionsLoad, sessionPath),
  createSession: (input) => invoke(CHANNELS.sessionsCreate, input),
  takeoverLock: (sessionPath) => invoke(CHANNELS.sessionsTakeoverLock, sessionPath),
  saveSettings: (input) => invoke(CHANNELS.settingsSave, input),
  onAgentToken: (listener) => subscribe(CHANNELS.agentToken, listener),
  onAssistantTurnEnd: (listener) => subscribe(CHANNELS.agentAssistantTurnEnd, listener),
  onToolStart: (listener) => subscribe(CHANNELS.agentToolStart, listener),
  onToolEnd: (listener) => subscribe(CHANNELS.agentToolEnd, listener),
  onApprovalRequest: (listener) => subscribe(CHANNELS.agentApprovalRequest, listener),
  onAskRequest: (listener) => subscribe(CHANNELS.agentAskRequest, listener),
  onDone: (listener) => subscribe(CHANNELS.agentDone, listener),
  onStatus: (listener) => subscribe(CHANNELS.agentStatus, listener),
  onQuota: (listener) => subscribe(CHANNELS.agentQuota, listener),
  onError: (listener) => subscribe(CHANNELS.agentError, listener),
  onSessionEvent: (listener) => subscribe(CHANNELS.sessionsEvent, listener)
};
contextBridge.exposeInMainWorld("ccr", api);
