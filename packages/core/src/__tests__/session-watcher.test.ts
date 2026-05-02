import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdtemp, mkdir, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { watchSessions, type SessionEvent, type SessionWatcher } from "../session-watcher.js";

let dir: string;
let activeWatcher: SessionWatcher | null = null;

async function nextEvent(
  events: SessionEvent[],
  predicate: (e: SessionEvent) => boolean,
  timeoutMs = 2000,
): Promise<SessionEvent> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = events.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(
    `Timed out waiting for matching event. Saw: ${events.map((e) => e.type).join(", ") || "(none)"}`,
  );
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ccr-watch-"));
});

afterEach(async () => {
  if (activeWatcher) {
    await activeWatcher.close();
    activeWatcher = null;
  }
  await rm(dir, { recursive: true, force: true });
});

describe("session-watcher", () => {
  it("emits session-changed when a new session JSON appears", async () => {
    const events: SessionEvent[] = [];
    activeWatcher = watchSessions(dir, (e) => events.push(e));
    // Give chokidar a moment to start watching
    await new Promise((r) => setTimeout(r, 200));

    const projectDir = join(dir, "abc123");
    await mkdir(projectDir, { recursive: true });
    const sessionPath = join(projectDir, "20260502-100000.json");
    await writeFile(sessionPath, JSON.stringify({ messages: [] }), "utf8");

    const evt = await nextEvent(
      events,
      (e) => e.type === "session-changed" && e.path === sessionPath,
    );
    assert.equal(evt.type, "session-changed");
  });

  it("emits session-changed when an existing session JSON is modified", async () => {
    const projectDir = join(dir, "abc123");
    await mkdir(projectDir, { recursive: true });
    const sessionPath = join(projectDir, "existing.json");
    await writeFile(sessionPath, JSON.stringify({ messages: [] }), "utf8");

    const events: SessionEvent[] = [];
    activeWatcher = watchSessions(dir, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 200));

    await writeFile(sessionPath, JSON.stringify({ messages: [{ role: "user", content: "hi" }] }), "utf8");

    await nextEvent(events, (e) => e.type === "session-changed" && e.path === sessionPath);
  });

  it("emits lock-acquired when a .lock file is created", async () => {
    const projectDir = join(dir, "abc123");
    await mkdir(projectDir, { recursive: true });
    const sessionPath = join(projectDir, "20260502.json");
    await writeFile(sessionPath, "{}", "utf8");

    const events: SessionEvent[] = [];
    activeWatcher = watchSessions(dir, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 200));

    const lockFile = sessionPath + ".lock";
    await writeFile(lockFile, JSON.stringify({ pid: 1, host: "x", sessionId: "20260502", startedAt: "" }), "utf8");

    const evt = await nextEvent(
      events,
      (e) => e.type === "lock-acquired" && e.sessionPath === sessionPath,
    );
    assert.equal(evt.type, "lock-acquired");
  });

  it("emits lock-released when a .lock file is removed", async () => {
    const projectDir = join(dir, "abc123");
    await mkdir(projectDir, { recursive: true });
    const sessionPath = join(projectDir, "20260502.json");
    await writeFile(sessionPath, "{}", "utf8");
    const lockFile = sessionPath + ".lock";
    await writeFile(lockFile, JSON.stringify({ pid: 1, host: "x", sessionId: "x", startedAt: "" }), "utf8");

    const events: SessionEvent[] = [];
    activeWatcher = watchSessions(dir, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 200));

    await unlink(lockFile);

    await nextEvent(events, (e) => e.type === "lock-released" && e.sessionPath === sessionPath);
  });

  it("close() unsubscribes — no further events after close", async () => {
    const events: SessionEvent[] = [];
    const w = watchSessions(dir, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 150));

    await w.close();

    const projectDir = join(dir, "abc123");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "post-close.json"), "{}", "utf8");

    // Give it a generous wait — if any event slips through, we'll catch it.
    await new Promise((r) => setTimeout(r, 400));

    const slipped = events.filter((e) => e.type === "session-changed");
    assert.equal(slipped.length, 0, "no session-changed events should fire after close()");
  });

  it("ignores files that are neither .json nor .lock", async () => {
    const events: SessionEvent[] = [];
    activeWatcher = watchSessions(dir, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 200));

    const projectDir = join(dir, "abc123");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "ignore-me.txt"), "noise", "utf8");
    await writeFile(join(projectDir, "DS_Store"), "noise", "utf8");
    await new Promise((r) => setTimeout(r, 300));

    assert.equal(events.length, 0, `unexpected events: ${events.map((e) => e.type).join(", ")}`);
  });
});
