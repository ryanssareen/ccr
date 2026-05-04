import React, { useEffect } from "react";
import { theme } from "../theme.js";

function colorizeDiffLine(line: string): React.ReactNode {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return (
      <span style={{ fontWeight: 700, color: theme.text }}>
        {line}
        {"\n"}
      </span>
    );
  }
  if (line.startsWith("@@"))
    return (
      <span style={{ color: theme.tealDim }}>
        {line}
        {"\n"}
      </span>
    );
  if (line.startsWith("+"))
    return (
      <span style={{ color: theme.green }}>
        {line}
        {"\n"}
      </span>
    );
  if (line.startsWith("-"))
    return (
      <span style={{ color: theme.red }}>
        {line}
        {"\n"}
      </span>
    );
  return (
    <span style={{ color: theme.textDim }}>
      {line}
      {"\n"}
    </span>
  );
}

export function ApprovalModal(props: {
  kind: string;
  title: string;
  detail: string;
  onAnswer: (yes: boolean) => void;
  onAcceptAll?: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Escape") {
        props.onAnswer(false);
        return;
      }
      const k = e.key;
      if (k === "y" || k === "Y") props.onAnswer(true);
      else if (k === "n" || k === "N") props.onAnswer(false);
      else if ((k === "a" || k === "A") && props.kind === "edit") props.onAcceptAll?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const looksDiff = /^(---|\+\+\+|@@)/m.test(props.detail);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          maxHeight: "80vh",
          overflow: "auto",
          padding: "16px 20px",
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          background: "#181b22",
        }}
      >
        <div style={{ color: theme.amber, fontWeight: 700, marginBottom: 8 }}>
          ⚠ {props.title}
          <span style={{ color: theme.textMute, fontWeight: 400 }}> ({props.kind})</span>
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            margin: "8px 0 0",
            color: theme.text,
          }}
        >
          {!looksDiff
            ? props.detail
            : props.detail.split("\n").map((line, i) => <React.Fragment key={i}>{colorizeDiffLine(line)}</React.Fragment>)}
        </pre>
        <div style={{ marginTop: 12, fontSize: 12, fontFamily: "system-ui" }}>
          <span style={{ color: theme.textDim }}>Approve? </span>
          <span style={{ color: theme.green }}>[Y]</span>
          <span style={{ color: theme.textDim }}> yes&nbsp; </span>
          <span style={{ color: theme.red }}>[N / Esc]</span>
          <span style={{ color: theme.textDim }}> no&nbsp; </span>
          {props.kind === "edit" && (
            <>
              <span style={{ color: theme.teal }}>[A]</span>
              <span style={{ color: theme.textDim }}> accept all edits this session</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
