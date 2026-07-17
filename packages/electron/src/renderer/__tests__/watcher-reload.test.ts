// Regression coverage for #17: a watcher-triggered reload of the *active*
// session used to replace the whole transcript from disk, wiping the optimistic
// user echo (which isn't persisted until the run ends) and killing live stream
// state mid-run. These drive the real session-store watcher subscription, so
// they cover the full chain: sessions:event -> debounce -> selectSessionPath ->
// hydrateFromStored.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNELS } from "../../common/ipc.js";
import { installBridgeMock } from "./_bridge-mock.js";
import { useRunStore } from "../state/run-store.js";
import { useSessionStore } from "../state/session-store.js";

interface Snap {
  id: string;
  messages: unknown[];
  projectRoot: string | null;
  foreignLockPid: number | null;
}

const PATH_A = "/sessions/proj/sess-a.json";
const PATH_B = "/sessions/proj/sess-b.json";

function snap(id: string, messages: unknown[]): Snap {
  return { id, messages, projectRoot: "/proj", foreignLockPid: null };
}

function userMsg(text: string) {
  return { role: "user", content: text };
}
function assistantMsg(text: string) {
  return { role: "assistant", content: text };
}

let disk: Record<string, Snap>;
let handle: ReturnType<typeof installBridgeMock>;
let unsubWatcher: () => void;

/** Texts of the user/assistant rows currently in the chat pane. */
function transcript(): string[] {
  return useRunStore
    .getState()
    .entries.map((e) => ("text" in e ? e.text : `tool:${e.name}`));
}

/** Fire a watcher event and let the 140ms debounce + its async reload settle. */
async function fireWatcher(payload: unknown) {
  handle.fire(CHANNELS.sessionsEvent, payload);
  await vi.advanceTimersByTimeAsync(400);
}

beforeEach(() => {
  vi.useFakeTimers();
  disk = {
    [PATH_A]: snap("sess-a", [userMsg("hi"), assistantMsg("hello")]),
    [PATH_B]: snap("sess-b", [userMsg("other session")]),
  };
  handle = installBridgeMock({
    loadSession: vi.fn((p: string) => {
      const s = disk[p];
      if (!s) return Promise.reject(new Error(`no such session ${p}`));
      // Hand back a copy — callers must not alias our fake disk.
      return Promise.resolve({ ...s, messages: [...s.messages] });
    }),
    listSessions: vi.fn(() => Promise.resolve({ sessions: [] })),
  });

  useRunStore.setState({
    runningSessionId: null,
    streamingTail: "",
    entries: [],
    hydratedSessionId: null,
    approval: null,
    askModal: null,
    statusLine: null,
  });
  useSessionStore.setState({
    activeSessionPath: null,
    activeSessionId: null,
    activeProjectRoot: null,
    activeMessages: null,
    foreignLockPid: null,
    lastLoadError: null,
    indexed: [],
  });

  unsubWatcher = useSessionStore.getState().subscribeSessionWatcher();
});

afterEach(async () => {
  unsubWatcher?.();
  // Drain any debounced work before restoring real timers.
  await vi.advanceTimersByTimeAsync(500);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("active-session watcher reload", () => {
  it("keeps the unpersisted user echo when the session file changes", async () => {
    await useSessionStore.getState().selectSessionPath(PATH_A);
    expect(transcript()).toEqual(["hi", "hello"]);

    // ChatStage.submit() optimistically echoes the user's message. It is NOT
    // on disk yet — agent-host only persists once the run finishes.
    useRunStore.getState().pushUserEcho("second message");
    expect(transcript()).toEqual(["hi", "hello", "second message"]);

    // The agent touches the session file (or takes the lock); the watcher
    // fires for the path we already have open. Disk still lacks the echo.
    await fireWatcher({ type: "session-changed", path: PATH_A });

    expect(transcript()).toEqual(["hi", "hello", "second message"]);
  });

  it("keeps the echo when the lock is acquired for the active session", async () => {
    await useSessionStore.getState().selectSessionPath(PATH_A);
    useRunStore.getState().pushUserEcho("second message");

    await fireWatcher({ type: "lock-acquired", sessionPath: PATH_A });

    expect(transcript()).toContain("second message");
  });

  it("does not clear streamingTail or runningSessionId on a mid-run tick", async () => {
    await useSessionStore.getState().selectSessionPath(PATH_A);
    useRunStore.getState().pushUserEcho("second message");
    useRunStore.getState().setRunningSession("sess-a");
    useRunStore.getState().setStreamingTail("partial answer so far");
    useRunStore.getState().toolStart("bash", "ls -la");

    await fireWatcher({ type: "session-changed", path: PATH_A });

    const st = useRunStore.getState();
    expect(st.streamingTail).toBe("partial answer so far");
    expect(st.runningSessionId).toBe("sess-a");
    // Tool cards are never re-rendered from disk, so a reload must not drop them.
    expect(transcript()).toEqual(["hi", "hello", "second message", "tool:bash"]);
  });

  it("still replaces the transcript when switching to a different session", async () => {
    await useSessionStore.getState().selectSessionPath(PATH_A);
    useRunStore.getState().pushUserEcho("second message");
    useRunStore.getState().setStreamingTail("stale stream");
    useRunStore.getState().setRunningSession("sess-a");

    await useSessionStore.getState().selectSessionPath(PATH_B);

    // A genuine switch drops the old session's live state entirely.
    expect(transcript()).toEqual(["other session"]);
    expect(useRunStore.getState().streamingTail).toBe("");
    expect(useRunStore.getState().runningSessionId).toBeNull();
    expect(useRunStore.getState().hydratedSessionId).toBe("sess-b");
  });

  it("picks up turns another window persisted to the active session", async () => {
    await useSessionStore.getState().selectSessionPath(PATH_A);
    expect(transcript()).toEqual(["hi", "hello"]);

    // Another window (holding the lock) appends a turn and saves.
    disk[PATH_A] = snap("sess-a", [
      userMsg("hi"),
      assistantMsg("hello"),
      userMsg("from the other window"),
      assistantMsg("reply from the other window"),
    ]);

    await fireWatcher({ type: "session-changed", path: PATH_A });

    expect(transcript()).toEqual([
      "hi",
      "hello",
      "from the other window",
      "reply from the other window",
    ]);
  });

  it("appends a foreign turn without dropping our own unpersisted echo", async () => {
    await useSessionStore.getState().selectSessionPath(PATH_A);
    useRunStore.getState().pushUserEcho("my echo");

    // Disk diverges from live: it has a turn we've never seen, and lacks ours.
    disk[PATH_A] = snap("sess-a", [
      userMsg("hi"),
      assistantMsg("hello"),
      userMsg("theirs"),
    ]);

    await fireWatcher({ type: "session-changed", path: PATH_A });

    // Live diverged from disk, so live wins — the echo must not vanish, and we
    // must not duplicate a turn we can't confidently order.
    expect(transcript()).toContain("my echo");
  });
});
