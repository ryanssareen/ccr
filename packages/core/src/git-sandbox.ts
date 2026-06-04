// Tier 2 of the two-tier client-side execution defense (tier 1 is the
// guardrail in security.ts).
//
// In --yolo / bypass mode the agent auto-approves every shell command, so a
// bad command can mutate the working tree with no human in the loop. Rather
// than let those commands run "raw," we bracket each one with a git checkpoint:
//
//   1. checkpoint()  Snapshot the full working-tree state into a throwaway
//                    backup ref (ccr-sandbox-backup-<timestamp>) WITHOUT
//                    touching the user's files or their staged index.
//   2. run the command.
//   3a. success  -> release(): drop the backup ref, keep whatever changed.
//   3b. failure  -> restore(): hard-reset the working tree + index back to the
//                    snapshot and remove any files the command created, then
//                    drop the backup ref. The failure is fully isolated.
//
// This is a NON-virtualized sandbox: the command still runs on the host with
// the host's privileges. It protects *repository state*, not the machine —
// that's the guardrail's job. Ignored files (node_modules, build output, .env)
// are never snapshotted or cleaned, so a rollback won't nuke them.
//
// Implementation notes:
//   - All git calls use execFile (argv array, no shell) scoped to `cwd`.
//   - The snapshot is a `commit-tree` object published under refs/ccr-sandbox/…
//     It never moves HEAD or any branch. restore() uses `read-tree --reset -u`
//     (the tree half of `reset --hard`) so HEAD stays exactly where it was.
//   - The user's working tree is never modified during checkpoint; we only
//     borrow the index to write a tree, then put the index back via read-tree.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_GIT_BUFFER = 16 * 1024 * 1024;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: MAX_GIT_BUFFER });
  return stdout.toString().trim();
}

/** Run a git command for its side effect; swallow failures (best-effort). */
async function gitQuiet(cwd: string, args: string[]): Promise<void> {
  try {
    await git(cwd, args);
  } catch {
    /* best-effort — teardown / cleanup should never throw */
  }
}

/** True when `cwd` is inside a git working tree. */
export async function isGitWorkTree(cwd: string): Promise<boolean> {
  try {
    return (await git(cwd, ["rev-parse", "--is-inside-work-tree"])) === "true";
  } catch {
    return false;
  }
}

async function headSha(cwd: string): Promise<string | null> {
  try {
    return await git(cwd, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    return null; // unborn HEAD (repo with no commits yet)
  }
}

async function hasUnmergedEntries(cwd: string): Promise<boolean> {
  try {
    return (await git(cwd, ["ls-files", "--unmerged"])).length > 0;
  } catch {
    return false;
  }
}

/** Count of dirty entries (modified + untracked, excluding ignored). */
async function dirtyCount(cwd: string): Promise<number> {
  try {
    const out = await git(cwd, ["status", "--porcelain"]);
    return out ? out.split("\n").filter(Boolean).length : 0;
  } catch {
    return 0;
  }
}

/**
 * A live git checkpoint. Create with `GitSandbox.checkpoint(cwd, Date.now())`,
 * then call exactly one of restore() (roll back) or release() (keep changes).
 * Both are idempotent and tear down the backup ref.
 */
export class GitSandbox {
  /** Human-readable label, e.g. "ccr-sandbox-backup-1717459200000". */
  readonly label: string;
  /** The ref the backup commit is published under. */
  readonly ref: string;
  /** How many entries were dirty when the checkpoint was taken. */
  readonly dirtyAtCheckpoint: number;

  private readonly cwd: string;
  private readonly backupSha: string;
  private settled = false;

  private constructor(cwd: string, label: string, backupSha: string, dirty: number) {
    this.cwd = cwd;
    this.label = label;
    this.ref = `refs/ccr-sandbox/${label}`;
    this.backupSha = backupSha;
    this.dirtyAtCheckpoint = dirty;
  }

  /**
   * Take a checkpoint of the current working tree. `timestamp` is injected
   * (callers pass Date.now()) so labels are deterministic in tests. Throws if
   * `cwd` is not a git work tree or a merge/rebase is in progress.
   */
  static async checkpoint(cwd: string, timestamp: number): Promise<GitSandbox> {
    if (!(await isGitWorkTree(cwd))) {
      throw new Error("git-sandbox: not inside a git work tree");
    }
    if (await hasUnmergedEntries(cwd)) {
      // write-tree would fail on unmerged entries; bail rather than risk it.
      throw new Error("git-sandbox: refusing to checkpoint with unmerged (conflict) entries");
    }

    const label = `ccr-sandbox-backup-${timestamp}`;
    const dirty = await dirtyCount(cwd);

    // 1. remember the user's current index so we can restore it afterward.
    const originalIndexTree = await git(cwd, ["write-tree"]);
    // 2. stage everything (tracked edits + untracked, but NOT ignored files)
    //    and capture the full working-tree state as a tree object. `git add`
    //    only updates the index; it never changes file contents on disk.
    await git(cwd, ["add", "-A"]);
    const fullTree = await git(cwd, ["write-tree"]);
    // 3. wrap the tree in a commit so it survives gc and can be reset to.
    //    -c user.* keeps this working in repos with no configured identity.
    const parent = await headSha(cwd);
    const commitArgs = [
      "-c", "user.name=ccr-sandbox",
      "-c", "user.email=ccr-sandbox@local",
      "commit-tree", fullTree,
      ...(parent ? ["-p", parent] : []),
      "-m", label,
    ];
    const backupSha = await git(cwd, commitArgs);
    // 4. publish under a ref so the snapshot is named + retained.
    await git(cwd, ["update-ref", `refs/ccr-sandbox/${label}`, backupSha]);
    // 5. put the user's original index back — we only borrowed it. read-tree
    //    resets the index without touching the working tree.
    await git(cwd, ["read-tree", originalIndexTree]);

    return new GitSandbox(cwd, label, backupSha, dirty);
  }

  /**
   * Hard rollback: restore the working tree + index to the checkpoint and
   * remove any files the command created, WITHOUT moving HEAD or any branch.
   * Then tear down the backup ref.
   */
  async restore(): Promise<void> {
    if (this.settled) return;
    this.settled = true;
    // `read-tree --reset -u <commit>` is the tree half of `reset --hard`:
    // it overwrites tracked files and clears staged changes, but leaves HEAD
    // untouched (unlike `reset --hard`, which would move the branch onto the
    // throwaway backup commit and pollute history).
    await git(this.cwd, ["read-tree", "--reset", "-u", this.backupSha]);
    // Remove files the command newly created that aren't in the snapshot.
    // -f force, -d dirs; NO -x, so ignored files (node_modules/.env/dist) stay.
    await gitQuiet(this.cwd, ["clean", "-fd"]);
    await this.dropRef();
  }

  /** Success path: keep whatever the command changed; drop the backup ref. */
  async release(): Promise<void> {
    if (this.settled) return;
    this.settled = true;
    await this.dropRef();
  }

  private async dropRef(): Promise<void> {
    await gitQuiet(this.cwd, ["update-ref", "-d", this.ref]);
  }
}
