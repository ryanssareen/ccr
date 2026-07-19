import React, { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AskQuestion } from "@ccr/core";
import { theme as themeVals } from "../theme.js";
import { ccrIpcClient } from "../ipc-client.js";
import { MessageCard } from "./MessageCard.js";
import { ApprovalModal } from "./ApprovalModal.js";
import { QuestionModal } from "./QuestionModal.js";
import { useSessionStore, fileBasename } from "../state/session-store.js";
import { type ChatPaneEntry, useRunStore } from "../state/run-store.js";
import { KNOWN_MODELS } from "../known-models.js";
import type { DesktopMode } from "../theme.js";

const themeCss: Record<string, string> = { ...themeVals };

const MODE_DEFS: { key: DesktopMode; label: string; desc: string }[] = [
  { key: "ask", label: "Ask", desc: "Read-only — no edits or commands run." },
  {
    key: "accept-edits",
    label: "Accept edits",
    desc: "Auto-approves file edits, asks before shell commands.",
  },
  { key: "bypass", label: "Bypass", desc: "Runs everything without asking. Use with care." },
];

interface AskAccum {
  requestId: string;
  questions: AskQuestion[];
  step: number;
  answers: Parameters<typeof ccrIpcClient.askResponse>[1];
}

interface AttachedFile {
  basename: string;
  path: string;
  content: string;
  truncated: boolean;
}

