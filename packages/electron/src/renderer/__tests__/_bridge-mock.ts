import { vi } from "vitest";
import { CHANNELS } from "../../common/ipc.js";

/**
 * Renderer-test helper. Stubs `window.ccr` with a minimal but
 * shape-correct CcrBridgeApi. Keeps a per-channel listener registry so
 * tests can drive push events:
 *
 *   const { fire } = installBridgeMock();
 *   render(<MyComponent />);
 *   fire(CHANNELS.agentToken, { sessionId: "x", token: "hi" });
 */
export function installBridgeMock(overrides: Record<string, unknown> = {}) {
  const subs: Record<string, Array<(p: unknown) => void>> = {};

  function subscribe(channel: string) {
    return (listener: (p: unknown) => void) => {
      if (!subs[channel]) subs[channel] = [];
      subs[channel]!.push(listener);
      return () => {
        subs[channel] = (subs[channel] ?? []).filter((l) => l !== listener);
      };
    };
  }

  const bridge = {
    bootstrap: vi.fn(() =>
      Promise.resolve({ auth: null, config: {}, defaultProjectRoot: "/tmp/desktop" }),
    ),
    startAgent: vi.fn(() =>
      Promise.resolve({ ok: true, sessionId: "test", startedAt: new Date().toISOString() }),
    ),
    abortAgent: vi.fn(() => Promise.resolve()),
    respondToApproval: vi.fn(() => Promise.resolve()),
    respondToAsk: vi.fn(() => Promise.resolve()),
    listSessions: vi.fn(() => Promise.resolve({ sessions: [] })),
    loadSession: vi.fn(() =>
      Promise.resolve({ id: "test", messages: [], projectRoot: null, foreignLockPid: null }),
    ),
    createSession: vi.fn(() => Promise.resolve({ sessionId: "test", sessionPath: "/test/test.json" })),
    takeoverLock: vi.fn(() => Promise.resolve({ ok: true })),
    saveSettings: vi.fn(() => Promise.resolve()),
    onAgentToken: subscribe(CHANNELS.agentToken),
    onAssistantTurnEnd: subscribe(CHANNELS.agentAssistantTurnEnd),
    onToolStart: subscribe(CHANNELS.agentToolStart),
    onToolEnd: subscribe(CHANNELS.agentToolEnd),
    onApprovalRequest: subscribe(CHANNELS.agentApprovalRequest),
    onAskRequest: subscribe(CHANNELS.agentAskRequest),
    onDone: subscribe(CHANNELS.agentDone),
    onStatus: subscribe(CHANNELS.agentStatus),
    onQuota: subscribe(CHANNELS.agentQuota),
    onError: subscribe(CHANNELS.agentError),
    onSessionEvent: subscribe(CHANNELS.sessionsEvent),
    ...overrides,
  };

  vi.stubGlobal("ccr", bridge);

  return {
    bridge,
    subs,
    fire(channel: string, payload: unknown) {
      for (const l of subs[channel] ?? []) l(payload);
    },
  };
}
