/**
 * Eval harness for the CCR proxy.
 *
 * Usage:
 *   npm run -w @ccr/eval eval                          # default models
 *   npm run -w @ccr/eval eval -- --models a,b,c       # custom set
 *   npm run -w @ccr/eval eval -- --challenges two-sum,fizzbuzz
 *   npm run -w @ccr/eval eval -- --json out.json       # write raw results
 *
 * Auth comes from ~/.ccr/auth.json (run `ccr login` if missing).
 */

import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

import {
  CHALLENGES,
  type Challenge,
  type ExecValidator,
  type Language,
  type RegexValidator,
} from "./challenges.js";

// ───────────────────────── Config ─────────────────────────

const DEFAULT_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "moonshotai/kimi-k2-instruct",
  "qwen/qwen3-32b",
];

const REQUEST_TIMEOUT_MS = 90_000;

// ───────────────────────── CLI ─────────────────────────

interface Args {
  models: string[];
  challenges: string[] | null;
  json: string | null;
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    models: DEFAULT_MODELS,
    challenges: null,
    json: null,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--models" && argv[i + 1]) {
      out.models = argv[++i].split(",").map((s) => s.trim());
    } else if (a === "--challenges" && argv[i + 1]) {
      out.challenges = argv[++i].split(",").map((s) => s.trim());
    } else if (a === "--json" && argv[i + 1]) {
      out.json = argv[++i];
    } else if (a === "-v" || a === "--verbose") {
      out.verbose = true;
    }
  }
  return out;
}

// ───────────────────────── Auth ─────────────────────────

interface CcrAuth {
  token: string;
  endpoint: string;
  email: string;
}

async function loadAuth(): Promise<CcrAuth> {
  const p = path.join(os.homedir(), ".ccr", "auth.json");
  let raw: string;
  try {
    raw = await fs.readFile(p, "utf8");
  } catch {
    throw new Error(
      `Cannot read ${p}. Run \`ccr login\` first to authenticate.`
    );
  }
  const parsed = JSON.parse(raw) as Partial<CcrAuth>;
  if (!parsed.token || !parsed.endpoint) {
    throw new Error(`${p} is missing token or endpoint.`);
  }
  return {
    token: parsed.token,
    endpoint: parsed.endpoint.replace(/\/+$/, ""),
    email: parsed.email ?? "",
  };
}

// ───────────────────────── Proxy call ─────────────────────────

interface ChatResult {
  text: string;
  latencyMs: number;
  provider?: string;
  quotaUsed?: number;
  quotaLimit?: number;
  error?: string;
}

