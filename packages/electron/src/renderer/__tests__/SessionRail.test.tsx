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
    ...opts,
  };
}

afterEach(() => cleanup());

describe("SessionRail", () => {
  it("groups two projects sorted by newest project activity", async () => {
    const indexed: ListedSession[] = [
      mockSession({
        sessionPath: "/s/p1/old.json",
        sessionId: "old",
        projectRoot: "/tmp/a",
        updatedAt: 1,
      }),
      mockSession({
        sessionPath: "/s/p1/new.json",
        sessionId: "new-a",
        projectRoot: "/tmp/a",
        updatedAt: 999,
      }),
      mockSession({
        sessionPath: "/s/p2/x.json",
        sessionId: "b-only",
        projectRoot: "/tmp/b",
        updatedAt: 500,
      }),
    ];
    const onSelect = vi.fn();

    render(
      <SessionRail
        indexed={indexed}
        activeSessionPath={null}
        defaultProjectRoot="/tmp/proj"
        onSelect={(p) => onSelect(p)}
        onNewSession={vi.fn()}
      />,
    );

    const btn = screen.getByText(/new-a/).closest("button");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onSelect).toHaveBeenCalledWith(expect.stringContaining("new-a.json"));

    const headings = screen.getAllByText("Today");
    expect(headings.length).toBeGreaterThan(0);
  });

  it("empty state exposes new session CTA", () => {
    render(
      <SessionRail indexed={[]} activeSessionPath={null} defaultProjectRoot="/x" onSelect={vi.fn()} onNewSession={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /new session/i })).toBeTruthy();
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
      <SessionRail indexed={indexed} activeSessionPath={null} defaultProjectRoot="/fallback" onSelect={vi.fn()} onNewSession={vi.fn()} />,
    );
    const lockBtn = screen.getByRole("button", { name: /no-msgs/ });
    fireEvent.click(lockBtn);
  });
});
