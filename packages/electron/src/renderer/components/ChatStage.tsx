import React, { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AskQuestion } from "@ccr/core";
import { theme as themeVals } from "../theme.js";
import { ccrIpcClient } from "../ipc-client.js";
import { MessageCard } from "./MessageCard.js";
import { ApprovalModal } from "./ApprovalModal.js";
import { QuestionModal } from "./QuestionModal.js";
import { useSessionStore } from "../state/session-store.js";
import { type ChatPaneEntry, useRunStore } from "../state/run-store.js";
import { KNOWN_MODELS } from "../known-models.js";
import type { DesktopMode } from "../theme.js";

const themeCss: Record<string, string> = { ...themeVals };

function StreamingCaret() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn((v) => !v), 480);
    return () => clearInterval(t);
  }, []);
  return <span style={{ opacity: on ? 0.3 : 1, color: themeVals.clay }}>│</span>;
}

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
  onQuotaPush: (q: unknown) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionId = useSessionStore((s) => s.activeSessionId);
  const sessionPath = useSessionStore((s) => s.activeSessionPath);
  const projectRoot = useSessionStore((s) => s.activeProjectRoot);
  const foreignPid = useSessionStore((s) => s.foreignLockPid);
  const indexed = useSessionStore((s) => s.indexed);
  const activeListed = sessionPath
    ? indexed.find((s) => s.sessionPath === sessionPath)
    : undefined;
  const headerTitle = activeListed?.title ?? sessionId ?? null;

  const entries = useRunStore((s) => s.entries);
  const streamingTail = useRunStore((s) => s.streamingTail);
  const approval = useRunStore((s) => s.approval);
  const setApproval = useRunStore((s) => s.setApproval);

  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [takeConfirm, setTakeConfirm] = useState(false);
  const [askAccum, setAskAccum] = useState<AskAccum | null>(null);
  const [attached, setAttached] = useState<AttachedFile[]>([]);

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

  return (
    <div
      style={{
        gridArea: "chat",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: themeVals.bg,
      }}
    >
      {takeConfirm && readOnlyForeign && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(201, 142, 58, 0.14)",
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
        {/* Breadcrumb header */}
        <div
          style={{
            padding: "12px 22px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: `1px solid ${themeVals.borderSoft}`,
            flexShrink: 0,
            minHeight: 48,
            background: themeVals.bg,
          }}
        >
          {sessionId ? (
            <>
              <span style={{ color: themeVals.textMute, fontSize: 12 }}>⏵</span>
              <span
                style={{
                  color: themeVals.text,
                  fontSize: 14,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "calc(100% - 200px)",
                  fontFamily: "var(--font-serif)",
                  letterSpacing: "-0.01em",
                }}
                title={sessionId}
              >
                {headerTitle}
              </span>
            </>
          ) : (
            <span style={{ color: themeVals.textMute, fontSize: 13 }}>
              Pick a session on the left, or start a new one.
            </span>
          )}
          {readOnlyForeign && (
            <span style={{ marginLeft: "auto", color: themeVals.amber, fontSize: 11 }}>
              Locked · PID {foreignPid}
            </span>
          )}
          {running && !readOnlyForeign && (
            <span style={{ marginLeft: "auto", color: themeVals.clay, fontSize: 11 }}>
              Streaming…
            </span>
          )}
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
            padding: "16px 24px 18px",
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
                    <div
                      style={{
                        paddingLeft: 14,
                        fontFamily: "var(--font-mono)",
                        fontSize: 13.5,
                        color: themeVals.text,
                        lineHeight: 1.55,
                      }}
                    >
                      <span style={{ color: themeVals.clay, fontWeight: 700 }}>⏺ ccr </span>
                      <span style={{ whiteSpace: "pre-wrap" }}>{streamingTail}</span>
                      <StreamingCaret />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Composer */}
      <div
        style={{
          flexShrink: 0,
          padding: "12px 24px 18px",
          background: themeVals.bg,
          borderTop: `1px solid ${themeVals.borderSoft}`,
        }}
      >
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
                  padding: "4px 8px",
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

          {/* Composer footer: file upload (left) + model picker (middle-right) + send */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              paddingTop: 4,
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
              style={{ borderColor: "transparent" }}
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

            {/* Model picker — bottom middle-right */}
            <select
              value={modelInCatalog ? props.model : props.model}
              onChange={(e) => props.onPickModel(e.target.value)}
              disabled={running}
              style={{
                background: themeVals.bgAlt,
                border: `1px solid ${themeVals.borderSoft}`,
                borderRadius: 6,
                color: themeVals.textDim,
                padding: "4px 8px",
                fontSize: 11.5,
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                maxWidth: 220,
              }}
              title="Model"
            >
              {!modelInCatalog && (
                <option value={props.model}>{props.model}</option>
              )}
              {(KNOWN_MODELS as readonly string[]).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void submit()}
              disabled={readOnlyForeign || running || (!input.trim() && attached.length === 0)}
              className="btn btn-primary"
              style={{ padding: "7px 14px", fontSize: 13 }}
            >
              {running ? "…" : "Send"}
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: themeVals.textMute,
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
