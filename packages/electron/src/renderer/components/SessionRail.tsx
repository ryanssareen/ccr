import { theme } from "../theme.js";
import type { ListedSession } from "../ipc-client.js";
import { dateSubgroupLabel } from "../state/session-store.js";

export interface SessionRailProps {
  indexed: ListedSession[];
  activeSessionPath: string | null;
  onSelect: (path: string) => void;
  onNewSession: (projectRoot: string) => Promise<void>;
  defaultProjectRoot: string;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function basename(p: string): string {
  const norm = normalizePath(p);
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

const SUBGROUP_ORDER = ["Today", "Yesterday", "This week", "Older"] as const;

/** Left rail — Claude-Code-style. Project header + new session CTA + flat
 * Recents list grouped by Today/Yesterday/This week/Older with friendly
 * session titles. Project hash mixes are deliberately collapsed: users
 * think in "what was that chat about", not "which project hash". */
export function SessionRail(props: SessionRailProps) {
  const projectName = basename(props.defaultProjectRoot) || "ccr";

  const bucketed: Record<(typeof SUBGROUP_ORDER)[number], ListedSession[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Older: [],
  };
  for (const s of props.indexed) bucketed[dateSubgroupLabel(s.updatedAt)].push(s);
  for (const k of SUBGROUP_ORDER) {
    bucketed[k].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const empty = props.indexed.length === 0;

  return (
    <nav
      style={{
        gridArea: "sessions",
        overflow: "auto",
        background: "#13161c",
        borderRight: `1px solid ${theme.borderDim}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Project header */}
      <div
        style={{
          padding: "14px 14px 10px",
          borderBottom: `1px solid ${theme.borderDim}`,
        }}
      >
        <div style={{ color: theme.text, fontSize: 13, fontWeight: 600 }}>
          {projectName}
        </div>
        <div
          style={{
            color: theme.textMute,
            fontSize: 11,
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={props.defaultProjectRoot}
        >
          {props.defaultProjectRoot}
        </div>
      </div>

      {/* New session CTA */}
      <button
        type="button"
        onClick={() => void props.onNewSession(props.defaultProjectRoot)}
        style={{
          margin: "10px 10px 4px",
          padding: "8px 10px",
          textAlign: "left",
          background: "transparent",
          border: `1px dashed ${theme.borderDim}`,
          borderRadius: 6,
          color: theme.teal,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: "inherit",
        }}
      >
        + New session
      </button>

      {/* Recents */}
      <div style={{ padding: "8px 4px 16px", flex: 1 }}>
        {empty && (
          <div
            style={{
              color: theme.textMute,
              fontSize: 12,
              padding: "12px 14px",
              lineHeight: 1.5,
            }}
          >
            No sessions yet. Click "+ New session" to start, or run a session
            from the CLI — it'll show up here automatically.
          </div>
        )}
        {SUBGROUP_ORDER.map((bucket) =>
          bucketed[bucket].length === 0 ? null : (
            <div key={bucket} style={{ marginBottom: 6 }}>
              <div
                style={{
                  color: theme.textMute,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  padding: "10px 14px 4px",
                }}
              >
                {bucket}
              </div>
              {bucketed[bucket].map((s) => {
                const active =
                  normalizePath(props.activeSessionPath ?? "") ===
                  normalizePath(s.sessionPath);
                return (
                  <button
                    key={s.sessionPath}
                    type="button"
                    title={`${s.sessionId} · ${s.sessionPath}`}
                    onClick={() => props.onSelect(s.sessionPath)}
                    style={{
                      display: "block",
                      width: "calc(100% - 8px)",
                      margin: "1px 4px",
                      padding: "6px 10px",
                      borderRadius: 5,
                      border: "1px solid transparent",
                      background: active ? "#1f242e" : "transparent",
                      color: active ? theme.text : theme.textDim,
                      cursor: "pointer",
                      fontSize: 12.5,
                      fontFamily: "inherit",
                      textAlign: "left",
                      lineHeight: 1.35,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    <span style={{ display: "inline-block", width: 6, marginRight: 6 }}>
                      {s.foreignLockPid != null ? (
                        <span style={{ color: theme.amber }}>●</span>
                      ) : (
                        <span style={{ color: active ? theme.teal : theme.textMute }}>●</span>
                      )}
                    </span>
                    {s.title}
                  </button>
                );
              })}
            </div>
          ),
        )}
      </div>
    </nav>
  );
}