async function callProxy(
  auth: CcrAuth,
  model: string,
  prompt: string
): Promise<ChatResult> {
  const start = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${auth.endpoint}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are an expert programmer. When asked to write code, output a single fenced code block in the requested language and nothing else. No prose, no explanation outside the block.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: 1500,
      }),
    });

    const latencyMs = Date.now() - start;
    const provider = res.headers.get("X-CCR-Provider") ?? undefined;
    const quotaUsed = numOrUndef(res.headers.get("X-CCR-Quota-Used"));
    const quotaLimit = numOrUndef(res.headers.get("X-CCR-Quota-Limit"));

    if (!res.ok) {
      const body = await res.text();
      return {
        text: "",
        latencyMs,
        provider,
        quotaUsed,
        quotaLimit,
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    return { text, latencyMs, provider, quotaUsed, quotaLimit };
  } catch (err) {
    return {
      text: "",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function numOrUndef(s: string | null): number | undefined {
  if (s === null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// ───────────────────────── Code extraction ─────────────────────────

const FENCE_RE =
  /```(?:python|py|typescript|ts|javascript|js)?\s*\n([\s\S]*?)\n```/i;

function extractCode(response: string, language: Language): string | null {
  const match = response.match(FENCE_RE);
  if (match && match[1].trim().length > 0) return match[1];
  // Fallback: model returned bare code without fences.
  if (response.trim().length === 0) return null;
  return response;
}

// ───────────────────────── Validators ─────────────────────────

interface ValidationResult {
  pass: boolean;
  detail: string;
}

async function runExecValidator(
  v: ExecValidator,
  code: string
): Promise<ValidationResult> {
  const fullCode = [v.prefix ?? "", code, v.suffix ?? ""].join("\n");
  const timeoutSec = v.timeoutSec ?? 8;

  for (const c of v.cases) {
    const res = await runProgram(v.language, fullCode, c.stdin, timeoutSec);
    if (res.timedOut) {
      return { pass: false, detail: `timed out after ${timeoutSec}s` };
    }
    if (res.exitCode !== 0) {
      const stderrSnip = res.stderr.split("\n").slice(0, 3).join(" / ");
      return { pass: false, detail: `exit ${res.exitCode}: ${stderrSnip}` };
    }
    const got = res.stdout.replace(/\r\n/g, "\n").trim();
    const want = c.expected.replace(/\r\n/g, "\n").trim();
    if (got !== want) {
      return {
        pass: false,
        detail: `output mismatch — got ${snip(got)} want ${snip(want)}`,
      };
    }
  }
  return { pass: true, detail: "" };
}

function runRegexValidator(
  v: RegexValidator,
  code: string
): ValidationResult {
  for (const re of v.mustMatch ?? []) {
    if (!re.test(code)) {
      return { pass: false, detail: `missing pattern: ${re}` };
    }
  }
  for (const re of v.mustNotMatch ?? []) {
    if (re.test(code)) {
      return { pass: false, detail: `forbidden pattern: ${re}` };
    }
  }
  return { pass: true, detail: "" };
}

function snip(s: string, n = 60): string {
  const flat = s.replace(/\n/g, "⏎");
  return flat.length <= n ? `"${flat}"` : `"${flat.slice(0, n)}…"`;
}

// ───────────────────────── Code runner ─────────────────────────

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

async function runProgram(
  language: Language,
  code: string,
  stdin: string,
  timeoutSec: number
): Promise<RunResult> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ccr-eval-"));
  const ext =
    language === "python" ? "py" : language === "typescript" ? "ts" : "js";
  const file = path.join(dir, `program.${ext}`);
  await fs.writeFile(file, code);

  const cmd: { bin: string; args: string[] } = (() => {
    if (language === "python") return { bin: "python3", args: [file] };
    if (language === "javascript") return { bin: "node", args: [file] };
    return { bin: "npx", args: ["tsx", file] };
  })();

  return await new Promise<RunResult>((resolve) => {
    const child = spawn(cmd.bin, cmd.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutSec * 1000);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });
    child.on("error", (err) => {
      clearTimeout(t);
      resolve({
        exitCode: null,
        stdout,
        stderr: stderr + `\n[spawn error] ${err.message}`,
        timedOut,
      });
    });
  });
}

// ───────────────────────── Runner ─────────────────────────

interface CellResult {
  challengeId: string;
  model: string;
  pass: boolean;
  detail: string;
  latencyMs: number;
  provider?: string;
  hadCode: boolean;
}

async function runOne(
  auth: CcrAuth,
  challenge: Challenge,
  model: string,
  verbose: boolean
): Promise<CellResult> {
  const chat = await callProxy(auth, model, challenge.prompt);
  if (chat.error) {
    return {
      challengeId: challenge.id,
      model,
      pass: false,
      detail: chat.error.slice(0, 80),
      latencyMs: chat.latencyMs,
      provider: chat.provider,
      hadCode: false,
    };
  }

  const code = extractCode(chat.text, challenge.validator.language);
  if (!code) {
    return {
      challengeId: challenge.id,
      model,
      pass: false,
      detail: "no code in response",
      latencyMs: chat.latencyMs,
      provider: chat.provider,
      hadCode: false,
    };
  }

  if (verbose) {
    console.log(`\n--- ${challenge.id} × ${model} (raw) ---\n${code}\n---\n`);
  }

  const validation =
    challenge.validator.kind === "exec"
      ? await runExecValidator(challenge.validator, code)
      : runRegexValidator(challenge.validator, code);

  return {
    challengeId: challenge.id,
    model,
    pass: validation.pass,
    detail: validation.detail,
    latencyMs: chat.latencyMs,
    provider: chat.provider,
    hadCode: true,
  };
}

// ───────────────────────── Reporting ─────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printMatrix(results: CellResult[], models: string[]): void {
  const challengeIds = [...new Set(results.map((r) => r.challengeId))];
  const idCol = Math.max(20, ...challengeIds.map((c) => c.length));
  const modelCol = (m: string) => Math.max(8, m.length);

  // Header
  let header = pad("challenge", idCol);
  for (const m of models) header += " | " + pad(m, modelCol(m));
  console.log("\n" + header);
  console.log("-".repeat(header.length));

  for (const id of challengeIds) {
    let row = pad(id, idCol);
    for (const m of models) {
      const cell = results.find((r) => r.challengeId === id && r.model === m);
      const mark = cell?.pass ? "✓" : cell?.hadCode ? "✗" : "—";
      const ms = cell ? `${(cell.latencyMs / 1000).toFixed(1)}s` : "";
      row += " | " + pad(`${mark} ${ms}`, modelCol(m));
    }
    console.log(row);
  }

  // Summary row
  let summary = pad("PASS RATE", idCol);
  for (const m of models) {
    const modelResults = results.filter((r) => r.model === m);
    const passed = modelResults.filter((r) => r.pass).length;
    const total = modelResults.length;
    const pct = total === 0 ? 0 : Math.round((passed / total) * 100);
    summary += " | " + pad(`${passed}/${total} (${pct}%)`, modelCol(m));
  }
  console.log("-".repeat(header.length));
  console.log(summary);

  // Failure detail
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log("\nFailure details:");
    for (const f of failures) {
      console.log(
        `  ${f.challengeId} × ${f.model}: ${f.detail || "(no detail)"}`
      );
    }
  }
}

