import { useState } from "react";
import type { CcrConfig } from "@ccr/core";
import { ccrIpcClient } from "../ipc-client.js";
import { useSessionStore } from "../state/session-store.js";

interface SettingsModalProps {
  config: CcrConfig;
  onClose: () => void;
  onSignOut: () => void;
}

/** Settings modal — nickname, custom instructions, toggles. Persists via
 * the same `settings:save` IPC the model picker already uses. */
export function SettingsModal({ config, onClose, onSignOut }: SettingsModalProps) {
  const [nickname, setNickname] = useState(config.nickname ?? "");
  const [customInstructions, setCustomInstructions] = useState(
    config.customInstructions ?? "",
  );
  const [autoAcceptEdits, setAutoAcceptEdits] = useState<boolean>(
    !!config.toggles?.autoAcceptEdits,
  );
  const [sendTelemetry, setSendTelemetry] = useState<boolean>(
    config.toggles?.sendTelemetry ?? true,
  );
  const [saving, setSaving] = useState(false);
  const hydrate = useSessionStore((s) => s.hydrateBootstrap);

  async function save() {
    setSaving(true);
    await ccrIpcClient.saveSettings({
      nickname: nickname.trim() || undefined,
      customInstructions: customInstructions.trim() || undefined,
      toggles: { autoAcceptEdits, sendTelemetry },
    });
    await hydrate();
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Settings</h2>
        <p className="modal-sub">Personalize ccr — these stay local in ~/.ccr/config.json.</p>

        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Nickname</label>
          <input
            className="input"
            placeholder="What should ccr call you?"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Custom instructions</label>
          <textarea
            className="textarea"
            rows={5}
            placeholder="Coding style, frameworks, conventions ccr should follow…"
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            style={{ fontFamily: "var(--font-sans)", lineHeight: 1.5, resize: "vertical" }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <Toggle
            label="Auto-accept safe edits"
            sub="Skip approval prompts for non-destructive file edits."
            value={autoAcceptEdits}
            onChange={setAutoAcceptEdits}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <Toggle
            label="Send anonymous usage data"
            sub="Helps improve ccr. No prompt or code content is ever sent."
            value={sendTelemetry}
            onChange={setSendTelemetry}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: "var(--accent-red)", borderColor: "var(--accent-red)" }}
            onClick={onSignOut}
          >
            Sign out
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-mid)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 6,
};

function Toggle({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: "pointer",
        padding: "10px 0",
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          border: "none",
          background: value ? "var(--accent-clay)" : "var(--border-soft)",
          position: "relative",
          cursor: "pointer",
          transition: "background 140ms ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: value ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
            transition: "left 140ms ease",
          }}
        />
      </button>
      <span style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: "var(--text-ink)" }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-mid)" }}>{sub}</div>
      </span>
    </label>
  );
}
