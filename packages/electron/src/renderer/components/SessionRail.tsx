import { useMemo, useState } from "react";
import type { CcrAuth, CcrConfig, QuotaState } from "@ccr/core";
import { theme } from "../theme.js";
import type { ListedSession } from "../ipc-client.js";
import {
  dateSubgroupLabel,
  fileBasename,
  groupSessionsByProject,
  type DateSubgroup,
  type ProjectGroup,
} from "../state/session-store.js";
import { ProfileFooter } from "./ProfileFooter.js";

export interface SessionRailProps {
  indexed: ListedSession[];
  activeSessionPath: string | null;
  onSelect: (path: string) => void;
  onNewSession: (projectRoot: string) => Promise<void>;
  onDeleteSession?: (path: string) => Promise<void> | void;
  defaultProjectRoot: string;
  /** Opens the folder picker. Absent in tests/contexts without the bridge. */
  onPickProjectRoot?: () => Promise<void> | void;

  /** Collapse state is owned by App so the grid column width can follow it. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Session search — controlled by App so ⌘K and the rail can share intent. */
  query?: string;
  onQueryChange?: (q: string) => void;

  // Footer wiring (profile chip + quota meter live at the bottom of the rail).
  auth?: CcrAuth | null;
  config?: CcrConfig | null;
  quota?: QuotaState | null;
  onOpenSettings?: () => void;

