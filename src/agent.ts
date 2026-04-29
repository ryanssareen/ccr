import OpenAI from "openai";
import { dispatch, toolSchemas, type ToolContext } from "./tools.js";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
// llama-3.1-8b-instant has the highest TPM cap on Groq's free tier (~30k vs 12k
// for 70b/120b models), so requests that include CLAUDE.md / project context
// don't immediately blow the rate limit. Switch via /model for stronger models.
export const DEFAULT_MODEL = process.env.CCR_MODEL || "llama-3.1-8b-instant";
const MAX_ITERATIONS = 25;

const SYSTEM_PROMPT = (root: string, projectContext: string) => `You are ccr, a terminal-native coding assistant operating inside the user's project directory.

Operating principles:
- Be concise. Prefer doing over narrating.
- Use tools to read code before answering questions about it. Do not guess file contents.
- For modifications, prefer edit_file or multi_edit. The user sees a diff and approves.
- Use bash for tests, builds, git, and other shell tasks. The user approves each command.
- If a tool call is denied, revise your plan; never retry the same denied action.
- When the task is complete, give a short final summary.

Project root: ${root}
${projectContext}`;

export function buildClient(apiKey?: string): OpenAI {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error(
      "No Groq API key found. Set GROQ_API_KEY or add it to ~/.ccr/config.json:\n" +
        '  { "groqApiKey": "gsk_..." }',
    );
  }
  return new OpenAI({ apiKey: key, baseURL: GROQ_BASE_URL });
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

async function step(run: AgentRun, messages: any[]): Promise<boolean> {
  compactOldToolResults(messages);
  const stream = await run.client.chat.completions.create(
    {
      model: run.model,
      messages,
      tools: toolSchemas(),
      tool_choice: "auto",
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
