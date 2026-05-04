import { promises as fs, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const CONTEXT_FILES = ["CLAUDE.md", "AGENTS.md", ".ccr/context.md"];
const PROJECT_CONTEXT_PER_FILE = 6000;
const PROJECT_CONTEXT_TOTAL = 12000;

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

/** Mirrors CLI `packages/cli/src/cli.ts` project context ingestion. */
export async function loadProjectContext(root: string): Promise<string> {
  loadDotEnv(root);
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