// ───────────────────────── Main ─────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const auth = await loadAuth();

  const challenges = args.challenges
    ? CHALLENGES.filter((c) => args.challenges!.includes(c.id))
    : CHALLENGES;

  if (challenges.length === 0) {
    console.error("No matching challenges. Available:");
    for (const c of CHALLENGES) console.error(`  ${c.id}`);
    process.exit(1);
  }

  console.log(`signed in as ${auth.email}`);
  console.log(`endpoint    ${auth.endpoint}`);
  console.log(`models      ${args.models.length} (${args.models.join(", ")})`);
  console.log(`challenges  ${challenges.length}`);
  console.log(
    `requests    ${args.models.length * challenges.length} (≈ same in quota)`
  );
  console.log("");

  const results: CellResult[] = [];

  for (const challenge of challenges) {
    process.stdout.write(`▸ ${challenge.id}\n`);
    // Sequential within a challenge to keep output readable; you can
    // parallelize later if you trust your quota.
    for (const model of args.models) {
      process.stdout.write(`    ${pad(model, 38)} `);
      const res = await runOne(auth, challenge, model, args.verbose);
      results.push(res);
      const mark = res.pass ? "✓" : res.hadCode ? "✗" : "—";
      process.stdout.write(
        `${mark}  ${(res.latencyMs / 1000).toFixed(1)}s  ${
          res.provider ?? "?"
        }${res.detail ? "  · " + res.detail.slice(0, 60) : ""}\n`
      );
    }
  }

  printMatrix(results, args.models);

  if (args.json) {
    await fs.writeFile(args.json, JSON.stringify(results, null, 2));
    console.log(`\nRaw results written to ${args.json}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
