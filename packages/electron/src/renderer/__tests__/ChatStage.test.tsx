import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import type { ListedSession } from "../ipc-client.js";
import type { BootstrapPayload } from "../../common/bootstrap-types.js";
import { ChatStage } from "../components/ChatStage.js";

const subs: Record<string, Array<(p: unknown) => void>> = {};

function wireWindowCcrMock() {
  vi.stubGlobal("ccr", {
    invoke: vi.fn(() => Promise.resolve({ ok: true })),
    bootstrap: (): Promise<BootstrapPayload> =>
      Promise.resolve({ auth: null, config: {}, defaultProjectRoot: "/tmp/desktop" }),
    subscribe: vi.fn((ch: string, cb: (p: unknown) => void) => {
      if (!subs[ch]) subs[ch] = [];
      subs[ch]!.push(cb);
      return () => {
        subs[ch] = (subs[ch] ?? []).filter((x) => x !== cb);
      };
    }),
  });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  Object.keys(subs).forEach((k) => delete subs[k]);
  wireWindowCcrMock();

  const { useSessionStore } = await import("../state/session-store.js");
  useSessionStore.setState({
    bootstrapDefaultProjectRoot: "/tmp",
    auth: null,
    config: {},
    quota: null,
    indexed: [],
    activeSessionPath: "/fake/s.json",
    activeSessionId: "sess",
    activeProjectRoot: "/proj",
    activeMessages: [{ role: "user", content: "hi" }],
    foreignLockPid: null,
    lastLoadError: null,
    hydrateBootstrap: vi.fn(async () => undefined),
    refreshIndex: vi.fn(async () => undefined),
    selectSessionPath: vi.fn(async () => undefined),
    patchLocalIndexed: vi.fn(() => undefined),
    subscribeSessionWatcher: () => vi.fn(() => undefined),
    setQuota: vi.fn(() => undefined),
  });

  const run = (await import("../state/run-store.js")).useRunStore;
  run.setState({
    model: "",
    mode: "ask",
    runningSessionId: null,
    streamingTail: "",
    entries: [{ kind: "user", text: "seed" }],
    statusLine: null,
    approval: null,
    askModal: null,
  });
});

afterEach(() => cleanup());

describe("ChatStage", () => {
  it("streaming tokens concatenate", () => {
    render(<ChatStage mode="ask" model="m" onQuotaPush={vi.fn()} />);

    subs["agent:token"]!.forEach((fn) => fn({ sessionId: "sess", token: "word" }));

    expect(screen.getByText(/word/)).toBeTruthy();

    subs["agent:tool-start"]!.forEach((fn) =>
      fn({ sessionId: "sess", name: "bash", argsPreview: "ls" }),
    );
    subs["agent:tool-end"]!.forEach((fn) =>
      fn({
        sessionId: "sess",
        name: "bash",
        result: "ERROR denied",
        isError: true,
      }),
    );
    expect(screen.getByText(/ERROR denied/)).toBeTruthy();

    subs["agent:approval-request"]!.forEach((fn) =>
      fn({
        sessionId: "sess",
        requestId: "r1",
        kind: "edit",
        title: "diff",
        detail: "--- a.txt\n+++ b.txt",
      }),
    );
    fireEvent.keyDown(window, { key: "y" });
    subs["agent:assistant-turn-end"]!.forEach((fn) =>
      fn({ sessionId: "sess", content: "final" }),
    );
    expect(screen.getByText("final")).toBeTruthy();
  });

  it("virtualization renders long lists without exploding", async () => {
    const rows = Array.from({ length: 520 }, (_, i) => ({
      kind: "user" as const,
      text: `bulk-${i}`,
    }));
    const run = (await import("../state/run-store.js")).useRunStore;
    run.setState({ entries: rows, streamingTail: "" });

    render(<ChatStage mode="ask" model="m" onQuotaPush={vi.fn()} />);
    expect(screen.getAllByText(/bulk-/).length).toBeGreaterThan(0);
  });
});
