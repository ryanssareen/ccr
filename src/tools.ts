import { promises as fs } from "node:fs";
import { existsSync, statSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createPatch } from "diff";

const execAsync = promisify(exec);

const MAX_FILE_BYTES = 500_000;
const MAX_TOOL_OUTPUT = 12_000;
const MAX_GREP_RESULTS = 80;
const MAX_GLOB_RESULTS = 150;
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  "dist",
  "build",
  ".next",
  ".turbo",
]);

export type ApprovalKind = "edit" | "bash";

export interface ApprovalRequest {
  kind: ApprovalKind;
  title: string;
  detail: string;
}

export type Approver = (req: ApprovalRequest) => Promise<boolean>;

export interface AskQuestion {
  question: string;
  options: string[];
}

export interface AskRequest {
  questions: AskQuestion[];
}

export interface AskAnswer {
  answer: string;
}

export type Asker = (req: AskRequest) => Promise<AskAnswer[]>;

export interface ToolContext {
  root: string;
  approve: Approver;
  ask?: Asker;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly: boolean;
  run: (ctx: ToolContext, args: any) => Promise<string>;
}

function truncate(s: string, limit = MAX_TOOL_OUTPUT): string {
  if (s.length <= limit) return s;
  return s.slice(0, limit) + `\n\n[... truncated ${s.length - limit} bytes ...]`;
}

function safePath(root: string, target: string): string {
  return path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target);
}

async function readFileText(p: string): Promise<string> {
  return fs.readFile(p, "utf8");
}

function unifiedDiff(oldText: string, newText: string, label: string): string {
  return createPatch(label, oldText, newText, "", "");
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      yield* walk(path.join(dir, e.name));
    } else if (e.isFile()) {
      yield path.join(dir, e.name);
    }
  }
}

function globToRegex(pattern: string): RegExp {
  // Minimal glob: ** matches across dirs, * matches within dir, ? matches single char.
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLESTAR::/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp("^" + re + "$");
}

function fnmatch(name: string, pattern: string): boolean {
  return globToRegex(pattern).test(name);
}

// --- Tools --------------------------------------------------------------------

const readFileTool: ToolDef = {
  name: "read_file",
  description: "Read a UTF-8 text file from the project. Returns numbered lines.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative or absolute path." },
      offset: { type: "integer", description: "0-indexed start line.", default: 0 },
      limit: { type: "integer", description: "Max lines to return.", default: 2000 },
    },
    required: ["path"],
  },
  async run(ctx, { path: target, offset = 0, limit = 2000 }) {
    const p = safePath(ctx.root, target);
    if (!existsSync(p)) return `ERROR: file not found: ${p}`;
    const st = statSync(p);
    if (st.isDirectory()) return `ERROR: is a directory: ${p}`;
    if (st.size > MAX_FILE_BYTES)
      return `ERROR: file too large (${st.size} bytes); read in chunks via offset/limit`;
    const text = await readFileText(p);
    const lines = text.split("\n");
    const sliced = lines.slice(offset, offset + limit);
    const numbered = sliced
      .map((ln, i) => `${String(i + 1 + offset).padStart(6)}\t${ln}`)
      .join("\n");
    return truncate(`${p} (${lines.length} lines)\n${numbered}`);
  },
};

const writeFileTool: ToolDef = {
  name: "write_file",
  description: "Create or overwrite a file with the given content. Requires user approval.",
  readOnly: false,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  async run(ctx, { path: target, content }) {
    const p = safePath(ctx.root, target);
    const existed = existsSync(p);
    const old = existed ? await readFileText(p) : "";
    const diff = unifiedDiff(old, content, path.relative(ctx.root, p) || p);
    const ok = await ctx.approve({
      kind: "edit",
      title: `${existed ? "Overwrite" : "Create"} ${p}`,
      detail: diff || "(empty file)",
    });
    if (!ok) return "DENIED: user rejected the write.";
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content, "utf8");
    return `OK: wrote ${Buffer.byteLength(content, "utf8")} bytes to ${p}`;
  },
};

const editFileTool: ToolDef = {
  name: "edit_file",
  description:
    "Replace old_string with new_string in a file. old_string must be unique unless replace_all=true. Requires approval.",
  readOnly: false,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      old_string: { type: "string" },
      new_string: { type: "string" },
      replace_all: { type: "boolean", default: false },
    },
    required: ["path", "old_string", "new_string"],
  },
  async run(ctx, { path: target, old_string, new_string, replace_all = false }) {
    const p = safePath(ctx.root, target);
    if (!existsSync(p)) return `ERROR: file not found: ${p}`;
    const text = await readFileText(p);
    if (!text.includes(old_string)) return "ERROR: old_string not found in file";
    const occurrences = text.split(old_string).length - 1;
    if (!replace_all && occurrences > 1)
      return `ERROR: old_string appears ${occurrences} times; pass replace_all=true or expand context`;
    const newText = replace_all
      ? text.split(old_string).join(new_string)
      : text.replace(old_string, new_string);
    const diff = unifiedDiff(text, newText, path.relative(ctx.root, p) || p);
    const ok = await ctx.approve({ kind: "edit", title: `Edit ${p}`, detail: diff });
    if (!ok) return "DENIED: user rejected the edit.";
    await fs.writeFile(p, newText, "utf8");
    return `OK: edited ${p}`;
  },
};

