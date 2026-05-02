import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { watchSessions } from "@ccr/core";

async function pause(ms = 120) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollUntil(predicate: () => boolean, ms = 600) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 35));
  }
  throw new Error("pollUntil timeout");
}

describe("sessions file watcher behaviour", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ccr-watch-"));

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("fires session-changed shortly after JSON write settles", async () => {
    const fired: string[] = [];
    const watcher = watchSessions(dir, (e) => fired.push(e.type));

    await pause();
    const sub = path.join(dir, `pj_${Date.now()}`);
    await fs.mkdir(sub, { recursive: true });
    const p = path.join(sub, `sess-${Date.now()}.json`);
    await fs.writeFile(p, JSON.stringify({ messages: [], updated: Date.now() }), "utf8");

    await pollUntil(() => fired.includes("session-changed"));
    assert.ok(true);
    await watcher.close();
  });

  it("observes lock-acquired and lock-released for sibling .json.lock paths", async () => {
    const fired: string[] = [];
    const watcher = watchSessions(dir, (e) => fired.push(e.type));
    await pause();

    const sub = path.join(dir, `pj2_${Date.now()}`);
    await fs.mkdir(sub, { recursive: true });
    const sessionJson = path.join(sub, `s-${Date.now()}.json`);
    await fs.writeFile(sessionJson, "{}\n");

    await pollUntil(() => fired.includes("session-changed"));

    fired.length = 0;
    const lockP = `${sessionJson}.lock`;
    await fs.writeFile(
      lockP,
      JSON.stringify({
        pid: 999991,
        host: os.hostname(),
        sessionId: "x",
        startedAt: new Date().toISOString(),
      }),
    );

    await pollUntil(() => fired.includes("lock-acquired"));
    await fs.unlink(lockP);
    await pollUntil(() => fired.includes("lock-released"));

    assert.ok(true);
    await watcher.close();
  });
});
