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

function resolveBridge(explicit?: CcrBridgeApi): CcrBridgeApi {
  if (explicit) return explicit;
  if (!window.ccr) {
    throw new Error("CCR bridge was not found on window. Check the preload script.");
  }
  return window.ccr;
}

export function createIpcClient(explicitBridge?: CcrBridgeApi) {
  return {
    start(input: AgentStartInput): Promise<AgentStartResult> {
      return resolveBridge(explicitBridge).startAgent(input);
    },
    abort(input: AgentAbortInput): Promise<void> {
      return resolveBridge(explicitBridge).abortAgent(input);
    },
    respondToApproval(input: AgentApprovalResponseInput): Promise<void> {
      return resolveBridge(explicitBridge).respondToApproval(input);
    },
    respondToAsk(input: AgentAskResponseInput): Promise<void> {
      return resolveBridge(explicitBridge).respondToAsk(input);
    },
    onToken(listener: Listener<AgentTokenPayload>): Unsubscribe {
      return resolveBridge(explicitBridge).onAgentToken(listener);
    },
    onAssistantTurnEnd(listener: Listener<AgentAssistantTurnEndPayload>): Unsubscribe {
      return resolveBridge(explicitBridge).onAssistantTurnEnd(listener);
    },
    onToolStart(listener: Listener<AgentToolStartPayload>): Unsubscribe {
      return resolveBridge(explicitBridge).onToolStart(listener);
    },
    onToolEnd(listener: Listener<AgentToolEndPayload>): Unsubscribe {
      return resolveBridge(explicitBridge).onToolEnd(listener);
    },
    onApprovalRequest(listener: Listener<AgentApprovalRequestPayload>): Unsubscribe {
      return resolveBridge(explicitBridge).onApprovalRequest(listener);
    },
    onAskRequest(listener: Listener<AgentAskRequestPayload>): Unsubscribe {
      return resolveBridge(explicitBridge).onAskRequest(listener);
    },
    onDone(listener: Listener<AgentDonePayload>): Unsubscribe {
      return resolveBridge(explicitBridge).onDone(listener);
    },
    onStatus(listener: Listener<AgentStatusPayload>): Unsubscribe {
      return resolveBridge(explicitBridge).onStatus(listener);
    },
    onQuota(listener: Listener<AgentQuotaPayload>): Unsubscribe {
      return resolveBridge(explicitBridge).onQuota(listener);
    },
    onError(listener: Listener<AgentErrorPayload>): Unsubscribe {
      return resolveBridge(explicitBridge).onError(listener);
    },
  };
}

export const ipcClient = createIpcClient();
