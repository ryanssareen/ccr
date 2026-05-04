---
date: 2026-05-03
topic: open-ideation
focus: open-ended (DX, agent capability, reliability, distribution, knowledge compounding)
---

# Ideation: Open-ended improvement directions for CCR

## Codebase Context

**Project shape.** TypeScript npm-workspaces monorepo. Three frontends + one backend:
- `packages/core` — shared agent runtime: `agent.ts`, `tools.ts`, `session.ts`, `session-watcher.ts`, `session-lock.ts`, `config.ts`, `known-models.ts`. Single source of truth used by both CLI and Electron.
- `packages/cli` — Ink-based React TUI; published as `@ryanisavibecoder/ccr`.
- `packages/electron` — desktop app (electron-vite + vitest), Firebase JS SDK in renderer + chokidar watcher in main. Just shipped first arm64 ad-hoc-signed DMG.
- `web/` — Next.js 15 marketing/auth/dashboard. Firebase ID-token-exchange handshake at `/cli-auth`.
- `service/functions/` — Firebase Cloud Functions backend (proxy + quota + auth).

**Notable conventions.** Auth via `~/.ccr/auth.json` (browser OAuth → CCR token exchange). Sessions persisted as JSON in `~/.ccr/sessions/`. Read-only tools auto-allowed; mutations require per-call approval. Free tier 2k req/month with quota in response headers. Dated planning docs in `docs/plans/` show structured spec-first workflow.

**Pain points / gaps.**
- README explicitly admits: no memory distillation, no cross-project recall, no learning loop.
- No root `AGENTS.md` — repo doesn't dogfood its own context convention.
- Three surfaces re-implement model lists / auth flows / IPC types — drift risk compounding every release.
- Electron `known-models.ts` already duplicated from core — proof drift is starting.
- No top-level CI; tests per-workspace.
- Distribution just started: arm64 unsigned (now ad-hoc signed) DMG, no x64 / Windows / Linux / auto-update.

**Past learnings.** `docs/solutions/` does not exist — clean slate. Closest priors are `docs/brainstorms/` and `docs/plans/`.

## Ranked Ideas

### 1. Session journal as event-log substrate (memory + policy + undo + eval)
**Description.** Treat `~/.ccr/sessions/*.json` as a first-class append-only event log with multiple consumers:
- (a) background distiller drafts per-project `AGENTS.md` and global `~/.ccr/memory.md` from past turns
- (b) policy learner watches your approvals → proposes per-tool/per-project allowlists
- (c) snapshotter shadow-commits every agent mutation → enables `ccr undo`
- (d) replay harness re-runs old prompts against new model versions → eval substrate before shipping prompt changes

**Rationale.** README explicitly admits "no memory distillation, no cross-project recall." All four consumers live atop the same data already being written. One substrate, four flywheels — each session makes the next better forever after. Highest-leverage idea by a wide margin and the one most aligned with CCR's "vibe code, free" wedge.

**Downsides.** Privacy — synthesizing user code/prompts; need clear off-switch and local-only default. Distiller quality bar is high (bad memory is worse than none). Scope creep risk — pick one consumer to ship first.

**Confidence:** 85%
**Complexity:** High (but slices ship independently)
**Status:** Unexplored

### 2. Learning approval policies + diff-rich hunk-level previews
**Description.** Two layered moves on the existing approval gate:
- (i) replace the yes/no for `write_file` with a unified diff renderer supporting y/n/edit per hunk
- (ii) persist decisions per `tool + arg-pattern` (e.g. `bash:git status*`, `read:src/**`); after N repeats prompt to install the rule into `.ccr/allow.toml`. Novel tool shapes still gate; familiar ones flow.

**Rationale.** Per-call approval is the #1 friction in agentic CLIs and the reason power users disable it (unsafe). Most approvals are repeats of safe shapes. Diff-rich previews convert a hesitation into a confident keypress; learned policies make that keypress disappear over time.

