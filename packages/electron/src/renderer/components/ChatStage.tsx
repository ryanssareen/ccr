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
import type { DesktopMode } from "../theme.js";

const themeCss: Record<string, string> = { ...themeVals };

function StreamingCaret() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn((v) => !v), 480);
    return () => clearInterval(t);
  }, []);
  return <span style={{ opacity: on ? 0.3 : 1, color: themeVals.teal }}>│</span>;
}

interface AskAccum {
  requestId: string;
  questions: AskQuestion[];
  step: number;
  answers: Parameters<typeof ccrIpcClient.askResponse>[1];
}

/** Center transcript + streamed tokens + overlays + composer. */
export function ChatStage(props: {
  mode: DesktopMode;
  model: string;
  onQuotaPush: (q: unknown) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
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

  async function submit() {
    const text = input.trim();
    const sid = sessionId;
    // Fall back to bootstrap default when the session JSON predates the
    // projectRoot field (older CLI-written sessions).
    const pr = projectRoot ?? useSessionStore.getState().bootstrapDefaultProjectRoot;
    const sp = sessionPath;
    if (!text) return;
    if (readOnlyForeign) {
      useRunStore.getState().sysLine("Read-only — another window holds the lock.", "warn");
      return;
    }
    if (!sid || !pr || !sp) {
      useRunStore.getState().sysLine(
        "Pick or create a session before sending. (No active session selected.)",
        "warn",
      );
      return;
    }
    if (running) return;
    setRunning(true);
    setInput("");
    useRunStore.getState().pushUserEcho(text);
    useRunStore.setState({ streamingTail: "" });
    useRunStore.getState().setRunningSession(sid);

    try {
      const res = await ccrIpcClient.startAgent({
        sessionId: sid,
        projectRoot: pr,
        model: props.model,
        mode: props.mode,
        text,
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

  return (
    <div
      style={{
        gridArea: "chat",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#101218",
      }}
    >
      {takeConfirm && readOnlyForeign && (
        <div
          style={{
            padding: "10px 12px",
            background: "#2a1f12",
            color: themeVals.amber,
            fontSize: 13,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span style={{ flex: 1 }}>
            Take over this session? The other window stops holding the lock only if its PID has exited.
          </span>
          <button type="button" onClick={() => setTakeConfirm(false)}>
            Cancel
          </button>
          <button type="button" onClick={() => void takeoverLock()}>
            Take over
          </button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Breadcrumb header — Claude-Code style */}
        <div
          style={{
            padding: "10px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: `1px solid ${themeVals.borderDim}`,
            flexShrink: 0,
            minHeight: 44,
          }}
        >
          {sessionId ? (
            <>
              <span style={{ color: themeVals.textMute, fontSize: 12 }}>
                ⏵
              </span>
              <span
                style={{
                  color: themeVals.text,
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "calc(100% - 200px)",
                }}
                title={sessionId}
              >
                {headerTitle}
              </span>
            </>
          ) : (
            <span style={{ color: themeVals.textMute, fontSize: 13 }}>
              No session selected — pick one on the left or start a new one.
            </span>
          )}
          {readOnlyForeign && (
            <span style={{ marginLeft: "auto", color: themeVals.amber, fontSize: 11 }}>
              Locked · PID {foreignPid}
            </span>
          )}
          {running && !readOnlyForeign && (
            <span style={{ marginLeft: "auto", color: themeVals.teal, fontSize: 11 }}>
              Streaming…
            </span>
          )}
        </div>

        {/* Empty state when no messages yet */}
        {entries.length === 0 && streamingTail.length === 0 && sessionId && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: 32,
              color: themeVals.textMute,
            }}
          >
            <pre
              style={{
                color: themeVals.teal,
                fontSize: 14,
                lineHeight: 1.15,
                margin: 0,
                whiteSpace: "pre",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >{`  /\\_/\\
 ( o.o )
  > ^ <
 /     \\
(__|_|__)`}</pre>
            <div style={{ fontSize: 13, color: themeVals.text }}>
              Ready when you are.
            </div>
            <div style={{ fontSize: 12, color: themeVals.textMute, textAlign: "center", maxWidth: 340 }}>
              Type a request below — read code, run shell commands, edit files.
              ccr will ask before doing anything destructive.
            </div>
          </div>
        )}

        <div
          ref={parentRef}
          style={{
            flex: entries.length === 0 && streamingTail.length === 0 && sessionId ? 0 : 1,
            minHeight: 0,
            overflow: "auto",
            padding: "16px 22px 18px",
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
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 13,
                        color: themeVals.text,
                      }}
                    >
                      <span style={{ color: themeVals.teal, fontWeight: 700 }}>⏺ ccr </span>
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

      <div
        style={{
          flexShrink: 0,
          padding: "12px 22px 18px",
          background: "#101218",
        }}
      >
        {readOnlyForeign && (
          <div style={{ marginBottom: 10, fontSize: 12, color: themeVals.amber }}>
            Live tail only — edits disabled while PID {foreignPid} holds the lock.{" "}
            <button
              type="button"
              style={{
                cursor: "pointer",
                color: themeVals.teal,
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
        <div
          style={{
            border: `1px solid ${themeVals.border}`,
            borderRadius: 10,
            background: "#161922",
            padding: "10px 12px",
            transition: "border-color 0.12s",
          }}
          onFocusCapture={(e) =>
            ((e.currentTarget as HTMLDivElement).style.borderColor = themeVals.tealDim)
          }
          onBlurCapture={(e) =>
            ((e.currentTarget as HTMLDivElement).style.borderColor = themeVals.border)
          }
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
              fontFamily: "inherit",
              fontSize: 14,
              resize: "none",
              lineHeight: 1.5,
            }}
          />
          <div
            style={{
              marginTop: 6,
              fontSize: 10.5,
              color: themeVals.textMute,
              display: "flex",
              gap: 12,
            }}
          >
            <span>Enter to send</span>
            <span>Shift+Enter newline</span>
            <span>⌘K command bar</span>
          </div>
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
