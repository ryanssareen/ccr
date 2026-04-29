#!/usr/bin/env node
import { promises as fs, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import kleur from "kleur";
import React from "react";
import { render } from "ink";
import {
  buildClient,
  DEFAULT_MODEL,
  initialMessages,
  runAgent,
  type AgentRun,
  type Reporter,
} from "./agent.js";
import { listSessions, loadSession, newSessionId, saveSession } from "./session.js";
import type { Approver, ToolContext } from "./tools.js";
import { App, type Mode } from "./app.js";
import { applyConfig, loadConfig } from "./config.js";

const VERSION = "0.1.0";
const CONTEXT_FILES = ["CLAUDE.md", "AGENTS.md", ".ccr/context.md"];

function loadDotEnv(root: string): void {
  for (const name of [".env", ".env.local"]) {
    const p = path.join(root, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

// Per-file cap (chars). Anything over this is truncated; the model can
// re-read the full file via the read_file tool if needed. ~6000 chars ≈ 1500 tokens.
const PROJECT_CONTEXT_PER_FILE = 6000;
const PROJECT_CONTEXT_TOTAL = 12000;

async function loadProjectContext(root: string): Promise<string> {
  const chunks: string[] = [];
  let total = 0;
  for (const name of CONTEXT_FILES) {
    const p = path.join(root, name);
    if (!existsSync(p)) continue;
    let body: string;
    try {
      body = await fs.readFile(p, "utf8");
    } catch {
      continue;
    }
    let note = "";
    if (body.length > PROJECT_CONTEXT_PER_FILE) {
      note = `\n[truncated from ${body.length} chars; use read_file('${name}') for full content]`;
      body = body.slice(0, PROJECT_CONTEXT_PER_FILE);
    }
    const piece = `--- ${name} ---\n${body}${note}`;
    if (total + piece.length > PROJECT_CONTEXT_TOTAL) break;
    chunks.push(piece);
    total += piece.length;
  }
  return chunks.length ? "\n\nProject instructions:\n" + chunks.join("\n\n") : "";
}

interface Args {
  prompt: string[];
  print: boolean;
  resume: string | null | undefined;
  listSessions: boolean;
  mode: Mode;
  model: string;
  cwd: string | null;
  showHelp: boolean;
  showVersion: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    prompt: [],
    print: false,
    resume: undefined,
    listSessions: false,
    mode: "ask",
    model: DEFAULT_MODEL,
    cwd: null,
    showHelp: false,
    showVersion: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-h":
      case "--help":
        args.showHelp = true;
        break;
      case "-V":
      case "--version":
        args.showVersion = true;
        break;
      case "-p":
      case "--print":
        args.print = true;
        break;
      case "-r":
      case "--resume": {
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          args.resume = next;
          i++;
        } else {
          args.resume = null;
        }
        break;
      }
      case "--list-sessions":
        args.listSessions = true;
        break;
      case "--yolo":
      case "--bypass":
        args.mode = "bypass";
        break;
      case "--accept-edits":
        args.mode = "accept-edits";
        break;
      case "--mode": {
        const v = argv[++i];
        if (v === "ask" || v === "accept-edits" || v === "bypass") {
          args.mode = v;
        } else {
          console.error(`unknown --mode value: ${v}`);
          process.exit(2);
        }
        break;
      }
      case "--model":
        args.model = argv[++i];
        break;
      case "--cwd":
        args.cwd = argv[++i];
        break;
      default:
        args.prompt.push(a);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`ccr ${VERSION} — clean-room terminal coding assistant (Groq-backed)

Usage: ccr [options] [prompt...]

Options:
  -p, --print              One-shot mode: run prompt and exit (no UI).
  -r, --resume [ID]        Resume last (or named) session.
  --list-sessions          List saved sessions and exit.
  --mode MODE              Permission mode: ask | accept-edits | bypass.
  --accept-edits           Auto-approve file edits, ask for shell commands.
  --yolo, --bypass         Auto-approve everything (alias for --mode bypass).
  --model NAME             Override Groq model (default: ${DEFAULT_MODEL}).
  --cwd DIR                Project root (default: cwd).
  -V, --version            Print version.
  -h, --help               Show this help.

REPL slash commands: /help /clear /model /models /mode /yolo /sessions /save /exit
`);
}

function colorizeDiff(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("+++") || line.startsWith("---")) return kleur.bold(line);
      if (line.startsWith("@@")) return kleur.cyan(line);
      if (line.startsWith("+")) return kleur.green(line);
      if (line.startsWith("-")) return kleur.red(line);
      return line;
    })
    .join("\n");
}

function consoleApprover(mode: Mode, rl: readline.Interface): Approver {
  return async (req) => {
    if (mode === "bypass") {
      console.log(kleur.yellow(`[bypass] auto-approve: ${req.title}`));
      return true;
    }
    if (mode === "accept-edits" && req.kind === "edit") {
      console.log(kleur.yellow(`[accept-edits] auto-approve: ${req.title}`));
      return true;
    }
    console.log(kleur.yellow().bold(`\n┌─ ${req.title} (${req.kind})`));
    const looksLikeDiff = /^(---|\+\+\+|@@)/m.test(req.detail);
    console.log(looksLikeDiff ? colorizeDiff(req.detail) : req.detail);
    console.log(kleur.yellow("└─"));
    const answer: string = await new Promise((res) => rl.question("Approve? [y/N] ", res));
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  };
}

