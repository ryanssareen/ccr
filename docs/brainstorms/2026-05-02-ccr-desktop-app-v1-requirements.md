---
date: 2026-05-02
topic: ccr-desktop-app-v1
---

# CCR Desktop App v1

## Problem Frame

The CLI works for terminal-loving developers but excludes a real user segment: visual learners, occasional users, and devs who'd rather drive an agent from a polished GUI than from an Ink TUI. A pure web dashboard at the existing proxy can't serve them either — the agent needs filesystem and shell access on the user's machine, which a web app cannot do.

The desktop app fills exactly that gap: native local execution (the CLI's strength), GUI driving it (the website's strength), no compromise. It is a *second frontend* over the same agent core, not a replacement for the CLI.

## Architecture Overview

```text
┌────────── user's machine ──────────┐    ┌──── ccr-ebon.vercel.app ────┐
│                                    │    │                              │
│  cli/  (Ink TUI)   ── spawns ──┐   │    │  Next.js proxy              │
│                                ├───┼────►  - auth (Firestore)         │
│  electron/  (GUI) ── spawns ──┘    │    │  - quota                    │
│   ▲         ▲                      │    │  - LLM router (Groq /       │
│   └ reads ──┴─ reads ─┐            │    │    Cerebras / OpenRouter /  │
│                       │            │    │    Together)                │
│   ~/.ccr/sessions/<projectId>/*.json │    │                              │
│   ~/.ccr/auth.json,  config.json   │    └──────────────────────────────┘
│   <session>.lock  (active flag)    │
│                                    │
│   core/  ← shared by cli/ + electron/
│           agent loop, tools, proxy client, session io
└────────────────────────────────────┘
```

## Requirements

