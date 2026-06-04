import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GitSandbox, isGitWorkTree } from "../git-sandbox.js";
import { dispatch, type ToolContext } from "../tools.js";

const execFileAsync = promisify(execFile);

let repo: string;

async function git(args: string[], cwd = repo): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.toString().trim();
}

async function readRepoFile(name: string): Promise<string> {
  return readFile(join(repo, name), "utf8");
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "ccr-sandbox-"));
  await git(["init", "-q"]);
  await git(["config", "user.email", "test@ccr.local"]);
  await git(["config", "user.name", "ccr test"]);
  await writeFile(join(repo, "a.txt"), "v1\n", "utf8");
  await git(["add", "-A"]);
  await git(["commit", "-q", "-m", "init"]);
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("isGitWorkTree", () => {
  it("is true inside a repo", async () => {
    assert.equal(await isGitWorkTree(repo), true);
  });
  it("is false outside a repo", async () => {
    const plain = await mkdtemp(join(tmpdir(), "ccr-plain-"));
    try {
      assert.equal(await isGitWorkTree(plain), false);
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});

describe("GitSandbox.checkpoint", () => {
  it("publishes a timestamped backup ref and leaves the working tree untouched", async () => {
    const before = await readRepoFile("a.txt");
    const sandbox = await GitSandbox.checkpoint(repo, 1700000000000);
    assert.equal(sandbox.label, "ccr-sandbox-backup-1700000000000");
    // backup ref exists
    assert.equal(await git(["rev-parse", "--verify", sandbox.ref]), await git(["rev-parse", sandbox.ref]));
    // working tree + clean status are unchanged by the checkpoint itself
    assert.equal(await readRepoFile("a.txt"), before);
    assert.equal(await git(["status", "--porcelain"]), "");
    await sandbox.release();
  });

  it("throws outside a git work tree", async () => {
    const plain = await mkdtemp(join(tmpdir(), "ccr-plain-"));
    try {
      await assert.rejects(() => GitSandbox.checkpoint(plain, 1), /not inside a git work tree/);
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});

describe("GitSandbox.restore — hard rollback", () => {
  it("reverts a modified tracked file and removes a newly created file", async () => {
    const sandbox = await GitSandbox.checkpoint(repo, 1);
    await writeFile(join(repo, "a.txt"), "MUTATED\n", "utf8");
    await writeFile(join(repo, "new-file.txt"), "junk\n", "utf8");

    await sandbox.restore();

    assert.equal(await readRepoFile("a.txt"), "v1\n", "tracked file should be reverted");
    assert.equal(existsSync(join(repo, "new-file.txt")), false, "new file should be removed");
    assert.equal(await git(["status", "--porcelain"]), "", "tree should be clean after rollback");
  });

  it("restores a file the command deleted", async () => {
    const sandbox = await GitSandbox.checkpoint(repo, 2);
    await rm(join(repo, "a.txt"));
    await sandbox.restore();
    assert.equal(existsSync(join(repo, "a.txt")), true);
    assert.equal(await readRepoFile("a.txt"), "v1\n");
  });

  it("does NOT move HEAD (rollback restores content, not history)", async () => {
    const head = await git(["rev-parse", "HEAD"]);
    const sandbox = await GitSandbox.checkpoint(repo, 3);
    await writeFile(join(repo, "a.txt"), "MUTATED\n", "utf8");
    await sandbox.restore();
    assert.equal(await git(["rev-parse", "HEAD"]), head, "HEAD must be unchanged");
  });

  it("tears down the backup ref", async () => {
    const sandbox = await GitSandbox.checkpoint(repo, 4);
    await sandbox.restore();
    await assert.rejects(() => git(["rev-parse", "--verify", sandbox.ref]));
  });

  it("does not delete .gitignored files on rollback", async () => {
    await writeFile(join(repo, ".gitignore"), "ignored/\n", "utf8");
    await git(["add", ".gitignore"]);
    await git(["commit", "-q", "-m", "add gitignore"]);
    await execFileAsync("mkdir", ["-p", join(repo, "ignored")]);
    await writeFile(join(repo, "ignored", "keep.txt"), "node_modules-like\n", "utf8");

    const sandbox = await GitSandbox.checkpoint(repo, 5);
    await writeFile(join(repo, "a.txt"), "MUTATED\n", "utf8");
    await sandbox.restore();

    assert.equal(existsSync(join(repo, "ignored", "keep.txt")), true, "ignored files must survive rollback");
    assert.equal(await readRepoFile("a.txt"), "v1\n");
  });
});

describe("GitSandbox.release — keep changes", () => {
  it("keeps working-tree changes and drops the backup ref", async () => {
    const sandbox = await GitSandbox.checkpoint(repo, 6);
    await writeFile(join(repo, "a.txt"), "KEPT\n", "utf8");
    await sandbox.release();
    assert.equal(await readRepoFile("a.txt"), "KEPT\n", "changes should be kept");
    await assert.rejects(() => git(["rev-parse", "--verify", sandbox.ref]));
  });

  it("restore() / release() are idempotent", async () => {
    const sandbox = await GitSandbox.checkpoint(repo, 7);
    await sandbox.release();
    await sandbox.release(); // no throw
    await sandbox.restore(); // already settled — no throw, no effect
    assert.ok(true);
  });
});

// ─── tier-2 integration: a failing command under --yolo hard-rolls-back ──────
//
// This drives the real bash tool through dispatch() with ctx.yolo = true,
// exactly as the agent loop does in --yolo/bypass mode.

function yoloCtx(): ToolContext {
  return { root: repo, approve: async () => true, yolo: true };
}

describe("bash tool under --yolo: automatic rollback on failure", () => {
  it("rolls back the working tree when a command exits non-zero", async () => {
    const out = await dispatch(yoloCtx(), "bash", {
      command: "printf 'MUTATED\\n' > a.txt && printf 'junk\\n' > created.txt && exit 1",
    });

    assert.match(out, /exit=1/);
    assert.match(out, /rolled back working tree to checkpoint ccr-sandbox-backup-/);
    // failure is fully isolated:
    assert.equal(await readRepoFile("a.txt"), "v1\n", "modified file reverted");
    assert.equal(existsSync(join(repo, "created.txt")), false, "created file removed");
  });

  it("rolls back when a command times out", async () => {
    const out = await dispatch(yoloCtx(), "bash", {
      command: "printf 'MUTATED\\n' > a.txt && sleep 5",
      timeout: 1,
    });
    assert.match(out, /rolled back working tree to checkpoint/);
    assert.equal(await readRepoFile("a.txt"), "v1\n");
  });

  it("keeps changes when a command succeeds", async () => {
    const out = await dispatch(yoloCtx(), "bash", {
      command: "printf 'KEPT\\n' > a.txt && printf 'new\\n' > kept.txt",
    });
    assert.match(out, /exit=0/);
    assert.doesNotMatch(out, /rolled back/);
    assert.equal(await readRepoFile("a.txt"), "KEPT\n", "successful change is kept");
    assert.equal(existsSync(join(repo, "kept.txt")), true, "created file is kept");
    // and the throwaway backup ref is gone
    assert.equal(await git(["for-each-ref", "--format=%(refname)", "refs/ccr-sandbox/"]), "");
  });

  it("leaves no sandbox refs behind after a run", async () => {
    await dispatch(yoloCtx(), "bash", { command: "exit 1" });
    assert.equal(await git(["for-each-ref", "--format=%(refname)", "refs/ccr-sandbox/"]), "");
  });
});
