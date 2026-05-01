import OpenAI from "openai";
import {
  dispatch,
  toolSchemas,
  type ToolContext,
  type SubagentRunOptions,
} from "./tools.js";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const PROXY_API_PATH = "/api/v1";
// llama-3.3-70b-versatile is the default because the 8b-instant model produces
// noticeably worse code (it'll happily return a shell one-liner when asked for
// a recursive function). Per-user quotas keep 70b traffic manageable across
// the multi-provider pool. Override via `/model` or `CCR_MODEL=...`.
export const DEFAULT_MODEL = process.env.CCR_MODEL || "llama-3.3-70b-versatile";

export interface QuotaState {
  used: number;
  limit: number;
  resetAt: Date;
}

export type QuotaListener = (state: QuotaState) => void;
const MAX_ITERATIONS = 25;

const SYSTEM_PROMPT = (root: string, projectContext: string) => `You are ccr, a terminal-native coding assistant operating inside the user's project directory.

Operating principles:
- Be concise. Prefer doing over narrating.
- Match effort to the request. Greetings, small talk, and trivial questions ("hi", "thanks", "what can you do?", simple factual questions you already know) get a short plain-text reply with NO tool calls.
- Only invoke tools when the task actually requires inspecting or changing the user's project, running a command, or asking the user something you cannot infer. Never call a tool just to look busy.
- Use read_file / glob / grep before answering questions about specific code. Do not guess file contents.
- For modifications, prefer edit_file or multi_edit. The user sees a diff and approves.
- Use bash for tests, builds, git, and other shell tasks. The user approves each command.
- When a request is genuinely ambiguous and a wrong guess would waste work, call ask_user_question with 1-3 short multiple-choice questions (each option list automatically gets a free-text "Other" path). Do NOT use it for things you can decide yourself or for trivial preferences.
- For large or parallelizable jobs (multi-file research, broad investigation, batch refactor) you can deploy a focused subagent via spawn_agent. Tell the user you're deploying an agent before calling. If the user did not specify which model the subagent should use, first call ask_user_question with a short list of plausible models so they can pick. Subagents share the user's approval flow — they cannot bypass it.
- If a tool call is denied, revise your plan; never retry the same denied action.
- When the task is complete, give a short final summary.

Project root: ${root}
${projectContext}`;

export interface BuildClientOptions {
  /** Managed-mode token from ~/.ccr/auth.json. */
  authToken?: string;
  /** Managed-mode service endpoint (e.g., https://ccr.vercel.app). */
  endpoint?: string;
  /** Direct-mode Groq API key (legacy / escape hatch). */
  apiKey?: string;
  /** Called after every chat completion that returns CCR quota headers. */
  onQuota?: QuotaListener;
}

export function buildClient(options: BuildClientOptions = {}): OpenAI {
  const { authToken, endpoint, apiKey, onQuota } = options;

  // Managed mode (preferred): hit the CCR proxy, which rotates across
  // multiple LLM providers and tracks per-user quota.
  if (authToken && endpoint) {
    const baseURL = `${endpoint.replace(/\/+$/, "")}${PROXY_API_PATH}`;
    return new OpenAI({
      apiKey: authToken,
      baseURL,
      fetch: makeQuotaCapturingFetch(onQuota),
    });
  }

  // Direct mode (legacy): hit Groq directly with a user-provided key.
  // Kept as an escape hatch for offline / power-user scenarios.
  const directKey = apiKey || process.env.GROQ_API_KEY;
  if (directKey) {
    return new OpenAI({ apiKey: directKey, baseURL: GROQ_BASE_URL });
  }

  throw new Error(
    "Not signed in. Run `ccr login` to sign up (free, no API key needed),\n" +
      "or set GROQ_API_KEY for direct Groq access.",
  );
}

/**
 * Wraps the native fetch so we can sniff CCR-specific quota headers off
 * every response (including streaming SSE) and forward them to the UI.
 * The OpenAI SDK supports a custom fetch, which is cleaner than parsing
 * after-the-fact.
 */
function makeQuotaCapturingFetch(onQuota?: QuotaListener): typeof fetch {
  if (!onQuota) return globalThis.fetch;
  return async (input: any, init?: any) => {
    const res = await globalThis.fetch(input, init);
    const used = res.headers.get("X-CCR-Quota-Used");
    const limit = res.headers.get("X-CCR-Quota-Limit");
    const resetAt = res.headers.get("X-CCR-Quota-Reset");
    if (used !== null && limit !== null && resetAt !== null) {
      const u = Number(used);
      const l = Number(limit);
      const r = new Date(resetAt);
      if (Number.isFinite(u) && Number.isFinite(l) && !Number.isNaN(r.getTime())) {
        try {
          onQuota({ used: u, limit: l, resetAt: r });
        } catch {
          // never let UI-side errors take down the request
        }
      }
    }
    return res;
  };
}

