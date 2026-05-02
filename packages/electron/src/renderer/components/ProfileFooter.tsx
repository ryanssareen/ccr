import type { CcrAuth, CcrConfig } from "@ccr/core";
import { theme } from "../theme.js";

interface ProfileFooterProps {
  auth: CcrAuth | null;
  config: CcrConfig | null;
  onOpenSettings: () => void;
}

/** Bottom-left profile chip — avatar, nickname/email, and a settings button.
 * Replaces the old SettingsPanel grid area. */
export function ProfileFooter({ auth, config, onOpenSettings }: ProfileFooterProps) {
  const email = auth?.email ?? "";
  const display =
    config?.nickname?.trim() ||
    (email ? email.split("@")[0] : "Anonymous");
  const initials = (display.match(/[A-Za-z0-9]/g) ?? ["·"])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      style={{
        gridArea: "settings",
        borderTop: `1px solid ${theme.borderSoft}`,
        borderRight: `1px solid ${theme.borderSoft}`,
        padding: "12px 12px",
        background: theme.bgAlt,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: theme.clay,
          color: "#fff",
          display: "grid",
          placeItems: "center",
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: "0.02em",
          flexShrink: 0,
        }}
      >
        {initials}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <span
          style={{
            color: theme.text,
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={display}
        >
          {display}
        </span>
        <span
          style={{
            color: theme.textMute,
            fontSize: 11.5,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={email}
        >
          {email || "not signed in"}
        </span>
      </div>
      <button
        type="button"
        className="btn-icon"
        title="Settings"
        aria-label="Open settings"
        onClick={onOpenSettings}
        style={{ flexShrink: 0 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
