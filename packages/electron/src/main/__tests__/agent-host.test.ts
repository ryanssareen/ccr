import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import OpenAI from "openai";
import {
  DEFAULT_MODEL,
  acquireLock,
  initialMessages,
  lockPath,
  makeSubagentRunner,
  releaseLock,
  runAgent,
  type AgentRun,
  type BuildClientOptions,
} from "@ccr/core";
import { AgentHost, AgentHostStartError, type AgentHostDeps, type RendererSender } from "../agent-host.js";

interface SentEvent {
  channel: string;
  payload: unknown;
}

let rootDir: string;
let sessionDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "ccr-electron-host-"));
  sessionDir = path.join(rootDir, ".sessions");
  await mkdir(sessionDir, { recursive: true });
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe("AgentHost", () => {
  it("starts a first-turn greeting run and finishes without a model call", async () => {
    let modelCalls = 0;
    const host = createHost({
      buildClient: () => {
        return {
          chat: {
            completions: {
              create: async () => {
                modelCalls += 1;
                throw new Error("model should not be called for greeting smoke");
              },
            },
          },
        } as unknown as OpenAI;
      },
    });

    const recorder = createRecorder();
    await host.start(recorder.sender, {
      sessionId: "greeting-smoke",
      model: DEFAULT_MODEL,
      mode: "ask",
      text: "hi",
    });

    await recorder.done;
    assert.equal(modelCalls, 0);
    assert.deepEqual(
      recorder.events.map((event) => event.channel),
      ["agent:assistant-turn-end", "agent:done"],
    );
    assert.match(String((recorder.events[0].payload as { content: string }).content), /what would you like/i);
  });

  it("creates the session directory before writing a new lock file", async () => {
    let modelCalls = 0;
    const nestedSessionsDir = path.join(rootDir, "brand-new", "nested");
    const host = createHost({
      buildClient: () =>
        ({
          chat: {
            completions: {
              create: async () => {
                modelCalls += 1;
                throw new Error("greeting path should not call the model");
              },
            },
          },
        }) as unknown as OpenAI,
      sessionPath: (_root, sessionId) => path.join(nestedSessionsDir, `${sessionId}.json`),
    });

    const recorder = createRecorder();
    await host.start(recorder.sender, {
      sessionId: "fresh-session",
      model: DEFAULT_MODEL,
      mode: "ask",
      text: "hi",
    });

    await recorder.done;
    assert.equal(modelCalls, 0);
    assert.ok(existsSync(nestedSessionsDir));
  });

  it("resolves a pending approval and continues the run", async () => {
    const host = createHost({
      runAgent: async (run: AgentRun) => {
        const approved = await run.ctx.approve({
          kind: "edit",
          title: "Edit demo.ts",
          detail: "--- demo.ts\n+++ demo.ts\n@@\n-old\n+new",
        });
        run.reporter.assistantTurnEnd(approved ? "approved" : "denied");
      },
    });

    const recorder = createRecorder();
    await host.start(recorder.sender, {
      sessionId: "approval-flow",
      model: DEFAULT_MODEL,
      mode: "ask",
      text: "please change the file",
    });

    const approval = await recorder.next<{
      requestId: string;
      title: string;
    }>("agent:approval-request");
    assert.equal(approval.title, "Edit demo.ts");

    await host.respondToApproval({
      requestId: approval.requestId,
      approved: true,
    });

    await recorder.done;
    assert.equal(findEvent(recorder.events, "agent:assistant-turn-end")?.payload?.content, "approved");
  });

  it("rejects a second start for the same session while one is already running", async () => {
    const host = createHost({
      runAgent: async (run: AgentRun) => {
        await new Promise<void>((resolve, reject) => {
          if (run.signal?.aborted) {
            reject(new Error("aborted"));
            return;
          }
          const onAbort = () => reject(new Error("aborted"));
          run.signal?.addEventListener("abort", onAbort, { once: true });
        });
      },
    });

    const recorder = createRecorder();
    await host.start(recorder.sender, {
      sessionId: "duplicate-run",
      model: DEFAULT_MODEL,
      mode: "ask",
      text: "wait here",
    });

    await assert.rejects(
      () =>
        host.start(recorder.sender, {
          sessionId: "duplicate-run",
          model: DEFAULT_MODEL,
          mode: "ask",
          text: "wait here too",
        }),
      (error: Error) => {
        assert.ok(error instanceof AgentHostStartError);
        assert.equal((error as AgentHostStartError).code, "ALREADY_RUNNING");
        return true;
      },
    );

    await host.abort({ sessionId: "duplicate-run" });
    await recorder.done;
  });

  it("aborts an active run, emits done, and releases the session lock", async () => {
    const host = createHost({
      runAgent: async (run: AgentRun) => {
        await new Promise<void>((resolve, reject) => {
          if (run.signal?.aborted) {
            reject(new Error("aborted"));
            return;
          }
          const onAbort = () => reject(new Error("aborted"));
          run.signal?.addEventListener("abort", onAbort, { once: true });
        });
      },
    });

    const recorder = createRecorder();
    const sessionId = "abort-run";
    const sessionFilePath = sessionFile(sessionId);

    await host.start(recorder.sender, {
      sessionId,
      model: DEFAULT_MODEL,
      mode: "ask",
      text: "keep running",
    });

    assert.ok(existsSync(lockPath(sessionFilePath)), "lock should exist while the run is active");
    await host.abort({ sessionId });
    await recorder.done;

    assert.equal(findEvent(recorder.events, "agent:error"), undefined);
    assert.ok(!existsSync(lockPath(sessionFilePath)), "lock should be released after abort");
  });

  it("rejects start when the session lock belongs to another pid and emits no IPC events", async () => {
    const host = createHost({
      acquireSessionLock: async () => {
        const error = new Error("Session is active in another ccr process (pid=4321). Close the other window or wait for it to finish.");
        Object.assign(error, { name: "LockOwnedElsewhereError", pid: 4321, host: "host.local" });
        throw error;
      },
    });

    const recorder = createRecorder();
    await assert.rejects(
      () =>
        host.start(recorder.sender, {
          sessionId: "locked-session",
          model: DEFAULT_MODEL,
          mode: "ask",
          text: "hi",
        }),
      (error: Error) => {
        assert.ok(error instanceof AgentHostStartError);
        assert.equal((error as AgentHostStartError).code, "LOCK_OWNED_ELSEWHERE");
        assert.equal((error as AgentHostStartError).pid, 4321);
        return true;
      },
    );

    assert.equal(recorder.events.length, 0);
  });

  it("wires ToolContext.runSubagent for the main-process agent loop", async () => {
    const host = createHost({
      makeSubagentRunner: () => async () => "subagent summary",
      runAgent: async (run: AgentRun) => {
        const summary = await run.ctx.runSubagent?.({
          task: "check the project",
          role: "explorer",
          reason: "test",
        });
        run.reporter.assistantTurnEnd(summary ?? "(missing subagent)");
      },
    });

    const recorder = createRecorder();
    await host.start(recorder.sender, {
      sessionId: "subagent-session",
      model: DEFAULT_MODEL,
      mode: "ask",
      text: "investigate",
    });

    await recorder.done;
    assert.equal(findEvent(recorder.events, "agent:assistant-turn-end")?.payload?.content, "subagent summary");
  });
});