function consoleReporter(): Reporter {
  let header = false;
  return {
    token(s) {
      if (!header) {
        process.stdout.write(kleur.magenta().bold("⏺ ccr") + "\n  ");
        header = true;
      }
      process.stdout.write(s);
    },
    assistantTurnEnd() {
      if (header) process.stdout.write("\n");
      header = false;
    },
    toolCallStart(name, argsPreview) {
      console.log(kleur.dim(`→ ${name}(${argsPreview})`));
    },
    toolCallEnd(name, result, isError) {
      if (isError) {
        console.log(kleur.red(`  ${(result.split("\n")[0] || "").slice(0, 200)}`));
        return;
      }
      if ((name === "glob" || name === "grep") && result !== "(no matches)") {
        const lines = result.split("\n").filter((l) => l.length > 0);
        console.log(kleur.dim(`  ${lines.length} result${lines.length === 1 ? "" : "s"}`));
        for (const line of lines.slice(0, 3)) console.log(kleur.dim(`    ${line}`));
        if (lines.length > 3) console.log(kleur.dim(`    … +${lines.length - 3} more`));
        return;
      }
      console.log(kleur.dim(`  ${(result.split("\n")[0] || "").slice(0, 200)}`));
    },
    iterationCap() {
      console.log(kleur.yellow("⚠ hit max iterations"));
    },
    setStatus(text) {
      if (text) process.stdout.write("\r" + kleur.yellow(text) + "    ");
      else process.stdout.write("\r" + " ".repeat(80) + "\r");
    },
  };
}

async function runOneShot(args: Args, root: string): Promise<number> {
  let client;
  try {
    client = buildClient();
  } catch (e: any) {
    console.error(kleur.red(e.message));
    return 1;
  }

  let sessionId: string;
  let messages: any[];
  if (args.resume !== undefined) {
    try {
      const loaded = await loadSession(root, args.resume || null);
      sessionId = loaded.id;
      messages = loaded.messages;
    } catch (e: any) {
      console.error(kleur.red(e.message));
      return 1;
    }
  } else {
    sessionId = newSessionId();
    messages = initialMessages(root, await loadProjectContext(root));
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ctx: ToolContext = { root, approve: consoleApprover(args.mode, rl) };
  const run: AgentRun = { client, model: args.model, ctx, reporter: consoleReporter() };

  const initialPrompt = args.prompt.join(" ").trim();
  if (initialPrompt) {
    messages.push({ role: "user", content: initialPrompt });
    try {
      await runAgent(run, messages);
    } catch (e: any) {
      console.error(kleur.red(`error: ${e?.message ?? e}`));
    }
    await saveSession(root, sessionId, messages);
  }
  rl.close();
  return 0;
}

async function runInteractive(args: Args, root: string): Promise<number> {
  // Verify Groq key up front so the user gets a clean error before Ink starts.
  try {
    buildClient();
  } catch (e: any) {
    console.error(kleur.red(e.message));
    return 1;
  }

  let sessionId: string;
  let messages: any[];
  if (args.resume !== undefined) {
    try {
      const loaded = await loadSession(root, args.resume || null);
      sessionId = loaded.id;
      messages = loaded.messages;
    } catch (e: any) {
      console.error(kleur.red(e.message));
      return 1;
    }
  } else {
    sessionId = newSessionId();
    messages = initialMessages(root, await loadProjectContext(root));
  }

  const initialPrompt = args.prompt.join(" ").trim() || null;

  const { waitUntilExit } = render(
    React.createElement(App, {
      root,
      model: args.model,
      mode: args.mode,
      initialSessionId: sessionId,
      initialApiMessages: messages,
      initialPrompt,
      buildClient,
      loadProjectContext: () => loadProjectContext(root),
    }),
    { exitOnCtrlC: false },
  );
  await waitUntilExit();
  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.showVersion) {
    console.log(`ccr ${VERSION}`);
    return 0;
  }
  if (args.showHelp) {
    printHelp();
    return 0;
  }

  const root = path.resolve(args.cwd ?? process.cwd());
  applyConfig(await loadConfig());
  loadDotEnv(root);

  if (args.listSessions) {
    const sessions = await listSessions(root);
    if (!sessions.length) {
      console.log(kleur.dim("no sessions for this project"));
      return 0;
    }
    for (const s of sessions) console.log(`${path.basename(s, ".json")}\t${s}`);
    return 0;
  }

  if (args.print) {
    return runOneShot(args, root);
  }
  // Default: interactive Ink UI. If there's an initial prompt it runs first.
  return runInteractive(args, root);
}

main().then((code) => process.exit(code ?? 0));
