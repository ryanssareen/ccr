// Issue #21: the renderer half of the project-folder picker. Covers the rail
// trigger reaching the IPC channel, and the store's live update — after a pick
// the rail must show the new root without a restart, which means the store
// can't wait for the next bootstrap to learn about it.
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRootPickResult } from "../../common/ipc.js";
import { SessionRail } from "../components/SessionRail.js";
import { useSessionStore } from "../state/session-store.js";
import { installBridgeMock } from "./_bridge-mock.js";

const HOME = "/Users/ryan";
const PROJECT = "/Users/ryan/Documents/ccr-npm";

function resetStore() {
  useSessionStore.setState({
    bootstrapDefaultProjectRoot: HOME,
    needsProjectRootChoice: true,
    config: { model: "keep-me" },
    indexed: [],
  });
}

afterEach(() => cleanup());

describe("SessionRail project-root trigger", () => {
  beforeEach(() => resetStore());

  it("renders a Change trigger that invokes the pick channel", async () => {
    const handle = installBridgeMock({
      pickProjectRoot: vi.fn(
        (): Promise<ProjectRootPickResult> =>
          Promise.resolve({ ok: true, projectRoot: PROJECT }),
      ),
    });

    render(
      <SessionRail
        indexed={[]}
        activeSessionPath={null}
        defaultProjectRoot={HOME}
        onSelect={vi.fn()}
        onNewSession={vi.fn()}
        onPickProjectRoot={() => useSessionStore.getState().pickProjectRoot().then(() => {})}
      />,
    );

    const trigger = screen.getByRole("button", { name: /change project folder/i });
    fireEvent.click(trigger);

    // The rail must reach the main-process dialog — the renderer has no
    // access to Electron's dialog module itself.
    await waitFor(() => expect(handle.bridge.pickProjectRoot).toHaveBeenCalledTimes(1));
  });

  it("omits the trigger when no handler is supplied", () => {
    installBridgeMock();
    render(
      <SessionRail
        indexed={[]}
        activeSessionPath={null}
        defaultProjectRoot={HOME}
        onSelect={vi.fn()}
        onNewSession={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /change project folder/i })).toBeNull();
  });

  it("still renders the current root next to the trigger", () => {
    installBridgeMock();
    render(
      <SessionRail
        indexed={[]}
        activeSessionPath={null}
        defaultProjectRoot={HOME}
        onSelect={vi.fn()}
        onNewSession={vi.fn()}
        onPickProjectRoot={vi.fn()}
      />,
    );
    expect(screen.getByText(HOME)).toBeTruthy();
  });
});

describe("session-store pickProjectRoot", () => {
  beforeEach(() => resetStore());

  it("updates the default root live — no restart, no rehydrate", async () => {
    installBridgeMock({
      pickProjectRoot: vi.fn(
        (): Promise<ProjectRootPickResult> =>
          Promise.resolve({ ok: true, projectRoot: PROJECT }),
      ),
    });

    expect(useSessionStore.getState().bootstrapDefaultProjectRoot).toBe(HOME);

    const result = await useSessionStore.getState().pickProjectRoot();

    expect(result).toEqual({ ok: true, projectRoot: PROJECT });
    // bootstrap is not called again — the pick's return value is what moves it.
    expect(useSessionStore.getState().bootstrapDefaultProjectRoot).toBe(PROJECT);
    expect(useSessionStore.getState().needsProjectRootChoice).toBe(false);
  });

  it("mirrors the new root into config without dropping other settings", async () => {
    installBridgeMock({
      pickProjectRoot: vi.fn(
        (): Promise<ProjectRootPickResult> =>
          Promise.resolve({ ok: true, projectRoot: PROJECT }),
      ),
    });

    await useSessionStore.getState().pickProjectRoot();

    expect(useSessionStore.getState().config).toEqual({
      model: "keep-me",
      projectRoot: PROJECT,
    });
  });

  it("cancelling changes nothing", async () => {
    installBridgeMock({
      pickProjectRoot: vi.fn(
        (): Promise<ProjectRootPickResult> => Promise.resolve({ ok: false, canceled: true }),
      ),
    });

    const result = await useSessionStore.getState().pickProjectRoot();

    expect(result).toEqual({ ok: false, canceled: true });
    expect(useSessionStore.getState().bootstrapDefaultProjectRoot).toBe(HOME);
    expect(useSessionStore.getState().config).toEqual({ model: "keep-me" });
    // Still unanswered — a cancel must not count as a decision.
    expect(useSessionStore.getState().needsProjectRootChoice).toBe(true);
  });

  it("a rejected pick leaves the root alone and surfaces the reason", async () => {
    installBridgeMock({
      pickProjectRoot: vi.fn(
        (): Promise<ProjectRootPickResult> =>
          Promise.resolve({ ok: false, error: '"/" is not a usable project folder.' }),
      ),
    });

    const result = await useSessionStore.getState().pickProjectRoot();

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/not a usable project folder/);
    expect(useSessionStore.getState().bootstrapDefaultProjectRoot).toBe(HOME);
    expect(useSessionStore.getState().needsProjectRootChoice).toBe(true);
  });

  it("hydrateBootstrap carries needsProjectRootChoice through", async () => {
    installBridgeMock({
      bootstrap: vi.fn(() =>
        Promise.resolve({
          auth: null,
          config: {},
          defaultProjectRoot: HOME,
          needsProjectRootChoice: true,
          defaultModel: "m",
          firebaseConfig: { apiKey: "", authDomain: "", projectId: "", appId: "" },
          authEndpoint: "",
        }),
      ),
    });

    useSessionStore.setState({ needsProjectRootChoice: false });
    await useSessionStore.getState().hydrateBootstrap();

    expect(useSessionStore.getState().needsProjectRootChoice).toBe(true);
    expect(useSessionStore.getState().bootstrapDefaultProjectRoot).toBe(HOME);
  });

  it("dismissing the prompt keeps the $HOME fallback — it's a legitimate answer", () => {
    useSessionStore.getState().dismissProjectRootPrompt();
    expect(useSessionStore.getState().needsProjectRootChoice).toBe(false);
    expect(useSessionStore.getState().bootstrapDefaultProjectRoot).toBe(HOME);
  });
});