export function ChatStage(props: {
  mode: DesktopMode;
  model: string;
  onPickModel: (m: string) => void;
  onSetMode?: (m: DesktopMode) => void;
  onOpenCommandBar?: () => void;
  onQuotaPush: (q: unknown) => void;
  onToast?: (text: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionId = useSessionStore((s) => s.activeSessionId);
  const sessionPath = useSessionStore((s) => s.activeSessionPath);
  const projectRoot = useSessionStore((s) => s.activeProjectRoot);
  const foreignPid = useSessionStore((s) => s.foreignLockPid);
  const indexed = useSessionStore((s) => s.indexed);
  const defaultRoot = useSessionStore((s) => s.bootstrapDefaultProjectRoot);
  const activeListed = sessionPath
    ? indexed.find((s) => s.sessionPath === sessionPath)
    : undefined;
  const headerTitle = activeListed?.title ?? sessionId ?? null;
  const projectName = fileBasename(projectRoot ?? defaultRoot) || "ccr";

  const entries = useRunStore((s) => s.entries);
  const streamingTail = useRunStore((s) => s.streamingTail);
  const approval = useRunStore((s) => s.approval);
  const setApproval = useRunStore((s) => s.setApproval);

  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [takeConfirm, setTakeConfirm] = useState(false);
  const [askAccum, setAskAccum] = useState<AskAccum | null>(null);
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const readOnlyForeign =
    foreignPid != null && typeof foreignPid === "number" && foreignPid > 0;

  const rowCount = entries.length + (streamingTail.length > 0 ? 1 : 0);
  const virtualizer = useVirtualizer({
    count: Math.max(1, rowCount),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  useEffect(() => {
    virtualizer.scrollToIndex(Math.max(0, rowCount - 1));
  }, [entries.length, rowCount, streamingTail.length, virtualizer]);

  function activeSid() {
    return useSessionStore.getState().activeSessionId;
  }
  async function reloadActiveSafe() {
    const ap = useSessionStore.getState().activeSessionPath;
    if (ap) await useSessionStore.getState().selectSessionPath(ap);
    await useSessionStore.getState().refreshIndex();
  }

  useEffect(() => {
    const unsubs = [
      ccrIpcClient.subscribeAgentTokens(({ sessionId: sid, token }) => {
        if (sid !== activeSid()) return;
        useRunStore.setState((s) => ({ streamingTail: s.streamingTail + token }));
      }),
      ccrIpcClient.subscribeAgentAssistantEnd(({ sessionId: sid, content }) => {
        if (sid !== activeSid()) return;
        useRunStore.getState().finalizeAssistantTurn(content);
      }),
      ccrIpcClient.subscribeAgentQuota(props.onQuotaPush),
      ccrIpcClient.subscribeToolStart(({ sessionId: sid, name, argsPreview }) => {
        if (sid !== activeSid()) return;
        useRunStore.getState().toolStart(name, argsPreview);
      }),
      ccrIpcClient.subscribeToolEnd(({ sessionId: sid, name, result, isError }) => {
        if (sid !== activeSid()) return;
        useRunStore.getState().toolEnd(name, result, isError);
      }),
      ccrIpcClient.subscribeApprovalRequest(({ sessionId: sid, requestId, kind, title, detail }) => {
        if (sid !== activeSid()) return;
        useRunStore.setState({ approval: { requestId, kind, title, detail } });
      }),
      ccrIpcClient.subscribeAskRequest(({ sessionId: sid, requestId, questions }) => {
        if (sid !== activeSid()) return;
        setAskAccum({ requestId, questions: questions ?? [], step: 0, answers: [] });
      }),
      ccrIpcClient.subscribeAgentDone(({ sessionId: sid }) => {
        if (sid !== activeSid()) return;
        setRunning(false);
        useRunStore.getState().setRunningSession(null);
        void reloadActiveSafe();
      }),
      ccrIpcClient.subscribeAgentError(({ sessionId: sid, message }) => {
        if (sid !== activeSid()) return;
        setRunning(false);
        useRunStore.getState().setRunningSession(null);
        useRunStore.getState().sysLine(message, "error");
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [props]);

  function buildPrompt(text: string): string {
    if (attached.length === 0) return text;
    const blocks = attached.map((a) => {
      const note = a.truncated ? " (truncated)" : "";
      return `--- File: ${a.basename}${note} ---\n${a.content}\n--- End ${a.basename} ---`;
    });
    return `${blocks.join("\n\n")}\n\n${text}`;
  }

  async function submit() {
    const text = input.trim();
    const sid = sessionId;
    const pr = projectRoot ?? useSessionStore.getState().bootstrapDefaultProjectRoot;
    const sp = sessionPath;
    if (!text && attached.length === 0) return;
    if (readOnlyForeign) {
      useRunStore.getState().sysLine("Read-only — another window holds the lock.", "warn");
      return;
    }
    if (!sid || !pr || !sp) {
      useRunStore.getState().sysLine(
        "Pick or create a session before sending.",
        "warn",
      );
      return;
    }
    if (running) return;
    setRunning(true);
    const composed = buildPrompt(text || "(see attached file)");
    setInput("");
    setAttached([]);
    useRunStore.getState().pushUserEcho(text || `(attached ${attached.length} file)`);
    useRunStore.setState({ streamingTail: "" });
    useRunStore.getState().setRunningSession(sid);

    try {
      const res = await ccrIpcClient.startAgent({
        sessionId: sid,
        projectRoot: pr,
        model: props.model,
        mode: props.mode,
        text: composed,
      });
      if (!res.ok) {
        useRunStore.getState().setRunningSession(null);
        setRunning(false);
        useRunStore.getState().sysLine(res.error + (res.lockPid != null ? ` (PID ${res.lockPid})` : ""), "error");
        return;
      }
    } catch (e: any) {
      setRunning(false);
      useRunStore.getState().setRunningSession(null);
      useRunStore.getState().sysLine(e?.message ?? String(e), "error");
    }
  }

  async function handleFilePick(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = ""; // reset so picking the same file twice fires
    if (!file) return;
    // Electron file inputs expose file.path
    const filePath = (file as unknown as { path?: string }).path;
    if (!filePath) {
      useRunStore.getState().sysLine("Could not resolve file path.", "warn");
      return;
    }
    const res = await ccrIpcClient.readFile({ path: filePath });
    if (!res.ok || res.content == null) {
      useRunStore.getState().sysLine(res.error ?? "Failed to read file.", "warn");
      return;
    }
    const next: AttachedFile = {
      basename: res.basename ?? file.name,
      path: filePath,
      content: res.content,
      truncated: !!res.truncated,
    };
    setAttached((prev) => [...prev, next]);
  }

  async function takeoverLock() {
    if (!sessionPath || !sessionId) return;
    if (readOnlyForeign && !takeConfirm) {
      setTakeConfirm(true);
      return;
    }
    setTakeConfirm(false);
    const r = await ccrIpcClient.takeoverLock(sessionPath, sessionId);
    if (!r.ok) {
      window.alert(`${r.error}\n\nPID ${r.pid ?? "?"}`);
      return;
    }
    await reloadActiveSafe();
  }

  const askQ = askAccum?.questions[askAccum.step];
  const catalog = KNOWN_MODELS as readonly string[];
  const modelInCatalog = catalog.includes(props.model);
  const modelList = modelInCatalog ? catalog : [props.model, ...catalog];

  const status = readOnlyForeign
    ? { label: `Locked · PID ${foreignPid}`, bg: themeVals.amberSoft, color: themeVals.amber }
    : running
      ? { label: "Streaming…", bg: themeVals.claySoft, color: themeVals.clay }
      : { label: "Synced", bg: themeVals.sageSoft, color: themeVals.sage };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 0,
        height: "100%",
        background: themeVals.bg,
      }}
    >
      {takeConfirm && readOnlyForeign && (
        <div
          style={{
            padding: "10px 14px",
            background: themeVals.amberSoft,
            color: themeVals.amber,
            fontSize: 13,
            display: "flex",
            gap: 12,
            alignItems: "center",
            borderBottom: `1px solid ${themeVals.borderSoft}`,
          }}
        >
          <span style={{ flex: 1 }}>
            Take over this session? The other window stops holding the lock only if its PID has exited.
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setTakeConfirm(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void takeoverLock()}>
            Take over
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* ── Breadcrumb header ── */}
        <div
          style={{
            padding: "13px 24px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: `1px solid ${themeVals.borderSoft}`,
            flexShrink: 0,
            minHeight: 50,
            background: themeVals.bg,
          }}
        >
          {sessionId ? (
            <>
              <span style={{ color: themeVals.textSoft, fontSize: 12 }}>{projectName} ⏵</span>
              <span
                style={{
                  color: themeVals.text,
                  fontSize: 15,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 420,
                  fontFamily: "var(--font-serif)",
                  letterSpacing: "-0.01em",
                }}
                title={sessionId}
              >
                {headerTitle}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: status.bg,
                  color: status.color,
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {status.label}
              </span>
            </>
          ) : (
            <span style={{ color: themeVals.textSoft, fontSize: 13 }}>
              Pick a session on the left, or start a new one.
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span
            style={{
              color: themeVals.textMute,
              fontSize: 11.5,
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
            title="Active model"
          >
            {props.model}
          </span>
          <button
            type="button"
            onClick={() => props.onOpenCommandBar?.()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 7,
              border: `1px solid ${themeVals.borderSoft}`,
              background: themeVals.white,
              color: themeVals.textDim,
              cursor: "pointer",
              fontSize: 11.5,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <span>Command bar</span>
            <span style={{ fontFamily: "var(--font-mono)", color: themeVals.textSoft }}>⌘K</span>
          </button>
        </div>

        {/* Empty state */}
        {entries.length === 0 && streamingTail.length === 0 && sessionId && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              padding: 32,
              color: themeVals.textMute,
            }}
          >
            <pre
              style={{
                color: themeVals.clay,
                fontSize: 14,
                lineHeight: 1.15,
                margin: 0,
                whiteSpace: "pre",
                fontFamily: "var(--font-mono)",
              }}
            >{`  /\\_/\\
 ( o.o )
  > ^ <
 /     \\
(__|_|__)`}</pre>
            <div
              style={{
                fontSize: 26,
                color: themeVals.text,
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                transform: "rotate(-1deg)",
              }}
            >
              Ready when you are.
            </div>
            <div style={{ fontSize: 13, color: themeVals.textMute, textAlign: "center", maxWidth: 380 }}>
              Type a request below — read code, run shell commands, edit files. ccr will ask before doing anything destructive.
            </div>
          </div>
        )}

        <div
          ref={parentRef}
          style={{
            flex: entries.length === 0 && streamingTail.length === 0 && sessionId ? 0 : 1,
            minHeight: 0,
            overflow: "auto",
            padding: "18px 26px 20px",
          }}
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((vr) => {
              const streamingRow = vr.index >= entries.length;
              const row = streamingRow ? null : entries[vr.index];

              return (
                <div
                  key={vr.key}
                  data-index={vr.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vr.start}px)`,
                  }}
                >
                  {row ? <MessageCard entry={row as ChatPaneEntry} themeCss={themeCss} /> : null}
                  {streamingRow && (
                    <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 7,
                          background: themeVals.clay,
                          color: "#fff",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        cc
                      </div>
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          color: themeVals.text,
                          fontSize: 14,
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {streamingTail}
                        <span
                          style={{
                            display: "inline-block",
                            width: 2,
                            height: 15,
                            background: themeVals.clay,
                            marginLeft: 2,
                            verticalAlign: -3,
                            animation: "blinkCaret 1s steps(1) infinite",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Composer ── */}
      <div
        style={{
          flexShrink: 0,
          padding: "12px 24px 18px",
          background: themeVals.bg,
          borderTop: `1px solid ${themeVals.borderSoft}`,
        }}
      >
        {/* Mode pills */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {MODE_DEFS.map((mo) => {
            const on = props.mode === mo.key;
            return (
              <button
                key={mo.key}
                type="button"
                title={mo.desc}
                onClick={() => props.onSetMode?.(mo.key)}
                style={{
                  padding: "5px 11px",
                  borderRadius: 999,
                  border: `1px solid ${on ? themeVals.clay : themeVals.borderSoft}`,
                  background: on ? themeVals.clay : "transparent",
                  color: on ? "#fff" : themeVals.textDim,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {mo.label}
              </button>
            );
          })}
        </div>

        {readOnlyForeign && (
          <div style={{ marginBottom: 10, fontSize: 12, color: themeVals.amber }}>
            Live tail only — edits disabled while PID {foreignPid} holds the lock.{" "}
            <button
              type="button"
              style={{
                cursor: "pointer",
                color: themeVals.clay,
                background: "transparent",
                border: "none",
                padding: 0,
                fontSize: 12,
                textDecoration: "underline",
              }}
              onClick={() => void takeoverLock()}
            >
              Open here…
            </button>
          </div>
        )}

        {/* Attached files chips */}
        {attached.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {attached.map((a, i) => (
              <span
                key={a.path + i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "4px 9px",
                  borderRadius: 999,
                  background: themeVals.bgAlt2,
                  color: themeVals.text,
                  border: `1px solid ${themeVals.borderSoft}`,
                }}
                title={a.path}
              >
                📎 {a.basename}
                {a.truncated && (
                  <span style={{ color: themeVals.amber, fontSize: 10 }}>(trim)</span>
                )}
                <button
                  type="button"
                  onClick={() => setAttached((prev) => prev.filter((_, j) => j !== i))}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: themeVals.textMute,
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                  }}
                  aria-label={`Remove ${a.basename}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            border: `1px solid ${themeVals.borderSoft}`,
            borderRadius: 12,
            background: themeVals.white,
            padding: "10px 12px 8px",
            transition: "border-color 0.12s, box-shadow 0.12s",
          }}
          onFocusCapture={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = themeVals.clay;
            el.style.boxShadow = "0 0 0 3px rgba(217, 119, 87, 0.12)";
          }}
          onBlurCapture={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = themeVals.borderSoft;
            el.style.boxShadow = "none";
          }}
        >
          <textarea
            disabled={readOnlyForeign || running}
            value={input}
            rows={3}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                ((e.ctrlKey || e.metaKey) && e.key === "Enter") ||
                (!e.shiftKey && e.key === "Enter" && input.trim())
              ) {
                if (!e.ctrlKey && !e.metaKey && e.key === "Enter") e.preventDefault();
                void submit();
              }
            }}
            placeholder={
              readOnlyForeign
                ? "Subscribe-only mirror"
                : sessionId
                  ? "Message ccr…"
                  : "Pick a session on the left, or click + New session"
            }
            style={{
              width: "100%",
              background: "transparent",
              color: themeVals.text,
              border: "none",
              outline: "none",
              fontFamily: "var(--font-sans)",
              fontSize: 14.5,
              resize: "none",
              lineHeight: 1.55,
            }}
          />

          {/* Composer footer: file upload (left) + model picker + send */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              paddingTop: 6,
              borderTop: `1px solid ${themeVals.borderSoft2}`,
            }}
          >
            <button
              type="button"
              className="btn-icon"
              title="Attach file"
              aria-label="Attach file"
              onClick={() => fileInputRef.current?.click()}
              disabled={readOnlyForeign || running}
              style={{ borderColor: "transparent", width: 28, height: 28, padding: 0 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.42 17.41a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => void handleFilePick(e)}
              style={{ display: "none" }}
            />

            <div style={{ flex: 1 }} />

            {/* Model picker — custom popup so it matches the cream palette */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setModelMenuOpen((v) => !v)}
                disabled={running}
                title="Model"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: themeVals.bgAlt,
                  border: `1px solid ${themeVals.borderSoft}`,
                  borderRadius: 6,
                  color: themeVals.textDim,
                  padding: "5px 9px",
                  fontSize: 11.5,
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  maxWidth: 220,
                }}
              >
                <span
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {props.model}
                </span>
                <span style={{ color: themeVals.textSoft }}>▾</span>
              </button>
              {modelMenuOpen && (
                <>
                  <div
                    onClick={() => setModelMenuOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 60 }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      right: 0,
                      marginBottom: 6,
                      width: 260,
                      maxHeight: 220,
                      overflow: "auto",
                      background: themeVals.white,
                      border: `1px solid ${themeVals.borderSoft}`,
                      borderRadius: 9,
                      boxShadow: "0 12px 30px rgba(20, 20, 19, 0.16)",
                      zIndex: 61,
                      padding: 4,
                    }}
                  >
                    {modelList.map((m) => {
                      const on = m === props.model;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            props.onPickModel(m);
                            setModelMenuOpen(false);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "7px 10px",
                            borderRadius: 6,
                            border: "none",
                            background: on ? themeVals.bgAlt2 : "transparent",
                            color: on ? themeVals.text : themeVals.textDim,
                            fontSize: 12,
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                          }}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => void submit()}
              disabled={readOnlyForeign || running || (!input.trim() && attached.length === 0)}
              className="btn btn-primary"
              style={{ padding: "7px 16px", fontSize: 13 }}
            >
              {running ? "…" : "Send"}
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: themeVals.textSoft,
            display: "flex",
            gap: 14,
            paddingLeft: 4,
          }}
        >
          <span>Enter to send</span>
          <span>Shift+Enter newline</span>
          <span>⌘K command bar</span>
        </div>
      </div>

      {approval && (
        <ApprovalModal
          kind={approval.kind}
          title={approval.title}
          detail={approval.detail}
          onAnswer={async (yes) => {
            await ccrIpcClient.approvalResponse(approval.requestId, yes);
            setApproval(null);
          }}
          onAcceptAll={
            approval.kind === "edit"
              ? async () => {
                  await ccrIpcClient.approvalResponse(approval.requestId, true);
                  setApproval(null);
                }
              : undefined
          }
        />
      )}

      {askAccum && askQ && (
        <QuestionModal
          step={askAccum.step}
          total={askAccum.questions.length}
          question={askQ}
          onPickOption={async (choice) => {
            const next = [...askAccum.answers, { answer: choice }];
            if (askAccum.step + 1 >= askAccum.questions.length) {
              await ccrIpcClient.askResponse(askAccum.requestId, next);
              setAskAccum(null);
            } else {
              setAskAccum({ ...askAccum, answers: next, step: askAccum.step + 1 });
            }
          }}
          onSubmitFreeText={async (ans) => {
            const next = [...askAccum.answers, { answer: ans }];
            if (askAccum.step + 1 >= askAccum.questions.length) {
              await ccrIpcClient.askResponse(askAccum.requestId, next);
              setAskAccum(null);
            } else {
              setAskAccum({ ...askAccum, answers: next, step: askAccum.step + 1 });
            }
          }}
        />
      )}
    </div>
  );
}
