import { theme } from "../theme.js";

/**
 * Thin clay-on-cream progress bar. `pct` is 0–100 and is clamped, so callers
 * can hand it a raw ratio without guarding the edges themselves.
 */
export function ProgressBar({ pct, height = 8 }: { pct: number; height?: number }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      style={{
        width: "100%",
        height,
        borderRadius: 999,
        background: theme.borderSoft2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: theme.clay,
          borderRadius: 999,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}

/**
 * Slim top-of-window bar announcing a newer release. Unsigned builds can't
 * self-install, so "Download" opens the release page rather than updating in
 * place. Dismissable — the same version is still reachable from Settings.
 */
export function UpdateBanner({
  version,
  onDownload,
  onDismiss,
}: {
  version: string;
  onDownload: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        background: theme.claySoft,
        borderBottom: `1px solid ${theme.borderSoft}`,
        color: theme.text,
        fontSize: 13,
      }}
    >
      <span
        aria-hidden
        style={{ width: 7, height: 7, borderRadius: "50%", background: theme.clay, flexShrink: 0 }}
      />
      <span>
        A new version of ccr is available — <strong>v{version}</strong>.
      </span>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onDownload}
        style={{ padding: "5px 12px", fontSize: 12.5 }}
      >
        Download
      </button>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        aria-label="Dismiss update notice"
        title="Dismiss"
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "none",
          color: theme.textMute,
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: "0 4px",
        }}
      >
        ×
      </button>
    </div>
  );
}

/** Bottom-right ink toast. Rendered by App; auto-dismiss lives in the caller. */
export function Toast({ text }: { text: string }) {
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 22,
        right: 22,
        background: theme.text,
        color: theme.bg,
        padding: "10px 16px",
        borderRadius: 9,
        fontSize: 13,
        boxShadow: "0 12px 30px rgba(20, 20, 19, 0.3)",
        zIndex: 200,
        animation: "toastIn 180ms ease",
      }}
    >
      {text}
    </div>
  );
}
