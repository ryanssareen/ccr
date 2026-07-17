// Project-root resolution for the desktop app (issue #19).
//
// `process.cwd()` is not a usable default here: a packaged macOS app launched
// from Finder/Dock inherits cwd = "/", so every session the shipped app
// created was rooted at the filesystem root — which is both a nonsense label
// in the rail and, far worse, the directory the agent's file tools and
// project-context loader then operate against.
//
// The rule this module enforces: a filesystem root is a sentinel meaning
// "unresolved", never a legitimate project root. Everything here is pure and
// dependency-injected so it can be tested without launching Electron.
import { statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** True for "/" (posix) and "C:\" (win32) — any path that is its own parent. */
export function isFilesystemRoot(candidate: string): boolean {
  const resolved = path.resolve(candidate);
  return path.dirname(resolved) === resolved;
}

/** Structural check only — no filesystem access. */
function isPlausibleProjectRoot(candidate: string | null | undefined): candidate is string {
  if (typeof candidate !== "string") return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  if (!path.isAbsolute(trimmed)) return false;
  return !isFilesystemRoot(trimmed);
}

function defaultIsDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Structurally plausible *and* actually an existing directory. */
export function isUsableProjectRoot(
  candidate: string | null | undefined,
  isDirectory: (p: string) => boolean = defaultIsDirectory,
): boolean {
  if (!isPlausibleProjectRoot(candidate)) return false;
  return isDirectory(path.resolve(candidate));
}

export interface ProjectRootEnv {
  /** Usually `process.cwd()`. Only trusted when the app is unpackaged. */
  cwd: string;
  /** `app.isPackaged`. */
  isPackaged: boolean;
  /** `projectRoot` from ~/.ccr/config.json, when the user has pinned one. */
  configuredRoot?: string | null;
  /** `app.getPath("home")`. */
  homeDir: string;
  /** Last-resort backstop; only reachable if home is unusable. */
  tmpDir?: string;
  /** Injected in tests. */
  isDirectory?: (p: string) => boolean;
}

/**
 * Resolve the root new sessions should be created in.
 *
 * Order:
 *   - dev only: `cwd` — `npm run dev:desktop` runs with cwd = the repo, and
 *     that's the root a developer expects. A packaged app's cwd is whatever
 *     the launcher happened to hand it ("/" from Finder, the install dir from
 *     Explorer), so it is never consulted.
 *   - `configuredRoot` — an explicitly pinned root from config.
 *   - `homeDir` — the safe fallback: a real directory the user owns, and a
 *     boring, obvious place rather than a wrong guess at a project.
 *   - `tmpDir` — only if home itself is unusable (e.g. HOME=/ in a container).
 *
 * Unusable candidates (missing, relative, or a filesystem root) are skipped,
 * so the result is never "/".
 */
export function resolveProjectRoot(env: ProjectRootEnv): string {
  const isDirectory = env.isDirectory ?? defaultIsDirectory;
  const candidates: Array<string | null | undefined> = [
    env.isPackaged ? null : env.cwd,
    env.configuredRoot,
    env.homeDir,
    env.tmpDir ?? os.tmpdir(),
  ];
  for (const candidate of candidates) {
    if (isUsableProjectRoot(candidate, isDirectory)) return path.resolve(candidate as string);
  }
  // Every candidate failed — refuse to imply "/" is a project.
  throw new Error(
    `Could not resolve a project root (cwd=${env.cwd}, home=${env.homeDir}). ` +
      `Set "projectRoot" to an absolute directory in ~/.ccr/config.json.`,
  );
}

/**
 * Boundary guard for a caller-supplied root (renderer input, or the root
 * persisted in an existing session file). Falls back when the candidate is
 * not a legal project root — notably "/", which every session created by the
 * pre-fix packaged build carries.
 *
 * Structural check only: no filesystem access, because this sits on the hot
 * path of session creation and agent start, and a root that exists *now* is
 * not the invariant being defended here — "not the filesystem root" is.
 */
export function sanitizeProjectRoot(
  candidate: string | null | undefined,
  fallback: string,
): string {
  if (isPlausibleProjectRoot(candidate)) return path.resolve(candidate);
  return fallback;
}
