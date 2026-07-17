import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import {
  DEFAULT_MODEL,
  acquireLock,
  applyConfig,
  buildClient,
  initialMessages,
  loadAuth,
  loadConfig,
  lockPath,
  makeSubagentRunner,
  releaseLock,
  runAgent,
  saveSession,
  sessionPath,
  type AgentRun,
  type Approver,
  type AskRequest,
  type Asker,
  type BuildClientOptions,
  type LockOwnedElsewhereError,
  type Reporter,
  type ToolContext,
} from "@ccr/core";
import type {
  AgentApprovalRequestPayload,
  AgentApprovalResponseInput,
  AgentAskRequestPayload,
  AgentAskResponseInput,
  AgentMode,
  AgentStartInput,
  AgentStartResult,
  MainToRendererChannel,
  MainToRendererPayloads,
} from "../common/ipc.js";
import { sanitizeProjectRoot } from "./project-root.js";

const CONTEXT_FILES = ["CLAUDE.md", "AGENTS.md", ".ccr/context.md"];
const PROJECT_CONTEXT_PER_FILE = 6_000;
const PROJECT_CONTEXT_TOTAL = 12_000;
const FIRST_TURN_GREETING_RE =
  /^(?:hi+|hey+y*|hello+|hallo+o*|hola+|ola+|yo+|sup|howdy|hiya|heya|aloha|greetings|gm|gn)[\s.!?,👋]*$/i;

export interface RendererSender {
  send<K extends MainToRendererChannel>(channel: K, payload: MainToRendererPayloads[K]): void;
}

export class AgentHostStartError extends Error {
  readonly code: "ALREADY_RUNNING" | "LOCK_OWNED_ELSEWHERE";
  readonly pid?: number;
  readonly host?: string;

  constructor(
    code: "ALREADY_RUNNING" | "LOCK_OWNED_ELSEWHERE",
    message: string,
    details: { pid?: number; host?: string } = {},
  ) {
    super(message);
    this.name = "AgentHostStartError";
    this.code = code;
    this.pid = details.pid;
    this.host = details.host;
  }
}

/**
 * The two roots a run needs. They are usually identical, and diverge only for
 * sessions the pre-fix packaged build created at "/" (issue #19): those keep
 * their transcript where it already lives, but must not run tools there.
 */
interface RunRoots {
  /** Root the transcript is keyed to — decides where the session file lives. */
  session: string;
  /** Root the agent's tools operate against. Never a filesystem root. */
  operating: string;
}

interface ActiveRun {
  sessionId: string;
  sessionFilePath: string;
  sender: RendererSender;
  abortController: AbortController;
  completion: Promise<void>;
}

interface PendingApproval {
  sessionId: string;
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
}

interface PendingAsk {
  sessionId: string;
  resolve: (value: Array<{ answer: string }>) => void;
  reject: (error: Error) => void;
}

export interface AgentHostDeps {
  acquireSessionLock: typeof acquireLock;
  releaseSessionLock: typeof releaseLock;
  buildClient: (options: BuildClientOptions) => OpenAI;
  loadAuth: typeof loadAuth;
  loadConfig: typeof loadConfig;
  applyConfig: typeof applyConfig;
  initialMessages: typeof initialMessages;
  runAgent: typeof runAgent;
  makeSubagentRunner: typeof makeSubagentRunner;
  saveSession: typeof saveSession;
  sessionPath: typeof sessionPath;
  loadProjectContext: (root: string) => Promise<string>;
}

export interface AgentHostOptions {
  /**
   * The root runs default to when the renderer doesn't supply one.
   *
   * Pass a function to keep it live: the app's root can change at runtime when
   * the user picks a project folder (issue #21), and a value captured at
   * construction would leave every subsequent run pointed at the old root —
   * silently, since the rail would already be showing the new one. A plain
   * string is still accepted for callers whose root genuinely is fixed (tests).
   */
  projectRoot?: string | (() => string);
  deps?: Partial<AgentHostDeps>;
}

