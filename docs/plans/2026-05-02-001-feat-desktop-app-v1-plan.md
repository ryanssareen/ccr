---
title: "feat: CCR Desktop App v1 (dashboard + shared core)"
type: feat
status: active
date: 2026-05-02
origin: docs/brainstorms/2026-05-02-ccr-desktop-app-v1-requirements.md
---

# CCR Desktop App v1 (dashboard + shared core)

## Overview

Evolve CCR from a single CLI front-end into a multi-frontend ecosystem: today's Ink TUI plus a new Electron desktop dashboard, both sharing one core agent engine. The desktop app provides a three-region GUI (sessions rail, chat stage, settings panel) and a cmd-K command bar over the same local execution model the CLI uses today. Sessions remain local JSON; a per-session lock file arbitrates which front-end is actively running an agent loop.

This plan covers the repo restructure (single `src/` → npm workspaces with `packages/core` + `packages/cli` + `packages/electron`), the new lock + watcher infrastructure in core, the Electron main-process agent host, the renderer dashboard, the cmd-K bar, live session-rail updates, and standalone distribution via `electron-builder`. No cross-device sync, no daemon, no compound-feedback work — those are explicitly out per the origin doc.

## Problem Frame

CCR's CLI works for terminal-loving developers but excludes visual learners and casual users who'd rather drive an agent from a polished GUI. A pure web dashboard at the existing proxy can't serve them either — the agent needs filesystem and shell access on the user's machine. The desktop app is the only way to give those users *both* a real GUI *and* the local execution the CLI provides today (see origin: `docs/brainstorms/2026-05-02-ccr-desktop-app-v1-requirements.md`).

## Requirements Trace

Carried forward verbatim from the origin document. Each requirement is satisfied by the implementation units below.

**Architecture**
- R1. Extract agent loop, tool registry, proxy client, and session I/O into a shared `core/` package consumed by both `cli/` and `electron/`. (Units 1, 2)
- R2. Sessions remain JSON files in `~/.ccr/sessions/<projectId>/<sessionId>.json`. Both front-ends read/write the same paths. (Units 1, 2)
- R3. While a session is actively executing, the owning process holds a lock file (`<sessionPath>.lock`) carrying its PID + timestamp. Non-owning frontend opens the session in read-only / live-tail mode. (Units 3, 7)

**Desktop app v1 shape**
- R4. Three-region dashboard layout (sessions rail / chat stage / settings panel). (Units 4, 5)
- R5. Cmd-K command bar in v1, supporting switch session / model / mode, new session, slash commands. (Unit 6)
- R6. Agent loop runs in Electron main process; renderer is React UI; main↔renderer IPC carries streaming, tool calls, approvals. (Unit 4)
- R7. Reuse `~/.ccr/auth.json` and `~/.ccr/config.json`. Desktop never re-authenticates if CLI is signed in. (Units 4, 5)

**Live sync (same machine)**
- R8. When one front-end writes a session JSON, the other reflects within <500ms via file watcher. Token streaming during active runs is delivered only to the owning front-end. (Units 3, 7)
- R9. Lock file is the sole arbiter of "active here". Stale locks (dead PID) are recoverable. (Units 3, 7)

## Scope Boundaries

- Cross-device session sync — out.
- Background daemon owning the agent loop — out.
- Compound feedback / pattern memory / templates — out (separate brainstorm later).
- Web dashboard at `ccr-ebon.vercel.app/app` — out.
- Mobile companion, VS Code / JetBrains plugins — out.
- New auth methods — out (reuse managed mode).
- New tools, new agent capabilities, new prompt changes unrelated to architecture — out (this plan is structural only).

## Context & Research

### Relevant Code and Patterns

- `src/agent.ts` — `runAgent`, `step`, `Reporter` interface, retry loop, model fallback, `makeSubagentRunner`, `looksLikeNonTask`, first-turn greeting short-circuit. This is what becomes `packages/core/src/agent.ts` essentially unchanged.
- `src/tools.ts` — `TOOLS`, `ToolContext`, `Approver`, `Asker`, `dispatch`, `toolSchemas`. Becomes `packages/core/src/tools.ts`.
- `src/session.ts` — `listSessions`, `loadSession`, `saveSession`, `sessionPath`, `newSessionId`, `projectId` derivation via `sha1(absPath).slice(0,12)`. Lock file lives next to the session JSON. Becomes `packages/core/src/session.ts`.
- `src/config.ts` — `loadAuth`, `loadConfig`, `clearAuth`, `authPath`, `configPath`. All paths are `~/.ccr/...`. Becomes `packages/core/src/config.ts`.
- `src/version.ts` + `src/update-check.ts` — already centralized; move to core unchanged.
- `src/app.tsx` — Ink dashboard with welcome panel, message list, approval/question/model/mode pickers, theme palette. Stays in `packages/cli/src/app.tsx`. Renderer-side dashboard in Electron is a *separate* implementation that consumes the same core APIs but renders via React-DOM.
- `src/cli.ts` — argv parser, `consoleApprover`, `consoleAsker`, `consoleReporter`, `runOneShot`, `runInteractive`, `runLogin`, `runLogout`. Stays in `packages/cli/src/cli.ts`.
- `src/auth/terminal.tsx`, `src/auth/browser.ts`, `src/auth/terminal.test.ts` — login flows. Move with the CLI to `packages/cli/src/auth/`. The Electron app will piggyback on `~/.ccr/auth.json` written by the CLI's login (R7) — no new login UI in v1.
- `web/lib/non-task-detector.ts` — already shared logic mirrored client-side in `src/agent.ts`. Stays where it is; the CLI mirror moves into core.

### Institutional Learnings

- The codebase has shipped through 1.4.x with several tone/UX iterations. The pattern of "ship a small fix, watch the user try it, ship the next" is established. The desktop app should follow the same pattern: land a working but minimal v1, then iterate.
- Recurring footgun (this session): publishing requires a Bypass-2FA token. Distribution work in Unit 8 should mirror the same hardening — codify the publish steps so future maintenance doesn't rediscover the 2FA cliff.
- `vercel env pull` mangles JSON-valued env vars on local roundtrip. Not directly relevant to this plan but worth knowing if the Electron app ever consumes proxy-side env.

### External References

- **Electron** main↔renderer IPC: `contextBridge.exposeInMainWorld` + `ipcRenderer.invoke` for request/response, `ipcRenderer.on` for streaming pushes from main. Renderer should run with `contextIsolation: true`, `nodeIntegration: false`. See <https://www.electronjs.org/docs/latest/tutorial/ipc>.
- **chokidar** — v3 is the standard. `awaitWriteFinish` is critical for our case (avoid firing on partial JSON writes). See <https://github.com/paulmillr/chokidar>.
- **cmdk** — headless command palette primitives. `<Command.Root>`, `<Command.Input>`, `<Command.List>`, `<Command.Item>`. Plays well with any styling layer. See <https://cmdk.paco.me>.
- **electron-builder** — multi-platform packaging (`.dmg`, `.exe`, `.AppImage`). Pairs with `electron-updater` for in-app updates against GitHub Releases. See <https://www.electron.build>.

