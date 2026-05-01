import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import SelectInput from "ink-select-input";
import { runAgent, initialMessages } from "./agent.js";
import { saveSession, listSessions } from "./session.js";
import path from "node:path";
const MODE_LABEL = {
    ask: "ask for every edit + bash (safest)",
    "accept-edits": "auto-accept file edits, ask for bash",
    bypass: "auto-approve everything (yolo)",
};
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
function formatResetDate(d) {
    // "May 1" — short, no year (resets are always within ~30 days)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function QuotaLine({ quota }) {
    const ratio = quota.limit > 0 ? quota.used / quota.limit : 0;
    const exceeded = ratio >= 1;
    const warning = !exceeded && ratio >= 0.8;
    const color = exceeded ? "red" : warning ? "yellow" : undefined;
    const dim = !color;
    return (_jsxs(Text, { color: color, dimColor: dim, children: ["quota ", quota.used.toLocaleString(), " / ", quota.limit.toLocaleString(), " · resets ", formatResetDate(quota.resetAt), exceeded ? " · LIMIT REACHED" : warning ? " · approaching limit" : ""] }));
}
function colorizeDiffLine(line) {
    if (line.startsWith("+++") || line.startsWith("---"))
        return _jsx(Text, { bold: true, children: line });
    if (line.startsWith("@@"))
        return _jsx(Text, { color: "cyan", children: line });
    if (line.startsWith("+"))
        return _jsx(Text, { color: "green", children: line });
    if (line.startsWith("-"))
        return _jsx(Text, { color: "red", children: line });
    return _jsx(Text, { children: line });
}
function DiffOrText({ text }) {
    const lines = text.split("\n");
    const looksLikeDiff = /^(---|\+\+\+|@@)/m.test(text);
    if (!looksLikeDiff)
        return _jsx(Text, { children: text });
    return (_jsx(Box, { flexDirection: "column", children: lines.map((line, i) => (_jsx(Box, { children: colorizeDiffLine(line) }, i))) }));
}
function summarize(s, max = 200) {
    const first = s.split("\n")[0] ?? "";
    return first.length > max ? first.slice(0, max) + "…" : first;
}
function summarizeForTool(name, result) {
    if (result.startsWith("ERROR") || result.startsWith("DENIED"))
        return summarize(result);
    const lines = result.split("\n").filter((l) => l.length > 0);
    if (name === "glob" || name === "grep") {
        if (result === "(no matches)")
            return "(no matches)";
        const count = lines.length;
        const preview = lines.slice(0, 3).map((l) => "  " + l).join("\n");
        const more = count > 3 ? `\n  … +${count - 3} more` : "";
        return `${count} result${count === 1 ? "" : "s"}\n${preview}${more}`;
    }
    return summarize(result);
}
function ToolCard({ entry }) {
    const pending = entry.result === undefined;
    const colour = pending ? "yellow" : entry.isError ? "red" : "green";
    const icon = pending ? "◌" : entry.isError ? "✗" : "✓";
    return (_jsxs(Box, { flexDirection: "column", marginY: 0, children: [_jsxs(Text, { children: [_jsx(Text, { color: colour, children: icon }), _jsxs(Text, { dimColor: true, children: [" ", entry.name] }), _jsxs(Text, { dimColor: true, children: ["(", entry.argsPreview, ")"] })] }), !pending && entry.result && (_jsx(Box, { paddingLeft: 2, flexDirection: "column", children: summarizeForTool(entry.name, entry.result)
                    .split("\n")
                    .map((line, i) => (_jsx(Text, { dimColor: true, children: line }, i))) }))] }));
}
function MessageList({ entries }) {
    return (_jsx(Box, { flexDirection: "column", children: entries.map((e, i) => {
            if (e.kind === "user") {
                return (_jsxs(Box, { marginTop: 1, children: [_jsxs(Text, { color: "cyan", bold: true, children: ["\u203A", " "] }), _jsx(Text, { children: e.text })] }, i));
            }
            if (e.kind === "assistant") {
                return (_jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(Text, { color: "magentaBright", bold: true, children: "\u23FA ccr" }), _jsx(Box, { paddingLeft: 2, children: _jsx(Text, { children: e.text }) })] }, i));
            }
            if (e.kind === "tool") {
                return (_jsx(Box, { paddingLeft: 2, children: _jsx(ToolCard, { entry: e }) }, i));
            }
            const tone = e.tone ?? "info";
            const colour = tone === "error" ? "red" : tone === "warn" ? "yellow" : "gray";
            return (_jsx(Box, { flexDirection: "column", children: e.text.split("\n").map((line, j) => (_jsx(Text, { color: colour, children: line }, j))) }, i));
        }) }));
}
function QuestionPanel({ req, onComplete }) {
    const [step, setStep] = useState(0);
    const [collected, setCollected] = useState([]);
    const [freeText, setFreeText] = useState("");
    const [mode, setMode] = useState("select");
    const q = req.questions[step];
    const finish = (next) => {
        if (step + 1 >= req.questions.length) {
            onComplete(next);
        }
        else {
            setCollected(next);
            setStep(step + 1);
            setFreeText("");
            setMode("select");
        }
    };
    if (!q)
        return null;
    const baseItems = (q.options ?? []).map((o, i) => ({ label: o, value: `opt:${i}` }));
    const items = [...baseItems, { label: "Other (free text)…", value: "__other__" }];
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "magenta", paddingX: 1, marginY: 1, children: [
        _jsxs(Text, { bold: true, color: "magenta", children: ["? ccr asks (", step + 1, "/", req.questions.length, ")"] }),
        _jsx(Box, { marginTop: 1, children: _jsx(Text, { children: q.question }) }),
        mode === "select"
            ? _jsx(Box, { marginTop: 1, flexDirection: "column", children: _jsx(SelectInput, { items: items, onSelect: (item) => {
                        if (item.value === "__other__") {
                            setMode("freetext");
                            return;
                        }
                        const idx = parseInt(String(item.value).slice(4), 10);
                        const answer = q.options[idx];
                        finish([...collected, { answer }]);
                    } }) })
            : _jsxs(Box, { marginTop: 1, children: [
                    _jsx(Text, { dimColor: true, children: "your answer: " }),
                    _jsx(TextInput, { value: freeText, onChange: setFreeText, onSubmit: (v) => {
                            const trimmed = v.trim() || "(no answer)";
                            finish([...collected, { answer: trimmed }]);
                        } })
                ] }),
        _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: mode === "select" ? "↑↓ navigate · Enter pick" : "Enter to submit" }) })
    ] }));
}
function ApprovalPanel({ req, onAnswer, onAcceptAll, }) {
    useInput((input, key) => {
        if (input === "y" || input === "Y" || key.return)
            onAnswer(true);
        else if (input === "n" || input === "N" || key.escape)
            onAnswer(false);
        else if (input === "a" || input === "A")
            onAcceptAll();
    });
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 1, marginY: 1, children: [_jsxs(Text, { bold: true, color: "yellow", children: ["\u26A0 ", req.title, _jsxs(Text, { dimColor: true, children: [" (", req.kind, ")"] })] }), _jsx(Box, { marginTop: 1, children: _jsx(DiffOrText, { text: req.detail }) }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { dimColor: true, children: "Approve? " }), _jsx(Text, { color: "green", children: "[y]" }), _jsx(Text, { dimColor: true, children: " yes  " }), _jsx(Text, { color: "red", children: "[n/Esc]" }), _jsx(Text, { dimColor: true, children: " no  " }), req.kind === "edit" && (_jsxs(_Fragment, { children: [_jsx(Text, { color: "cyan", children: "[a]" }), _jsx(Text, { dimColor: true, children: " accept all edits this session" })] }))] })] }));
}
function ModePicker({ current, onSelect, onCancel }) {
    useInput((_input, key) => {
        if (key.escape)
            onCancel();
    });
    const items = ["ask", "accept-edits", "bypass"].map((m) => ({
        label: (m === current ? "● " : "  ") +
            m +
            "  " +
            MODE_LABEL[m] +
            (m === current ? "  (current)" : ""),
        value: m,
    }));
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 1, marginY: 1, children: [_jsx(Text, { bold: true, color: "yellow", children: "Pick a mode" }), _jsx(Box, { marginTop: 1, flexDirection: "column", children: _jsx(SelectInput, { items: items, onSelect: (item) => onSelect(item.value) }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "\u2191\u2193 navigate \u00B7 Enter pick \u00B7 Esc cancel" }) })] }));
}
function ModelPicker({ models, current, loading, onSelect, onCancel }) {
    const [filter, setFilter] = useState("");
    useInput((_input, key) => {
        if (key.escape)
            onCancel();
    });
    const items = models
        .filter((m) => m.toLowerCase().includes(filter.toLowerCase()))
        .map((m) => ({ label: m === current ? `${m}  (current)` : m, value: m }));
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, marginY: 1, children: [_jsxs(Text, { bold: true, color: "cyan", children: ["Pick a model ", loading && _jsx(Text, { dimColor: true, children: "(loading\u2026)" })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { dimColor: true, children: "filter: " }), _jsx(TextInput, { value: filter, onChange: setFilter, onSubmit: () => undefined })] }), _jsx(Box, { marginTop: 1, flexDirection: "column", children: items.length === 0 ? (_jsx(Text, { dimColor: true, children: "(no matches \u2014 Esc to cancel)" })) : (_jsx(SelectInput, { items: items, limit: 8, onSelect: (item) => onSelect(item.value) })) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "\u2191\u2193 navigate \u00B7 Enter pick \u00B7 Esc cancel" }) })] }));
}
export function App(props) {
    const { exit } = useApp();
    const [entries, setEntries] = useState([]);
    const [streaming, setStreaming] = useState("");
    const [running, setRunning] = useState(false);
    const [input, setInput] = useState("");
    const [approval, setApproval] = useState(null);
    const [askRequest, setAskRequest] = useState(null);
    const [exitConfirm, setExitConfirm] = useState(false);
    const [model, setModel] = useState(props.model);
    const [mode, setMode] = useState(props.mode);
    const [picker, setPicker] = useState(null);
    const [modePicker, setModePicker] = useState(false);
    const [status, setStatus] = useState(null);
    const [quota, setQuotaState] = useState(null);
    const apiMessagesRef = useRef(props.initialApiMessages);
    const sessionIdRef = useRef(props.initialSessionId);
    const abortRef = useRef(null);
    const startedRef = useRef(false);
    const modeRef = useRef(mode);
    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);
    const pushEntry = useCallback((e) => {
        setEntries((prev) => [...prev, e]);
    }, []);
    const approve = useCallback((req) => {
        const m = modeRef.current;
        if (m === "bypass") {
            pushEntry({ kind: "system", text: `[bypass] auto-approve: ${req.title}`, tone: "warn" });
            return Promise.resolve(true);
        }
        if (m === "accept-edits" && req.kind === "edit") {
            pushEntry({ kind: "system", text: `[accept-edits] auto-approve: ${req.title}`, tone: "warn" });
            return Promise.resolve(true);
        }
        return new Promise((resolve) => {
            setApproval({
                ...req,
                resolve: (v) => {
                    setApproval(null);
                    resolve(v);
                },
            });
        });
    }, [pushEntry]);
    const ask = useCallback((req) => {
        return new Promise((resolve) => {
            setAskRequest({
                ...req,
                resolve: (answers) => {
                    setAskRequest(null);
                    resolve(answers);
                },
            });
        });
    }, []);
    const reporter = {
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
    const fetchModels = useCallback(async () => {
        try {
            const client = props.buildClient(setQuotaState);
            const list = await client.models.list();
            const ids = [];
            for await (const m of list) {
                if (m?.id)
                    ids.push(m.id);
            }
            ids.sort();
            return ids;
        }
        catch {
            return KNOWN_MODELS;
        }
    }, [props]);
    const openPicker = useCallback(async () => {
        setPicker({ models: KNOWN_MODELS, loading: true });
        const ids = await fetchModels();
        setPicker({ models: ids.length ? ids : KNOWN_MODELS, loading: false });
    }, [fetchModels]);
    const submit = useCallback(async (text) => {
        if (!text.trim() || running)
            return;
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
                    text: "Commands:\n" +
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
                }
                else {
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
                    text: sessions.length === 0
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
        const ctx = { root: props.root, approve, ask };
        const run = {
            client: props.buildClient(setQuotaState),
            model,
            ctx,
            reporter,
            signal: ac.signal,
        };
        try {
            await runAgent(run, apiMessagesRef.current);
        }
        catch (e) {
            if (e?.message === "aborted" || ac.signal.aborted) {
                pushEntry({ kind: "system", text: "interrupted", tone: "warn" });
            }
            else {
                pushEntry({ kind: "system", text: `error: ${e?.message ?? e}`, tone: "error" });
            }
        }
        finally {
            setRunning(false);
            setStreaming("");
            setStatus(null);
            abortRef.current = null;
            try {
                await saveSession(props.root, sessionIdRef.current, apiMessagesRef.current);
            }
            catch {
                /* ignore */
            }
        }
    }, [running, exit, props, pushEntry, approve, ask, model, openPicker]);
    useEffect(() => {
        if (!startedRef.current && props.initialPrompt) {
            startedRef.current = true;
            submit(props.initialPrompt);
        }
        else {
            startedRef.current = true;
        }
    }, []);
    useInput((char, key) => {
        if (approval || askRequest || picker || modePicker)
            return;
        if (key.ctrl && (char === "c" || char === "C")) {
            if (running && abortRef.current) {
                abortRef.current.abort();
                return;
            }
            if (exitConfirm) {
                exit();
            }
            else {
                setExitConfirm(true);
                setTimeout(() => setExitConfirm(false), 1500);
            }
        }
    });
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { borderStyle: "round", borderColor: "cyan", paddingX: 1, flexDirection: "column", children: [_jsxs(Text, { children: [_jsx(Text, { bold: true, children: "ccr 0.1.0" }), _jsx(Text, { dimColor: true, children: " \u00B7 model=" }), _jsx(Text, { color: "cyan", children: model }), _jsx(Text, { dimColor: true, children: " \u00B7 root=" }), _jsx(Text, { color: "green", children: props.root })] }), _jsxs(Text, { dimColor: true, children: ["session=", props.initialSessionId, " \u00B7 mode=", _jsx(Text, { color: mode === "bypass" ? "red" : mode === "accept-edits" ? "yellow" : "green", children: mode }), "  ", "\u00B7 /help for commands"] }), quota && _jsx(QuotaLine, { quota: quota })] }), _jsx(MessageList, { entries: entries }), streaming && (_jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(Text, { color: "magentaBright", bold: true, children: "\u23FA ccr" }), _jsx(Box, { paddingLeft: 2, children: _jsx(Text, { children: streaming }) })] })), approval && (_jsx(ApprovalPanel, { req: approval, onAnswer: (yes) => approval.resolve(yes), onAcceptAll: () => {
                    setMode("accept-edits");
                    pushEntry({
                        kind: "system",
                        text: "mode → accept-edits (auto-approving file edits this session)",
                        tone: "warn",
                    });
                    approval.resolve(true);
                } })), askRequest && (_jsx(QuestionPanel, { req: askRequest, onComplete: (answers) => askRequest.resolve(answers) })), picker && (_jsx(ModelPicker, { models: picker.models, current: model, loading: picker.loading, onSelect: (name) => {
                    setPicker(null);
                    setModel(name);
                    pushEntry({ kind: "system", text: `model → ${name}` });
                }, onCancel: () => setPicker(null) })), modePicker && (_jsx(ModePicker, { current: mode, onSelect: (next) => {
                    setModePicker(false);
                    setMode(next);
                    pushEntry({
                        kind: "system",
                        text: `mode → ${next}: ${MODE_LABEL[next]}`,
                        tone: "warn",
                    });
                }, onCancel: () => setModePicker(false) })), _jsx(Box, { marginTop: 1, children: running ? (_jsx(Box, { flexDirection: "column", children: _jsxs(Box, { children: [_jsx(Text, { color: "yellow", children: _jsx(Spinner, { type: "dots" }) }), _jsxs(Text, { dimColor: true, children: [" ", status ?? "thinking… (Ctrl-C to interrupt)"] })] }) })) : approval ? (_jsxs(Text, { dimColor: true, children: ["(awaiting approval \u2014 y / n", approval.kind === "edit" ? " / a" : "", ")"] })) : askRequest ? (_jsx(Text, { dimColor: true, children: "(answering ccr's question \u2014 \u2191\u2193 navigate, Enter to pick)" })) : picker ? (_jsx(Text, { dimColor: true, children: "(picking model \u2014 type to filter, Enter to choose)" })) : modePicker ? (_jsx(Text, { dimColor: true, children: "(picking mode \u2014 Enter to choose, Esc to cancel)" })) : (_jsxs(Box, { children: [_jsxs(Text, { color: "cyan", bold: true, children: ["\u203A", " "] }), _jsx(TextInput, { value: input, onChange: setInput, onSubmit: (v) => {
                                setInput("");
                                submit(v);
                            } })] })) }), exitConfirm && _jsx(Text, { dimColor: true, children: "(press Ctrl-C again to exit)" })] }));
}
//# sourceMappingURL=app.js.map