const DEFAULT_DEPS: AgentHostDeps = {
  acquireSessionLock: acquireLock,
  releaseSessionLock: releaseLock,
  buildClient,
  loadAuth,
  loadConfig,
  applyConfig,
  initialMessages,
  runAgent,
  makeSubagentRunner,
  saveSession,
  sessionPath,
  loadProjectContext,
};

export class AgentHost {
  private readonly readProjectRoot: () => string;
  private readonly deps: AgentHostDeps;
  private readonly runs = new Map<string, ActiveRun>();
  private readonly approvals = new Map<string, PendingApproval>();
  private readonly asks = new Map<string, PendingAsk>();
  private requestCounter = 0;

  constructor(options: AgentHostOptions = {}) {
    // process.cwd() is only a last resort here, and is itself sanitized: a
    // packaged app's cwd is "/" (issue #19).
    const source = options.projectRoot ?? process.cwd();
    const read = typeof source === "function" ? source : () => source;
    // Sanitize on every read, not once at construction: a live root arrives
    // from a getter, so there is no single moment at which to vet it.
    // sanitizeProjectRoot is a structural check with no fs access, so this is
    // cheap enough to sit on the start path.
    this.readProjectRoot = () => sanitizeProjectRoot(read(), os.homedir());
    this.deps = { ...DEFAULT_DEPS, ...options.deps };
  }

  /** The current default root. Re-read per access — never cached. */
  private get projectRoot(): string {
    return this.readProjectRoot();
  }

  async start(sender: RendererSender, input: AgentStartInput): Promise<AgentStartResult> {
    const sessionId = input.sessionId.trim();
    if (!sessionId) return { ok: false, error: "sessionId is required" };
    if (this.runs.has(sessionId)) {
      return {
        ok: false,
        error: `Session '${sessionId}' is already running in this window.`,
      };
    }

    // Per-call projectRoot — sessions can target different repos via the
    // rail "New session in project" button. Falls back to the host's
    // default if the renderer didn't supply one.
    //
    // The session root is deliberately NOT sanitized: it keys the transcript's
    // location on disk, so rewriting it would strand an existing conversation
    // under a different hash. Resuming a legacy "/"-rooted session therefore
    // still finds its history — it just doesn't get to run tools at "/".
    // Snapshot once per start so both roots below agree, then stay fixed for
    // the lifetime of this run — a pick mid-run must not move a live agent's
    // feet. The next start picks up the new root.
    const hostRoot = this.projectRoot;
    const roots: RunRoots = {
      session: input.projectRoot ? path.resolve(input.projectRoot) : hostRoot,
      operating: sanitizeProjectRoot(input.projectRoot ?? hostRoot, hostRoot),
    };
    const sessionFilePath = this.deps.sessionPath(roots.session, sessionId);
    await fs.mkdir(path.dirname(sessionFilePath), { recursive: true });
    try {
      await this.deps.acquireSessionLock(sessionFilePath, sessionId);
    } catch (error) {
      if (isLockOwnedElsewhere(error)) {
        return {
          ok: false,
          error: error.message,
          lockPid: error.pid,
        };
      }
      throw error;
    }

    const abortController = new AbortController();
    const completion = this.runSession(sender, input, sessionFilePath, roots, abortController.signal).finally(
      async () => {
        this.runs.delete(sessionId);
        this.rejectPendingForSession(sessionId, new Error("run ended"));
        try {
          await this.deps.releaseSessionLock(sessionFilePath);
        } catch {
          // best effort
        }
        sender.send("agent:done", { sessionId });
      },
    );

    this.runs.set(sessionId, {
      sessionId,
      sessionFilePath,
      sender,
      abortController,
      completion,
    });

    return {
      ok: true,
      sessionId,
      startedAt: new Date().toISOString(),
    };
  }

  async abort({ sessionId }: { sessionId: string }): Promise<void> {
    const active = this.runs.get(sessionId);
    if (!active) return;
    active.abortController.abort();
    await active.completion.catch(() => {});
  }

  async respondToApproval(input: AgentApprovalResponseInput): Promise<void> {
    const pending = this.approvals.get(input.requestId);
    if (!pending) throw new Error(`Unknown approval request '${input.requestId}'.`);
    this.approvals.delete(input.requestId);
    pending.resolve(input.approved);
  }

