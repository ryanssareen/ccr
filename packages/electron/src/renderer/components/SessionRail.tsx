import { theme } from "../theme.js";
import type { ListedSession } from "../ipc-client.js";
import type { ProjectGroup } from "../state/session-store.js";
import { dateSubgroupLabel, groupSessionsByProject } from "../state/session-store.js";

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

/** Left nav: project groups + Today/Yesterday/week/Older headings. */
export function SessionRail(props: SessionRailProps) {
  const groups = groupSessionsByProject(props.indexed);

  if (groups.length === 0) {
    return (
      <div style={{ gridArea: "sessions", overflow: "auto", padding: 12, borderRight: `1px solid ${theme.border}` }}>
        <div style={{ color: theme.teal, fontWeight: 700, marginBottom: 8 }}>Sessions</div>
        <div style={{ color: theme.textMute, fontSize: 13, marginBottom: 12 }}>
          No sessions yet — start chatting from the CLI or create one here.
        </div>
        <button type="button" className="ccr-accent-btn" onClick={() => props.onNewSession(props.defaultProjectRoot)}>
          New session
        </button>
      </div>
    );
  }

  return (
    <nav style={{ gridArea: "sessions", overflow: "auto", borderRight: `1px solid ${theme.border}`, paddingBottom: 8 }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.borderDim}` }}>
        <div style={{ color: theme.teal, fontWeight: 700 }}>Sessions</div>
      </div>
      <div style={{ padding: "6px 10px", display: "flex", gap: 6 }}>
        <button type="button" className="ccr-accent-btn" onClick={() => props.onNewSession(props.defaultProjectRoot)}>
          + New ({props.defaultProjectRoot.split("/").filter(Boolean).pop() ?? "~"})
        </button>
      </div>
      <div style={{ padding: "0 6px 8px" }}>
        {groups.map((group) => (
          <ProjectBlock
            key={group.key}
            group={group}
            activeSessionPath={props.activeSessionPath}
            onSelect={props.onSelect}
            onNewInProject={(root) =>
              props.onNewSession(root ?? props.defaultProjectRoot)
            }
          />
        ))}
      </div>
    </nav>
  );
}

function ProjectBlock(props: {
  group: ProjectGroup;
  activeSessionPath: string | null;
  onSelect: (p: string) => void;
  onNewInProject: (root: string | null) => Promise<void>;
}) {
  const { group } = props;
  const bucketed = bucketByDateSubgroup(group.sessions);

  const label =
    group.displayName ??
    "(" + group.projectIdHash.slice(0, 8) + "…)";

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ color: theme.amberDim, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, padding: "6px 4px 4px" }}>
        {label}
      </div>
      <button
        type="button"
        style={{ fontSize: 11, padding: "2px 4px", marginBottom: 4, background: "none", border: "none", color: theme.tealDim, cursor: "pointer", textDecoration: "underline" }}
        onClick={() => void props.onNewInProject(group.projectRoot)}
      >
        New session in project
      </button>
      {(["Today", "Yesterday", "This week", "Older"] as const).map((lbl) =>
        bucketed[lbl].length > 0 ? (
          <div key={lbl}>
            <div style={{ marginTop: 6, padding: "2px 4px", color: theme.textMute, fontSize: 11 }}>{lbl}</div>
            {bucketed[lbl].map((s) => (
              <button
                key={s.sessionPath}
                title={s.sessionPath}
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  marginTop: 2,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border:
                    normalizePath(props.activeSessionPath ?? "") === normalizePath(s.sessionPath)
                      ? `1px solid ${theme.teal}`
                      : `1px solid ${theme.borderDim}`,
                  cursor: "pointer",
                  fontSize: 12,
                  background: normalizePath(props.activeSessionPath ?? "") === normalizePath(s.sessionPath)
                    ? "#232731"
                    : "#1a1d24",
                  color: theme.textDim,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                onClick={() => props.onSelect(s.sessionPath)}
              >
                {s.sessionId}
                {" "}
                {s.foreignLockPid != null && s.foreignLockPid > 0 ?
                  <span style={{ color: theme.red, marginLeft: 6, fontSize: 10 }}>
                    Locked · PID {s.foreignLockPid}
                  </span>
                : null}
              </button>
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}

function bucketByDateSubgroup(sessions: ListedSession[]): Record<
  "Today" | "Yesterday" | "This week" | "Older",
  ListedSession[]
> {
  const o: Record<"Today" | "Yesterday" | "This week" | "Older", ListedSession[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Older: [],
  };
  for (const s of sessions) {
    o[dateSubgroupLabel(s.updatedAt)].push(s);
  }
  return o;
}