const multiEditTool: ToolDef = {
  name: "multi_edit",
  description:
    "Apply a sequence of search-replace edits to a single file atomically. Each edit operates on the result of the previous one. Requires a single approval for the combined diff.",
  readOnly: false,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      edits: {
        type: "array",
        description: "Ordered list of edits.",
        items: {
          type: "object",
          properties: {
            old_string: { type: "string" },
            new_string: { type: "string" },
            replace_all: { type: "boolean", default: false },
          },
          required: ["old_string", "new_string"],
        },
      },
    },
    required: ["path", "edits"],
  },
  async run(ctx, { path: target, edits }) {
    const p = safePath(ctx.root, target);
    if (!existsSync(p)) return `ERROR: file not found: ${p}`;
    const original = await readFileText(p);
    let cur = original;
    for (let i = 0; i < edits.length; i++) {
      const { old_string, new_string, replace_all = false } = edits[i];
      if (!cur.includes(old_string)) return `ERROR: edit #${i + 1}: old_string not found`;
      const count = cur.split(old_string).length - 1;
      if (!replace_all && count > 1)
        return `ERROR: edit #${i + 1}: old_string appears ${count} times; set replace_all=true or expand context`;
      cur = replace_all ? cur.split(old_string).join(new_string) : cur.replace(old_string, new_string);
    }
    if (cur === original) return "ERROR: edits produced no change";
    const diff = unifiedDiff(original, cur, path.relative(ctx.root, p) || p);
    const ok = await ctx.approve({
      kind: "edit",
      title: `Multi-edit ${p} (${edits.length} edits)`,
      detail: diff,
    });
    if (!ok) return "DENIED: user rejected the edits.";
    await fs.writeFile(p, cur, "utf8");
    return `OK: applied ${edits.length} edits to ${p}`;
  },
};

const insertLinesTool: ToolDef = {
  name: "insert_lines",
  description:
    "Insert content at a specific 1-indexed line number in a file (content is inserted before that line; use line=N+1 to append). Requires approval.",
  readOnly: false,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      line: { type: "integer", description: "1-indexed line number to insert before." },
      content: { type: "string", description: "Content to insert. Trailing newline added if missing." },
    },
    required: ["path", "line", "content"],
  },
  async run(ctx, { path: target, line, content }) {
    const p = safePath(ctx.root, target);
    if (!existsSync(p)) return `ERROR: file not found: ${p}`;
    const text = await readFileText(p);
    const lines = text.split("\n");
    if (line < 1 || line > lines.length + 1) return `ERROR: line ${line} out of range (1..${lines.length + 1})`;
    const insert = content.endsWith("\n") ? content.slice(0, -1).split("\n") : content.split("\n");
    const out = [...lines.slice(0, line - 1), ...insert, ...lines.slice(line - 1)].join("\n");
    const diff = unifiedDiff(text, out, path.relative(ctx.root, p) || p);
    const ok = await ctx.approve({
      kind: "edit",
      title: `Insert at line ${line} in ${p}`,
      detail: diff,
    });
    if (!ok) return "DENIED: user rejected the insert.";
    await fs.writeFile(p, out, "utf8");
    return `OK: inserted ${insert.length} lines at ${p}:${line}`;
  },
};

const globTool: ToolDef = {
  name: "glob",
  description: "Find files by glob pattern (e.g. '**/*.ts'). Returns paths sorted by mtime desc.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string", description: "Optional base directory." },
    },
    required: ["pattern"],
  },
  async run(ctx, { pattern, path: base }) {
    const root = base ? safePath(ctx.root, base) : ctx.root;
    const matches: { p: string; mtime: number }[] = [];
    const re = globToRegex(pattern);
    for await (const file of walk(root)) {
      const rel = path.relative(root, file);
      const name = path.basename(file);
      if (re.test(rel) || re.test(name)) {
        try {
          matches.push({ p: file, mtime: statSync(file).mtimeMs });
        } catch {
          continue;
        }
        if (matches.length >= MAX_GLOB_RESULTS) break;
      }
    }
    matches.sort((a, b) => b.mtime - a.mtime);
    return truncate(matches.map((m) => m.p).join("\n") || "(no matches)");
  },
};

