import { useMemo, useState } from "react";
import { theme } from "../theme.js";
import type { ListedSession } from "../ipc-client.js";
import {
  dateSubgroupLabel,
  groupSessionsByProject,
  type DateSubgroup,
  type ProjectGroup,
} from "../state/session-store.js";

export interface SessionRailProps {
  indexed: ListedSession[];
  activeSessionPath: string | null;
  onSelect: (path: string) => void;
  onNewSession: (projectRoot: string) => Promise<void>;
  onDeleteSession?: (path: string) => Promise<void> | void;
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

const SUBGROUP_ORDER: readonly DateSubgroup[] = [
  "Today",
  "Yesterday",
  "This week",
  "This month",
  "Older",
] as const;

function bucketByDate(sessions: ListedSession[]): Record<DateSubgroup, ListedSession[]> {
  const out: Record<DateSubgroup, ListedSession[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    "This month": [],
    Older: [],
  };
  for (const s of sessions) out[dateSubgroupLabel(s.updatedAt)].push(s);
  for (const k of SUBGROUP_ORDER) out[k].sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

/** Left rail — sessions grouped by project (the folder ccr was launched in)
 * and within each project by date bucket. */
export function SessionRail(props: SessionRailProps) {
  const projectName = basename(props.defaultProjectRoot) || "ccr";
  const projects = useMemo(
    () => groupSessionsByProject(props.indexed),
    [props.indexed],
  );
  const empty = props.indexed.length === 0;

  return (
    <nav
      style={{
        gridArea: "sessions",
        overflow: "auto",
        background: theme.bgAlt,
        borderRight: `1px solid ${theme.borderSoft}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Project header */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: `1px solid ${theme.borderSoft}`,
        }}
      >
        <div
          className="wordmark"
          style={{
            fontSize: 28,
            color: theme.text,
            display: "block",
            marginBottom: 8,
          }}
        >
          ccr
        </div>
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
          margin: "12px 10px 6px",
          padding: "9px 12px",
          textAlign: "left",
          background: "transparent",
          border: `1px dashed ${theme.borderSoft}`,
          borderRadius: 8,
          color: theme.clay,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: "inherit",
          fontWeight: 500,
        }}
      >
        + New session
      </button>

      {/* Recents — grouped by project → date bucket */}
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
        {projects.map((group) => (
          <ProjectSection
            key={group.key}
            group={group}
            activeSessionPath={props.activeSessionPath}
            onSelect={props.onSelect}
            onDelete={props.onDeleteSession}
          />
        ))}
      </div>
    </nav>
  );
}

function ProjectSection(props: {
  group: ProjectGroup;
  activeSessionPath: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => Promise<void> | void;
}) {
  const { group } = props;
  const containsActive = props.activeSessionPath
    ? group.sessions.some(
        (s) => normalizePath(s.sessionPath) === normalizePath(props.activeSessionPath ?? ""),
      )
    : false;
  const [open, setOpen] = useState(true);
  const buckets = bucketByDate(group.sessions);
  // If the active session is inside a collapsed group, force-expand so it's visible.
  const expanded = open || containsActive;

  return (
    <div style={{ marginBottom: 6 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "calc(100% - 8px)",
          margin: "8px 4px 2px",
          padding: "4px 10px",
          background: "transparent",
          border: "none",
          color: theme.text,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--font-sans)",
        }}
        title={group.projectRoot ?? `(${group.projectIdHash})`}
      >
        <span
          style={{
            display: "inline-block",
            width: 10,
            color: theme.textMute,
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform 120ms",
            fontSize: 10,
          }}
        >
          ▶
        </span>
        <span
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
          }}
        >
          {group.displayName}
        </span>
        <span style={{ color: theme.textMute, fontSize: 11, fontWeight: 500 }}>
          {group.sessions.length}
        </span>
      </button>
      {group.projectRoot && expanded && (
        <div
          style={{
            color: theme.textMute,
            fontSize: 10.5,
            padding: "0 14px 4px 24px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily: "var(--font-mono)",
          }}
          title={group.projectRoot}
        >
          {group.projectRoot}
        </div>
      )}

      {expanded &&
        SUBGROUP_ORDER.map((bucket) =>
          buckets[bucket].length === 0 ? null : (
            <div key={bucket} style={{ marginBottom: 2 }}>
              <div
                style={{
                  color: theme.textMute,
                  fontSize: 9.5,
                  textTransform: "uppercase",
                  letterSpacing: 0.7,
                  padding: "6px 14px 2px 24px",
                }}
              >
                {bucket}
              </div>
              {buckets[bucket].map((s) => {
                const active =
                  normalizePath(props.activeSessionPath ?? "") ===
                  normalizePath(s.sessionPath);
                return (
                  <SessionRow
                    key={s.sessionPath}
                    session={s}
                    active={active}
                    onSelect={props.onSelect}
                    onDelete={props.onDelete}
                  />
                );
              })}
            </div>
          ),
        )}
    </div>
  );
}

function SessionRow(props: {
  session: ListedSession;
  active: boolean;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => Promise<void> | void;
}) {
  const { session: s, active, onSelect, onDelete } = props;
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const locked = s.foreignLockPid != null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setConfirming(false);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        margin: "1px 4px",
        borderRadius: 6,
        background: active ? theme.bgAlt2 : "transparent",
        position: "relative",
      }}
    >
      <button
        type="button"
        title={`${s.sessionId} · ${s.sessionPath}`}
        onClick={() => onSelect(s.sessionPath)}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "7px 10px",
          borderRadius: 6,
          border: "1px solid transparent",
          background: "transparent",
          color: active ? theme.text : theme.textDim,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: "inherit",
          textAlign: "left",
          lineHeight: 1.35,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <span style={{ display: "inline-block", width: 6, marginRight: 8 }}>
          {locked ? (
            <span style={{ color: theme.amber }}>●</span>
          ) : (
            <span style={{ color: active ? theme.clay : theme.textSoft }}>●</span>
          )}
        </span>
        {s.title}
      </button>

      {onDelete && (hovered || confirming) && !locked && (
        <button
          type="button"
          aria-label={confirming ? `Confirm delete ${s.title}` : `Delete ${s.title}`}
          title={confirming ? "Click again to confirm" : "Delete conversation"}
          onClick={async (e) => {
            e.stopPropagation();
            if (!confirming) {
              setConfirming(true);
              return;
            }
            await onDelete(s.sessionPath);
            setConfirming(false);
          }}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: confirming ? theme.red : "transparent",
            border: `1px solid ${confirming ? theme.red : "transparent"}`,
            borderRadius: 5,
            color: confirming ? "#fff" : theme.textMute,
            cursor: "pointer",
            padding: "3px 6px",
            fontSize: 11,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {confirming ? (
            "Delete?"
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
