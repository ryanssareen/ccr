// Watch ~/.ccr/sessions/<projectId>/ for session JSON + lock file changes.
// Both the CLI and the Electron app subscribe to keep their session lists
// and "active here" badges live without polling.
//
// We use chokidar with awaitWriteFinish so partial JSON writes (which our
// own session.saveSession can't actually produce — fs.writeFile is one
// shot — but other tools might) don't fire premature `session-changed`.
import chokidar from "chokidar";

export type SessionEvent =
  | { type: "session-changed"; path: string }
  | { type: "session-removed"; path: string }
  | { type: "lock-acquired"; sessionPath: string }
  | { type: "lock-released"; sessionPath: string };

export interface SessionWatcher {
  /** Stop watching. Idempotent. */
  close(): Promise<void>;
}

const LOCK_SUFFIX = ".json.lock";

function classify(p: string): SessionEvent | null {
  if (p.endsWith(LOCK_SUFFIX)) {
    // <session>.json.lock → strip the trailing ".lock" to get the session
    // path the lock guards.
    return { type: "lock-acquired", sessionPath: p.slice(0, -".lock".length) };
  }
  if (p.endsWith(".json")) {
    return { type: "session-changed", path: p };
  }
  return null;
}

export function watchSessions(
  rootDir: string,
  onEvent: (e: SessionEvent) => void,
): SessionWatcher {
  const watcher = chokidar.watch(rootDir, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on("add", (p: string) => {
    const evt = classify(p);
    if (evt) onEvent(evt);
  });

  watcher.on("change", (p: string) => {
    if (p.endsWith(".json")) onEvent({ type: "session-changed", path: p });
    // .lock files don't typically change in place — they're created or
    // removed. Ignore changes for them.
  });

  watcher.on("unlink", (p: string) => {
    if (p.endsWith(LOCK_SUFFIX)) {
      onEvent({ type: "lock-released", sessionPath: p.slice(0, -".lock".length) });
    } else if (p.endsWith(".json")) {
      onEvent({ type: "session-removed", path: p });
    }
  });

  let closed = false;
  return {
    async close() {
      if (closed) return;
      closed = true;
      await watcher.close();
    },
  };
}