**Downsides.** Pattern matching for shell is genuinely hard ("git status *" is fine; "git push *" usually isn't). Need conservative defaults + dry-run for shell.

**Confidence:** 90%
**Complexity:** Medium
**Status:** Unexplored

### 3. `@ccr/contracts` — single source of truth across the three surfaces
**Description.** Hoist the duplicated triplet (model lists, IPC types, auth shapes, system prompts, tool-call schemas) out of CLI/Electron/Web into a versioned `packages/contracts`. Web fetches a generated JSON manifest at build; Electron + CLI import types directly. Adding a model becomes a 1-line PR.

**Rationale.** Three surfaces re-implement model lists / auth flows / IPC types. Today, adding a model anywhere requires touching three places — and the marketing site can silently lag the CLI. Every future feature inherits this fix. Low-risk hygiene with high compounding payoff.

**Downsides.** Touches all three packages — coordinated PR risk. Mostly internal hygiene; users see nothing immediately.

**Confidence:** 95%
**Complexity:** Low–Medium
**Status:** Unexplored

### 4. Quota-aware adaptive router (incl. killing the model picker)
**Description.** Use the existing `X-CCR-Quota` headers as a first-class signal in `@ccr/core`. Cheap intents (commit messages, filename suggestions, summaries) route to small models; reasoning routes to large. As monthly burn approaches the cap, the router silently down-routes instead of hard-failing. The CLI/Electron model picker becomes a footer that shows what was chosen and a hotkey to override — never a dropdown the user has to think about.

**Rationale.** Free tier is the wedge but users either hit caps or don't *feel* the freedom. Quota data already exists; it's just unused. Inverts the model-picker tax. Compounds: every future feature inherits the routing.

**Downsides.** "Right" model per intent is fuzzy; needs prompt-shape heuristics + a fallback. Overrides need to feel cheap or power users will revolt.

**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 5. Auto-resume + shadow-git checkpoint/undo
**Description.** Two complementary moves:
- (i) `ccr` in a directory implicitly continues that cwd's last session — kill the "new session?" question for 95% of cases
- (ii) before every mutation batch, snapshot the working tree to a `refs/ccr/<session>/<turn>` shadow ref. `ccr undo` rewinds the last agent turn cleanly; the Electron app gets a timeline scrubber for branch-and-explore.

**Rationale.** `session-watcher.ts` + `session-lock.ts` + sessions on disk already exist — substrate is half-built. Crash recovery + reversible mutations are why people *trust* an agent on real code. The timeline scrubber is also a unique product framing nobody owns.

**Downsides.** Shadow refs need careful interaction with user's git workflow (don't pollute log/reflog). Big edits = big snapshots; need GC.

**Confidence:** 80%
**Complexity:** Medium–High
**Status:** Unexplored

### 6. MCP client support
**Description.** Add a Model Context Protocol client to `@ccr/core` so users plug in Postgres / Linear / Sentry / Playwright / their own internal servers via `~/.ccr/mcp.json`. CCR ships a small set of built-in tools; everything else is BYO.

**Rationale.** MCP is now table stakes (Claude Code, Cursor, Cline). Without it CCR can't match competitors on tool breadth, and enterprise users can't bring internal tools. The current closed `tools.ts` registry is the limiting factor.

**Downsides.** MCP servers run subprocesses — security/sandboxing matters. Spec is moving; lock to a stable version. Some onboarding cost (users have to know what MCP is).

**Confidence:** 85%
**Complexity:** Medium
**Status:** Unexplored

### 7. Background watch-mode (`ccr watch`) — ambient pair programmer
**Description.** A daemon mode using the existing chokidar watcher to: detect file changes → run user-defined check (tests, typecheck, lint) → on failure, spawn an agent to draft a fix as a *pending review* in the Electron app's tray. User glances over, approves or dismisses. CCR moves from synchronous chat to ambient.

