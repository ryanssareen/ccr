import React, { useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import type { ListedSession } from "../ipc-client.js";
import type { DesktopMode } from "../theme.js";
import { theme } from "../theme.js";

/** ⌘K / Ctrl K palette backed by cmdk fuzzy scoring. Cream-themed to match
 * the rest of CCR Desktop. */
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

const groupHeading = (label: string) => (
  <span
    style={{
      color: theme.textSoft,
      fontSize: 10.5,
      textTransform: "uppercase",
      letterSpacing: "0.6px",
    }}
  >
    {label}
  </span>
);

const itemStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  borderRadius: 7,
  margin: "2px 4px",
  cursor: "pointer",
  color: theme.text,
};

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
        backdropFilter: "blur(2px)",
        background: "rgba(20, 20, 19, 0.46)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 90,
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
          width: "min(560px,calc(100vw - 32px))",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 13,
          border: `1px solid ${theme.borderSoft}`,
          background: theme.bgAlt,
          color: theme.text,
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(20, 20, 19, 0.22)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <Command.Input
          ref={inputRef}
          value={value}
          onValueChange={setValue}
          placeholder="Type a command or search sessions…"
          style={{
            outline: "none",
            padding: "14px 16px",
            border: "none",
            borderBottom: `1px solid ${theme.borderSoft}`,
            width: "100%",
            background: "transparent",
            color: theme.text,
            fontSize: 14,
            fontFamily: "var(--font-sans)",
          }}
          /* cmdk handles Enter natively (selects the active item). Don't
             swallow keydowns here. */
        />
        <Command.List style={{ maxHeight: 360, overflow: "auto", padding: 6 }}>
          <Command.Empty style={{ padding: "10px 12px", color: theme.textSoft, fontSize: 13 }}>
            (no matching commands)
          </Command.Empty>

          <Command.Group heading={groupHeading("Sessions · recent")}>
            {recentSessions.map((s) => (
              <Command.Item
                key={s.sessionPath}
                value={`${s.sessionPath} session ${s.sessionId} ${s.title}`}
                onSelect={() => runAndClose(() => props.onSelectSessionPath(s.sessionPath))}
                style={itemStyle}
              >
                {s.title}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={groupHeading("Modes")}>
            {props.modes.map((mode) => (
              <Command.Item
                key={mode}
                value={`mode ${mode}`}
                onSelect={() => runAndClose(() => props.onSetMode(mode))}
                style={itemStyle}
              >
                mode — {mode}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={groupHeading("Models")}>
            {props.models.map((m) => (
              <Command.Item
                key={m}
                value={`switch model ${m}`}
                onSelect={() => runAndClose(() => props.onSetModel(m))}
                style={{ ...itemStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}
              >
                {m}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={groupHeading("Actions")}>
            {props.slashActions.map((a) => (
              <Command.Item
                key={a.shortcut}
                value={`slash ${a.label} ${a.shortcut}`}
                onSelect={() => runAndClose(a.run)}
                style={itemStyle}
              >
                {a.shortcut}{" — "}{a.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={groupHeading("New session")}>
            {props.projectRoots.map((root) => (
              <Command.Item
                key={root}
                value={`new session in ${root}`}
                onSelect={() => runAndClose(() => props.onNewSession(root))}
                style={{ ...itemStyle, whiteSpace: "pre-wrap" }}
              >
                New session in {root}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>

        <div
          style={{
            padding: "8px 14px",
            borderTop: `1px solid ${theme.borderSoft}`,
            fontSize: 10.5,
            color: theme.textMute,
          }}
        >
          ⌘K toggle · ↑↓ navigate · Esc close · Enter execute
        </div>
      </Command>
    </div>
  );
}
