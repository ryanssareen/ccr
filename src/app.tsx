import React, { useState, useRef, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import SelectInput from "ink-select-input";
import {
  runAgent,
  initialMessages,
  makeSubagentRunner,
  type AgentRun,
  type QuotaState,
  type Reporter,
} from "./agent.js";
import type {
  Approver,
  ApprovalRequest as ToolApprovalRequest,
  Asker,
  AskAnswer,
  AskQuestion,
  AskRequest,
  ToolContext,
} from "./tools.js";
import { saveSession, listSessions, newSessionId } from "./session.js";
import path from "node:path";

export type Mode = "ask" | "accept-edits" | "bypass";

const MODE_LABEL: Record<Mode, string> = {
  ask: "ask for every edit + bash (safest)",
  "accept-edits": "auto-accept file edits, ask for bash",
  bypass: "auto-approve everything (yolo)",
};

interface ToolEntry {
  kind: "tool";
  name: string;
  argsPreview: string;
  result?: string;
  isError?: boolean;
}
interface AssistantEntry {
  kind: "assistant";
  text: string;
}
interface UserEntry {
  kind: "user";
  text: string;
}
interface SystemEntry {
  kind: "system";
  text: string;
  tone?: "info" | "warn" | "error";
}
type Entry = ToolEntry | AssistantEntry | UserEntry | SystemEntry;

interface PendingApproval extends ToolApprovalRequest {
  resolve: (approved: boolean) => void;
}

interface PendingAsk extends AskRequest {
  resolve: (answers: AskAnswer[]) => void;
}

interface AppProps {
  root: string;
  model: string;
  mode: Mode;
  initialSessionId: string;
  initialApiMessages: any[];
  initialPrompt: string | null;
  buildClient: (onQuota?: (q: QuotaState) => void) => any;
  loadProjectContext: () => Promise<string>;
}

const KNOWN_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "moonshotai/kimi-k2-instruct",
  "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
];

function formatResetDate(d: Date): string {
  // "May 1" — short, no year (resets are always within ~30 days)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function QuotaLine({ quota }: { quota: QuotaState }): React.ReactElement {
  const ratio = quota.limit > 0 ? quota.used / quota.limit : 0;
  const exceeded = ratio >= 1;
  const warning = !exceeded && ratio >= 0.8;
  const color = exceeded ? "red" : warning ? "yellow" : undefined;
  const dim = !color;
  return (
    <Text color={color} dimColor={dim}>
      quota {quota.used.toLocaleString()} / {quota.limit.toLocaleString()}
      {" · resets "}
      {formatResetDate(quota.resetAt)}
      {exceeded ? " · LIMIT REACHED" : warning ? " · approaching limit" : ""}
    </Text>
  );
}

function colorizeDiffLine(line: string): React.ReactNode {
  if (line.startsWith("+++") || line.startsWith("---"))
    return <Text bold>{line}</Text>;
  if (line.startsWith("@@")) return <Text color="cyan">{line}</Text>;
  if (line.startsWith("+")) return <Text color="green">{line}</Text>;
  if (line.startsWith("-")) return <Text color="red">{line}</Text>;
  return <Text>{line}</Text>;
}

function DiffOrText({ text }: { text: string }) {
  const lines = text.split("\n");
  const looksLikeDiff = /^(---|\+\+\+|@@)/m.test(text);
  if (!looksLikeDiff) return <Text>{text}</Text>;
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Box key={i}>{colorizeDiffLine(line)}</Box>
      ))}
    </Box>
  );
}

function summarize(s: string, max = 200): string {
  const first = s.split("\n")[0] ?? "";
  return first.length > max ? first.slice(0, max) + "…" : first;
}

function summarizeForTool(name: string, result: string): string {
  if (result.startsWith("ERROR") || result.startsWith("DENIED")) return summarize(result);
  const lines = result.split("\n").filter((l) => l.length > 0);
  if (name === "glob" || name === "grep") {
    if (result === "(no matches)") return "(no matches)";
    const count = lines.length;
    const preview = lines.slice(0, 3).map((l) => "  " + l).join("\n");
    const more = count > 3 ? `\n  … +${count - 3} more` : "";
    return `${count} result${count === 1 ? "" : "s"}\n${preview}${more}`;
  }
  return summarize(result);
}