export function initialMessages(root: string, projectContext: string): any[] {
  return [{ role: "system", content: SYSTEM_PROMPT(root, projectContext) }];
}

export interface Reporter {
  /** Streaming token from the model. */
  token(s: string): void;
  /** Called once when the assistant produces a non-empty content turn. */
  assistantTurnEnd(content: string): void;
  /** Called when a tool call begins. */
  toolCallStart(name: string, argsPreview: string): void;
  /** Called when a tool call completes. */
  toolCallEnd(name: string, result: string, isError: boolean): void;
  /** Called when the agent loop hits the iteration cap. */
  iterationCap?(): void;
  /** Transient status line (e.g., 'retrying in 30s'). Pass null to clear. */
  setStatus?(text: string | null): void;
  /** Updated whenever the proxy returns fresh quota headers. */
  setQuota?(state: QuotaState): void;
}

interface ToolCallAcc {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AgentRun {
  client: OpenAI;
  model: string;
  ctx: ToolContext;
  reporter: Reporter;
  signal?: AbortSignal;
}

function shortArgs(args: any): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args ?? {})) {
    let s = JSON.stringify(v);
    if (s && s.length > 80) s = s.slice(0, 77) + '..."';
    parts.push(`${k}=${s}`);
  }
  return parts.join(", ");
}

function compactOldToolResults(messages: any[], keepRecent = 2): void {
  // Keep the last `keepRecent` tool messages full; replace older ones with a stub.
  const toolIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "tool") toolIndices.push(i);
  }
  if (toolIndices.length <= keepRecent) return;
  const cutoff = toolIndices.length - keepRecent;
  for (let k = 0; k < cutoff; k++) {
    const i = toolIndices[k];
    const m = messages[i];
    if (typeof m.content === "string" && m.content.length > 400 && !m.content.startsWith("[compacted]")) {
      m.content = `[compacted] earlier tool result (${m.content.length} chars). Re-call the tool if you need it again.`;
    }
  }
}

function isRateLimitError(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  const msg = err?.message || "";
  return (
    status === 413 ||
    status === 429 ||
    /Request too large/i.test(msg) ||
    /rate.?limit/i.test(msg) ||
    /tokens per minute/i.test(msg)
  );
}

function parseRetryAfterSeconds(err: any): number {
  // Try header first.
  const hdrs = err?.headers ?? err?.response?.headers;
  if (hdrs) {
    const get = typeof hdrs.get === "function" ? (k: string) => hdrs.get(k) : (k: string) => hdrs[k];
    const ra = get("retry-after") ?? get("Retry-After");
    if (ra) {
      const n = parseFloat(String(ra));
      if (!Number.isNaN(n) && n > 0) return Math.ceil(n);
    }
    const reset = get("x-ratelimit-reset-tokens") ?? get("X-RateLimit-Reset-Tokens");
    if (reset) {
      const m = String(reset).match(/(\d+(?:\.\d+)?)s/);
      if (m) return Math.ceil(parseFloat(m[1]));
      const n = parseFloat(String(reset));
      if (!Number.isNaN(n) && n > 0) return Math.ceil(n);
    }
  }
  // Fall back to parsing the message: "Please try again in 33.5s"
  const msg = err?.message || "";
  const m = msg.match(/try again in (\d+(?:\.\d+)?)\s*s/i);
  if (m) return Math.ceil(parseFloat(m[1]));
  // Default: wait for the next per-minute window to definitely roll.
  return 60;
}

function isUnrecoverableSize(err: any): boolean {
  // True 'request too large' where a single request can't ever fit.
  // Heuristic: explicit "Request too large" with Requested > 2× Limit.
  const msg = err?.message || "";
  const m = msg.match(/Limit\s+(\d+)[^\d]+Requested\s+(\d+)/i);
  if (m) {
    const limit = parseInt(m[1], 10);
    const requested = parseInt(m[2], 10);
    if (limit > 0 && requested > limit * 2) return true;
  }
  return false;
}

async function sleepWithCountdown(
  seconds: number,
  reporter: Reporter,
  signal?: AbortSignal,
): Promise<void> {
  for (let s = seconds; s > 0; s--) {
    reporter.setStatus?.(`⏱ rate-limited; retrying in ${s}s (Ctrl-C to cancel)`);
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      };
      const t = setTimeout(() => {
        signal?.removeEventListener?.("abort", onAbort);
        resolve();
      }, 1000);
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }
  reporter.setStatus?.(null);
}

function isTransientToolCallError(err: any): boolean {
  const msg = err?.message || "";
  return /Failed to call a function/i.test(msg) || /tool.?call.*format/i.test(msg);
}