## Key Technical Decisions

- **Electron, not Tauri.** Existing Node agent runs in main process unchanged. Tauri requires Node sidecar + stdin/stdout IPC = significant rework with no v1 payoff. Bundle size acceptable for v1.
- **npm workspaces, not pnpm.** Already on npm; matches existing publish; zero new tooling.
- **Sessions stay as JSON files in `~/.ccr/sessions/`.** Per origin R2. No Firestore migration.
- **Lock file is the source of truth for "active here".** Per origin R3. JSON, sibling to the session file. PID-based liveness probe via `process.kill(pid, 0)`.
- **chokidar for file watching.** Robust cross-platform vs. `node:fs.watch`'s known quirks.
- **cmdk for command bar.** Headless, lightweight, stylable.
- **Standalone Electron bundle for distribution.** electron-builder + electron-updater against GitHub Releases. The npm package (`@ryanisavibecoder/ccr`) and the desktop binary become two release tracks; both consume the same core but with different versioning.
- **Renderer is a Vite + React + TypeScript SPA.** Not Next.js (overkill for an Electron renderer). Tailwind for styling to keep visual parity with the proxy site's look (already designed in `web/app/cli-auth/page.tsx` etc.).
- **Node version pinned to 18+.** Already a constraint in `package.json` (`engines.node: ">=18"`); Electron 28+ ships with Node 18+ in main process by default.

## Open Questions

### Resolved During Planning

- All 6 deferred-to-planning questions from the origin doc — see the table at the top of this plan.

### Deferred to Implementation

- **Exact cmdk visual styling.** Will be designed inline once the dashboard layout is in place. No semantic decisions remain.
- **Code signing.** v1 ships unsigned (or ad-hoc-signed on macOS). Real signing certs are an operational task, not a planning question. Users will see a Gatekeeper warning on first launch; document the workaround in the README.
- **Auto-update channel naming.** "stable" + "beta" or just "latest"? Decide once we have non-zero users.
- **Migration script for already-published 1.4.x users.** Unclear whether desktop app should also ingest sessions written by older CLIs that put files in slightly different layouts. Inspect at implementation time; likely a no-op since session schema is stable.
- **Window persistence (size, position, sidebar collapsed state).** Use `electron-window-state` or roll our own; defer the lib choice.
- **Settings UI for "default model" / "default mode" persistence.** Already lives in `~/.ccr/config.json`; just need a UI surface in the settings panel. Defer the form layout.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Workspace shape after Unit 1:**

```text
ccr-npm/
├── package.json                    workspaces: [packages/*]
├── tsconfig.base.json              shared compiler options + path aliases
├── packages/
│   ├── core/                       NEW — moved from src/
│   │   ├── package.json            name: @ccr/core
│   │   ├── src/
│   │   │   ├── agent.ts            ← src/agent.ts
│   │   │   ├── tools.ts            ← src/tools.ts
│   │   │   ├── session.ts          ← src/session.ts (extended w/ lock + watcher)
│   │   │   ├── session-lock.ts     NEW
│   │   │   ├── session-watcher.ts  NEW
│   │   │   ├── config.ts           ← src/config.ts
│   │   │   ├── update-check.ts     ← src/update-check.ts
│   │   │   ├── version.ts          ← src/version.ts (renamed package version source)
│   │   │   └── index.ts            public API barrel
│   ├── cli/                        ← was src/, minus what moved to core
│   │   ├── package.json            name: @ryanisavibecoder/ccr  (the published one)
│   │   ├── src/
│   │   │   ├── cli.ts              ← src/cli.ts (imports from @ccr/core)
│   │   │   ├── app.tsx             ← src/app.tsx
│   │   │   └── auth/               ← src/auth/
│   └── electron/                   NEW
│       ├── package.json            name: @ccr/desktop
│       ├── electron-builder.yml    NEW (Unit 8)
│       └── src/
│           ├── main/
│           │   ├── index.ts        app lifecycle, window mgmt
│           │   ├── agent-host.ts   owns AgentRun, bridges to IPC
│           │   ├── ipc.ts          channel definitions + handlers
│           │   └── preload.ts      contextBridge surface
│           └── renderer/
│               ├── index.html
│               ├── main.tsx        React root + Vite entry
│               ├── App.tsx         three-region dashboard
│               ├── components/
│               │   ├── SessionRail.tsx
│               │   ├── ChatStage.tsx
│               │   ├── SettingsPanel.tsx
│               │   ├── CommandBar.tsx       cmdk
│               │   ├── ApprovalModal.tsx
│               │   └── QuestionModal.tsx
│               └── ipc-client.ts   typed wrappers over window.ccr
└── web/                            unchanged (out of scope for this plan)
```

**Runtime: agent flow in Electron**

```text
Renderer                                    Main (Node)
─────────────────────────────────────────────────────────────────
[user types prompt, hits Enter]
        │
        │  invoke('agent:start', { sessionId, model, mode, text })
        ▼
        ─────────────────────────────────────────►
                                                 │
                                                 ▼
                                       acquire <session>.lock
                                       build AgentRun {
                                         client = buildClient(auth)
                                         reporter = ipcReporter
                                         ctx = { approve: ipcApprove,
                                                 ask: ipcAsk, ... }
                                       }
                                       runAgent(run, messages)
                                                 │
                              ◄──── 'agent:token' (streaming chunk) ──┐
                              ◄──── 'agent:tool-start' { name, args } │
                              ◄──── 'agent:tool-end'   { name, result }
                              ◄──── 'agent:approval-request' { ... }  │
        invoke('agent:approval-response', yes)                        │
        ─────────────────────────────────────────►                    │
                                                 [approval resolves]  │
                              ◄──── 'agent:done' { final summary }    │
                                       release <session>.lock
                                       persist messages to JSON
                                                 │
                                                 ▼

Same dance, but Reporter / Approver / Asker are implementations
that send IPC messages instead of writing to stdout / Ink state.
```

**Lock arbitration when both front-ends are open**

```text
Both processes mount the SessionWatcher. Each session JSON has a sibling .lock
file (or no lock if idle).

      no lock file               lock file with my pid          lock file with foreign pid
        ───────                    ──────────────────              ──────────────────────
   "open here" enabled         "active here" badge            "active in <other window>"
   submit → acquire lock        submit → already mine         submit disabled
                                                              "open here" button
                                                              (forces takeover after
                                                               lock liveness probe;
                                                               only if foreign PID dead)
```

## Implementation Units

