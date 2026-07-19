import { useState } from "react";
import type { ChatPaneEntry } from "../state/run-store.js";

export interface MessageCardProps {
  entry: ChatPaneEntry;
  themeCss: Record<string, string>;
}

/** User / assistant / tool / system chat rows, styled to the CCR Desktop
 * design: right-aligned user bubbles, an avatar + prose for the assistant,
 * and collapsible tool cards. */
export function MessageCard({ entry, themeCss }: MessageCardProps) {
  const t = themeCss;

  if (entry.kind === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <div
          style={{
            maxWidth: "72%",
            background: t.claySoft,
            color: t.text,
            padding: "10px 14px",
            borderRadius: "14px 14px 4px 14px",
            fontSize: 14,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Avatar t={t} />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            color: t.text,
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.kind === "tool") {
    return <ToolCard entry={entry} t={t} />;
  }

  // system line (warnings / errors — not part of the mock, but the real app
  // surfaces them; keep them quiet and on-palette).
  const tone = entry.tone ?? "info";
  const col = tone === "error" ? t.red : tone === "warn" ? t.amber : t.textMute;
  return (
    <div
      style={{
        marginTop: 10,
        marginLeft: 34,
        fontSize: 12,
        color: col,
        whiteSpace: "pre-wrap",
      }}
    >
      {entry.text}
    </div>
  );
}

function Avatar({ t }: { t: Record<string, string> }) {
  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        background: t.clay,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
        marginTop: 1,
      }}
    >
      cc
    </div>
  );
}

function ToolCard({
  entry,
  t,
}: {
  entry: Extract<ChatPaneEntry, { kind: "tool" }>;
  t: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const pending = entry.result === undefined;
  const statusColor = pending ? t.amber : entry.isError ? t.red : t.sage;
  const statusIcon = pending ? "◌" : entry.isError ? "✗" : "✓";
  const hasResult = !pending && !!entry.result;

  return (
    <div style={{ marginTop: 8, marginLeft: 34 }}>
      <button
        type="button"
        onClick={() => hasResult && setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 8,
          border: `1px solid ${t.borderSoft2}`,
          background: t.white,
          cursor: hasResult ? "pointer" : "default",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          color: t.textDim,
          maxWidth: "100%",
        }}
      >
        <span style={{ color: statusColor }}>{statusIcon}</span>
        <span style={{ color: t.text, fontWeight: 600 }}>{entry.name}</span>
        <span
          style={{
            color: t.textSoft,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {entry.argsPreview}
        </span>
        {hasResult && (
          <span
            style={{
              color: t.textSoft,
              marginLeft: "auto",
              display: "inline-block",
              transform: expanded ? "rotate(180deg)" : "none",
            }}
          >
            ⌄
          </span>
        )}
      </button>
      {expanded && hasResult && (
        <div
          style={{
            marginTop: 4,
            padding: "8px 12px",
            borderRadius: 8,
            background: t.bgAlt,
            color: t.textDim,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            whiteSpace: "pre-wrap",
          }}
        >
          {(entry.result || "").split("\n").slice(0, 40).join("\n")}
        </div>
      )}
    </div>
  );
}