function toolValidationError(err: any): string | null {
  const msg = err?.message || "";
  const m = msg.match(/attempted to call tool '([^']+)' which was not in request\.tools/i);
  if (m) return m[1];
  return null;
}

// Greeting / non-task detection. When the latest user turn is a pure greeting,
// thanks, or other no-ask filler, we send tool_choice: "none" so the model
// physically cannot emit a tool call for that turn. Enforced at the API
// contract layer (Groq honors tool_choice), not just via prompt wording.
//
// Mirror of web/lib/non-task-detector.ts — keep both in sync. The proxy is
// the authoritative enforcer; this client copy is a fast-path so we don't
// burn a round-trip when the answer is obvious.
const GREETING_RE =
  /^(?:hi+|hey+|hello+|yo+|sup|howdy|thanks?(?:\s+(?:you|so\s+much|a\s+lot|man|dude))?|thx|ty|cheers|cool|nice|ok(?:ay)?|got\s*it|sure|sounds\s+good|np|no\s+problem|gm|gn|good\s+(?:morning|night|afternoon|evening)|great|awesome|perfect|amazing|wonderful|excellent|fantastic|alright|right|fine|wow|lol|haha|👋|👍|🙏|❤️)\b[\s.!?,👋👍🙏❤️🤝]*$/i;

const TASK_SIGNALS = new Set([
  "read", "write", "edit", "fix", "build", "test", "run", "list", "show",
  "find", "grep", "search", "check", "do", "make", "get", "install", "deploy",
  "create", "update", "delete", "remove", "refactor", "explain", "describe",
  "review", "debug", "help", "can", "could", "would", "will", "please",
  "what", "why", "how", "when", "where", "who", "which",
]);

function isLikelyNonTask(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 60) return false;
  if (GREETING_RE.test(trimmed)) return true;
  if (trimmed.length <= 30) {
    if (trimmed.includes("?")) return false;
    const tokens = trimmed.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (tokens.length === 0) return true;
    if (tokens.some((t) => TASK_SIGNALS.has(t))) return false;
    return true;
  }
  return false;
}

function looksLikeNonTask(messages: any[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const text = typeof m.content === "string" ? m.content : "";
    return isLikelyNonTask(text);
  }
  return false;
}

async function step(run: AgentRun, messages: any[]): Promise<boolean> {
  compactOldToolResults(messages);
  const tools = toolSchemas(run.ctx.isSubagent ? new Set(["spawn_agent"]) : undefined);
  const tool_choice: "auto" | "none" = looksLikeNonTask(messages) ? "none" : "auto";
  const stream = await run.client.chat.completions.create(
    {
      model: run.model,
      messages,
      tools,
      tool_choice,
      stream: true,
    },
    { signal: run.signal },
  );

  let content = "";
  const tcByIndex = new Map<number, ToolCallAcc>();

  for await (const chunk of stream) {
    if (run.signal?.aborted) throw new Error("aborted");
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      run.reporter.token(delta.content);
      content += delta.content;
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        let slot = tcByIndex.get(idx);
        if (!slot) {
          slot = { id: "", type: "function", function: { name: "", arguments: "" } };
          tcByIndex.set(idx, slot);
        }
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.function.name += tc.function.name;
        if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
      }
    }
  }

  if (content) run.reporter.assistantTurnEnd(content);

  const toolCalls = [...tcByIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  const assistantMsg: any = { role: "assistant", content: content || null };
  if (toolCalls.length) assistantMsg.tool_calls = toolCalls;
  messages.push(assistantMsg);

  if (!toolCalls.length) return false;

  for (const tc of toolCalls) {
    const name = tc.function.name;
    let args: any;
    let result: string;
    let isError = false;
    try {
      args = JSON.parse(tc.function.arguments || "{}");
    } catch {
      result = `ERROR: invalid JSON arguments: ${tc.function.arguments.slice(0, 200)}`;
      isError = true;
      run.reporter.toolCallStart(name, "(invalid JSON)");
      run.reporter.toolCallEnd(name, result, isError);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      continue;
    }
    run.reporter.toolCallStart(name, shortArgs(args));
    result = await dispatch(run.ctx, name, args);
    isError = result.startsWith("ERROR") || result.startsWith("DENIED");
    run.reporter.toolCallEnd(name, result, isError);
    messages.push({ role: "tool", tool_call_id: tc.id, content: result });
  }
  return true;
}

function dropOrphanAssistantToolCalls(messages: any[]): void {
  while (messages.length) {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.tool_calls && (!last.content || last.content === null)) {
      messages.pop();
    } else {
      break;
    }
  }
}

const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_WAIT_SECONDS = 75;

