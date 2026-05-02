import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatStage } from "../components/ChatStage.js";
import { installBridgeMock } from "./_bridge-mock.js";

beforeEach(async () => {
  installBridgeMock();

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
    render(<ChatStage mode="ask" model="m" onPickModel={() => undefined} onQuotaPush={() => undefined} />);
    expect(screen.getByText(/Locked · PID 4242/)).toBeTruthy();
  });
});
