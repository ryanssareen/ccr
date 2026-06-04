// Tier 1 of the two-tier client-side execution defense (tier 2 is the git
// sandbox in git-sandbox.ts).
//
// A DEFENSE-IN-DEPTH interceptor, not a sandbox. It screens command strings
// and filesystem paths against a small, hardcoded blocklist *before* they
// reach child_process or fs, and blocks the catastrophic-by-accident and
// low-effort-malicious cases:
//
//   - `rm -rf /` (and home / system-dir variants, --no-preserve-root)
//   - chmod / chown / chgrp against a system directory
//   - piping a downloaded payload straight into a shell (`curl … | sh`)
//   - reads / writes of credential files (.env, auth.json, ~/.ssh/, .git/config)
//
// It is NOT a substitute for OS-level isolation: a determined process with
// shell access can defeat any string filter (base64, env-var indirection,
// here-docs, writing then sourcing a script). Treat it as a seatbelt backed
// by the git sandbox and the user approval flow — together they cover the
// realistic risk surface for an autonomous coding agent.
//
// The screen is UNCONDITIONAL: it runs in every permission mode, including
// --yolo/bypass, and runs *before* the approval prompt. A guardrail you can
// click "approve" past is not a guardrail. On a breach it throws SecurityError,
// which the tool dispatcher (tools.ts) re-throws rather than swallowing, so a
// breach attempt kills the current agent loop immediately instead of being fed
// back to the model.

/** Thrown when the guardrail blocks a command or path. */
export class SecurityError extends Error {
  /** Short, stable id of the rule that fired, e.g. "rm-rf-system-root". */
  readonly rule: string;
  /** The offending command line or path. */
  readonly target: string;

  constructor(rule: string, reason: string, target: string) {
    super(`Security guardrail [${rule}] blocked this operation: ${reason} — ${JSON.stringify(target)}`);
    this.name = "SecurityError";
    this.rule = rule;
    this.target = target;
  }
}

// ─── shared helpers ───────────────────────────────────────────────────────────

// Absolute directories whose contents must never be recursively removed or
// have their permissions/ownership rewritten. The bare filesystem root and the
// home directory are handled separately in isSystemRootTarget().
const SYSTEM_DIRS = [
  "/bin", "/boot", "/dev", "/etc", "/lib", "/lib32", "/lib64", "/opt",
  "/proc", "/root", "/run", "/sbin", "/srv", "/sys", "/usr", "/var",
  // macOS
  "/System", "/Library", "/Applications", "/private", "/Volumes", "/Users",
];

