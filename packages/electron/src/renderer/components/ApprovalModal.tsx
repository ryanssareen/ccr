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
        background: "rgba(20,20,19,.42)",
        backdropFilter: "blur(2px)",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          width: "100%",
          maxHeight: "80vh",
          overflow: "auto",
          padding: "18px 22px",
          borderRadius: 14,
          border: `1px solid ${theme.borderSoft}`,
          background: theme.bgAlt,
          boxShadow: "0 24px 60px rgba(20, 20, 19, 0.18)",
        }}
      >
        <div style={{ color: theme.amber, fontWeight: 700, marginBottom: 8 }}>
          ⚠ {props.title}
          <span style={{ color: theme.textMute, fontWeight: 400 }}> ({props.kind})</span>
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            margin: "8px 0 0",
            padding: "10px 12px",
            borderRadius: 8,
            background: theme.white,
            border: `1px solid ${theme.borderSoft2}`,
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
