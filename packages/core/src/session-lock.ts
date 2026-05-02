// Per-session lock arbitration. Each `~/.ccr/sessions/<projectId>/<id>.json`
// can have a sibling `<id>.json.lock` recording the pid + host of the
// process actively running an agent loop on that session. When two
// front-ends (CLI + Electron) are open on the same machine, the lock is
// the only signal that says "another window is driving this session".
//
// Single-machine assumption (v1): cross-host locks are refused, not stolen.
// Stale locks (owning pid is dead on this host) are taken over silently.
import { promises as fs, existsSync } from "node:fs";
import { hostname } from "node:os";

export interface LockFile {
  pid: number;
  host: string;
  sessionId: string;
  /** ISO 8601 timestamp. */
  startedAt: string;
}

export class LockOwnedElsewhereError extends Error {
  readonly pid: number;
  readonly host: string;
  constructor(message: string, pid: number, host: string) {
    super(message);
    this.name = "LockOwnedElsewhereError";
    this.pid = pid;
    this.host = host;
  }
}

export interface AcquireOptions {
  /** Test seam — defaults to process.pid. */
  pid?: number;
  /** Test seam — defaults to os.hostname(). */
  host?: string;
  /** Test seam — defaults to a real `process.kill(pid, 0)` probe. */
  isPidAlive?: (pid: number) => boolean;
  /**
   * Force-acquire even when a foreign lock exists. Still respects liveness:
   * if the foreign pid is alive, this throws. This is the "open here"
   * recovery path for a foreign lock whose owning process has died.
   */
  force?: boolean;
}

export interface ReleaseOptions {
  /** Test seam — defaults to process.pid. */
  pid?: number;
  /** Test seam — defaults to os.hostname(). */
  host?: string;
}

/** Returns the lock file path for a given session JSON path. */
export function lockPath(sessionPath: string): string {
  return sessionPath + ".lock";
}

function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true; // exists but isn't ours to signal
    return false;
  }
}

/** Read and parse the lock file. Returns null when missing or malformed. */
export async function readLock(sessionPath: string): Promise<LockFile | null> {
  const p = lockPath(sessionPath);
  if (!existsSync(p)) return null;
  try {
    const text = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(text) as Partial<LockFile>;
    if (
      typeof parsed.pid === "number" &&
      typeof parsed.host === "string" &&
      typeof parsed.sessionId === "string" &&
      typeof parsed.startedAt === "string"
    ) {
      return parsed as LockFile;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeLockAtomic(p: string, lock: LockFile): Promise<void> {
  // Write-temp-then-rename for atomicity. After rename, read back to make
  // sure our pid/host landed (defends against the rare Windows non-atomic
  // rename or a concurrent writer racing us).
  const tmp = `${p}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(lock, null, 2), "utf8");
  await fs.rename(tmp, p);
  const verify = JSON.parse(await fs.readFile(p, "utf8")) as LockFile;
  if (verify.pid !== lock.pid || verify.host !== lock.host) {
    throw new LockOwnedElsewhereError(
      `Concurrent writer raced lock acquisition (saw pid=${verify.pid} host=${verify.host}).`,
      verify.pid,
      verify.host,
    );
  }
}

/**
 * Acquire the lock for a session. Resolves with the lock record we wrote.
 * Behavior:
 *   - No existing lock → write one and return.
 *   - Existing lock by current pid+host → refresh timestamp, return.
 *   - Same host, owning pid is dead → take over (overwrite).
 *   - Same host, owning pid is alive → throw `LockOwnedElsewhereError`.
 *   - Different host → throw with a single-machine-assumption message.
 *   - Malformed JSON → treat as stale, take over.
 *
 * `force: true` takes over an already-dead foreign lock on the same host
 * but still refuses to steal from a live owner.
 */
export async function acquireLock(
  sessionPath: string,
  sessionId: string,
  opts: AcquireOptions = {},
): Promise<LockFile> {
  const myPid = opts.pid ?? process.pid;
  const myHost = opts.host ?? hostname();
  const isAlive = opts.isPidAlive ?? defaultIsPidAlive;
  const p = lockPath(sessionPath);

  const existing = await readLock(sessionPath);

  if (existing) {
    if (existing.host !== myHost) {
      throw new LockOwnedElsewhereError(
        `Session is locked on another machine (host=${existing.host} pid=${existing.pid}). ` +
          `CCR's single-machine assumption refuses cross-host takeover; resolve manually.`,
        existing.pid,
        existing.host,
      );
    }
    if (existing.pid === myPid) {
      // Re-entry: refresh and return.
      const refreshed: LockFile = {
        pid: myPid,
        host: myHost,
        sessionId,
        startedAt: new Date().toISOString(),
      };
      await writeLockAtomic(p, refreshed);
      return refreshed;
    }
    if (isAlive(existing.pid)) {
      throw new LockOwnedElsewhereError(
        `Session is active in another ccr process (pid=${existing.pid}). ` +
          `Close the other window or wait for it to finish.`,
        existing.pid,
        existing.host,
      );
    }
    // Stale (dead pid on same host) — fall through to take over.
    // `force: true` is a no-op here since liveness already said dead.
  }

  const fresh: LockFile = {
    pid: myPid,
    host: myHost,
    sessionId,
    startedAt: new Date().toISOString(),
  };
  await writeLockAtomic(p, fresh);
  return fresh;
}

/**
 * Release the lock for a session. Idempotent. Refuses to delete a lock
 * owned by a different pid (logs a warning instead of nuking it).
 */
export async function releaseLock(
  sessionPath: string,
  opts: ReleaseOptions = {},
): Promise<void> {
  const myPid = opts.pid ?? process.pid;
  const myHost = opts.host ?? hostname();
  const p = lockPath(sessionPath);

  const existing = await readLock(sessionPath);
  if (!existing) return;
  if (existing.pid !== myPid || existing.host !== myHost) {
    // Don't delete someone else's lock. Caller likely got confused;
    // leave the foreign lock alone.
    return;
  }
  try {
    await fs.unlink(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