### Unit 1: Repo restructure to npm workspaces

- [x] **Goal:** Convert the single-package repo into an npm workspace with `packages/core`, `packages/cli`, `packages/electron` (skeleton). Today's `src/` moves into `packages/core` and `packages/cli`. Existing CLI publish keeps working under the same package name.

> **Implementation note (post-merge):** The plan's "produce a tarball with the same 32 files as today" verification was deliberately replaced with **bundle the CLI via tsup at publish time**. `bundleDependencies` does not include workspace symlinks under npm 10 (known limitation), so a self-contained published tarball requires either a copy step or a bundler. tsup is the modern monorepo standard. Result: published tarball is 4 files (`package.json`, `README.md`, `dist/cli.js`, `dist/cli.js.map`) totaling ~115 KB — significantly smaller than today's 32 files. Sandbox install + run verified the tarball is fully self-contained with no `@ccr/core` runtime dep needed. Library-style import (`import { runAgent } from "@ryanisavibecoder/ccr"`) is no longer supported by the published package; the `index.ts` entry was vestigial. Real library users should depend on `@ccr/core` directly (currently a private workspace package).

**Requirements:** R1, R2.

**Dependencies:** None (foundational unit).

**Files:**
- Modify: `package.json` — add `workspaces: ["packages/*"]`, drop the build/start/version scripts that now live in sub-packages.
- Create: `packages/core/package.json` (name: `@ccr/core`, private, type: module).
- Create: `packages/cli/package.json` (name: `@ryanisavibecoder/ccr`, the publishable one; copy bin, files, dependencies, scripts from current root).
- Create: `packages/electron/package.json` (name: `@ccr/desktop`, private; Electron + Vite deps placeholder).
- Create: `tsconfig.base.json` (shared strict compiler options, ES2022 target, react-jsx).
- Create: `packages/core/tsconfig.json`, `packages/cli/tsconfig.json`, `packages/electron/tsconfig.json` (each extends base, sets rootDir/outDir, path mappings).
- Move: every file in `src/agent.ts`, `src/tools.ts`, `src/session.ts`, `src/config.ts`, `src/update-check.ts`, `src/version.ts` → `packages/core/src/`.
- Move: `src/cli.ts`, `src/app.tsx`, `src/auth/*`, `src/index.ts` → `packages/cli/src/`.
- Update imports inside `packages/cli/src/*` to import from `@ccr/core` instead of relative paths.
- Update root `.gitignore` if needed (per-package `dist/` directories).
- Move: existing `web/` is not part of workspaces (it has its own dep tree); decide whether to convert it too. **Recommendation:** leave `web/` outside workspaces for v1 to minimize blast radius. Document this in the root README.
- Test: `packages/cli/src/auth/terminal.test.ts` (already exists — moves with the rest of `src/auth/`). No new test files in this unit; the existing test must still pass.

**Approach:**
- Use `npm@10`+ workspaces (already on `npm` for publish flow).
- The published package stays `@ryanisavibecoder/ccr`; only its source location changes. `bin: { ccr: ./dist/cli.js }` still resolves under the cli package.
- `packages/core` exports a barrel `index.ts` with the public API; CLI imports `import { runAgent, ... } from "@ccr/core"`. Path mappings in `tsconfig.base.json` make this work in dev (`"@ccr/core": ["packages/core/src/index.ts"]`); after build, npm workspaces hoist + link the package directory.
- Keep existing `dist/` build output; just update the per-package `outDir`. Root `package.json`'s `prepublishOnly` no longer makes sense; move to `packages/cli/package.json`.

**Patterns to follow:**
- The existing `src/` layout is already clean enough to split by import boundary — anything that imports `react`/`ink`/`ink-text-input` is CLI-side; anything that doesn't is core-side.

**Test scenarios:**
- *Happy path:* After restructure, `npm run -w @ryanisavibecoder/ccr build` succeeds and produces the same `dist/cli.js`, `dist/agent.js`, etc. (now in `packages/cli/dist/`). `node packages/cli/dist/cli.js --version` prints the current VERSION.
- *Happy path:* `npm test` from root runs `packages/cli/src/auth/terminal.test.ts` and all 11 cases still pass.
- *Integration:* `npm pack -w @ryanisavibecoder/ccr` produces a tarball whose `package.json` name is `@ryanisavibecoder/ccr` and whose `bin/ccr` resolves to a working binary when installed globally on a fresh tmp Node.
- *Edge case:* importing `@ccr/core` from a sibling workspace package resolves via npm's symlink, not `node_modules` duplicate.

**Verification:**
- The published-shape build output is identical to today's (modulo paths). `npm pack --dry-run -w @ryanisavibecoder/ccr` lists the same 32 files and produces a tarball within ±10% of today's size.
- `node packages/cli/dist/cli.js` renders the welcome panel without error.

---

### Unit 2: Define and lock the core's public API

- [x] **Goal:** Make `@ccr/core`'s exported surface explicit and complete enough for the Electron app to consume without reaching into private modules. No behavior change.

**Requirements:** R1, R6, R7.

**Dependencies:** Unit 1.

**Files:**
- Modify: `packages/core/src/index.ts` — barrel export.
- Modify (where needed): export annotations on internal helpers that need to be public for Electron (e.g., `Reporter`, `Approver`, `Asker`, `ToolContext`, `AgentRun`, `BuildClientOptions`, `QuotaState`, `runAgent`, `buildClient`, `initialMessages`, `makeSubagentRunner`, `loadAuth`, `loadConfig`, `applyConfig`, `authPath`, `configPath`, `clearAuth`, `listSessions`, `loadSession`, `saveSession`, `sessionPath`, `newSessionId`, `projectId` (newly exported), `VERSION`, `PACKAGE_NAME`, `checkForUpdate`, `UpdateInfo`, `TOOLS`, `TOOL_BY_NAME`, `toolSchemas`, `dispatch`).
- Modify: `packages/core/package.json` — `exports` field pointing at the barrel; `types` for the .d.ts.
- Test: `packages/core/src/__tests__/exports.test.ts` (new).

**Approach:**
- Barrel pattern. No re-implementation. Just expose what the CLI already uses internally + what Electron will need.
- Mark anything not exported as `@internal` in JSDoc so the API surface is reviewable.
- The `projectId` helper currently lives inside `session.ts` as a private function; promote it to public so Electron can group sessions by project root the same way `listSessions` does.

**Patterns to follow:**
- Existing `src/index.ts` already does `export * from "./agent.js"` etc. — just move that pattern into core and curate.

**Test scenarios:**
- *Happy path:* `import { runAgent, runAgent as _, ToolContext, Reporter } from "@ccr/core"` compiles in a fresh TS project with `moduleResolution: "bundler"`.
- *Happy path:* `Object.keys(require("@ccr/core"))` enumerates exactly the documented public symbols (snapshot test).
- *Edge case:* `@ccr/core/internal/*` imports fail (no deep-link surface area).

