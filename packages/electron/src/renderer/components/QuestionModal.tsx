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
        background: "rgba(20,20,19,.42)",
        backdropFilter: "blur(2px)",
        zIndex: 45,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
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
          width: "100%",
          padding: "20px 22px",
          borderRadius: 14,
          border: `1px solid ${theme.borderSoft}`,
          background: theme.bgAlt,
          boxShadow: "0 24px 60px rgba(20, 20, 19, 0.18)",
        }}
      >
        <div style={{ color: theme.clay, fontWeight: 700, marginBottom: 8 }}>
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
                    marginTop: 6,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${theme.borderSoft}`,
                    background: theme.white,
                    color: theme.text,
                    cursor: "pointer",
                    fontSize: 13.5,
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
              className="textarea"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              style={{
                width: "100%",
                minHeight: 72,
                marginTop: 6,
                resize: "vertical",
                fontFamily: "var(--font-sans)",
              }}
            />
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => props.onSubmitFreeText(freeText.trim() || "(no answer)")}
              >
                Submit
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setMode("select")}>
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