  /** Fire-and-forget confirmations (new session, delete). */
  onToast?: (text: string) => void;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
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

function matches(s: ListedSession, q: string): boolean {
  return !q || s.title.toLowerCase().includes(q);
}

/** Left rail — the current project's sessions grouped by date bucket, with
 * every other project tucked into an "Other projects" disclosure. Search,
 * collapse, and the profile/quota footer live here too. */
export function SessionRail(props: SessionRailProps) {
  const collapsed = !!props.collapsed;
  const showText = !collapsed;
  const q = (props.query ?? "").trim().toLowerCase();

  const projects = useMemo(
    () => groupSessionsByProject(props.indexed),
    [props.indexed],
  );

  const defRoot = normalizePath(props.defaultProjectRoot);
  const currentGroup = useMemo(
    () => projects.find((g) => g.projectRoot && normalizePath(g.projectRoot) === defRoot),
    [projects, defRoot],
  );
  const otherGroups = useMemo(
    () => projects.filter((g) => g !== currentGroup),
    [projects, currentGroup],
  );

  const currentName = fileBasename(props.defaultProjectRoot) || "ccr";
  const currentSessions = (currentGroup?.sessions ?? []).filter((s) => matches(s, q));
  const otherFiltered = otherGroups
    .map((g) => ({ group: g, sessions: g.sessions.filter((s) => matches(s, q)) }))
    .filter((g) => g.sessions.length > 0);

  const totalMatches =
    currentSessions.length + otherFiltered.reduce((n, g) => n + g.sessions.length, 0);
  const hasNoResults = q.length > 0 && totalMatches === 0;

  const activeInOther = props.activeSessionPath
    ? otherGroups.some((g) =>
        g.sessions.some(
          (s) => normalizePath(s.sessionPath) === normalizePath(props.activeSessionPath ?? ""),
        ),
      )
    : false;

  return (
    <nav
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        background: theme.bgAlt,
        borderRight: `1px solid ${theme.borderSoft}`,
      }}
    >
      {/* ── Header: wordmark, project identity, collapse toggle ── */}
      <div
        style={{
          padding: "16px 14px 12px",
          borderBottom: `1px solid ${theme.borderSoft}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="wordmark" style={{ fontSize: 26, lineHeight: 1 }}>
            ccr
          </div>
          {showText &&
            (props.onPickProjectRoot ? (
              <button
                type="button"
                aria-label="Change project folder"
                title="Choose the folder new sessions run in"
                onClick={() => void props.onPickProjectRoot?.()}
                style={{
                  display: "block",
                  marginTop: 6,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  maxWidth: "100%",
                  minWidth: 0,
                }}
              >
                <div style={projectNameStyle}>{currentName}</div>
                <div style={projectRootStyle} title={props.defaultProjectRoot}>
                  {props.defaultProjectRoot}
                </div>
              </button>
            ) : (
              <div style={{ marginTop: 6 }}>
                <div style={projectNameStyle}>{currentName}</div>
                <div style={projectRootStyle} title={props.defaultProjectRoot}>
                  {props.defaultProjectRoot}
                </div>
              </div>
            ))}
        </div>
        {props.onToggleCollapse && (
          <button
            type="button"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={props.onToggleCollapse}
            style={{
              flexShrink: 0,
              width: 26,
              height: 26,
              borderRadius: 6,
              border: `1px solid ${theme.borderSoft}`,
              background: "transparent",
              color: theme.textMute,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              marginTop: 2,
            }}
          >
            <span
              style={{
                fontSize: 11,
                display: "inline-block",
                transform: collapsed ? "rotate(180deg)" : "none",
              }}
            >
              ◂
            </span>
          </button>
        )}
      </div>

      {/* ── Search ── */}
      {showText && (
        <div style={{ padding: "10px 10px 4px" }}>
          <input
            className="input"
            placeholder="Search sessions…"
            value={props.query ?? ""}
            onChange={(e) => props.onQueryChange?.(e.target.value)}
            style={{ height: 36, padding: "0 12px", fontSize: 13, borderRadius: 8 }}
          />
        </div>
      )}

      {/* ── New session CTA ── */}
      <div style={{ padding: "8px 10px 6px" }}>
        <button
          type="button"
          onClick={() => {
            void props.onNewSession(props.defaultProjectRoot);
            props.onToast?.("New session started");
          }}
          className="btn btn-ghost"
          style={{
            width: "100%",
            justifyContent: showText ? "flex-start" : "center",
            height: 36,
            padding: showText ? "0 12px" : 0,
            color: theme.clay,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {showText ? "+ New session" : "+"}
        </button>
      </div>

      {/* ── Session list ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "4px 6px 10px" }}>
        {hasNoResults && showText && (
          <div style={{ color: theme.textSoft, fontSize: 12, padding: "14px 12px", lineHeight: 1.5 }}>
            No sessions match "{props.query}".
          </div>
        )}

        {props.indexed.length === 0 && !q && showText && (
          <div style={{ color: theme.textSoft, fontSize: 12, padding: "12px 12px", lineHeight: 1.5 }}>
            No sessions yet. Click "+ New session" to start, or run a session from
            the CLI — it'll show up here automatically.
          </div>
        )}

        {collapsed ? (
          // Collapsed: a flat column of selectable dots, newest first.
          <div style={{ padding: "4px 2px" }}>
            {[...(currentGroup?.sessions ?? []), ...otherGroups.flatMap((g) => g.sessions)].map(
              (s) => (
                <SessionRow
                  key={s.sessionPath}
                  session={s}
                  active={
                    normalizePath(props.activeSessionPath ?? "") === normalizePath(s.sessionPath)
                  }
                  collapsed
                  onSelect={props.onSelect}
                />
              ),
            )}
          </div>
        ) : (
          <div style={{ padding: "4px 4px 2px" }}>
            {/* Current project */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px 2px",
                color: theme.text,
                fontSize: 11.5,
                fontWeight: 600,
              }}
              title={currentGroup?.projectRoot ?? props.defaultProjectRoot}
            >
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentName}
              </span>
              <span style={{ color: theme.textSoft, fontWeight: 500 }}>
                {currentSessions.length}
              </span>
            </div>
            <DateBuckets
              sessions={currentSessions}
              activeSessionPath={props.activeSessionPath}
              onSelect={props.onSelect}
              onDelete={props.onDeleteSession}
              onToast={props.onToast}
            />

            {/* Other projects */}
            {otherFiltered.length > 0 && (
              <OtherProjects
                projects={otherFiltered}
                activeSessionPath={props.activeSessionPath}
                onSelect={props.onSelect}
                onDelete={props.onDeleteSession}
                onToast={props.onToast}
                forceOpen={q.length > 0 || activeInOther}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Footer: profile chip + quota meter ── */}
      <ProfileFooter
        auth={props.auth ?? null}
        config={props.config ?? null}
        quota={props.quota ?? null}
        collapsed={collapsed}
        onOpenSettings={props.onOpenSettings ?? (() => undefined)}
      />
    </nav>
  );
}

const projectNameStyle: React.CSSProperties = {
  color: theme.text,
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const projectRootStyle: React.CSSProperties = {
  color: theme.textSoft,
  fontSize: 10.5,
  marginTop: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  fontFamily: "var(--font-mono)",
};

function OtherProjects(props: {
  projects: { group: ProjectGroup; sessions: ListedSession[] }[];
  activeSessionPath: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => Promise<void> | void;
  onToast?: (text: string) => void;
  forceOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expanded = open || props.forceOpen;
  const count = props.projects.reduce((n, p) => n + p.group.sessions.length, 0);

  return (
    <div style={{ marginTop: 8, borderTop: `1px solid ${theme.borderSoft2}`, paddingTop: 6 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "6px 8px",
          background: "transparent",
          border: "none",
          color: theme.textDim,
          fontSize: 11.5,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--font-sans)",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 9,
            fontSize: 9,
            color: theme.textSoft,
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform 120ms",
          }}
        >
          ▶
        </span>
        <span style={{ flex: 1 }}>Other projects</span>
        <span style={{ color: theme.textSoft, fontWeight: 500 }}>{count}</span>
      </button>
      {expanded &&
        props.projects.map(({ group, sessions }) => (
          <div key={group.key} style={{ padding: "2px 4px 6px 8px" }}>
            <div
              style={{
                color: theme.textMute,
                fontSize: 10.5,
                fontWeight: 600,
                padding: "4px 8px 2px 16px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={group.projectRoot ?? `(${group.projectIdHash})`}
            >
              {group.displayName}
            </div>
            {sessions.map((s) => (
              <SessionRow
                key={s.sessionPath}
                session={s}
                active={
                  normalizePath(props.activeSessionPath ?? "") === normalizePath(s.sessionPath)
                }
                indent
                onSelect={props.onSelect}
                onDelete={props.onDelete}
                onToast={props.onToast}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

function DateBuckets(props: {
  sessions: ListedSession[];
  activeSessionPath: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => Promise<void> | void;
  onToast?: (text: string) => void;
}) {
  const buckets = bucketByDate(props.sessions);
  return (
    <>
      {SUBGROUP_ORDER.map((bucket) =>
        buckets[bucket].length === 0 ? null : (
          <div key={bucket} style={{ marginBottom: 2 }}>
            <div
              style={{
                color: theme.textSoft,
                fontSize: 9.5,
                textTransform: "uppercase",
                letterSpacing: 0.7,
                padding: "7px 8px 3px 10px",
              }}
            >
              {bucket}
            </div>
            {buckets[bucket].map((s) => (
              <SessionRow
                key={s.sessionPath}
                session={s}
                active={
                  normalizePath(props.activeSessionPath ?? "") === normalizePath(s.sessionPath)
                }
                onSelect={props.onSelect}
                onDelete={props.onDelete}
                onToast={props.onToast}
              />
            ))}
          </div>
        ),
      )}
    </>
  );
}

function SessionRow(props: {
  session: ListedSession;
  active: boolean;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => Promise<void> | void;
  onToast?: (text: string) => void;
  collapsed?: boolean;
  indent?: boolean;
}) {
  const { session: s, active, onSelect, onDelete, collapsed, indent } = props;
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const locked = s.foreignLockPid != null;
  const showText = !collapsed;
  const dotColor = locked ? theme.amber : active ? theme.clay : theme.textSoft;

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
        margin: "1px 0",
        borderRadius: 7,
        background: active ? theme.bgAlt2 : "transparent",
        position: "relative",
      }}
    >
      <button
        type="button"
        title={collapsed ? s.title : `${s.sessionId} · ${s.sessionPath}`}
        aria-label={s.title}
        onClick={() => onSelect(s.sessionPath)}
        style={{
          flex: 1,
          minWidth: 0,
          padding: indent ? "6px 10px 6px 18px" : collapsed ? "7px 0" : "7px 10px",
          borderRadius: 7,
          border: "none",
          background: "transparent",
          color: active ? theme.text : theme.textDim,
          cursor: "pointer",
          fontSize: indent ? 12.5 : 13,
          fontFamily: "inherit",
          textAlign: "left",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />
        {showText && (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
        )}
      </button>

      {showText && onDelete && (hovered || confirming) && !locked && (
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
            props.onToast?.("Conversation deleted");
          }}
          style={{
            position: "absolute",
            right: 5,
            top: "50%",
            transform: "translateY(-50%)",
            background: confirming ? theme.red : "transparent",
            border: `1px solid ${confirming ? theme.red : "transparent"}`,
            borderRadius: 5,
            color: confirming ? "#fff" : theme.textMute,
            cursor: "pointer",
            padding: "3px 7px",
            fontSize: 10.5,
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