function stripQuotes(s: string): string {
  return s.replace(/^['"]+|['"]+$/g, "");
}

/** Split a command line into rough pipeline/sequence segments. Not a real
 *  shell parser — just enough to inspect each invocation's argv regardless of
 *  where it sits in a `&&` / `;` / `|` chain. */
function splitSegments(command: string): string[] {
  return command
    .split(/\s*(?:\|\||&&|;|\n|\||&)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokenize(segment: string): string[] {
  return segment.trim().split(/\s+/).filter(Boolean);
}

/** Find the command word in a segment, skipping leading `VAR=val` assignments
 *  and privilege wrappers (sudo / command / doas / a leading backslash). */
function commandWord(tokens: string[]): { name: string; rest: string[] } | null {
  let i = 0;
  while (
    i < tokens.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) ||
      tokens[i] === "sudo" ||
      tokens[i] === "doas" ||
      tokens[i] === "command" ||
      tokens[i] === "exec" ||
      tokens[i] === "time")
  ) {
    i++;
  }
  const raw = tokens[i];
  if (!raw) return null;
  // basename, drop a leading backslash used to bypass shell aliases (\rm)
  const name = raw.replace(/^\\/, "").replace(/^.*\//, "");
  return { name, rest: tokens.slice(i + 1) };
}

/** True if a flag list contains a short flag whose letters include `letter`
 *  (e.g. -r, -rf, -Rf) or the given long flag. Case-insensitive on the letter. */
function hasShortOrLong(flags: string[], letter: string, long: string): boolean {
  const l = letter.toLowerCase();
  return flags.some(
    (f) => f === long || (/^-[A-Za-z]+$/.test(f) && f.slice(1).toLowerCase().includes(l)),
  );
}

/** A target token pointing at the filesystem root, the home directory, or a
 *  system directory — the things you must never recursively delete or chmod. */
function isSystemRootTarget(token: string): boolean {
  const t = stripQuotes(token).trim();
  if (!t) return false;
  // filesystem root and root globs
  if (t === "/" || t === "/*" || t === "/." || t === "/.*") return true;
  // home directory in its various spellings
  if (["~", "~/", "~/*", "$HOME", "${HOME}", "$HOME/", "$HOME/*"].includes(t)) return true;
  // a system directory, optionally with a trailing slash, a /* glob, or a subpath
  const noTrail = t.replace(/\/+$/, "");
  return SYSTEM_DIRS.some((d) => noTrail === d || t === d + "/*" || t.startsWith(d + "/"));
}

// ─── sensitive-path classification (shared by command + file-tool screens) ─────

export interface SensitiveHit {
  rule: string;
  reason: string;
}

// Basenames that are sensitive regardless of location.
const SENSITIVE_BASENAMES = new Set(["auth.json"]);
// .env.* suffixes that are conventionally non-secret templates and stay allowed.
const DOTENV_TEMPLATE_SUFFIX = /\.(example|sample|template|dist)$/i;

/**
 * Classify a path-ish string (relative, absolute, or `~`-prefixed) as a
 * sensitive credential location, or null if it's fine. Shared by the command
 * screen and the file-tool path screen so both agree on what "sensitive" means.
 */
export function classifySensitivePath(p: string): SensitiveHit | null {
  if (!p) return null;
  const norm = stripQuotes(p).replace(/\\/g, "/");
  const segments = norm.split("/").filter(Boolean);
  const base = segments.length ? segments[segments.length - 1] : norm;

  // ~/.ssh or any .ssh directory anywhere in the path
  if (segments.includes(".ssh")) {
    return { rule: "ssh-dir", reason: "accesses an SSH key directory (.ssh)" };
  }
  // .git/config (can leak remote credentials / URLs)
  for (let i = 0; i + 1 < segments.length; i++) {
    if (segments[i] === ".git" && segments[i + 1] === "config") {
      return { rule: "git-config", reason: "accesses .git/config" };
    }
  }
  // auth.json credentials file
  if (SENSITIVE_BASENAMES.has(base)) {
    return { rule: "auth-json", reason: "accesses an auth.json credentials file" };
  }
  // .env and .env.<env> secret files — but allow .env.example / .sample / etc.
  if ((base === ".env" || /^\.env\.[\w.-]+$/.test(base)) && !DOTENV_TEMPLATE_SUFFIX.test(base)) {
    return { rule: "dotenv-file", reason: "accesses a .env secrets file" };
  }
  return null;
}

// ─── command screen ────────────────────────────────────────────────────────────

// curl/wget/etc. whose output is piped directly into a shell or interpreter.
// Matches `curl … | sh`, `wget -qO- … | sudo bash`, `curl … | python3`, etc.
const PIPE_TO_SHELL =
  /\b(?:curl|wget|fetch|lynx|links)\b[^\n]*?\|\s*(?:sudo\s+|doas\s+)?(?:[\w./-]*\/)?(?:sh|bash|zsh|dash|ksh|fish|csh|tcsh|python[0-9.]*|perl|ruby|node|deno|php)\b/i;

function segmentBlocksRm(tokens: string[]): boolean {
  const cw = commandWord(tokens);
  if (!cw || cw.name !== "rm") return false;
  const flags = cw.rest.filter((t) => t.startsWith("-"));
  const targets = cw.rest.filter((t) => !t.startsWith("-"));
  if (flags.includes("--no-preserve-root")) return true;
  const recursive = hasShortOrLong(flags, "r", "--recursive");
  const force = hasShortOrLong(flags, "f", "--force");
  if (!recursive || !force) return false;
  return targets.some(isSystemRootTarget);
}

function segmentBlocksPermChange(tokens: string[]): boolean {
  const cw = commandWord(tokens);
  if (!cw || !["chmod", "chown", "chgrp"].includes(cw.name)) return false;
  const operands = cw.rest.filter((t) => !t.startsWith("-"));
  // The first non-flag operand is the mode / owner spec (e.g. 777, root:root),
  // not a path. The rest are the paths being changed.
  const paths = operands.slice(1);
  return paths.some(isSystemRootTarget);
}

/**
 * Screen a shell command against the guardrail. Returns a SecurityError to
 * throw, or null if the command is allowed. Pure — never executes anything.
 */
export function screenCommand(command: string): SecurityError | null {
  if (typeof command !== "string" || !command.trim()) return null;

  // 1. remote payload piped straight into a shell (runs on the whole pipeline)
  if (PIPE_TO_SHELL.test(command)) {
    return new SecurityError(
      "pipe-to-shell",
      "pipes a downloaded payload directly into a shell interpreter",
      command,
    );
  }

  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);

    // 2. recursive force-remove of a filesystem / home / system root
    if (segmentBlocksRm(tokens)) {
      return new SecurityError(
        "rm-rf-system-root",
        "recursive force-remove targeting the filesystem root, home, or a system directory",
        command,
      );
    }

    // 3. chmod / chown / chgrp against a system directory
    if (segmentBlocksPermChange(tokens)) {
      return new SecurityError(
        "perm-change-system-root",
        "changes permissions or ownership of a system directory",
        command,
      );
    }

    // 4. references to sensitive credential files (reads, writes, redirects)
    for (const token of tokens) {
      const cleaned = stripQuotes(token).replace(/^\d*[<>&]+/, "");
      const hit = classifySensitivePath(cleaned);
      if (hit) {
        return new SecurityError(hit.rule, `command references a sensitive file — ${hit.reason}`, command);
      }
    }
  }

  return null;
}

/** Screen a command and throw SecurityError if it's blocked. */
export function assertCommandAllowed(command: string): void {
  const err = screenCommand(command);
  if (err) throw err;
}

/** Screen a filesystem path the agent is about to read/write/execute and throw
 *  SecurityError if it targets a sensitive credential file. */
export function assertPathAllowed(targetPath: string, mode: "read" | "write" | "exec" = "read"): void {
  const hit = classifySensitivePath(targetPath);
  if (hit) {
    throw new SecurityError(hit.rule, `${mode} of a sensitive file is blocked — ${hit.reason}`, targetPath);
  }
}
