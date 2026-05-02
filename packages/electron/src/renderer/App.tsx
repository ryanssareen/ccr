import { useEffect, useMemo, useState } from "react";
import { ipcClient } from "./ipc-client.js";
import type {
  AgentApprovalRequestPayload,
  AgentAskRequestPayload,
  AgentQuotaPayload,
} from "../shared/ipc.js";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

interface LogEntry {
  id: string;
  title: string;
  detail: string;
}

function stamp(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function App() {
  const [running, setRunning] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [quota, setQuota] = useState<AgentQuotaPayload | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    const push = (title: string, detail: string) => {
      setLog((entries) => [
        {
          id: `${Date.now()}-${entries.length}`,
          title,
          detail: `${stamp()} · ${detail}`,
        },
        ...entries,
      ].slice(0, 16));
    };

    const subscriptions = [
      ipcClient.onToken(({ sessionId, token }) => {
        push("agent:token", `${sessionId} → ${token}`);
      }),
      ipcClient.onAssistantTurnEnd(({ sessionId, content }) => {
        setLastReply(content);
        push("agent:assistant-turn-end", `${sessionId} → ${content}`);
      }),
      ipcClient.onToolStart(({ sessionId, name, argsPreview }) => {
        push("agent:tool-start", `${sessionId} → ${name}(${argsPreview})`);
      }),
      ipcClient.onToolEnd(({ sessionId, name, result, isError }) => {
        push("agent:tool-end", `${sessionId} → ${name} [${isError ? "error" : "ok"}] ${result}`);
      }),
      ipcClient.onApprovalRequest((payload: AgentApprovalRequestPayload) => {
        push("agent:approval-request", `${payload.sessionId} → ${payload.title}`);
      }),
      ipcClient.onAskRequest((payload: AgentAskRequestPayload) => {
        push("agent:ask-request", `${payload.sessionId} → ${payload.questions.length} question(s)`);
      }),
      ipcClient.onDone(({ sessionId }) => {
        setRunning(false);
        setStatus(null);
        push("agent:done", sessionId);
      }),
      ipcClient.onStatus(({ sessionId, text }) => {
        setStatus(text);
        push("agent:status", `${sessionId} → ${text ?? "(cleared)"}`);
      }),
      ipcClient.onQuota((nextQuota) => {
        setQuota(nextQuota);
        push("agent:quota", `${nextQuota.used}/${nextQuota.limit}`);
      }),
      ipcClient.onError(({ sessionId, message }) => {
        setError(message);
        setRunning(false);
        push("agent:error", `${sessionId} → ${message}`);
      }),
    ];

    return () => {
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  }, []);

  const quotaLine = useMemo(() => {
    if (!quota) return "Quota will appear here once the proxy returns headers.";
    return `${quota.used} / ${quota.limit} · resets ${new Date(quota.resetAt).toLocaleString()}`;
  }, [quota]);

  async function handleSendHi() {
    const sessionId = `desktop-stub-${Date.now()}`;
    setRunning(true);
    setError(null);
    setStatus("starting agent run…");
    setLastReply(null);
    setCurrentSessionId(sessionId);
    try {
      await ipcClient.start({
        sessionId,
        model: DEFAULT_MODEL,
        mode: "ask",
        text: "hi",
      });
    } catch (caught) {
      setRunning(false);
      setStatus(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Unit 4 / Electron Scaffold</div>
        <h1>Hello, CCR.</h1>
        <p>
          This window is intentionally tiny for now. The main process owns the real agent run, and
          every renderer action goes through the preload bridge with Node kept out of the page.
        </p>
        <div className="toolbar">
          <button className="cta" type="button" onClick={handleSendHi} disabled={running}>
            Send &apos;hi&apos;
          </button>
          <div className="status-chip">{running ? "Agent running" : "Idle"}</div>
          <div className="status-chip">Auth comes from `~/.ccr/auth.json`</div>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Live Events</h2>
          <ul className="log-list">
            {log.length === 0 ? (
              <li className="log-item">
                <strong>Waiting</strong>
                Press the stub button to exercise the full IPC chain.
              </li>
            ) : (
              log.map((entry) => (
                <li key={entry.id} className="log-item">
                  <strong>{entry.title}</strong>
                  <div>{entry.detail}</div>
                </li>
              ))
            )}
          </ul>
        </article>

        <aside className="panel">
          <h2>Run Snapshot</h2>
          <ul className="meta-list">
            <li>
              Session: <code>{currentSessionId ?? "(none yet)"}</code>
            </li>
            <li>Status: {status ?? "idle"}</li>
            <li>Last reply: {lastReply ?? "(waiting)"}</li>
            <li>Quota: {quotaLine}</li>
            <li className={error ? "error" : undefined}>
              Error: {error ?? "If you are not signed in yet, run `ccr login` in a terminal."}
            </li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
