import { useMemo, useState } from "react";
import type { AskQuestion } from "@ccr/core";
import { theme } from "../theme.js";

export function QuestionModal(props: {
  step: number;
  total: number;
  question: AskQuestion;
  onPickOption: (choice: string) => void;
  onSubmitFreeText: (text: string) => void;
}) {
  const options = props.question.options ?? [];
  const baseItems = useMemo(() => options.map((o, i) => ({ label: o, value: String(i) })), [options]);
  const items = useMemo(() => [...baseItems, { label: "Other (free text)…", value: "__other__" }], [baseItems]);

  const [mode, setMode] = useState<"select" | "freetext">("select");
  const [freeText, setFreeText] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        zIndex: 45,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseDown={(e) => {
        /* prevent click-through behind */
        e.stopPropagation();
      }}
    >
      <div
        style={{
          minWidth: 320,
          maxWidth: 520,
          padding: "16px 18px",
          borderRadius: 10,
          border: `1px solid ${theme.purple}`,
          background: "#181b22",
        }}
      >
        <div style={{ color: theme.purple, fontWeight: 700, marginBottom: 8 }}>
          ? ccr asks ({props.step + 1}/{props.total})
        </div>
        <div style={{ color: theme.text, fontSize: 14, whiteSpace: "pre-wrap", marginBottom: 10 }}>
          {props.question.question ?? ""}
        </div>

        {mode === "select" ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 240, overflow: "auto" }}>
            {items.map((item) => (
              <li key={item.value}>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    marginTop: 4,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: `1px solid ${theme.borderDim}`,
                    background: "#20242d",
                    color: theme.text,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    if (item.value === "__other__") setMode("freetext");
                    else props.onPickOption(options[Number(item.value)] ?? item.label);
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ marginTop: 10 }}>
            <label style={{ color: theme.textDim, fontSize: 13 }}>Your answer</label>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              style={{
                width: "100%",
                minHeight: 72,
                marginTop: 6,
                background: "#1a1d24",
                color: theme.text,
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                padding: 8,
                resize: "vertical",
              }}
            />
            <div style={{ marginTop: 10, fontSize: 12, color: theme.textMute }}>
              <button
                type="button"
                style={{ marginRight: 8 }}
                onClick={() => props.onSubmitFreeText(freeText.trim() || "(no answer)")}
              >
                Submit
              </button>
              <button type="button" onClick={() => setMode("select")}>
                Back
              </button>
            </div>
          </div>
        )}
        {mode === "select" && (
          <div style={{ marginTop: 12, fontSize: 11, color: theme.textMute }}>Click an option · Other → free text</div>
        )}
      </div>
    </div>
  );
}
