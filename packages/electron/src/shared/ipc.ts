export const CHANNELS = {
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
} as const;

export type AgentMode = "ask" | "accept-edits" | "bypass";

export interface AgentStartInput {
  sessionId: string;
  model: string;
  mode: AgentMode;
  text: string;
}

export interface AgentStartResult {
  sessionId: string;
  startedAt: string;
}

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
}

export type MainToRendererChannel = keyof MainToRendererPayloads;
export type Listener<T> = (payload: T) => void;
export type Unsubscribe = () => void;

export interface CcrBridgeApi {
  startAgent(input: AgentStartInput): Promise<AgentStartResult>;
  abortAgent(input: AgentAbortInput): Promise<void>;
  respondToApproval(input: AgentApprovalResponseInput): Promise<void>;
  respondToAsk(input: AgentAskResponseInput): Promise<void>;
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
}
