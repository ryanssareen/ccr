import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import type { ListedSession } from "../ipc-client.js";
import { CHANNELS } from "../../common/ipc.js";
import { ChatStage } from "../components/ChatStage.js";
import { installBridgeMock } from "./_bridge-mock.js";

let bridgeHandle: ReturnType<typeof installBridgeMock>;
let subs: Record<string, Array<(p: unknown) => void>>;

beforeEach(async () => {
  vi.restoreAllMocks();
  bridgeHandle = installBridgeMock();
  // Live ref into the helper's listener map. Channels populate lazily as
  // components subscribe, so reads inside test bodies see the registered
  // listeners after render().
  subs = bridgeHandle.subs;
  void CHANNELS; // referenced below

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
  // @tanstack/react-virtual measures DOM rect via ResizeObserver. jsdom returns
  // 0×0 for everything, so the virtualizer renders an empty list regardless
  // of state — making text-content assertions meaningless. Re-enable once we
  // ship a layout shim or move ChatStage to non-virtualized rendering at
  // small list sizes.
  it.skip("streaming tokens concatenate", () => {
    render(<ChatStage mode="ask" model="m" onPickModel={vi.fn()} onQuotaPush={vi.fn()} />);

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

  it.skip("virtualization renders long lists without exploding", async () => {
    const rows = Array.from({ length: 520 }, (_, i) => ({
      kind: "user" as const,
      text: `bulk-${i}`,
    }));
    const run = (await import("../state/run-store.js")).useRunStore;
    run.setState({ entries: rows, streamingTail: "" });

    render(<ChatStage mode="ask" model="m" onPickModel={vi.fn()} onQuotaPush={vi.fn()} />);
    expect(screen.getAllByText(/bulk-/).length).toBeGreaterThan(0);
  });
});
