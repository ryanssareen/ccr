// Renderer-test environment shims. jsdom doesn't ship ResizeObserver, and
// no preload runs there so window.ccr is undefined. Components / state
// that touch the bridge call the no-op default below; tests that exercise
// real IPC behavior override `window.ccr` themselves via vi.stubGlobal.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined" && !(window as any).ResizeObserver) {
  (window as any).ResizeObserver = NoopResizeObserver;
}
if (typeof globalThis !== "undefined" && !(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = NoopResizeObserver;
}

// jsdom doesn't ship Element.scrollIntoView. cmdk's internals call it on
// the active option as the user navigates the palette — without this,
// cmdk-driven tests crash on Enter / arrow keys.
if (typeof window !== "undefined" && !(window.HTMLElement.prototype as any).scrollIntoView) {
  (window.HTMLElement.prototype as any).scrollIntoView = function () {};
}

// Default no-op bridge so components that call `bridge()` at mount don't
// throw in tests that don't care about IPC. Tests that need a real
// bridge override via vi.stubGlobal("ccr", { ... }).
function noop(): never {
  throw new Error(
    "window.ccr was called from a renderer test that didn't stub the bridge. Use vi.stubGlobal('ccr', { ... }) in the test setup.",
  );
}

const noopUnsub = () => () => {};

if (typeof window !== "undefined" && !(window as any).ccr) {
  (window as any).ccr = {
    bootstrap: () =>
      Promise.resolve({
        auth: null,
        config: {},
        defaultProjectRoot: "/test",
        firebaseConfig: {
          apiKey: "",
          authDomain: "",
          projectId: "",
          appId: "",
        },
        authEndpoint: "",
      }),
    startAgent: () => Promise.resolve({ sessionId: "test", startedAt: new Date().toISOString() }),
    abortAgent: () => Promise.resolve(),
    respondToApproval: () => Promise.resolve(),
    respondToAsk: () => Promise.resolve(),
    listSessions: () => Promise.resolve({ sessions: [] }),
    loadSession: () =>
      Promise.resolve({ id: "test", messages: [], projectRoot: null, foreignLockPid: null }),
    createSession: () => Promise.resolve({ sessionId: "test", sessionPath: "/test/test.json" }),
    takeoverLock: () => Promise.resolve({ ok: true }),
    deleteSession: () => Promise.resolve({ ok: true }),
    saveSettings: () => Promise.resolve(),
    saveAuthFromFirebase: () => Promise.resolve({ ok: false, error: "stub" }),
    clearAuth: () => Promise.resolve(),
    readFile: () => Promise.resolve({ ok: false, error: "stub" }),
    onAgentToken: noopUnsub,
    onAssistantTurnEnd: noopUnsub,
    onToolStart: noopUnsub,
    onToolEnd: noopUnsub,
    onApprovalRequest: noopUnsub,
    onAskRequest: noopUnsub,
    onDone: noopUnsub,
    onStatus: noopUnsub,
    onQuota: noopUnsub,
    onError: noopUnsub,
    onSessionEvent: noopUnsub,
  };
}

// Reset DOM between tests so ProjectGroup state doesn't leak.
afterEach(() => {
  cleanup();
});

export {};
