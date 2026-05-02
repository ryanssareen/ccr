import { useMemo } from "react";
import type { QuotaState } from "@ccr/core";
import { KNOWN_MODELS } from "../known-models.js";
import { theme } from "../theme.js";
import type { DesktopMode } from "../theme.js";

function formatResetDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Bottom-left footer: managed auth + picker + quota line. */
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
  const selectValue =
    catalog.includes(props.model) ? props.model : "__custom__";

  return (
    <div
      style={{
        gridArea: "settings",
        borderRight: `1px solid ${theme.border}`,
        borderTop: `1px solid ${theme.border}`,
        padding: "10px 12px 12px",
        background: "#141824",
        fontSize: 12,
      }}
    >
      <div style={{ color: theme.amberDim, fontWeight: 700, letterSpacing: 0.6, marginBottom: 10 }}>Settings</div>
      {!props.auth ?
        <div style={{ color: theme.amber }}>
          Sign in via <code style={{ color: theme.teal }}>ccr login</code> in your terminal · shared{" "}
          <code style={{ fontSize: 11 }}>~/.ccr/auth.json</code>
        </div>
      : <div style={{ color: theme.textDim, marginBottom: 12 }}>
          <span>Signed in as </span>
          <span style={{ color: theme.text }}>{props.auth.email ?? "(anonymous session)"}</span>
        </div>
      }

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ color: theme.textDim }}>Model</span>
          <select
            value={selectValue}
            onChange={(e) => {
              if (e.target.value !== "__custom__") props.onPickModel(e.target.value);
            }}
            style={{
              background: "#1a1d24",
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              color: theme.text,
              padding: 6,
            }}
          >
            {modelsOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value="__custom__">Other…</option>
          </select>
          <input
            type="text"
            placeholder="Other model id (used when selecting Other)"
            value={props.customModelDraft}
            onChange={(e) => props.onCustomDraft(e.target.value)}
            onBlur={() => props.onPickModel(props.customModelDraft || props.model)}
            style={{
              padding: "6px 8px",
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: "#1a1d24",
              color: theme.text,
            }}
          />
        </label>

        <div>
          <div style={{ color: theme.textDim, marginBottom: 4 }}>Mode</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(["ask", "accept-edits", "bypass"] as DesktopMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => props.onModePick(m)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: `1px solid ${props.mode === m ? theme.teal : theme.border}`,
                  cursor: "pointer",
                  fontSize: 11,
                  background: props.mode === m ? "#1f2a34" : "#171a22",
                  color: props.mode === m ? theme.tealDim : theme.textDim,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {!props.auth ? null :
          !props.quota ?
            <div style={{ color: theme.textMute }}>Quota refreshes once the backend returns quota headers.</div>
          : <div style={{ color: exceeded ? theme.red : warn ? theme.amber : theme.textDim }}>
              quota {props.quota.used.toLocaleString()} / {props.quota.limit.toLocaleString()} · resets{" "}
              {formatResetDate(props.quota.resetAt)}
              {exceeded ? " · LIMIT REACHED" : warn ? " · nearing limit" : ""}
            </div>
        }
      </div>
    </div>
  );
}
