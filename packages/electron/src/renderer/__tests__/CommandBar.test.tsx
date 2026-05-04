import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListedSession } from "../ipc-client.js";
import { CommandBar } from "../components/CommandBar.js";

afterEach(() => cleanup());

const row = (id: string, path: string, root = "/p"): ListedSession => ({
  sessionId: id,
  sessionPath: path,
  projectIdHash: "abcabcabcabc",
  projectRoot: root,
  updatedAt: Date.now(),
  messageCount: 0,
  foreignLockPid: null,
  title: id,
});

describe("CommandBar (cmdk)", () => {
  it("filters by typing and Enter selects first item", async () => {
    const user = userEvent.setup();
    const onModel = vi.fn();
    render(
      <CommandBar
        open
        indexed={[row("aa", "/a/aa.json"), row("bb", "/b/bb.json")]}
        models={["moonshotai/kimi-k2-instruct"]}
        modes={["ask"]}
        slashActions={[
          { label: "Exit", shortcut: "/exit", run: async () => undefined },
        ]}
        projectRoots={["/tmp"]}
        onOpenChange={() => undefined}
        onSelectSessionPath={vi.fn()}
        onNewSession={vi.fn()}
        onSetModel={onModel}
        onSetMode={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText(/Type a command/i);
    await user.type(input, "kimi");
    await user.keyboard("{Enter}");
    expect(onModel).toHaveBeenCalledWith("moonshotai/kimi-k2-instruct");
  });

  it("Esc closes overlay", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <CommandBar
        open
        indexed={[row("x", "/x.json")]}
        models={[]}
        modes={[]}
        slashActions={[]}
        projectRoots={[]}
        onOpenChange={(v) => onOpen(v)}
        onSelectSessionPath={vi.fn()}
        onNewSession={vi.fn()}
        onSetModel={vi.fn()}
        onSetMode={vi.fn()}
      />,
    );
    await user.keyboard("{Escape}");
    expect(onOpen).toHaveBeenCalledWith(false);
  });
});
