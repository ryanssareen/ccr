import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListedSession } from "../ipc-client.js";
import { SessionRail } from "../components/SessionRail.js";

vi.stubGlobal("alert", vi.fn());

function mockSession(opts: Partial<ListedSession> & Pick<ListedSession, "sessionPath" | "sessionId">): ListedSession {
  return {
    projectIdHash: "abcdef012345",
    projectRoot: "/tmp/proj-a",
    updatedAt: Date.now(),
    messageCount: 0,
    foreignLockPid: null,
    title: opts.sessionId,
    ...opts,
  };
}

afterEach(() => cleanup());

describe("SessionRail", () => {
  it("shows the current project's sessions and folds other projects away", async () => {
    const now = Date.now();
    const indexed: ListedSession[] = [
      mockSession({
        sessionPath: "/s/p1/old.json",
        sessionId: "old",
        projectRoot: "/tmp/a",
        updatedAt: now - 1000,
      }),
      mockSession({
        sessionPath: "/s/p1/new-a.json",
        sessionId: "new-a",
        projectRoot: "/tmp/a",
        updatedAt: now,
      }),
      mockSession({
        sessionPath: "/s/p2/x.json",
        sessionId: "b-only",
        projectRoot: "/tmp/b",
        updatedAt: now - 500,
      }),
    ];
    const onSelect = vi.fn();

    render(
      <SessionRail
        indexed={indexed}
        activeSessionPath={null}
        // The current project is the one new sessions default into; its
        // sessions are shown expanded, everything else is tucked away.
        defaultProjectRoot="/tmp/a"
        onSelect={(p) => onSelect(p)}
        onNewSession={vi.fn()}
      />,
    );

    // Current-project session is visible and selectable.
    const btn = screen.getByText(/new-a/).closest("button");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onSelect).toHaveBeenCalledWith(expect.stringContaining("new-a.json"));

    // Sessions are bucketed by date.
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);

    // The other project starts folded, then reveals its sessions on click.
    expect(screen.queryByText(/b-only/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /other projects/i }));
    expect(screen.getByText(/b-only/)).toBeTruthy();
  });

  it("empty state exposes new session CTA", () => {
    render(
      <SessionRail indexed={[]} activeSessionPath={null} defaultProjectRoot="/x" onSelect={vi.fn()} onNewSession={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /new session/i })).toBeTruthy();
  });

  it("search narrows the visible sessions", () => {
    const indexed = [
      mockSession({ sessionPath: "/s/a/one.json", sessionId: "one", projectRoot: "/tmp/a", title: "fix the flicker" }),
      mockSession({ sessionPath: "/s/a/two.json", sessionId: "two", projectRoot: "/tmp/a", title: "write the docs" }),
    ];
    render(
      <SessionRail
        indexed={indexed}
        activeSessionPath={null}
        defaultProjectRoot="/tmp/a"
        query="flick"
        onQueryChange={vi.fn()}
        onSelect={vi.fn()}
        onNewSession={vi.fn()}
      />,
    );
    expect(screen.getByText(/flicker/)).toBeTruthy();
    expect(screen.queryByText(/docs/)).toBeNull();
  });

  it("placeholder session renders without exploding", () => {
    const indexed = [
      mockSession({
        sessionPath: "/s/p1/ghost.json",
        sessionId: "ghost",
        projectRoot: "/tmp/a",
      }),
      mockSession({
        sessionPath: "/s/unset.json",
        sessionId: "no-msgs",
        projectRoot: null,
        foreignLockPid: 42,
      }),
    ];
    render(
      <SessionRail indexed={indexed} activeSessionPath={null} defaultProjectRoot="/tmp/a" onSelect={vi.fn()} onNewSession={vi.fn()} />,
    );
    // The null-root (locked) session lives under "Other projects".
    fireEvent.click(screen.getByRole("button", { name: /other projects/i }));
    const lockBtn = screen.getByRole("button", { name: /no-msgs/ });
    fireEvent.click(lockBtn);
  });
});
