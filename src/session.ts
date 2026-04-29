import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";

const SESSIONS_DIR = path.join(os.homedir(), ".ccr", "sessions");

function projectId(root: string): string {
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
): Promise<{ id: string; messages: any[] }> {
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
  return { id: sessionId, messages: data.messages ?? [] };
}

export async function saveSession(root: string, sessionId: string, messages: any[]): Promise<void> {
  const p = sessionPath(root, sessionId);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify({ messages, updated: Date.now() }, null, 2), "utf8");
}
