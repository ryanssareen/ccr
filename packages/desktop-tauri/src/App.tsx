import { useEffect, useMemo, useState } from "react";

import { bridge } from "./tauri-bridge";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

interface LogEntry {
  id: string;
  title: string;
  detail: string;
}

interface QuotaState {
  used: number;
  limit: number;
  resetAt: string;
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
  const [status, setStatus] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const push = (title: string, detail: string) => {
    setLog((entries) =>
      [
        {
          id: `${Date.now()}-${entries.length}`,
          title,
          detail: `${stamp()} · ${detail}`,
        },
        ...entries,
      ].slice(0, 16)
    );
  };

  useEffect(() => {
    void bridge
      .readAuth()
      .then((auth) => setAuthEmail(auth?.email ?? null))
      .catch(() => setAuthEmail(null));
  }, []);

  const quotaLine = useMemo(() => {
    if (!quota) return "Quota will appear once the proxy returns headers.";
    return `${quota.used} / ${quota.limit} · resets ${new Date(quota.resetAt).toLocaleString()}`;
  }, [quota]);

  async function handleSendHi() {
    setRunning(true);
    setError(null);
    setStatus("starting agent run…");
    setLastReply(null);

    try {
      const auth = await bridge.readAuth();
      if (!auth) {
        throw new Error('Not signed in. Run "ccr login" in a terminal first.');
      }
      push("auth", `loaded as ${auth.email}`);

      const res = await fetch(`${auth.endpoint}/api/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [{ role: "user", content: "Say hello in two words." }],
          max_tokens: 30,
          temperature: 0,
        }),
      });

      const used = res.headers.get("X-CCR-Quota-Used");
      const limit = res.headers.get("X-CCR-Quota-Limit");
      const resetAt = res.headers.get("X-CCR-Quota-Reset");
      if (used && limit && resetAt) {
        setQuota({ used: Number(used), limit: Number(limit), resetAt });
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content ?? "(empty)";
      setLastReply(content);
      push("agent:reply", content);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
      setStatus(null);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Tauri build · v0.2.0</div>
        <h1>Hello, CCR.</h1>
        <p>
          Same agent as the CLI, on the OS&apos;s native webview. Bundle is
          ~10× smaller than the Electron build because there&apos;s no
          Chromium ridealong.
        </p>
        <div className="toolbar">
          <button className="cta" type="button" onClick={handleSendHi} disabled={running}>
            Send &apos;hi&apos;
          </button>
          <div className="status-chip">{running ? "Agent running" : "Idle"}</div>
          <div className="status-chip">
            {authEmail ? `Signed in as ${authEmail}` : "Not signed in — run `ccr login`"}
          </div>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Live Events</h2>
          <ul className="log-list">
            {log.length === 0 ? (
              <li className="log-item">
                <strong>Waiting</strong>
                <div>Press &quot;Send &apos;hi&apos;&quot; to exercise the proxy round-trip.</div>
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
            <li>Status: {status ?? "idle"}</li>
            <li>Last reply: {lastReply ?? "(waiting)"}</li>
            <li>Quota: {quotaLine}</li>
            <li className={error ? "error" : undefined}>
              Error: {error ?? '(none — sign in via `ccr login` if needed)'}
            </li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