**Verification:**
- `npm run -w @ccr/core build && cd /tmp && npm init -y && npm install /Users/...packages/core && node -e 'console.log(Object.keys(require("@ccr/core")))'` lists every public name.

---

### Unit 3: Session lock + file watcher in core

- [x] **Goal:** Add the lock manager and the session file watcher to `@ccr/core`. Wire `runAgent` to acquire on start, release on end. Both front-ends consume the watcher to live-tail non-owned sessions.

**Requirements:** R3, R8, R9.

**Dependencies:** Units 1, 2.

**Files:**
- Create: `packages/core/src/session-lock.ts` — `acquireLock`, `releaseLock`, `readLock`, `LockOwnedElsewhereError`, `lockPath(sessionPath)`.
- Create: `packages/core/src/session-watcher.ts` — `watchSessions(rootDir, onChange): cleanup`.
- Modify: `packages/core/src/agent.ts` — `runAgent` acquires the lock at the top, releases in `finally`. New optional `AgentRun.sessionPath`. If lock acquisition throws `LockOwnedElsewhereError`, surface a clear error to the reporter and return early (don't kill the loop without explanation).
- Modify: `packages/core/src/session.ts` — exposed `lockPath` helper (or re-exports from session-lock).
- Update: `packages/core/src/index.ts` — export the new symbols.
- Modify: `packages/core/package.json` — add `chokidar` dependency.
- Test: `packages/core/src/__tests__/session-lock.test.ts`.
- Test: `packages/core/src/__tests__/session-watcher.test.ts`.

**Execution note:** Test-first for lock semantics. The behavior matrix (acquire/release/stale/contended/foreign-host/malformed) is small enough to fully enumerate and the cost of a bug here is "two front-ends silently double-write the same session", so write the tests before the impl.

**Approach:**
- Lock file format (JSON, written atomically via write-temp-then-rename):
  ```json
  { "pid": 12345, "host": "ryan-mbp.local", "sessionId": "20260502-103015", "startedAt": "2026-05-02T10:30:15.123Z" }
  ```
- Stale detection:
  - Different `host` → treat as foreign-machine; in v1 we assume single-machine, so error with a clear message rather than steal.
  - Same `host`, `process.kill(pid, 0)` throws `ESRCH` → stale, take over (overwrite).
  - Same `host`, `pid` is alive → contended; throw `LockOwnedElsewhereError`.
  - Malformed JSON → log warning, treat as stale, take over.
  - Same `host` and `pid` matches `process.pid` → idempotent re-acquire (just refresh timestamp).
- Atomic write: write to `<lock>.tmp` then `fs.rename` — on POSIX this is atomic; on Windows it's "as atomic as you'll get" with chokidar's `awaitWriteFinish`.
- Watcher uses `chokidar.watch(rootDir, { ignored, persistent: true, awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 } })`. Filters on `.json` and `.lock` paths. Emits typed events: `session-changed`, `lock-acquired`, `lock-released`.
- `runAgent` integration: at the top, if `run.sessionPath` is provided, call `acquireLock(run.sessionPath)`. Wrap the existing for-loop in `try { ... } finally { await releaseLock(run.sessionPath) }`.

**Patterns to follow:**
- The existing `web/lib/non-task-detector.ts` pattern of small focused modules with a tight test file.
- `src/auth/terminal.test.ts` test style (`node:test` + `node:assert/strict`, `mkdtemp` for temp dirs).

**Test scenarios for `session-lock.test.ts`:**
- *Happy path:* `acquireLock(p)` writes the lock file with current pid/host/timestamp; returns lock object.
- *Happy path:* `releaseLock(p)` removes the lock file. Idempotent if no lock file exists.
- *Edge case:* `acquireLock` when current pid already holds the lock → no-op, returns existing lock with refreshed `startedAt`.
- *Edge case:* `acquireLock` when stale lock from dead PID exists → takes over, overwrites with current pid.
- *Edge case:* Lock file is malformed JSON → treated as stale, takes over, logs.
- *Error path:* `acquireLock` when fresh lock from different live PID exists → throws `LockOwnedElsewhereError`. Error includes the foreign pid for UI display.
- *Error path:* Lock file from different `host` → throws clear "session is locked on another machine" error (single-machine assumption guard).
- *Integration:* `runAgent` acquires lock at start, releases at end. Crash mid-run (simulated by killing the process before completion) leaves a stale lock; next `runAgent` invocation takes over cleanly.

**Test scenarios for `session-watcher.test.ts`:**
- *Happy path:* `watchSessions(tmpDir, onChange)` fires `session-changed` within 500ms of writing a new session JSON in a project subdir.
- *Happy path:* Modifying an existing session JSON (e.g., appending a turn) fires exactly one `session-changed` for that path (no duplicate burst, thanks to `awaitWriteFinish`).
- *Happy path:* Creating a `.lock` file fires `lock-acquired`; deleting it fires `lock-released`.
- *Edge case:* Writing a partial JSON file (open file, write half, sleep, write rest) does not fire `session-changed` until the write stabilizes.
- *Edge case:* Watcher cleanup function unsubscribes; subsequent file modifications produce no events.
- *Integration:* Two processes — one writes a session, the other watches the same dir — sees the change within 500ms.

**Verification:**
- All test scenarios above pass under `npm test -w @ccr/core`.
- A manual smoke: spin two `node` REPLs, both calling `watchSessions(...)`. In a third, write a session JSON. Both REPLs log the change. Kill one. Watcher in the other still works.

---

### Unit 4: Electron scaffold + main-process agent host

- [ ] **Goal:** Stand up the Electron app skeleton — main process, preload, renderer, Vite dev server. Main process owns the `AgentRun`. Define and implement IPC channels for streaming, tool calls, approvals, asks. Renderer is a stub at this point.

**Requirements:** R6, R7.

**Dependencies:** Units 1, 2, 3.

**Files:**
- Create: `packages/electron/package.json` — Electron 28+, Vite, electron-vite or vite-plugin-electron, React 18, TypeScript.
- Create: `packages/electron/electron.vite.config.ts` (or equivalent) — three build targets: main, preload, renderer.
- Create: `packages/electron/src/main/index.ts` — `BrowserWindow` setup (1200×800, resizable, dark titlebar on macOS, `contextIsolation: true`, `nodeIntegration: false`, preload script).
- Create: `packages/electron/src/main/agent-host.ts` — class `AgentHost` that owns one `AgentRun` per session, exposes `start({ sessionId, model, mode, text })`, `respondToApproval(...)`, `respondToAsk(...)`, `abort()`.
- Create: `packages/electron/src/main/ipc.ts` — channel string constants + handler registration. Wraps `AgentHost` behind `ipcMain.handle(...)` for invoke-style calls and `webContents.send(...)` for streams.
- Create: `packages/electron/src/main/preload.ts` — `contextBridge.exposeInMainWorld('ccr', { ... })` — typed surface the renderer uses (no `require`, no `process` in renderer).
- Create: `packages/electron/src/renderer/index.html`, `main.tsx`, `App.tsx` (placeholder “hello, ccr” shell — full UI lands in Unit 5).
- Create: `packages/electron/src/renderer/ipc-client.ts` — typed wrappers over `window.ccr` so renderer code never touches strings.
- Modify: root `package.json` scripts — `dev:desktop` runs Vite in watch + Electron in `--inspect`; `build:desktop` produces unpacked output.
- Test: `packages/electron/src/main/__tests__/agent-host.test.ts`.
- Test: `packages/electron/src/main/__tests__/ipc.test.ts`.

**Approach:**
- IPC channel inventory:

  | Channel | Direction | Payload | Notes |
  |---|---|---|---|
  | `agent:start` | renderer → main (invoke) | `{ sessionId, model, mode, text }` | Resolves when run starts; rejects on lock-owned-elsewhere |
  | `agent:abort` | renderer → main (invoke) | `{ sessionId }` | Aborts current run |
  | `agent:token` | main → renderer (send) | `{ sessionId, token }` | Streaming tokens |
  | `agent:assistant-turn-end` | main → renderer (send) | `{ sessionId, content }` | When `assistantTurnEnd` fires |
  | `agent:tool-start` | main → renderer (send) | `{ sessionId, name, argsPreview }` | |
  | `agent:tool-end` | main → renderer (send) | `{ sessionId, name, result, isError }` | |
  | `agent:approval-request` | main → renderer (send) | `{ sessionId, requestId, kind, title, detail }` | |
  | `agent:approval-response` | renderer → main (invoke) | `{ requestId, approved }` | Resolves request |
  | `agent:ask-request` | main → renderer (send) | `{ sessionId, requestId, questions }` | |
  | `agent:ask-response` | renderer → main (invoke) | `{ requestId, answers }` | |
  | `agent:done` | main → renderer (send) | `{ sessionId }` | |
  | `agent:status` | main → renderer (send) | `{ sessionId, text }` | mirrors `Reporter.setStatus` |
  | `agent:quota` | main → renderer (send) | `{ used, limit, resetAt }` | mirrors `Reporter.setQuota` |
  | `agent:error` | main → renderer (send) | `{ sessionId, message }` | unrecoverable error |

- `AgentHost` builds its `Reporter` / `Approver` / `Asker` to translate to/from these IPC events. Approval/ask resolution uses a `Map<requestId, { resolve, reject }>` in main; renderer responds with the matching id.
- Auth flow per R7: main process reads `~/.ccr/auth.json` and `~/.ccr/config.json` directly via `@ccr/core`'s `loadAuth`/`loadConfig`. If unauthenticated, render a “run `ccr login` in your terminal” banner in the renderer (no in-app login UI in v1).
- Quota line: `Reporter.setQuota` already exists in core; it relays to `agent:quota` and the renderer renders.
- The agent run is per-session: `AgentHost` keeps a `Map<sessionId, { run, abortController }>` so multiple sessions could in theory run concurrently. v1 UI will only let you run one at a time, but the host is multi-aware.

**Patterns to follow:**
- The existing `src/cli.ts` `consoleApprover` / `consoleAsker` / `consoleReporter` shape — the IPC versions in main should be drop-in replacements.
- `web/app/cli-auth/page.tsx` for visual styling cues (Fraunces serif heading, monospace body, palette).

**Test scenarios for `agent-host.test.ts`:**
- *Happy path:* `start({ sessionId, ..., text: "hi" })` triggers the first-turn greeting short-circuit in core, emits exactly one `assistant-turn-end` and `done` event without a model call. (No fixtures required — first-turn greeting reply is hard-coded.)
- *Happy path:* Mid-run, `respondToApproval(requestId, true)` resolves the pending approval and the agent proceeds.
- *Edge case:* Two `start` invocations for the same `sessionId` while one is running → second rejects with "already running" error.
- *Edge case:* `abort` on an active run causes the in-flight `runAgent` to throw `aborted`; lock is released; renderer receives `agent:done` with no error noise.
- *Error path:* Lock is held by another PID → `start` rejects with a structured error including the foreign pid; no IPC events fire.
- *Integration:* AgentHost respects `ToolContext.runSubagent` (subagent path still works through main) — verify with a tiny mock client that returns a `spawn_agent` tool call.

**Test scenarios for `ipc.test.ts`:**
- *Happy path:* Renderer-side `ipc-client.start(...)` round-trips through `ipcMain.handle('agent:start', ...)` and resolves with the host's response. (Use `electron-mocha` or hand-roll with `mockMainAndPreload` helper.)
- *Edge case:* Renderer subscribes to `agent:token` and unsubscribes; subsequent token events do not invoke the listener.
- *Error path:* Channel name typo on the renderer side → fails at compile time (test the .d.ts surface, not runtime, by ensuring `ipc-client.ts` is the only string-touching layer).

**Verification:**
- `npm run dev:desktop` opens an Electron window. Pressing the placeholder "Send 'hi'" button in the renderer triggers a real `agent:start`, the main process logs the canned first-turn reply, and the renderer logs the `agent:done`.
- Lock file appears at `~/.ccr/sessions/<projectId>/<sessionId>.lock` while the run is active and disappears after.

---

### Unit 5: Renderer dashboard (sessions rail / chat stage / settings panel)

- [ ] **Goal:** Build the three-region dashboard. Left rail = session groups by project, with date sub-grouping; center = chat stage with streamed assistant output, user echoes, tool-call cards, approval and question modals, input bar; bottom-left = settings (model picker, mode toggle, account email, quota line).

**Requirements:** R4, R7.

**Dependencies:** Units 1–4.

**Files:**
- Create: `packages/electron/src/renderer/App.tsx` — three-region layout with CSS grid (12-col + named areas).
- Create: `packages/electron/src/renderer/components/SessionRail.tsx` — groups sessions by project, sub-groups by date (Today / Yesterday / This week / Older), shows new-session button per project.
- Create: `packages/electron/src/renderer/components/ChatStage.tsx` — virtualized message list (sessions can grow long), streaming token cursor, tool cards, approval + question modals as overlays.
- Create: `packages/electron/src/renderer/components/SettingsPanel.tsx` — model picker (dropdown over `KNOWN_MODELS` from core), mode toggle (ask / accept-edits / bypass), account email line, quota line.
- Create: `packages/electron/src/renderer/components/ApprovalModal.tsx` — diff renderer (use `react-diff-viewer` or roll own with monospace + colored lines), approve/deny/accept-all buttons.
- Create: `packages/electron/src/renderer/components/QuestionModal.tsx` — multi-step question flow with mcq + free-text fallback (mirrors core's `QuestionPanel` from `src/app.tsx`).
- Create: `packages/electron/src/renderer/components/MessageCard.tsx` — user / assistant / tool / system variants, theme palette ported from `src/app.tsx`'s `theme`.
- Create: `packages/electron/src/renderer/state/sessions.ts` — Zustand or React context store of all sessions in `~/.ccr/sessions/` (loaded via IPC at boot from `listSessions` + per-session `loadSession`).
- Create: `packages/electron/src/renderer/state/run.ts` — store of in-flight messages for the active session, fed by IPC token / tool-end / done events.
- Create: `packages/electron/src/renderer/styles.css` — theme tokens matching `src/app.tsx`'s `theme` constant; Tailwind config (or vanilla CSS variables — pick during impl).
- Modify: `packages/electron/src/main/ipc.ts` — add `sessions:list`, `sessions:load(sessionId)`, `sessions:create(projectRoot)` invoke handlers.
- Test: `packages/electron/src/renderer/__tests__/SessionRail.test.tsx`, `ChatStage.test.tsx`, `SettingsPanel.test.tsx` (Vitest + React Testing Library).

**Approach:**
- Use React 18 + plain Vite (not Next.js — overkill for an Electron renderer).
- State management: Zustand. Lightweight, no provider tree clutter, plays well with IPC subscriptions.
- The visual design intentionally mirrors `src/app.tsx`'s palette tokens (teal/amber/purple) so a user moving between CLI and desktop sees the same brand. Background is a near-black charcoal; cards have rounded borders; typography is JetBrains Mono for code and a sans for chrome (Inter or system stack).
- Session rail grouping: `groupBy(s => s.projectRoot)` then sort projects by recent activity, sessions within a project by `updatedAt` desc, date headers (Today / Yesterday / This week / Older) inserted between sessions.
- Project root display name: `path.basename(projectRoot)` with the full path on hover.
- Streaming cursor: a blinking caret rendered after the streamed content; position recomputed on each `agent:token` event.
- Tool cards: collapsed by default (one line: ✓/✗ + name + args preview); clicking expands the result.
- Settings model picker: dropdown lists `KNOWN_MODELS` from core; "Other…" option lets user type a custom id.
- Settings persistence: writes go through IPC `settings:save` → core's `saveConfig` (which already exists).
- Approval modal: keyboard shortcut `Y / N / A` (matches CLI). Full-screen overlay with diff in a scrollable code block.
- Question modal: same flow as `src/app.tsx`'s `QuestionPanel` — mcq list + "Other (free text)…" entry.

**Patterns to follow:**
- The Ink palette + component vocabulary in `packages/cli/src/app.tsx` (post-Unit 1) — reuse the palette tokens 1:1, reuse the message taxonomy (user / assistant / tool / system).
- The proxy site's typography choices in `web/app/cli-auth/page.tsx` — Fraunces for display headings, monospace for code, the same warm-charcoal background.

**Test scenarios for `SessionRail.test.tsx`:**
- *Happy path:* Given 5 mock sessions across 2 projects, the rail renders 2 project groups with the right session counts and sort order (recent first within group).
- *Happy path:* Clicking a session emits `setActiveSession(id)` to the store.
- *Edge case:* Empty state (no sessions) renders a "No sessions yet" hint with a "New session" CTA.
- *Edge case:* A session with no `messages` (just-created, empty) renders without crashing.

**Test scenarios for `ChatStage.test.tsx`:**
- *Happy path:* Streaming tokens append to the active assistant message in real time.
- *Happy path:* Tool-end event with `isError: true` renders the card with red iconography.
- *Edge case:* A 500-message session renders without dropping frames (virtualization smoke).
- *Integration:* `agent:approval-request` IPC event mounts the approval modal; clicking Approve calls `respondToApproval(requestId, true)` and the modal unmounts.

**Test scenarios for `SettingsPanel.test.tsx`:**
- *Happy path:* Selecting a different model fires `settings:save({ model })` IPC and the dropdown reflects the new value.
- *Happy path:* Quota line renders `used / limit · resets May 31`.
- *Edge case:* When `loadAuth` returned null (not signed in), settings shows "Sign in via `ccr login`" instead of the email + quota line.

**Verification:**
- Manual: launch the app, confirm sessions rail, chat stage, settings panel all render with mocked data, plus a real run-through of "type prompt → streaming reply → approval modal → continue" end-to-end.
- All component tests pass under `npm test -w @ccr/desktop`.

---

### Unit 6: Cmd-K command bar (cmdk)

- [ ] **Goal:** Add a fuzzy command palette accessible from anywhere via `⌘ K` (mac) / `Ctrl K`. Searchable corpus: open sessions, slash commands, models, modes, "new session in <project>".

**Requirements:** R5.

**Dependencies:** Unit 5.

**Files:**
- Create: `packages/electron/src/renderer/components/CommandBar.tsx` — cmdk root + input + list, with category headers (Sessions / Models / Modes / Actions / New session).
- Create: `packages/electron/src/renderer/state/commands.ts` — registry of command items with run() callbacks.
- Modify: `packages/electron/src/renderer/App.tsx` — global keydown listener for `⌘ K`; CommandBar rendered as portal-like overlay.
- Modify: `packages/electron/src/main/index.ts` — register a global accelerator for `CmdOrCtrl+K` so the bar opens even when the renderer doesn't have focus (optional v1.1 enhancement; basic in-window keydown works without).
- Test: `packages/electron/src/renderer/__tests__/CommandBar.test.tsx`.

**Approach:**
- cmdk components: `<Command>` root, `<Command.Input>`, `<Command.List>`, `<Command.Group heading="Sessions">`, `<Command.Item>`. Uses cmdk's built-in fuzzy scoring.
- Command corpus assembled at render time from the sessions store + a static list of slash commands + models + modes. New items auto-included as state changes.
- Activation: `useEffect` on `keydown` for `⌘ K` / `Ctrl K`; `Esc` closes; `Enter` runs the active item.
- Styling: blurred backdrop, centered card, monospace input, theme tokens matching the rest of the app.

**Patterns to follow:**
- cmdk official examples; Linear / Raycast-style palettes for spacing and visual hierarchy.

**Test scenarios:**
- *Happy path:* `⌘ K` opens the bar; typing "model" filters to model-switching items; arrow + enter switches model.
- *Happy path:* Typing a partial session name fuzzy-matches and selecting jumps to that session.
- *Edge case:* Empty input shows recent-first all categories, header-grouped.
- *Edge case:* `Esc` closes without committing.
- *Integration:* Selecting "New session in <project>" creates a session via IPC and switches to it; rail updates within 500ms.

**Verification:**
- Manual smoke from the running app. Unit tests pass.

---

### Unit 7: Live session-rail updates + lock-aware UI states

- [ ] **Goal:** Wire the file watcher from Unit 3 into the renderer so the sessions rail and the chat stage update live when the *other* front-end (or a different window) writes to the same files. Show "active in another window" badges and an "open here" recovery button when locks are stale.

**Requirements:** R3, R8, R9.

**Dependencies:** Units 3, 5.

**Files:**
- Modify: `packages/electron/src/main/index.ts` — start a `watchSessions` instance covering `~/.ccr/sessions/`; forward events to the renderer via IPC channel `sessions:event`.
- Modify: `packages/electron/src/main/ipc.ts` — `sessions:event` send channel; `sessions:takeover-lock` invoke handler that probes liveness and writes a fresh lock if stale.
- Modify: `packages/electron/src/renderer/state/sessions.ts` — handle `sessions:event` to refresh the affected session's metadata + lock state.
- Modify: `packages/electron/src/renderer/components/SessionRail.tsx` — render lock badge ("Active here" / "Active in <other window>") next to each session.
- Modify: `packages/electron/src/renderer/components/ChatStage.tsx` — read-only banner when active session is locked elsewhere; disabled input bar; "Open here" button (calls `sessions:takeover-lock` after confirm).
- Modify (CLI side): `packages/cli/src/app.tsx` — symmetrically watch + update its own session list. (CLI already lists from disk on /sessions; this makes the rail live during a chat.)
- Test: `packages/electron/src/main/__tests__/sessions-watch.test.ts` — integration test: start the watcher, write a session JSON in a temp dir, assert the IPC event fires.
- Test: `packages/electron/src/renderer/__tests__/lock-states.test.tsx`.

**Approach:**
- The watcher in main process emits IPC events; renderer Zustand store consumes and patches. Debounce per-session to avoid burst rerenders during streaming writes from the other front-end.
- "Open here" UX: confirm dialog ("Take over this session? The other window will become read-only.") → invoke `sessions:takeover-lock` → main calls `acquireLock` with `force: true` (only succeeds if foreign PID is dead, otherwise falls through to error). On success, refresh session and re-enable input.
- The CLI side gets the same watcher — when a desktop run completes and writes the session JSON, the CLI's `/sessions` list (and the dashboard view if/when added) sees it. Minimal surface change: just call `watchSessions` on startup and refresh the in-memory session list in the Ink store.

**Patterns to follow:**
- Existing `src/app.tsx` Zustand-equivalent (it currently uses `useState` arrays of entries) — fine to keep in CLI; only the desktop renderer uses Zustand.

**Test scenarios:**
- *Happy path:* A second process writes a session JSON; renderer sees `sessions:event` within 500ms; rail count increments.
- *Happy path:* Lock file appears for a session; rail shows "Active in another window" badge; input bar disables.
- *Happy path:* Lock file disappears (other process exited cleanly); rail badge clears; input bar re-enables.
- *Edge case:* Other process crashed → stale lock remains; "Open here" button takes over (after liveness probe says PID is dead).
- *Error path:* "Open here" while other process is still alive → confirm dialog says so, no takeover happens, user is told to close the other window first.
- *Integration:* CLI runs an agent → writes turns → desktop's chat stage live-tails them. Each new turn appears within 500ms.

**Verification:**
- Manual two-window smoke: run CLI in one terminal and the desktop app in parallel. Start a session in the CLI; switch to desktop. Watch live updates. Then submit from desktop while CLI is in its REPL — desktop holds the lock, CLI shows the read-only state.

---

### Unit 8: Distribution — electron-builder + electron-updater

- [ ] **Goal:** Package the desktop app for macOS (`.dmg`), Windows (`.exe`), and Linux (`.AppImage`). Wire auto-update against GitHub Releases via `electron-updater`. Document the publish flow.

**Requirements:** Implicit (no requirement number, but a v1 the user can install).

**Dependencies:** Units 4–7 must be functionally complete.

**Files:**
- Create: `packages/electron/electron-builder.yml` — appId, productName "CCR", per-platform targets, code-signing config (commented out for v1; ad-hoc on macOS), publish config pointing at `github` provider.
- Modify: `packages/electron/package.json` — `electron-builder`, `electron-updater` deps; `dist:mac` / `dist:win` / `dist:linux` scripts; `release` script that bumps version + tags + gh release create.
- Create: `packages/electron/build/` — icon assets (icns / ico / png).
- Create: `packages/electron/src/main/auto-update.ts` — check on startup + every N hours; show non-blocking notification when an update is staged; "Restart to update" button in settings.
- Modify: `.github/workflows/release-desktop.yml` (new workflow file) — on tag push, run electron-builder for all three platforms via matrix runners and upload artifacts to the GH release.
- Create: `packages/electron/README.md` — install instructions, Gatekeeper warning workaround for unsigned macOS builds, manual update fallback.
- Test: `packages/electron/src/main/__tests__/auto-update.test.ts`.

**Approach:**
- electron-builder config:
  - `productName: CCR`, `appId: ai.ccr.desktop` (or similar; settle once we have a domain/brand check).
  - macOS: `target: ["dmg", "zip"]`, `category: "public.app-category.developer-tools"`. v1 ships unsigned; document the `xattr -d com.apple.quarantine /Applications/CCR.app` workaround.
  - Windows: `target: ["nsis"]`. v1 unsigned; users will see SmartScreen warning.
  - Linux: `target: ["AppImage"]`.
  - `publish: { provider: "github", owner: "ryanssareen", repo: "ccr" }`.
- electron-updater is configured to auto-check; user opts out via a setting if they want.
- Versioning: the electron app version is independent of the npm CLI version. Both consume `@ccr/core` and may release on different cadences. Document this in the root README.
- Code signing is deferred. Mac users will need to right-click → Open the first time. Document this clearly.

**Patterns to follow:**
- Existing `web/` Vercel auto-deploy as the comparable "set it and forget it" release pattern — we want the desktop release to be similarly mechanical.
- The npm publish flow we already have (Bypass-2FA token) — desktop releases skip the npm 2FA cliff entirely since they go through GitHub.

**Test scenarios:**
- *Happy path:* `npm run -w @ccr/desktop dist:mac` produces `packages/electron/dist/CCR-1.0.0-arm64.dmg`. Manually opening it installs the app.
- *Happy path:* On startup with `process.env.CCR_NO_UPDATE_CHECK !== "1"`, auto-update probes the GH releases endpoint within 5s and either no-ops (current is latest) or emits an "Update available" toast.
- *Edge case:* GH releases endpoint is down → auto-update silently no-ops, no error UI (mirrors the CLI's update-check behavior).
- *Edge case:* Update download fails mid-stream → retry once, then surface a non-blocking error.
- *Integration:* Bumping version in `packages/electron/package.json` and pushing a git tag triggers the GH workflow, which produces artifacts and creates a release.

**Verification:**
- A `.dmg` is downloadable from GH releases. Install on a fresh macOS user account, launch, sign in (or rely on existing `~/.ccr/auth.json`), run a session end-to-end.
- Bumping the version locally, repeating the release, then opening the older version triggers the auto-update flow and the new app launches after restart.

## System-Wide Impact

- **Interaction graph:** The agent loop is currently entry-pointed by `runAgent(run, messages)` from `src/cli.ts`. After this plan it is also entry-pointed by `AgentHost` in Electron main. Any future tool added to the registry automatically appears in both front-ends because it's defined in core; no per-frontend registration. Subagents (`spawn_agent`) work in both because the runner is built in `@ccr/core`'s `makeSubagentRunner`.
- **Error propagation:** `LockOwnedElsewhereError` is a new structured error from core. Both front-ends must surface it as a user-actionable UI state, not as a generic exception. Other errors (rate limit, transient tool-call failure, network) flow through the existing `Reporter.assistantTurnEnd` channel — no change.
- **State lifecycle risks:** Two front-ends touching the same `~/.ccr/sessions/<id>.json` file is the new failure mode. Mitigations: (a) lock arbitration (Unit 3), (b) atomic writes in `saveSession` (already true: `fs.writeFile` writes whole file at once and chokidar `awaitWriteFinish` covers the rare partial-write case), (c) read-only mode in the non-owning front-end. Crash recovery: stale lock cleanup on next acquire.
- **API surface parity:** The Ink TUI in `packages/cli` and the React UI in `packages/electron` are separate implementations that consume the same core. They are *not* the same components rendered through different runtimes — they're different React trees with the same data model. Behavioral parity is enforced by the test suites in core (where the agent loop lives), not by sharing UI code.
- **Integration coverage:** Unit-level tests cover individual modules. The cross-front-end behavior (CLI starts a session, desktop sees it; desktop holds a lock, CLI is read-only) is only covered by manual two-window smokes in v1. Worth a dedicated e2e suite later — out of scope here.
- **Unchanged invariants:** The CLI's published surface (`@ryanisavibecoder/ccr` package name, `ccr` bin name, `ccr login` / `ccr logout` / `ccr --print` / etc. argv contract) is preserved bit-exactly. The proxy at `ccr-ebon.vercel.app` is untouched. `~/.ccr/auth.json` and `~/.ccr/config.json` schemas are unchanged. Session JSON file format is unchanged. Existing CLI users notice nothing different from `1.4.5` to whatever version ships these changes (probably `1.5.0`).

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Repo restructure (Unit 1) breaks existing publish — published 1.4.x users see a regression on `npm i -g @ryanisavibecoder/ccr@latest` | Pin the next CLI publish behind a workspace-built tarball that's manually inspected; `npm pack --dry-run -w @ryanisavibecoder/ccr` must produce a tarball with the same 32 files and same `bin` shape as today before any publish. Diff `npm pack` output before/after Unit 1. |
| Electron bundle size > 200 MB scares off users | Track the produced `.dmg` size and exclude unnecessary files via `electron-builder.yml` `files` field. Strip dev deps. If it exceeds 200 MB, look at `asar` packing and `electron-builder`'s `compression: "maximum"`. Tauri remains the escape hatch if v1 bundle size becomes a real adoption blocker. |
| File watcher misses events on macOS due to FSEvents flakiness | chokidar's `usePolling: false` is the default and works for most cases; if flaky in practice, fall back to polling at 1s interval. Acceptable for v1 (we're not racing). |
| Lock arbitration race: both front-ends acquire the same lock at exactly the same instant | Atomic write-temp-then-rename under POSIX is atomic; on Windows it may not be. Mitigation: read back the lock immediately after writing and verify our PID is in it; if not, throw `LockOwnedElsewhereError`. |
| User has no existing `~/.ccr/auth.json` and the desktop app has no in-app login (per R7) | Surface a clear empty-state in the renderer linking to the CLI's `ccr login`. v1 punts in-app login entirely; revisit if telemetry shows users abandoning at this gate. |
| Cross-front-end UX confusion: which window "owns" the session is non-obvious | Unit 7's lock badge + read-only banner makes it explicit. User testing post-launch will tell us if it's clear enough. |
| Two release tracks (npm CLI + GH desktop binary) drift in versioning or behavior | Both consume `@ccr/core`. Whenever core has a behavior change, both tracks bump within 24h. Document this in `CONTRIBUTING.md`. |
| Code-signed Mac builds are blocked behind needing an Apple Developer account ($99/yr) | Ship unsigned for v1 with documented Gatekeeper workaround. Real signing is a follow-up operational task, not a planning blocker. |
| `npm publish` for the CLI is now scoped to `packages/cli` and the existing Bypass-2FA token may not be valid for the new package layout | The package name `@ryanisavibecoder/ccr` is unchanged; npm doesn't care where the source lives. Token continues to work. Verified by `npm pack` smoke before first publish. |

## Documentation / Operational Notes

- **Root README** updated to explain the workspace layout: which package is the published CLI, which is the desktop app, which is the proxy, and where the shared core lives.
- **`packages/electron/README.md`** explains how to install the desktop app, the unsigned-build workaround for macOS, and how to opt out of auto-update via env var.
- **`docs/RELEASING.md`** (new): step-by-step for both release tracks. CLI track is unchanged from the existing publish flow. Desktop track: tag → push → GH workflow → release artifacts.
- **`AGENTS.md`** at repo root: a one-liner pointing this plan and the brainstorm at any future agent that wonders why the structure looks like this.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-02-ccr-desktop-app-v1-requirements.md](../brainstorms/2026-05-02-ccr-desktop-app-v1-requirements.md)
- **Existing CLI source:** `src/agent.ts`, `src/tools.ts`, `src/session.ts`, `src/app.tsx`, `src/cli.ts`, `src/config.ts`, `src/version.ts`, `src/update-check.ts`, `src/auth/*`
- **Existing proxy source:** `web/app/api/v1/chat/completions/route.ts`, `web/lib/non-task-detector.ts`, `web/lib/firebase-admin.ts`, `web/lib/providers/*`
- **Existing release plan:** [docs/plans/2026-04-30-001-feat-ccr-managed-service-plan.md](2026-04-30-001-feat-ccr-managed-service-plan.md) (the prior plan that produced the proxy + auth)
- **External:**
  - Electron IPC + contextBridge: <https://www.electronjs.org/docs/latest/tutorial/ipc>
  - chokidar docs: <https://github.com/paulmillr/chokidar>
  - cmdk: <https://cmdk.paco.me>
  - electron-builder: <https://www.electron.build>
  - electron-updater: <https://www.electron.build/auto-update>
