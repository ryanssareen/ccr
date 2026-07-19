import type { CcrAuth, CcrConfig, QuotaState } from "@ccr/core";
import { theme } from "../theme.js";
import { ProgressBar } from "./ui.js";

interface ProfileFooterProps {
  auth: CcrAuth | null;
  config: CcrConfig | null;
  quota?: QuotaState | null;
  collapsed?: boolean;
  onOpenSettings: () => void;
}

/** Bottom-of-rail profile chip — avatar, nickname/email, settings button, and
 * the daily request meter. Rendered inside SessionRail's flex column. */
export function ProfileFooter({ auth, config, quota, collapsed, onOpenSettings }: ProfileFooterProps) {
  const email = auth?.email ?? "";
  const display =
    config?.nickname?.trim() ||
    (email ? email.split("@")[0] : "Anonymous");
  const initials = (display.match(/[A-Za-z0-9]/g) ?? ["·"])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const showText = !collapsed;
  const hasQuota = quota != null && quota.limit > 0;
  const quotaPct = hasQuota ? (quota!.used / quota!.limit) * 100 : 0;
  const quotaLabel = hasQuota
    ? `${quota!.used} / ${quota!.limit} requests today`
    : "";

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: showText ? "10px 12px 12px" : "10px 0 12px",
        borderTop: `1px solid ${theme.borderSoft}`,
        background: theme.bgAlt,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: showText ? "flex-start" : "center",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: theme.clay,
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: 600,
            fontSize: 12.5,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        {showText && (
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
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
                color: theme.textSoft,
                fontSize: 11,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={email}
            >
              {email || "not signed in"}
            </span>
          </div>
        )}
        <button
          type="button"
          className="btn-icon"
          title="Settings"
          aria-label="Open settings"
          onClick={onOpenSettings}
          style={{ flexShrink: 0, width: 28, height: 28, padding: 0, borderRadius: 7 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
      {showText && hasQuota && (
        <div title={quotaLabel}>
          <ProgressBar pct={quotaPct} />
          <div style={{ color: theme.textSoft, fontSize: 10.5, marginTop: 4 }}>{quotaLabel}</div>
        </div>
      )}
    </div>
  );
}
