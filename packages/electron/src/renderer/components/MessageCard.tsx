import type { ChatPaneEntry } from "../state/run-store.js";

export interface MessageCardProps {
  entry: ChatPaneEntry;
  themeCss: Record<string, string>;
}

/** User / assistant / tool / system — mirrors Ink taxonomy from `packages/cli/src/app.tsx`. */
export function MessageCard({ entry, themeCss }: MessageCardProps) {
  const t = themeCss;
  if (entry.kind === "user") {
    return (
      <div style={{ marginTop: 10, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13 }}>
        <span style={{ color: t.teal, fontWeight: 700 }}>› </span>
        <span style={{ color: t.text, whiteSpace: "pre-wrap" }}>{entry.text}</span>
      </div>
    );
  }
  if (entry.kind === "assistant") {
    return (
      <div
        style={{
          marginTop: 10,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 13,
          flexDirection: "column",
        }}
      >
        <span style={{ color: t.teal, fontWeight: 700 }}>⏺ ccr</span>
        <div style={{ paddingLeft: 14, marginTop: 4, color: t.text, whiteSpace: "pre-wrap" }}>
          {entry.text}
        </div>
      </div>
    );
  }
  if (entry.kind === "tool") {
    const pending = entry.result === undefined;
    const accent = pending ? t.amber : entry.isError ? t.red : t.green;
    const icon = pending ? "◌" : entry.isError ? "✗" : "✓";
    return (
      <div style={{ paddingLeft: 14, marginTop: 6, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
        <span style={{ color: accent }}>{icon}</span>
        <span style={{ color: t.purple }}> {entry.name}</span>
        <span style={{ color: t.textMute }}> ({entry.argsPreview})</span>
        {!pending && entry.result && (
          <div style={{ paddingLeft: 14, marginTop: 4, color: t.textDim, whiteSpace: "pre-wrap" }}>
            {(entry.result || "").split("\n").slice(0, 12).join("\n")}
          </div>
        )}
      </div>
    );
  }
  const tone = entry.tone ?? "info";
  const col = tone === "error" ? t.red : tone === "warn" ? t.amber : t.textMute;
  return (
    <div style={{ marginTop: 10, fontSize: 12, color: col, whiteSpace: "pre-wrap", fontFamily: "system-ui, sans-serif" }}>
      {entry.text}
    </div>
  );
}