**Architecture**
- R1. Extract the agent loop, tool registry, OpenAI-compatible proxy client, and session I/O into a shared `core/` package consumed by both `cli/` (today's Ink TUI) and `electron/` (the new desktop app). Frontend code never reaches into the agent loop directly.
- R2. Sessions remain JSON files in `~/.ccr/sessions/<projectId>/<sessionId>.json` (status quo). Both the CLI and desktop app read and write the same paths — no migration to Firestore for v1.
- R3. While a session is actively executing an agent loop, the owning process holds a lock file (e.g. `~/.ccr/sessions/<projectId>/<sessionId>.lock`) carrying its PID + timestamp. The non-owning frontend opens that session in read-only / live-tail mode and surfaces an "open here instead" action.

**Desktop app v1 shape**
- R4. Three-region dashboard layout. Left rail = sessions grouped by project root (with date sub-grouping when sessions are numerous). Center = chat/agent stage with streamed assistant output, tool-call cards, approval modal, and the input bar. Bottom-left = settings panel with model picker, mode toggle, account email, live quota line.
- R5. Cmd-K command bar in v1. At minimum supports: switch session, switch model, switch permission mode, new session in `<projectRoot>`, `/clear`, `/save`, `/sessions`, `/exit`. Fuzzy search across all entries.
- R6. The agent loop runs locally in the Electron main process. The renderer is the React UI; main↔renderer IPC carries streaming tokens, tool-call lifecycle events, and the approval prompt. The renderer has no direct disk or network access.
- R7. Reuse the existing managed-mode auth (`~/.ccr/auth.json`) and config (`~/.ccr/config.json`). The desktop app never asks the user to re-authenticate if the CLI is already signed in. `ccr login` and `ccr logout` from the CLI affect both frontends.

**Live sync (same machine)**
- R8. When one frontend writes to a session JSON file, the other frontend reflects the change with <500ms latency for completed turns (file watcher: `chokidar` or `node:fs.watch`). Live token streaming during an active run is delivered only to the owning frontend; the non-owning frontend sees deltas only when the JSON is flushed.
- R9. The lock file mechanism (R3) is the single source of truth for "this session is running here". Stale locks (owning PID gone) are recoverable.

## Success Criteria

- A user with the CLI already logged in can launch the desktop app and immediately see all their sessions, grouped by project. Selecting any completed session renders its full transcript with tool-call cards intact.
- A user can run a complete agent task — read files, edit with diff approval, run bash with approval, see streaming response — entirely from the desktop app without opening a terminal.
- A session started in the CLI and saved is visible in the desktop app's session rail within 500ms.
- The agent loop, tool registry, and proxy client live in exactly one place. CLI and desktop each contain only frontend code; cross-frontend behavioral parity is automatic, not manually maintained.
- Released desktop bundle size: target <100MB for the user-facing download. (Tauri can hit this easily; Electron requires effort.)

## Scope Boundaries

- **Cross-device sync** is explicitly out of v1. Sessions never push to Firestore. If a user wants to see their work across machines, that's a future brainstorm.
- **Background daemon** owning the agent loop is explicitly rejected for v1. Both frontends spawn agents in-process; the lock file arbitrates. Revisit only when ≥3 frontends materialize.
- **Compound feedback / auto-extracted knowledge / pattern memory / templates** is explicitly deferred. The user will run a separate brainstorm using `compound-engineering` skills once v1 is shipped and real usage informs what's worth extracting.
- **Web dashboard** at `ccr-ebon.vercel.app/app` is not in v1. The proxy site stays as it is.
- **Mobile companion, VS Code extension, JetBrains plugin, browser extension**: not v1.

## Key Decisions

- **Native desktop is required, not web.** The user explicitly framed the value proposition as "best of both worlds — site can't do work, terminal has bad UI". A pure web app cannot do local FS / shell work; a CLI cannot present a dashboard. Native is the only intersection.
- **Same-machine session parity only.** Avoids Firestore-per-token cost, preserves local-first identity, makes v1 cheap to build.
- **Per-frontend agent loop with a lock file, not a daemon.** Today's CLI architecture (agent runs in-process) survives. Electron does the same. No new long-running process to install / version / crash-recover.
- **Full dashboard in v1, not a chat-only mirror.** The dashboard layout (sessions rail + chat stage + settings + cmd-K) is what justifies the desktop app existing alongside the CLI. A chat-only mirror would just be a slow, heavyweight Ink.
- **Repo restructure to `core/` + `cli/` + `electron/` is a v1 prerequisite, not a follow-up.** Without the extraction, the second frontend duplicates code from day one.

## Dependencies / Assumptions

- The existing managed-mode auth schema (`~/.ccr/auth.json` with `token`, `endpoint`, `email`) and config schema (`~/.ccr/config.json`) remain stable for v1.
- The session JSON format produced by `src/session.ts` today is stable enough for the desktop app to consume without a migration.
- The Next.js proxy at `ccr-ebon.vercel.app` continues to handle LLM routing + quota. The desktop app calls it via the same OpenAI-compatible surface the CLI uses today.

## Outstanding Questions

### Resolve Before Planning
*(None — main product decisions are settled.)*

### Deferred to Planning
- [Affects R6][Technical] **Electron vs Tauri.** Electron is the easier port given the existing TS/Node agent (agent in main process, React renderer). Tauri produces ~5–10 MB binaries vs Electron's ~150 MB but requires shipping a Node sidecar for the agent loop and re-architecting IPC. Resolve during planning based on bundle-size goal vs port effort.
- [Affects R8][Technical] **File-watcher choice.** `chokidar` is safer cross-platform but adds a dep; `node:fs.watch` is zero-dep but has known platform quirks. Pick during planning.
- [Affects R3][Technical] **Lock file format and stale-lock recovery.** PID + ISO timestamp; on startup, check `kill -0 <pid>` (or platform equivalent); if dead, treat as stale. Concrete recovery algorithm and edge cases (PID reuse, clock skew) during planning.
- [Affects R1][Needs research] **Repo restructure migration.** Today everything is under `src/`. Moving to `core/` + `cli/` + `electron/` touches every TS file and the existing `dist/` publish artifact. Likely needs npm workspaces (or pnpm) — pick the workspace tool and the migration sequence during planning so existing PRs don't get destroyed.
- [Affects R5][Technical] **Cmd-K command bar library.** `kbar`, custom roll, or pull from a UI kit. UX detail: fuzzy search must span sessions + commands + models in one bar.
- [Affects R7][Technical] **Distribution model.** Bundle the agent core inside the `.dmg`/`.exe` (no npm prereq, but two parallel release tracks), or require `npm i -g @ryanisavibecoder/ccr` first and have the desktop app discover it. Affects auto-update strategy too.

## Next Steps

→ `/ce:plan` for structured implementation planning.
