import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";

const SESSIONS_DIR = path.join(os.homedir(), ".ccr", "sessions");

/** Absolute `~/.ccr/sessions` path — shared watchers (CLI Unit 7 + Electron Unit 7). */
export function sessionsRootDirectory(): string {
  return SESSIONS_DIR;
}

/**
 * Stable hash of an absolute project root path. Used as the directory name
 * for the project's saved sessions under `~/.ccr/sessions/<projectId>/`.
 */
export function projectId(root: string): string {
  return createHash("sha1").update(path.resolve(root)).digest("hex").slice(0, 12);
}

function projectDir(root: string): string {
  return path.join(SESSIONS_DIR, projectId(root));
}

export function sessionPath(root: string, sessionId: string): string {
  return path.join(projectDir(root), `${sessionId}.json`);
}

export function newSessionId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export async function listSessions(root: string): Promise<string[]> {
  const dir = projectDir(root);
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir);
  const stats = await Promise.all(
    entries
      .filter((e) => e.endsWith(".json"))
      .map(async (e) => ({ p: path.join(dir, e), mtime: (await fs.stat(path.join(dir, e))).mtimeMs })),
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  return stats.map((s) => s.p);
}

export async function loadSession(
  root: string,
  sessionId: string | null,
): Promise<{ id: string; messages: any[]; projectRoot?: string }> {
  let target: string;
  if (!sessionId) {
    const all = await listSessions(root);
    if (all.length === 0) throw new Error("no sessions to resume");
    target = all[0];
    sessionId = path.basename(target, ".json");
  } else {
    target = sessionPath(root, sessionId);
  }
  const data = JSON.parse(await fs.readFile(target, "utf8"));
  const pr = typeof data.projectRoot === "string" ? data.projectRoot : undefined;
  return { id: sessionId, messages: data.messages ?? [], projectRoot: pr };
}

export async function saveSession(root: string, sessionId: string, messages: any[]): Promise<void> {
  const p = sessionPath(root, sessionId);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const resolvedRoot = path.resolve(root);
  await fs.writeFile(
    p,
    JSON.stringify({ messages, updated: Date.now(), projectRoot: resolvedRoot }, null, 2),
    "utf8",
  );
}

export interface SessionIndexEntry {
  sessionId: string;
  sessionPath: string;
  projectIdHash: string;
  projectRoot: string | null;
  updatedAt: number;
  messageCount: number;
}

const PROJECT_HASH_RE = /^[a-f0-9]{12}$/;

export async function listSessionsIndex(): Promise<SessionIndexEntry[]> {
  if (!existsSync(SESSIONS_DIR)) return [];
  const projectDirs = (await fs.readdir(SESSIONS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && PROJECT_HASH_RE.test(d.name))
    .map((d) => d.name);

  const out: SessionIndexEntry[] = [];
  for (const hash of projectDirs) {
    const dir = path.join(SESSIONS_DIR, hash);
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      if (name.endsWith(".json.lock")) continue;
      const sessionPathAbs = path.join(dir, name);
      let st;
      try {
        st = await fs.stat(sessionPathAbs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      let data: { messages?: unknown[]; updated?: number; projectRoot?: string };
      try {
        data = JSON.parse(await fs.readFile(sessionPathAbs, "utf8"));
      } catch {
        data = {};
      }
      const sessionId = path.basename(name, ".json");
      out.push({
        sessionId,
        sessionPath: sessionPathAbs,
        projectIdHash: hash,
        projectRoot: typeof data.projectRoot === "string" ? data.projectRoot : null,
        updatedAt:
          typeof data.updated === "number" && Number.isFinite(data.updated) ? data.updated : st.mtimeMs,
        messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
      });
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

export async function loadSessionByPath(absPath: string): Promise<{ id: string; messages: any[]; projectRoot?: string }> {
  const sessionId = path.basename(absPath, ".json");
  const data = JSON.parse(await fs.readFile(absPath, "utf8"));
  const pr = typeof data.projectRoot === "string" ? data.projectRoot : undefined;
  return { id: sessionId, messages: data.messages ?? [], projectRoot: pr };
}