export async function runAgent(run: AgentRun, messages: any[]): Promise<void> {
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let attempt = 0;
    let rateLimitRetries = 0;
    while (true) {
      try {
        const more = await step(run, messages);
        if (!more) return;
        break;
      } catch (e: any) {
        if (isRateLimitError(e)) {
          dropOrphanAssistantToolCalls(messages);
          if (isUnrecoverableSize(e) || rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
            run.reporter.setStatus?.(null);
            run.reporter.assistantTurnEnd(
              isUnrecoverableSize(e)
                ? "Request is too large to fit in a single per-minute window even after waiting. Try /clear, switch to a higher-limit model with /model, or trim CLAUDE.md."
                : `Still rate-limited after ${MAX_RATE_LIMIT_RETRIES} retries. Try /clear or /model to switch to a model with a higher TPM cap.`,
            );
            return;
          }
          rateLimitRetries++;
          const wait = Math.min(parseRetryAfterSeconds(e) + 2, MAX_RETRY_WAIT_SECONDS);
          try {
            await sleepWithCountdown(wait, run.reporter, run.signal);
          } catch {
            // aborted
            run.reporter.setStatus?.(null);
            run.reporter.assistantTurnEnd("interrupted while waiting on rate limit");
            return;
          }
          continue;
        }
        const badTool = toolValidationError(e);
        if (badTool) {
          dropOrphanAssistantToolCalls(messages);
          // Inject a corrective system note so the next turn doesn't repeat the mistake.
          const valid = (await import("./tools.js")).TOOLS.map((t) => t.name).join(", ");
          messages.push({
            role: "system",
            content: `[reminder] You called a tool named '${badTool}' that does not exist. Only call these tools: ${valid}. To run shell commands, call the 'bash' tool with a 'command' argument.`,
          });
          if (attempt < 2) {
            attempt++;
            await new Promise((r) => setTimeout(r, 200));
            continue;
          }
          run.reporter.assistantTurnEnd(
            `Model kept hallucinating a non-existent tool ('${badTool}'). Try /model llama-3.3-70b-versatile or rephrase your request.`,
          );
          return;
        }
        if (isTransientToolCallError(e) && attempt < 2) {
          attempt++;
          dropOrphanAssistantToolCalls(messages);
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        if (isTransientToolCallError(e)) {
          dropOrphanAssistantToolCalls(messages);
          run.reporter.assistantTurnEnd(
            `Groq's tool-calling for model '${run.model}' failed twice in a row. Try /model llama-3.3-70b-versatile (or another model) and retry.`,
          );
          return;
        }
        throw e;
      }
    }
  }
  run.reporter.iterationCap?.();
}


const SUBAGENT_SYSTEM_PROMPT = (role: string, root: string) =>
  `You are a "${role}" subagent inside ccr, deployed by a parent agent to handle one focused task. Reply in 1-3 short paragraphs at the end.

Operating rules:
- Stay focused on the assigned task. Do not start unrelated work.
- You have the same tools as the parent EXCEPT spawn_agent (no further nesting).
- Edits and shell commands still go through the user's approval flow.
- When done, give a tight final summary; no preamble.

Project root: ${root}`;

/**
 * Build a runSubagent function bound to a parent client. Inject this into
 * ToolContext.runSubagent so spawn_agent can dispatch into a child runAgent
 * loop without circular imports.
 */
export function makeSubagentRunner(
  client: OpenAI,
  parentCtx: ToolContext,
  defaultModel: string,
  parentReporter: Reporter,
) {
  return async (opts: SubagentRunOptions): Promise<string> => {
    const subModel = opts.model || defaultModel;
    parentReporter.setStatus?.(`🤖 ${opts.role} agent (${subModel}) running…`);
    const childMessages: any[] = [
      { role: "system", content: SUBAGENT_SYSTEM_PROMPT(opts.role, parentCtx.root) },
      { role: "user", content: opts.task },
    ];
    let finalContent = "";
    const childReporter: Reporter = {
      token: () => {},
      assistantTurnEnd: (text: string) => {
        if (text && text.trim()) finalContent = text;
      },
      toolCallStart: (name: string, argsPreview: string) => {
        opts.onToolCall?.(name, argsPreview);
      },
      toolCallEnd: () => {},
      setStatus: () => {},
    };
    const childCtx: ToolContext = {
      root: parentCtx.root,
      approve: parentCtx.approve,
      ask: parentCtx.ask,
      isSubagent: true,
      // runSubagent is intentionally absent: enforced by step() schema filter,
      // and double-checked by the spawn_agent tool itself.
    };
    const childRun: AgentRun = {
      client,
      model: subModel,
      ctx: childCtx,
      reporter: childReporter,
      signal: opts.signal,
    };
    try {
      await runAgent(childRun, childMessages);
    } finally {
      parentReporter.setStatus?.(null);
    }
    return finalContent.trim() || "(subagent produced no final summary)";
  };
}