function createHost(overrides: Partial<AgentHostDeps>) {
  return new AgentHost({
    projectRoot: rootDir,
    deps: {
      acquireSessionLock:
        overrides.acquireSessionLock ??
        ((sessionFilePath, sessionId) => acquireLock(sessionFilePath, sessionId)),
      releaseSessionLock:
        overrides.releaseSessionLock ??
        ((sessionFilePath) => releaseLock(sessionFilePath)),
      buildClient:
        overrides.buildClient ??
        ((options: BuildClientOptions) =>
          ({
            options,
          }) as unknown as OpenAI),
      loadAuth: overrides.loadAuth ?? (async () => ({ token: "token", endpoint: "https://ccr.example.com", email: "test@example.com" })),
      loadConfig: overrides.loadConfig ?? (async () => ({})),
      applyConfig: overrides.applyConfig ?? (() => {}),
      initialMessages: overrides.initialMessages ?? initialMessages,
      runAgent: overrides.runAgent ?? runAgent,
      makeSubagentRunner: overrides.makeSubagentRunner ?? makeSubagentRunner,
      saveSession:
        overrides.saveSession ??
        (async (_root: string, sessionId: string, messages: any[]) => {
          const target = sessionFile(sessionId);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, JSON.stringify({ messages, updated: Date.now() }, null, 2), "utf8");
        }),
      sessionPath: overrides.sessionPath ?? ((_root: string, sessionId: string) => sessionFile(sessionId)),
      loadProjectContext: overrides.loadProjectContext ?? (async () => ""),
    },
  });
}

function createRecorder() {
  const events: SentEvent[] = [];
  let doneResolve!: () => void;
  const done = new Promise<void>((resolve) => {
    doneResolve = resolve;
  });

  const waiters = new Map<string, Array<(payload: unknown) => void>>();
  const sender: RendererSender = {
    send(channel, payload) {
      events.push({ channel, payload });
      const listeners = waiters.get(channel);
      if (listeners && listeners.length > 0) {
        const next = listeners.shift();
        next?.(payload);
      }
      if (channel === "agent:done") doneResolve();
    },
  };

  return {
    events,
    sender,
    done,
    next<T>(channel: string): Promise<T> {
      return new Promise<T>((resolve) => {
        const listeners = waiters.get(channel) ?? [];
        listeners.push((payload) => resolve(payload as T));
        waiters.set(channel, listeners);
      });
    },
  };
}

function findEvent(events: SentEvent[], channel: string) {
  return events.find((event) => event.channel === channel) as
    | { channel: string; payload: { content?: string } }
    | undefined;
}

function sessionFile(sessionId: string): string {
  return path.join(sessionDir, `${sessionId}.json`);
}