function ToolCard({ entry }: { entry: ToolEntry }) {
  const pending = entry.result === undefined;
  const colour = pending ? "yellow" : entry.isError ? "red" : "green";
  const icon = pending ? "◌" : entry.isError ? "✗" : "✓";
  return (
    <Box flexDirection="column" marginY={0}>
      <Text>
        <Text color={colour}>{icon}</Text>
        <Text dimColor> {entry.name}</Text>
        <Text dimColor>({entry.argsPreview})</Text>
      </Text>
      {!pending && entry.result && (
        <Box paddingLeft={2} flexDirection="column">
          {summarizeForTool(entry.name, entry.result)
            .split("\n")
            .map((line, i) => (
              <Text key={i} dimColor>
                {line}
              </Text>
            ))}
        </Box>
      )}
    </Box>
  );
}

function MessageList({ entries }: { entries: Entry[] }) {
  return (
    <Box flexDirection="column">
      {entries.map((e, i) => {
        if (e.kind === "user") {
          return (
            <Box key={i} marginTop={1}>
              <Text color="cyan" bold>
                ›{" "}
              </Text>
              <Text>{e.text}</Text>
            </Box>
          );
        }
        if (e.kind === "assistant") {
          return (
            <Box key={i} marginTop={1} flexDirection="column">
              <Text color="magentaBright" bold>
                ⏺ ccr
              </Text>
              <Box paddingLeft={2}>
                <Text>{e.text}</Text>
              </Box>
            </Box>
          );
        }
        if (e.kind === "tool") {
          return (
            <Box key={i} paddingLeft={2}>
              <ToolCard entry={e} />
            </Box>
          );
        }
        const tone = e.tone ?? "info";
        const colour = tone === "error" ? "red" : tone === "warn" ? "yellow" : "gray";
        return (
          <Box key={i} flexDirection="column">
            {e.text.split("\n").map((line, j) => (
              <Text key={j} color={colour}>
                {line}
              </Text>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

function QuestionPanel({
  req,
  onComplete,
}: {
  req: PendingAsk;
  onComplete: (answers: AskAnswer[]) => void;
}) {
  const [step, setStep] = useState(0);
  const [collected, setCollected] = useState<AskAnswer[]>([]);
  const [freeText, setFreeText] = useState("");
  const [mode, setMode] = useState<"select" | "freetext">("select");
  const q: AskQuestion | undefined = req.questions[step];

  const finish = (next: AskAnswer[]) => {
    if (step + 1 >= req.questions.length) {
      onComplete(next);
    } else {
      setCollected(next);
      setStep(step + 1);
      setFreeText("");
      setMode("select");
    }
  };

  if (!q) return null;
  const baseItems = (q.options ?? []).map((o, i) => ({ label: o, value: `opt:${i}` }));
  const items = [...baseItems, { label: "Other (free text)…", value: "__other__" }];

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} marginY={1}>
      <Text bold color="magenta">
        ? ccr asks ({step + 1}/{req.questions.length})
      </Text>
      <Box marginTop={1}>
        <Text>{q.question}</Text>
      </Box>
      {mode === "select" ? (
        <Box marginTop={1} flexDirection="column">
          <SelectInput
            items={items}
            onSelect={(item) => {
              if (item.value === "__other__") {
                setMode("freetext");
                return;
              }
              const idx = parseInt(String(item.value).slice(4), 10);
              const answer = q.options[idx];
              finish([...collected, { answer }]);
            }}
          />
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>your answer: </Text>
          <TextInput
            value={freeText}
            onChange={setFreeText}
            onSubmit={(v) => {
              const trimmed = v.trim() || "(no answer)";
              finish([...collected, { answer: trimmed }]);
            }}
          />
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          {mode === "select" ? "↑↓ navigate · Enter pick" : "Enter to submit"}
        </Text>
      </Box>
    </Box>
  );
}

function ApprovalPanel({
  req,
  onAnswer,
  onAcceptAll,
}: {
  req: PendingApproval;
  onAnswer: (yes: boolean) => void;
  onAcceptAll: () => void;
}) {
  useInput((input, key) => {
    if (input === "y" || input === "Y" || key.return) onAnswer(true);
    else if (input === "n" || input === "N" || key.escape) onAnswer(false);
    else if (input === "a" || input === "A") onAcceptAll();
  });
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginY={1}>
      <Text bold color="yellow">
        ⚠ {req.title}
        <Text dimColor> ({req.kind})</Text>
      </Text>
      <Box marginTop={1}>
        <DiffOrText text={req.detail} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Approve? </Text>
        <Text color="green">[y]</Text>
        <Text dimColor> yes  </Text>
        <Text color="red">[n/Esc]</Text>
        <Text dimColor> no  </Text>
        {req.kind === "edit" && (
          <>
            <Text color="cyan">[a]</Text>
            <Text dimColor> accept all edits this session</Text>
          </>
        )}
      </Box>
    </Box>
  );
}

interface ModelPickerProps {
  models: string[];
  current: string;
  loading: boolean;
  onSelect: (name: string) => void;
  onCancel: () => void;
}

interface ModePickerProps {
  current: Mode;
  onSelect: (mode: Mode) => void;
  onCancel: () => void;
}

function ModePicker({ current, onSelect, onCancel }: ModePickerProps) {
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });
  const items: { label: string; value: Mode }[] = (
    ["ask", "accept-edits", "bypass"] as Mode[]
  ).map((m) => ({
    label:
      (m === current ? "● " : "  ") +
      m +
      "  " +
      MODE_LABEL[m] +
      (m === current ? "  (current)" : ""),
    value: m,
  }));
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginY={1}>
      <Text bold color="yellow">
        Pick a mode
      </Text>
      <Box marginTop={1} flexDirection="column">
        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter pick · Esc cancel</Text>
      </Box>
    </Box>
  );
}

function ModelPicker({ models, current, loading, onSelect, onCancel }: ModelPickerProps) {
  const [filter, setFilter] = useState("");
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });
  const items = models
    .filter((m) => m.toLowerCase().includes(filter.toLowerCase()))
    .map((m) => ({ label: m === current ? `${m}  (current)` : m, value: m }));
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginY={1}>
      <Text bold color="cyan">
        Pick a model {loading && <Text dimColor>(loading…)</Text>}
      </Text>
      <Box marginTop={1}>
        <Text dimColor>filter: </Text>
        <TextInput value={filter} onChange={setFilter} onSubmit={() => undefined} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        {items.length === 0 ? (
          <Text dimColor>(no matches — Esc to cancel)</Text>
        ) : (
          <SelectInput
            items={items}
            limit={8}
            onSelect={(item) => onSelect(item.value)}
          />
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter pick · Esc cancel</Text>
      </Box>
    </Box>
  );
}

export function App(props: AppProps) {
  const { exit } = useApp();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [streaming, setStreaming] = useState<string>("");
  const [running, setRunning] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [askRequest, setAskRequest] = useState<PendingAsk | null>(null);
  const [exitConfirm, setExitConfirm] = useState<boolean>(false);
  const [model, setModel] = useState<string>(props.model);
  const [mode, setMode] = useState<Mode>(props.mode);
  const [picker, setPicker] = useState<{ models: string[]; loading: boolean } | null>(null);
  const [modePicker, setModePicker] = useState<boolean>(false);
  const [status, setStatus] = useState<string | null>(null);
  const [quota, setQuotaState] = useState<QuotaState | null>(null);

  const apiMessagesRef = useRef<any[]>(props.initialApiMessages);
  const sessionIdRef = useRef<string>(props.initialSessionId);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef<boolean>(false);
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const pushEntry = useCallback((e: Entry) => {
    setEntries((prev) => [...prev, e]);
  }, []);

  const approve: Approver = useCallback(
    (req) => {
      const m = modeRef.current;
      if (m === "bypass") {
        pushEntry({ kind: "system", text: `[bypass] auto-approve: ${req.title}`, tone: "warn" });
        return Promise.resolve(true);
      }
      if (m === "accept-edits" && req.kind === "edit") {
        pushEntry({ kind: "system", text: `[accept-edits] auto-approve: ${req.title}`, tone: "warn" });
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve) => {
        setApproval({
          ...req,
          resolve: (v) => {
            setApproval(null);
            resolve(v);
          },
        });
      });
    },
    [pushEntry],
  );

  const ask: Asker = useCallback((req) => {
    return new Promise<AskAnswer[]>((resolve) => {
      setAskRequest({
        ...req,
        resolve: (answers) => {
          setAskRequest(null);
          resolve(answers);
        },
      });
    });
  }, []);

  const reporter: Reporter = {
    token: (s) => setStreaming((cur) => cur + s),
    assistantTurnEnd: (text) => {
      setStreaming("");
      pushEntry({ kind: "assistant", text });
    },
    toolCallStart: (name, argsPreview) => {
      pushEntry({ kind: "tool", name, argsPreview });
    },
    toolCallEnd: (name, result, isError) => {
      setEntries((prev) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          const e = prev[i];
          if (e.kind === "tool" && e.name === name && e.result === undefined) {
            const next = prev.slice();
            next[i] = { ...e, result, isError };
            return next;
          }
        }
        return prev;
      });
    },
    iterationCap: () => pushEntry({ kind: "system", text: "⚠ hit max iterations", tone: "warn" }),
    setStatus: (text) => setStatus(text),
    setQuota: (state) => setQuotaState(state),
  };

  const fetchModels = useCallback(async (): Promise<string[]> => {
    try {
      const client = props.buildClient(setQuotaState);
      const list = await client.models.list();
      const ids: string[] = [];
      for await (const m of list as any) {
        if (m?.id) ids.push(m.id);
      }
      ids.sort();
      return ids;
    } catch {
      return KNOWN_MODELS;
    }
  }, [props]);

  const openPicker = useCallback(async () => {
    setPicker({ models: KNOWN_MODELS, loading: true });
    const ids = await fetchModels();
    setPicker({ models: ids.length ? ids : KNOWN_MODELS, loading: false });
  }, [fetchModels]);

  const submit = useCallback(
    async (text: string) => {
      if (!text.trim() || running) return;
      const trimmed = text.trim();

      if (trimmed.startsWith("/")) {
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0];
        const arg = parts.slice(1).join(" ");
        if (cmd === "/exit" || cmd === "/quit") {
          exit();
          return;
        }
        if (cmd === "/help") {
          pushEntry({
            kind: "system",
            text:
              "Commands:\n" +
              "  /exit                 quit\n" +
              "  /clear                reset conversation\n" +
              "  /model [NAME]         switch model; no arg → picker with autocomplete\n" +
              "  /models               list known model names\n" +
              "  /mode [NAME]          ask | accept-edits | bypass; no arg → picker\n" +
              "  /yolo                 alias for /mode bypass\n" +
              "  /sessions             list saved sessions\n" +
              "  /save                 save session now\n" +
              "  /help                 this message",
          });
          return;
        }
        if (cmd === "/model") {
          if (!arg) {
            await openPicker();
            return;
          }
          setModel(arg);
          pushEntry({ kind: "system", text: `model → ${arg}` });
          return;
        }
        if (cmd === "/models") {
          pushEntry({
            kind: "system",
            text: "Known Groq models:\n  " + KNOWN_MODELS.join("\n  "),
          });
          return;
        }
        if (cmd === "/mode") {
          if (!arg) {
            setModePicker(true);
            return;
          }
          if (arg === "ask" || arg === "accept-edits" || arg === "bypass") {
            setMode(arg);
            pushEntry({ kind: "system", text: `mode → ${arg}: ${MODE_LABEL[arg]}`, tone: "warn" });
          } else {
            pushEntry({
              kind: "system",
              text: `unknown mode: ${arg}. valid: ask, accept-edits, bypass`,
              tone: "error",
            });
          }
          return;
        }
        if (cmd === "/yolo") {
          setMode("bypass");
          pushEntry({ kind: "system", text: "mode → bypass (yolo)", tone: "warn" });
          return;
        }
        if (cmd === "/clear") {
          apiMessagesRef.current = initialMessages(props.root, await props.loadProjectContext());
          setEntries([]);
          pushEntry({ kind: "system", text: "context cleared" });
          return;
        }
        if (cmd === "/sessions") {
          const sessions = await listSessions(props.root);
          pushEntry({
            kind: "system",
            text:
              sessions.length === 0
                ? "(no saved sessions)"
                : sessions.map((s) => "  " + path.basename(s, ".json")).join("\n"),
          });
          return;
        }
        if (cmd === "/save") {
          await saveSession(props.root, sessionIdRef.current, apiMessagesRef.current);
          pushEntry({ kind: "system", text: `saved ${sessionIdRef.current}` });
          return;
        }
        pushEntry({ kind: "system", text: `unknown command: ${cmd}`, tone: "warn" });
        return;
      }

      pushEntry({ kind: "user", text: trimmed });
      apiMessagesRef.current.push({ role: "user", content: trimmed });
      setRunning(true);

      const ac = new AbortController();
      abortRef.current = ac;

      const client = props.buildClient(setQuotaState);
      const ctx: ToolContext = { root: props.root, approve, ask };
      ctx.runSubagent = makeSubagentRunner(client, ctx, model, reporter);
      const run: AgentRun = {
        client,
        model,
        ctx,
        reporter,
        signal: ac.signal,
      };
      try {
        await runAgent(run, apiMessagesRef.current);
      } catch (e: any) {
        if (e?.message === "aborted" || ac.signal.aborted) {
          pushEntry({ kind: "system", text: "interrupted", tone: "warn" });
        } else {
          pushEntry({ kind: "system", text: `error: ${e?.message ?? e}`, tone: "error" });
        }
      } finally {
        setRunning(false);
        setStreaming("");
        setStatus(null);
        abortRef.current = null;
        try {
          await saveSession(props.root, sessionIdRef.current, apiMessagesRef.current);
        } catch {
          /* ignore */
        }
      }
    },
    [running, exit, props, pushEntry, approve, ask, model, openPicker],
  );

  useEffect(() => {
    if (!startedRef.current && props.initialPrompt) {
      startedRef.current = true;
      submit(props.initialPrompt);
    } else {
      startedRef.current = true;
    }
  }, []);

  useInput((char, key) => {
    if (approval || askRequest || picker || modePicker) return;
    if (key.ctrl && (char === "c" || char === "C")) {
      if (running && abortRef.current) {
        abortRef.current.abort();
        return;
      }
      if (exitConfirm) {
        exit();
      } else {
        setExitConfirm(true);
        setTimeout(() => setExitConfirm(false), 1500);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Text>
          <Text bold>ccr 1.3.0</Text>
          <Text dimColor> · model=</Text>
          <Text color="cyan">{model}</Text>
          <Text dimColor> · root=</Text>
          <Text color="green">{props.root}</Text>
        </Text>
        <Text dimColor>
          session={props.initialSessionId} · mode=
          <Text color={mode === "bypass" ? "red" : mode === "accept-edits" ? "yellow" : "green"}>
            {mode}
          </Text>
          {"  "}· /help for commands
        </Text>
        {quota && <QuotaLine quota={quota} />}
      </Box>

      <MessageList entries={entries} />

      {streaming && (
        <Box marginTop={1} flexDirection="column">
          <Text color="magentaBright" bold>
            ⏺ ccr
          </Text>
          <Box paddingLeft={2}>
            <Text>{streaming}</Text>
          </Box>
        </Box>
      )}

      {approval && (
        <ApprovalPanel
          req={approval}
          onAnswer={(yes) => approval.resolve(yes)}
          onAcceptAll={() => {
            setMode("accept-edits");
            pushEntry({
              kind: "system",
              text: "mode → accept-edits (auto-approving file edits this session)",
              tone: "warn",
            });
            approval.resolve(true);
          }}
        />
      )}

      {askRequest && (
        <QuestionPanel
          req={askRequest}
          onComplete={(answers) => askRequest.resolve(answers)}
        />
      )}

      {picker && (
        <ModelPicker
          models={picker.models}
          current={model}
          loading={picker.loading}
          onSelect={(name) => {
            setPicker(null);
            setModel(name);
            pushEntry({ kind: "system", text: `model → ${name}` });
          }}
          onCancel={() => setPicker(null)}
        />
      )}

      {modePicker && (
        <ModePicker
          current={mode}
          onSelect={(next) => {
            setModePicker(false);
            setMode(next);
            pushEntry({
              kind: "system",
              text: `mode → ${next}: ${MODE_LABEL[next]}`,
              tone: "warn",
            });
          }}
          onCancel={() => setModePicker(false)}
        />
      )}

      <Box marginTop={1}>
        {running ? (
          <Box flexDirection="column">
            <Box>
              <Text color="yellow">
                <Spinner type="dots" />
              </Text>
              <Text dimColor> {status ?? "thinking… (Ctrl-C to interrupt)"}</Text>
            </Box>
          </Box>
        ) : approval ? (
          <Text dimColor>(awaiting approval — y / n{approval.kind === "edit" ? " / a" : ""})</Text>
        ) : askRequest ? (
          <Text dimColor>(answering ccr's question — ↑↓ navigate, Enter to pick)</Text>
        ) : picker ? (
          <Text dimColor>(picking model — type to filter, Enter to choose)</Text>
        ) : modePicker ? (
          <Text dimColor>(picking mode — Enter to choose, Esc to cancel)</Text>
        ) : (
          <Box>
            <Text color="cyan" bold>
              ›{" "}
            </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={(v) => {
                setInput("");
                submit(v);
              }}
            />
          </Box>
        )}
      </Box>

      {exitConfirm && <Text dimColor>(press Ctrl-C again to exit)</Text>}
    </Box>
  );
}