**Rationale.** Every primitive exists already (chokidar in Electron main, agent-host, approval gates, sub-agents would slot in). No major competitor does ambient-test-fix well — and Electron + tray icon is a visual surface a CLI can't match.

**Downsides.** False-positive fixes are demoralizing. Need to keep the daemon cheap (idle should consume nothing). Definitely behind a toggle.

**Confidence:** 70%
**Complexity:** Medium
**Status:** Unexplored

## Cross-cutting synergies

- **#1 (event log) + #2 (policy learning)** — the policy learner is one of the four consumers in #1; shipping #1's substrate first makes #2 cheap.
- **#3 (contracts) + future cross-surface session sync** — once contracts lands, syncing sessions across CLI/Electron/Web becomes a small follow-up.
- **#5 (shadow-git undo) + #7 (watch mode)** — the watch mode's auto-fixes are only safe if undo is reversible; #5 unlocks #7's autonomy.

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| R1 | Trust budget for autonomous runs | Overlaps #2's compounding curve; weaker grounding (no clear UX shape) |
| R2 | `curl \| sh` installer + lazy Electron | Real install pain is Electron's, not CLI's; marginal vs proper signing |
| R3 | Device-bound ephemeral auth (no auth.json) | Burden very high (keychain across CLI + Electron + cross-machine sync); auth.json works |
| R4 | Streaming heartbeat + token meter | Real pain but too tactical for ideation; ship it inline |
| R5 | Cross-surface session sync via Firebase | Strong but depends on #3 (contracts) landing first; defer to follow-up |
| R6 | Sub-agent / parallel task spawning | Strong but most leverage requires #1 to feed sub-agent context |
| R7 | Multi-file semantic search (embeddings) | Well-trodden; real index-management cost; marginal vs grep on most repos |
| R8 | Shell replacement (CCR-as-shell) | Speculative; high failure rate; not grounded in current shape |
| R9 | Multiplayer repo daemon (CI/webhook/SMS clients) | Premature; rebuild on this AFTER #5 lands |
| R10 | Bartered-compute co-op (idle laptops) | Operational complexity huge; far from current shape |
| R11 | Community intent/recipe registry | Network-effect dependent; no user base yet |
| R12 | Spectator-mode streaming sessions | Interesting reframe, no repo-grounded entry point |
| R13 | Signed + notarized + Sparkle auto-update | Real but a checkbox-and-pay-Apple, less idea-shaped |
| R14 | `ccr doctor` + error→action remediation | Tactical; cheap, can ship inline anytime |
| R15 | Hot model-swap mid-conversation | Subsumed by #4's adaptive router |
| R16 | Auto-detect AGENTS.md scaffolding (standalone) | Subsumed by #1's distiller |
| R17 | Resumable sessions (standalone) | Subsumed by #5 |
| R18 | Memory layer (standalone) | Subsumed by #1 |
| R19 | Apprentice / skill-tree framing | Subsumed by #1 + #2 (same mechanism, less marketing) |
| R20 | Time machine / timeline scrubber (standalone) | Subsumed by #5's Electron UI |
| R21 | Shared model registry (standalone) | Subsumed by #3 |
| R22 | One generated IPC schema (standalone) | Subsumed by #3 |
| R23 | Prompt fragment library hot-reload | Subsumed by #3 |
| R24 | Quota disappears — predictive throttle | Subsumed by #4 |
| R25 | Streaming token budget UI | Subsumed by #4 |
| R26 | Tool-call telemetry replay harness | Subsumed by #1's eval consumer |

## Session Log
- 2026-05-03: Initial ideation — 43 raw candidates across 5 frames (pain/friction, missing-capability, inversion/automation, reframing, leverage/compounding) → 23 unique after dedup → 7 survivors after rubric pass. Heavy clustering around (a) memory/learning substrate, (b) approval/trust UX, (c) cross-surface unification.
