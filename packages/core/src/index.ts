// Public surface of @ccr/core. Anything not listed here is internal.
// The companion exports.test.ts snapshots this list — if you intentionally
// add or remove a public name, update the snapshot in the same commit.
//
// Surface conventions:
//   - Functions / classes / values are runtime exports (with types).
//   - Type-only exports use `export type` so they don't show up at runtime.
//   - Helpers that look exported in their source file but are not re-exported
//     here are considered private to @ccr/core and should not be relied on
//     by other packages.

// ─── agent / runtime ────────────────────────────────────────────────────────
export {
  GROQ_BASE_URL,
  PROXY_API_PATH,
  DEFAULT_MODEL,
  buildClient,
  initialMessages,
  runAgent,
  makeSubagentRunner,
} from "./agent.js";
export type {
  QuotaState,
  QuotaListener,
  BuildClientOptions,
  Reporter,
  AgentRun,
} from "./agent.js";

// ─── tools / agent context ──────────────────────────────────────────────────
export { TOOLS, TOOL_BY_NAME, toolSchemas, dispatch } from "./tools.js";
export type {
  ApprovalKind,
  ApprovalRequest,
  Approver,
  AskQuestion,
  AskRequest,
  AskAnswer,
  Asker,
  SubagentRunOptions,
  SubagentRunner,
  ToolContext,
  ToolDef,
} from "./tools.js";

// ─── session io ─────────────────────────────────────────────────────────────
export {
  sessionPath,
  newSessionId,
  listSessions,
  loadSession,
  saveSession,
  projectId,
  sessionsRootDirectory,
  listSessionsIndex,
  loadSessionByPath,
} from "./session.js";
export type { SessionIndexEntry } from "./session.js";
export { KNOWN_MODELS } from "./known-models.js";

// ─── session lock + watcher ────────────────────────────────────────────────
export {
  acquireLock,
  releaseLock,
  readLock,
  lockPath,
  LockOwnedElsewhereError,
} from "./session-lock.js";
export type { LockFile, AcquireOptions, ReleaseOptions } from "./session-lock.js";
export { watchSessions } from "./session-watcher.js";
export type { SessionEvent, SessionWatcher } from "./session-watcher.js";

// ─── config / auth ──────────────────────────────────────────────────────────
export {
  loadConfig,
  saveConfig,
  loadAuth,
  saveAuth,
  clearAuth,
  applyConfig,
  configPath,
  authPath,
} from "./config.js";
export type { CcrConfig, CcrAuth } from "./config.js";

// ─── version + update notifier ──────────────────────────────────────────────
export { VERSION, PACKAGE_NAME } from "./version.js";
export { checkForUpdate } from "./update-check.js";
export type { UpdateInfo } from "./update-check.js";
