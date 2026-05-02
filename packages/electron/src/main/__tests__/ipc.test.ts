import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentHost } from "../agent-host.js";
import { createIpcClient } from "../../renderer/ipc-client.js";
import { registerIpcHandlers, type IpcMainLike, type WebContentsLike } from "../ipc.js";
import type {
  AgentApprovalResponseInput,
  AgentAskResponseInput,
  AgentStartInput,
  CcrBridgeApi,
} from "../../shared/ipc.js";
import { CHANNELS } from "../../shared/ipc.js";

describe("desktop IPC wiring", () => {
  it("round-trips start(...) from the renderer bridge through ipcMain.handle", async () => {
    const ipcMain = new MockIpcMain();
    const hostCalls: Array<{ sender: WebContentsLike; input: AgentStartInput }> = [];
    const host = {
      start: async (sender: WebContentsLike, input: AgentStartInput) => {
        hostCalls.push({ sender, input });
        return { sessionId: input.sessionId, startedAt: "2026-05-02T00:00:00.000Z" };
      },
      abort: async () => {},
      respondToApproval: async () => {},
      respondToAsk: async () => {},
    } as unknown as AgentHost;

    registerIpcHandlers(ipcMain, host);
    const bridge = createBridge(ipcMain);
    const client = createIpcClient(bridge);

    const result = await client.start({
      sessionId: "ipc-smoke",
      model: "openai/gpt-oss-120b",
      mode: "ask",
      text: "hi",
    });

    assert.deepEqual(result, {
      sessionId: "ipc-smoke",
      startedAt: "2026-05-02T00:00:00.000Z",
    });
    assert.equal(hostCalls.length, 1);
    assert.equal(hostCalls[0].input.sessionId, "ipc-smoke");
  });

  it("stops invoking token listeners after unsubscribe", () => {
    const bridge = createEventOnlyBridge();
    const client = createIpcClient(bridge.api);
    const seen: string[] = [];

    const unsubscribe = client.onToken(({ token }) => {
      seen.push(token);
    });

    bridge.emitToken({ sessionId: "s1", token: "first" });
    unsubscribe();
    bridge.emitToken({ sessionId: "s1", token: "second" });

    assert.deepEqual(seen, ["first"]);
  });
});

class MockIpcMain implements IpcMainLike {
  private readonly handlers = new Map<string, (event: any, payload: unknown) => unknown | Promise<unknown>>();
  readonly sender: WebContentsLike = {
    send: () => {},
  };

  handle(channel: string, listener: (event: any, payload: unknown) => unknown | Promise<unknown>): void {
    this.handlers.set(channel, listener);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  async invoke(channel: string, payload: unknown) {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No handler registered for ${channel}`);
    return handler({ sender: this.sender }, payload);
  }
}

function createBridge(ipcMain: MockIpcMain): CcrBridgeApi {
  const onNothing = () => () => {};
  return {
    startAgent: (input) => ipcMain.invoke(CHANNELS.agentStart, input) as any,
    abortAgent: (input) => ipcMain.invoke(CHANNELS.agentAbort, input) as any,
    respondToApproval: (input: AgentApprovalResponseInput) =>
      ipcMain.invoke(CHANNELS.agentApprovalResponse, input) as any,
    respondToAsk: (input: AgentAskResponseInput) => ipcMain.invoke(CHANNELS.agentAskResponse, input) as any,
    onAgentToken: onNothing,
    onAssistantTurnEnd: onNothing,
    onToolStart: onNothing,
    onToolEnd: onNothing,
    onApprovalRequest: onNothing,
    onAskRequest: onNothing,
    onDone: onNothing,
    onStatus: onNothing,
    onQuota: onNothing,
    onError: onNothing,
  };
}

function createEventOnlyBridge() {
  const tokenListeners = new Set<(payload: { sessionId: string; token: string }) => void>();
  const noopAsync = async () => {};

  return {
    api: {
      startAgent: async () => ({ sessionId: "unused", startedAt: "unused" }),
      abortAgent: noopAsync,
      respondToApproval: noopAsync,
      respondToAsk: noopAsync,
      onAgentToken(listener) {
        tokenListeners.add(listener);
        return () => {
          tokenListeners.delete(listener);
        };
      },
      onAssistantTurnEnd: () => () => {},
      onToolStart: () => () => {},
      onToolEnd: () => () => {},
      onApprovalRequest: () => () => {},
      onAskRequest: () => () => {},
      onDone: () => () => {},
      onStatus: () => () => {},
      onQuota: () => () => {},
      onError: () => () => {},
    } satisfies CcrBridgeApi,
    emitToken(payload: { sessionId: string; token: string }) {
      for (const listener of tokenListeners) listener(payload);
    },
  };
}
