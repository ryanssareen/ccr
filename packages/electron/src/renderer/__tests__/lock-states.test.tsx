import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatStage } from "../components/ChatStage.js";

const subs: Record<string, Array<(p: unknown) => void>> = {};

beforeEach(async () => {
  Object.keys(subs).forEach((k) => delete subs[k]);
  vi.stubGlobal("ccr", {
    invoke: vi.fn(() => Promise.resolve({ ok: true })),
    bootstrap: () => Promise.resolve({ auth: null, config: {}, defaultProjectRoot: "/tmp" }),
    subscribe: vi.fn((ch: string, cb: (p: unknown) => void) => {
      if (!subs[ch]) subs[ch] = [];
      subs[ch]!.push(cb);
      return () => undefined;
    }),
  });

  const { useSessionStore } = await import("../state/session-store.js");
  useSessionStore.setState({
    bootstrapDefaultProjectRoot: "/tmp",
    auth: null,
    config: {},
    quota: null,
    indexed: [],
    activeSessionPath: "/l.json",
    activeSessionId: "l",
    activeProjectRoot: "/p",
    activeMessages: [],
    foreignLockPid: 4242,
    lastLoadError: null,
    hydrateBootstrap: vi.fn(),
    refreshIndex: vi.fn(),
    selectSessionPath: vi.fn(),
    patchLocalIndexed: vi.fn(),
    subscribeSessionWatcher: () => () => undefined,
    setQuota: vi.fn(),
  });

  const run = (await import("../state/run-store.js")).useRunStore;
  run.setState({ entries: [], streamingTail: "", approval: null });
});

afterEach(() => cleanup());

describe("Lock-aware chat shell", () => {
  it("shows read-only hint when PID is alive elsewhere", () => {
    render(<ChatStage mode="ask" model="m" onQuotaPush={() => undefined} />);
    expect(screen.getByText(/Read-only mirror/)).toBeTruthy();
    expect(screen.getByText(/4242/)).toBeTruthy();
  });
});
