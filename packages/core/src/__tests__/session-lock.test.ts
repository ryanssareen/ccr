import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";

import {
  acquireLock,
  releaseLock,
  readLock,
  lockPath,
  LockOwnedElsewhereError,
  type LockFile,
} from "../session-lock.js";

let dir: string;
let sessionPath: string;
let lockFilePath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ccr-lock-"));
  sessionPath = join(dir, "20260502-100000.json");
  await writeFile(sessionPath, JSON.stringify({ messages: [] }), "utf8");
  lockFilePath = lockPath(sessionPath);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("session-lock: happy path", () => {
  it("acquireLock writes the lock file with current pid/host/timestamp", async () => {
    const lock = await acquireLock(sessionPath, "20260502-100000");
    assert.ok(existsSync(lockFilePath), "lock file should exist after acquire");
    assert.equal(lock.pid, process.pid);
    assert.equal(typeof lock.host, "string");
    assert.equal(lock.sessionId, "20260502-100000");
    assert.match(lock.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("releaseLock removes the lock file", async () => {
    await acquireLock(sessionPath, "20260502-100000");
    await releaseLock(sessionPath);
    assert.ok(!existsSync(lockFilePath), "lock file should be removed after release");
  });

  it("releaseLock is idempotent when no lock exists", async () => {
    await releaseLock(sessionPath); // should not throw
    assert.ok(!existsSync(lockFilePath));
  });

  it("readLock returns null when no lock file exists", async () => {
    const lock = await readLock(sessionPath);
    assert.equal(lock, null);
  });

  it("readLock returns parsed lock when present", async () => {
    await acquireLock(sessionPath, "20260502-100000");
    const lock = await readLock(sessionPath);
    assert.ok(lock);
    assert.equal(lock.pid, process.pid);
  });
});

describe("session-lock: re-entry and refresh", () => {
  it("acquireLock by current pid is idempotent and refreshes the timestamp", async () => {
    const first = await acquireLock(sessionPath, "20260502-100000");
    await new Promise((r) => setTimeout(r, 10));
    const second = await acquireLock(sessionPath, "20260502-100000");
    assert.equal(second.pid, process.pid);
    assert.notEqual(second.startedAt, first.startedAt, "timestamp should refresh");
  });
});

describe("session-lock: stale detection", () => {
  it("takes over a lock owned by a dead pid on the same host", async () => {
    const stalePid = 999999; // very unlikely to be alive
    const staleLock: LockFile = {
      pid: stalePid,
      host: hostname(),
      sessionId: "20260502-100000",
      startedAt: new Date(Date.now() - 60_000).toISOString(),
    };
    await writeFile(lockFilePath, JSON.stringify(staleLock), "utf8");

    const lock = await acquireLock(sessionPath, "20260502-100000");
    assert.equal(lock.pid, process.pid, "should take over from dead pid");
  });

  it("treats malformed JSON as a stale lock and takes over", async () => {
    await writeFile(lockFilePath, "this is not json", "utf8");
    const lock = await acquireLock(sessionPath, "20260502-100000");
    assert.equal(lock.pid, process.pid);
  });
});

describe("session-lock: contention", () => {
  it("throws LockOwnedElsewhereError when a fresh lock from a different live pid exists", async () => {
    const liveLock: LockFile = {
      pid: process.pid + 1, // we'll simulate it as alive via the injection point
      host: hostname(),
      sessionId: "20260502-100000",
      startedAt: new Date().toISOString(),
    };
    await writeFile(lockFilePath, JSON.stringify(liveLock), "utf8");

    await assert.rejects(
      () =>
        acquireLock(sessionPath, "20260502-100000", {
          isPidAlive: (pid) => pid === liveLock.pid, // pretend the foreign pid is alive
        }),
      (err: Error) => {
        assert.ok(err instanceof LockOwnedElsewhereError);
        const e = err as LockOwnedElsewhereError;
        assert.equal(e.pid, liveLock.pid);
        assert.equal(e.host, liveLock.host);
        return true;
      },
    );
  });

  it("force-acquires when force=true even with a live foreign pid (used for 'open here' takeover)", async () => {
    // Note: in v1 we still respect liveness. force=true only succeeds when
    // the foreign pid is dead. This guards the user from accidentally
    // overlapping two live agents on the same session.
    const liveLock: LockFile = {
      pid: process.pid + 1,
      host: hostname(),
      sessionId: "20260502-100000",
      startedAt: new Date().toISOString(),
    };
    await writeFile(lockFilePath, JSON.stringify(liveLock), "utf8");

    await assert.rejects(
      () =>
        acquireLock(sessionPath, "20260502-100000", {
          force: true,
          isPidAlive: (pid) => pid === liveLock.pid, // alive
        }),
      LockOwnedElsewhereError,
    );

    // But once it's dead, force takes over.
    const lock = await acquireLock(sessionPath, "20260502-100000", {
      force: true,
      isPidAlive: () => false,
    });
    assert.equal(lock.pid, process.pid);
  });
});

describe("session-lock: foreign host", () => {
  it("rejects with a clear message when the lock is on a different host", async () => {
    const foreignLock: LockFile = {
      pid: 12345,
      host: "some-other-machine.local",
      sessionId: "20260502-100000",
      startedAt: new Date().toISOString(),
    };
    await writeFile(lockFilePath, JSON.stringify(foreignLock), "utf8");

    await assert.rejects(
      () => acquireLock(sessionPath, "20260502-100000"),
      (err: Error) => {
        assert.match(err.message, /another machine|other host|foreign host/i);
        return true;
      },
    );
  });
});

describe("session-lock: release safety", () => {
  it("releaseLock does not delete a lock owned by a different pid", async () => {
    const otherLock: LockFile = {
      pid: process.pid + 1,
      host: hostname(),
      sessionId: "20260502-100000",
      startedAt: new Date().toISOString(),
    };
    await writeFile(lockFilePath, JSON.stringify(otherLock), "utf8");

    await releaseLock(sessionPath); // should not throw, but should not delete either
    assert.ok(existsSync(lockFilePath), "should not delete a foreign lock");
  });
});