  async respondToAsk(input: AgentAskResponseInput): Promise<void> {
    const pending = this.asks.get(input.requestId);
    if (!pending) throw new Error(`Unknown question request '${input.requestId}'.`);
    this.asks.delete(input.requestId);
    pending.resolve(input.answers);
  }

  private async runSession(
    sender: RendererSender,
    input: AgentStartInput,
    sessionFilePath: string,
    roots: RunRoots,
    signal: AbortSignal,
  ): Promise<void> {
    const sessionId = input.sessionId;
    const messages = await this.loadMessagesForSession(sessionFilePath, roots.operating);
    messages.push({ role: "user", content: input.text });

    const reporter = this.createReporter(sender, sessionId);
    const auth = await this.deps.loadAuth();
    const config = await this.deps.loadConfig();
    this.deps.applyConfig(config);

    let client: OpenAI;
    try {
      client = this.deps.buildClient(buildClientOptionsFor(auth, (quota) => {
        sender.send("agent:quota", {
          used: quota.used,
          limit: quota.limit,
          resetAt: quota.resetAt.toISOString(),
        });
      }));
    } catch (error) {
      if (!isGreetingOnlyFirstTurn(messages, input.text)) throw error;
      client = createNoopClient();
    }

    const ctx = this.createToolContext(sender, sessionId, input.mode, roots.operating, signal);
    const model = input.model || config.model || DEFAULT_MODEL;
    ctx.runSubagent = this.deps.makeSubagentRunner(client, ctx, model, reporter);

    const run: AgentRun = {
      client,
      model,
      ctx,
      reporter,
      signal,
      sessionPath: sessionFilePath,
      sessionId,
    };

    try {
      await this.deps.runAgent(run, messages);
      // roots.session, not roots.operating — saveSession derives the file path
      // from the root, so this must stay where the transcript already is.
      await this.deps.saveSession(roots.session, sessionId, messages);
    } catch (error) {
      if (isAbortError(error)) {
        await this.deps.saveSession(roots.session, sessionId, messages).catch(() => {});
        return;
      }
      sender.send("agent:error", {
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async loadMessagesForSession(
    sessionFilePath: string,
    effectiveRoot: string,
  ): Promise<any[]> {
    if (existsSync(sessionFilePath)) {
      try {
        const parsed = JSON.parse(readFileSync(sessionFilePath, "utf8")) as { messages?: any[] };
        if (Array.isArray(parsed.messages) && parsed.messages.length > 0) return parsed.messages;
      } catch {
        // fall through to a fresh session
      }
    }
    const projectContext = await this.deps.loadProjectContext(effectiveRoot);
    return this.deps.initialMessages(effectiveRoot, projectContext);
  }

  private createReporter(sender: RendererSender, sessionId: string): Reporter {
    return {
      token: (token) => sender.send("agent:token", { sessionId, token }),
      assistantTurnEnd: (content) => sender.send("agent:assistant-turn-end", { sessionId, content }),
      toolCallStart: (name, argsPreview) =>
        sender.send("agent:tool-start", { sessionId, name, argsPreview }),
      toolCallEnd: (name, result, isError) =>
        sender.send("agent:tool-end", { sessionId, name, result, isError }),
      iterationCap: () => sender.send("agent:status", { sessionId, text: "hit max iterations" }),
      setStatus: (text) => sender.send("agent:status", { sessionId, text }),
    };
  }

  private createToolContext(
    sender: RendererSender,
    sessionId: string,
    mode: AgentMode,
    effectiveRoot: string,
    signal: AbortSignal,
  ): ToolContext {
    const approve: Approver = async (request) => {
      if (mode === "bypass") return true;
      if (mode === "accept-edits" && request.kind === "edit") return true;

      const requestId = this.nextRequestId("approval");
      const payload: AgentApprovalRequestPayload = {
        sessionId,
        requestId,
        kind: request.kind,
        title: request.title,
        detail: request.detail,
      };

      return new Promise<boolean>((resolve, reject) => {
        const onAbort = () => {
          this.approvals.delete(requestId);
          reject(new Error("aborted"));
        };
        this.approvals.set(requestId, {
          sessionId,
          resolve: (value) => {
            signal.removeEventListener("abort", onAbort);
            resolve(value);
          },
          reject: (error) => {
            signal.removeEventListener("abort", onAbort);
            reject(error);
          },
        });
        signal.addEventListener("abort", onAbort, { once: true });
        sender.send("agent:approval-request", payload);
      });
    };

    const ask: Asker = async (request) => {
      const requestId = this.nextRequestId("ask");
      const payload: AgentAskRequestPayload = {
        sessionId,
        requestId,
        questions: request.questions.map((question) => ({
          question: question.question,
          options: question.options,
        })),
      };

      return new Promise<Array<{ answer: string }>>((resolve, reject) => {
        const onAbort = () => {
          this.asks.delete(requestId);
          reject(new Error("aborted"));
        };
        this.asks.set(requestId, {
          sessionId,
          resolve: (value) => {
            signal.removeEventListener("abort", onAbort);
            resolve(value);
          },
          reject: (error) => {
            signal.removeEventListener("abort", onAbort);
            reject(error);
          },
        });
        signal.addEventListener("abort", onAbort, { once: true });
        sender.send("agent:ask-request", payload);
      });
    };

    return {
      root: effectiveRoot,
      approve,
      ask,
    };
  }

  private nextRequestId(kind: "approval" | "ask"): string {
    this.requestCounter += 1;
    return `${kind}-${this.requestCounter}`;
  }

  private rejectPendingForSession(sessionId: string, error: Error): void {
    for (const [requestId, pending] of this.approvals) {
      if (pending.sessionId !== sessionId) continue;
      this.approvals.delete(requestId);
      pending.reject(error);
    }
    for (const [requestId, pending] of this.asks) {
      if (pending.sessionId !== sessionId) continue;
      this.asks.delete(requestId);
      pending.reject(error);
    }
  }
}

function buildClientOptionsFor(
  auth: Awaited<ReturnType<typeof loadAuth>>,
  onQuota: BuildClientOptions["onQuota"],
): BuildClientOptions {
  if (auth) {
    return {
      authToken: auth.token,
      endpoint: auth.endpoint,
      onQuota,
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      apiKey: process.env.GROQ_API_KEY,
      onQuota,
    };
  }
  return { onQuota };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.message === "aborted";
}

function isGreetingOnlyFirstTurn(messages: any[], text: string): boolean {
  if (!FIRST_TURN_GREETING_RE.test(text.trim())) return false;
  return !messages.some((message) => message?.role === "assistant" || message?.role === "tool");
}

function createNoopClient(): OpenAI {
  return {
    chat: {
      completions: {
        create: async () => {
          throw new Error("No model client was available for this session.");
        },
      },
    },
  } as unknown as OpenAI;
}

function isLockOwnedElsewhere(error: unknown): error is LockOwnedElsewhereError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "pid" in error &&
      "host" in error &&
      (error as { name?: string }).name === "LockOwnedElsewhereError",
  );
}

async function loadProjectContext(root: string): Promise<string> {
  const chunks: string[] = [];
  let total = 0;

  for (const name of CONTEXT_FILES) {
    const candidate = path.join(root, name);
    if (!existsSync(candidate)) continue;

    let body: string;
    try {
      body = await fs.readFile(candidate, "utf8");
    } catch {
      continue;
    }

    let note = "";
    if (body.length > PROJECT_CONTEXT_PER_FILE) {
      note = `\n[truncated from ${body.length} chars; use read_file('${name}') for full content]`;
      body = body.slice(0, PROJECT_CONTEXT_PER_FILE);
    }

    const chunk = `--- ${name} ---\n${body}${note}`;
    if (total + chunk.length > PROJECT_CONTEXT_TOTAL) break;
    chunks.push(chunk);
    total += chunk.length;
  }

  return chunks.length > 0 ? `\n\nProject instructions:\n${chunks.join("\n\n")}` : "";
}
