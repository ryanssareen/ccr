import React, { useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import { KNOWN_MODELS } from "@ccr/core";
import type { ListedSession } from "../ipc-client.js";
import type { DesktopMode } from "../theme.js";
import { theme } from "../theme.js";

/** ⌘K / Ctrl K palette backed by cmdk fuzzy scoring — Unit 6. */
export interface CommandBarProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;

  indexed: ListedSession[];
  models: readonly string[];
  modes: DesktopMode[];
  slashActions: readonly { label: string; shortcut: string; run: () => void }[];
  /** Per distinct project roots seen in indexed sessions + default cwd */
  projectRoots: string[];
  onSelectSessionPath: (p: string) => void;
  onNewSession: (projectRoot: string) => Promise<void>;
  onSetModel: (m: string) => void;
  onSetMode: (m: DesktopMode) => void;
}

export function CommandBar(props: CommandBarProps) {
  const inputRef = useRef<React.ElementRef<typeof Command.Input>>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (props.open) {
      queueMicrotask(() => inputRef.current?.focus?.());
      setValue("");
    }
  }, [props.open]);

  const recentSessions = useMemo(() => [...props.indexed].slice(0, 12), [props.indexed]);

  function runAndClose(cb: () => void | Promise<void>) {
    void Promise.resolve(cb());
    props.onOpenChange(false);
  }

  if (!props.open) return null;

  return (
    <div
      data-testid="command-bar-overlay"
      style={{
        position: "fixed",
        inset: 0,
        backdropFilter: "blur(10px)",
        background: "rgba(8,10,14,.72)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 80,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onOpenChange(false);
      }}
    >
      <Command
        loop
        className="ccr-command"
        label="CCR command menu"
        onKeyDown={(e) => {
          if (e.key === "Escape") props.onOpenChange(false);
        }}
        style={{
          width: "min(540px,calc(100vw - 32px))",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          background: "#171a22",
          color: theme.text,
          overflow: "hidden",
          boxShadow: "0 18px 50px rgba(0,0,0,.65)",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <Command.Input
          ref={inputRef}
          value={value}
          onValueChange={setValue}
          placeholder="Type a command…"
          style={{
            outline: "none",
            padding: "12px 14px",
            border: "none",
            borderBottom: `1px solid ${theme.borderDim}`,
            width: "100%",
            background: "#171a22",
            color: theme.text,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
            }
          }}
        />
        <Command.List style={{ maxHeight: 320, overflow: "auto" }}>
          <Command.Empty style={{ padding: "10px 12px", color: theme.textMute }}>(no matching commands)</Command.Empty>

          <Command.Group
            heading={<span style={{ color: theme.textMute, fontSize: 11 }}>Sessions · recent</span>}
          >
            {recentSessions.map((s) => (
              <Command.Item
                key={s.sessionPath}
                value={`${s.sessionPath} session ${s.sessionId}`}
                onSelect={() => runAndClose(() => props.onSelectSessionPath(s.sessionPath))}
                style={{
                  padding: "7px 10px",
                  fontSize: 12,
                  borderRadius: 6,
                  margin: "2px 4px",
                  cursor: "pointer",
                }}
              >
                {s.sessionId}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={<span style={{ color: theme.textMute, fontSize: 11 }}>Models</span>}>
            {props.models.map((m) => (
              <Command.Item
                key={m}
                value={`switch model ${m}`}
                onSelect={() => runAndClose(() => props.onSetModel(m))}
                style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", margin: "2px 4px" }}
              >
                {m}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={<span style={{ color: theme.textMute, fontSize: 11 }}>Modes</span>}>
            {props.modes.map((mode) => (
              <Command.Item
                key={mode}
                value={`mode ${mode}`}
                onSelect={() => runAndClose(() => props.onSetMode(mode))}
                style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", margin: "2px 4px" }}
              >
                mode {mode}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={<span style={{ color: theme.textMute, fontSize: 11 }}>Actions</span>}>
            {props.slashActions.map((a) => (
              <Command.Item
                key={a.shortcut}
                value={`slash ${a.label} ${a.shortcut}`}
                onSelect={() => runAndClose(a.run)}
                style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", margin: "2px 4px" }}
              >
                {a.shortcut}{" — "}{a.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={<span style={{ color: theme.textMute, fontSize: 11 }}>New session</span>}>
            {props.projectRoots.map((root) => (
              <Command.Item
                key={root}
                value={`new session in ${root}`}
                onSelect={() => runAndClose(() => props.onNewSession(root))}
                style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", margin: "2px 4px", whiteSpace: "pre-wrap" }}
              >
                New session in {root}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>

        <div style={{ padding: "6px 10px", borderTop: `1px solid ${theme.border}`, fontSize: 10, color: theme.textMute }}>
          ⌘K / Ctrl+K toggle · ↑↓ navigate · Esc close · Enter execute
        </div>
      </Command>
    </div>
  );
}
