import { useMemo } from "react";
import type { QuotaState } from "@ccr/core";
import { KNOWN_MODELS } from "../known-models.js";
import { theme } from "../theme.js";
import type { DesktopMode } from "../theme.js";

function formatResetDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Bottom-of-sidebar footer. Tight one-column strip:
 * - Email line (or sign-in hint)
 * - Quota
 * - Model dropdown (compact)
 * - Mode segmented control */
export function SettingsPanel(props: {
  auth: { email?: string | null } | null;
  model: string;
  mode: DesktopMode;
  quota: QuotaState | null;
  customModelDraft: string;
  onPickModel: (m: string) => void;
  onCustomDraft: (value: string) => void;
  onModePick: (m: DesktopMode) => void;
}) {
  const modelsOptions = useMemo(() => [...KNOWN_MODELS], []);

  const exceeded =
    !!props.quota && props.quota.limit > 0 && props.quota.used / props.quota.limit >= 1;
  const warn =
    !!props.quota &&
    props.quota.limit > 0 &&
    props.quota.used / props.quota.limit >= 0.8 &&
    !exceeded;

  const catalog = KNOWN_MODELS as readonly string[];
  const selectValue = catalog.includes(props.model) ? props.model : "__custom__";

  return (
    <div
      style={{
        gridArea: "settings",
        borderTop: `1px solid ${theme.borderDim}`,
        borderRight: `1px solid ${theme.borderDim}`,
        padding: "10px 12px 12px",
        background: "#13161c",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* identity + quota row */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          color: theme.textDim,
          fontSize: 11.5,
        }}
      >
        {!props.auth ? (
          <span style={{ color: theme.amber }}>
            Run <code style={{ color: theme.teal }}>ccr login</code> in your terminal
          </span>
        ) : (
          <>
            <span
              style={{
                color: theme.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={props.auth.email ?? ""}
            >
              {props.auth.email ?? "(anonymous)"}
            </span>
            {props.quota ? (
              <span style={{ color: exceeded ? theme.red : warn ? theme.amber : theme.textMute, fontSize: 10.5 }}>
                {props.quota.used.toLocaleString()} / {props.quota.limit.toLocaleString()} ·{" "}
                {formatResetDate(props.quota.resetAt)}
                {exceeded ? " · LIMIT" : ""}
              </span>
            ) : (
              <span style={{ color: theme.textMute, fontSize: 10.5 }}>quota loads after first call</span>
            )}
          </>
        )}
      </div>

      {/* model */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ color: theme.textMute, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
          model
        </span>
        <select
          value={selectValue}
          onChange={(e) => {
            if (e.target.value !== "__custom__") props.onPickModel(e.target.value);
          }}
          style={{
            background: "#1a1d24",
            border: `1px solid ${theme.borderDim}`,
            borderRadius: 5,
            color: theme.text,
            padding: "4px 6px",
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {modelsOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value="__custom__">Other…</option>
        </select>
        {selectValue === "__custom__" && (
          <input
            type="text"
            placeholder="Other model id"
            value={props.customModelDraft}
            onChange={(e) => props.onCustomDraft(e.target.value)}
            onBlur={() => props.onPickModel(props.customModelDraft || props.model)}
            style={{
              padding: "4px 6px",
              borderRadius: 5,
              border: `1px solid ${theme.borderDim}`,
              background: "#1a1d24",
              color: theme.text,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        )}
      </div>

      {/* mode segmented control */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ color: theme.textMute, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
          mode
        </span>
        <div style={{ display: "flex", gap: 0, border: `1px solid ${theme.borderDim}`, borderRadius: 5, overflow: "hidden" }}>
          {(["ask", "accept-edits", "bypass"] as DesktopMode[]).map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => props.onModePick(m)}
              style={{
                flex: 1,
                padding: "4px 6px",
                border: "none",
                borderLeft: i === 0 ? "none" : `1px solid ${theme.borderDim}`,
                cursor: "pointer",
                fontSize: 10.5,
                background: props.mode === m ? "#1f242e" : "transparent",
                color: props.mode === m ? theme.teal : theme.textDim,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {m === "accept-edits" ? "edits" : m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