const grepTool: ToolDef = {
  name: "grep",
  description: "Regex search across project files. Returns path:line: match.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "JavaScript regex." },
      path: { type: "string" },
      glob: { type: "string", description: "Optional filename glob filter." },
    },
    required: ["pattern"],
  },
  async run(ctx, { pattern, path: base, glob }) {
    const root = base ? safePath(ctx.root, base) : ctx.root;
    let rx: RegExp;
    try {
      rx = new RegExp(pattern);
    } catch (e) {
      return `ERROR: bad regex: ${(e as Error).message}`;
    }
    const out: string[] = [];
    for await (const file of walk(root)) {
      if (glob && !fnmatch(path.basename(file), glob)) continue;
      let text: string;
      try {
        if (statSync(file).size > MAX_FILE_BYTES) continue;
        text = await readFileText(file);
      } catch {
        continue;
      }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (rx.test(lines[i])) {
          out.push(`${file}:${i + 1}: ${lines[i]}`);
          if (out.length >= MAX_GREP_RESULTS) {
            return truncate(out.join("\n") + `\n[stopped at ${MAX_GREP_RESULTS} matches]`);
          }
        }
      }
    }
    return truncate(out.join("\n") || "(no matches)");
  },
};

const bashTool: ToolDef = {
  name: "bash",
  description:
    "Run a shell command in the project directory. Requires approval. Returns exit code, stdout, stderr.",
  readOnly: false,
  parameters: {
    type: "object",
    properties: {
      command: { type: "string" },
      timeout: { type: "integer", description: "Seconds.", default: 120 },
    },
    required: ["command"],
  },
  async run(ctx, { command, timeout = 120 }) {
    const ok = await ctx.approve({ kind: "bash", title: "Run shell command", detail: `$ ${command}` });
    if (!ok) return "DENIED: user rejected the command.";
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: ctx.root,
        timeout: timeout * 1000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const parts = ["exit=0"];
      if (stdout) parts.push("--- stdout ---\n" + stdout);
      if (stderr) parts.push("--- stderr ---\n" + stderr);
      return truncate(parts.join("\n"));
    } catch (err: any) {
      const parts = [`exit=${err.code ?? 1}`];
      if (err.stdout) parts.push("--- stdout ---\n" + err.stdout);
      if (err.stderr) parts.push("--- stderr ---\n" + err.stderr);
      if (err.killed) parts.push(`(killed: ${err.signal ?? "timeout"})`);
      if (!err.stdout && !err.stderr && err.message) parts.push(err.message);
      return truncate(parts.join("\n"));
    }
  },
};

const askUserQuestionTool: ToolDef = {
  name: "ask_user_question",
  description:
    "Ask the user 1-3 short clarifying questions when the request is genuinely ambiguous. Each question presents multiple-choice options plus a free-text 'Other' path. Do NOT use for trivial preferences or things you can decide yourself.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            question: { type: "string", description: "The clarifying question, kept short." },
            options: {
              type: "array",
              description:
                "2-5 concise multiple-choice options. A free-text 'Other' choice is added automatically.",
              items: { type: "string" },
            },
          },
          required: ["question", "options"],
        },
      },
    },
    required: ["questions"],
  },
  async run(ctx, { questions }) {
    if (!Array.isArray(questions) || questions.length === 0)
      return "ERROR: questions list is empty";
    if (questions.length > 3) return "ERROR: at most 3 questions per call";
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q || typeof q.question !== "string")
        return `ERROR: question ${i} missing 'question' field`;
      if (!Array.isArray(q.options)) return `ERROR: question ${i} 'options' must be an array`;
    }
    if (typeof ctx.ask !== "function")
      return "ERROR: interactive Q&A is not available in this session";
    const answers = await ctx.ask({ questions });
    return (questions as AskQuestion[])
      .map((q, i) => `Q: ${q.question}\nA: ${answers?.[i]?.answer ?? "(no answer)"}`)
      .join("\n\n");
  },
};

export const TOOLS: ToolDef[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  multiEditTool,
  insertLinesTool,
  globTool,
  grepTool,
  bashTool,
  askUserQuestionTool,
];

export const TOOL_BY_NAME: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

export function toolSchemas() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function dispatch(ctx: ToolContext, name: string, args: any): Promise<string> {
  const tool = TOOL_BY_NAME[name];
  if (!tool) return `ERROR: unknown tool ${name}`;
  try {
    return await tool.run(ctx, args ?? {});
  } catch (e: any) {
    return `ERROR: ${e?.name ?? "Error"}: ${e?.message ?? String(e)}`;
  }
}
