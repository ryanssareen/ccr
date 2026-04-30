---

0title: "feat: CCR Managed Service — Free signup-based access with multi-provider LLM routing"
type: feat
status: active
date: 2026-04-30
---

# CCR Managed Service Plan

## Overview

Transform CCR from a "bring-your-own-Groq-key" CLI into a managed service where users sign up (CLI or web), get auto-provisioned access to a multi-provider LLM proxy, and operate under per-user quotas. The service stays free for end users by aggregating free tiers across multiple LLM providers (Groq, Together AI, Cerebras, OpenRouter) and enforcing per-user limits to prevent abuse.

The CLI becomes the primary entry point: first-run triggers an interactive signup flow (browser OAuth or terminal email/password), stores a CCR token locally, and routes all LLM requests through the managed proxy. A simple companion website handles signup/login and displays usage.

## Problem Frame

Currently, CCR requires every user to create a Groq account and configure `GROQ_API_KEY`. This friction blocks adoption — most users won't complete the setup. Inspired by OpenCode Zen and Junie, the goal is to remove the API key requirement entirely while keeping the service free.

The core tension: free LLM API tiers are rate-limited per organization, not per user. A naive single-key proxy caps the entire service at one provider's free quota (~14,400 req/day on Groq). Multi-provider routing distributes load across providers' free tiers legitimately (without ToS violations from creating alt accounts).

## Requirements Trace

- **R1.** Users can sign up via CLI (interactive flow) without leaving the terminal
- **R2.** Users can sign up via website (login/signup pages)
- **R3.** Auth supports both email/password and GitHub OAuth
- **R4.** New users get auto-provisioned access — no API key management UI, no manual setup
- **R5.** Service uses multiple LLM providers internally; users see one unified `ccr` experience
- **R6.** Per-user request quotas tracked and enforced (default: 2,000 req/month)
- **R7.** Users receive warnings at 80% quota, hard-block at 100%
- **R8.** CLI shows quota state inline (current usage, warning when near limit)
- **R9.** Website displays user's current usage
- **R10.** Service stays free for end users (no billing flows)

## Scope Boundaries

**In scope:**
- Firebase Auth (email/password + GitHub OAuth)
- Firestore for user accounts + usage counters
- Cloud Functions for proxy + rate limiting
- Multi-provider LLM router (Groq, Together AI, Cerebras, OpenRouter)
- Static/Next.js website with auth + minimal dashboard
- CLI signup: browser-based (default) + terminal fallback

**Out of scope:**
- API key management UI (one auto-generated token per user, no rotation needed)
- Paid tiers / billing (future)
- Admin dashboard (use Firebase console directly)
- Custom OAuth provider (rely on Firebase's built-in GitHub provider)
- Multi-org / team accounts
- Cross-device session sync beyond simple token storage
- Self-hosted deployment option

## Context & Research

### Relevant Code and Patterns

- **CLI structure** — `src/cli.ts` parses args and routes to interactive UI or one-shot mode; `src/app.tsx` is the Ink REPL. The signup flow needs to slot in before the existing API key check in `src/agent.ts` / `src/config.ts`.
- **Config loading** — `src/config.ts` currently reads `GROQ_API_KEY` from env or `~/.ccr/config.json`. Extend this to read a CCR auth token + endpoint URL.
- **OpenAI SDK usage** — `src/agent.ts` uses the OpenAI client pointed at Groq's base URL. We swap the base URL to the managed proxy and pass the CCR token as the bearer.
- **Session persistence** — `src/session.ts` stores sessions in `~/.ccr/sessions/`. Auth token storage follows the same pattern: `~/.ccr/auth.json`.

### External References

- **Groq free tier**: 30 RPM, 14,400 RPD (llama-3.1-8b), 1,000 RPD (llama-3.3-70b) — per-org ([Groq Rate Limits](https://console.groq.com/docs/rate-limits))
- **Firebase Auth GitHub provider**: built-in OAuth flow, supports popup + redirect modes
- **Firebase Functions rate limiter**: [firebase-functions-rate-limiter](https://www.npmjs.com/package/firebase-functions-rate-limiter) for per-user request capping
- **Multi-provider patterns**: OpenCode Zen and Junie use provider routing; OpenRouter is the canonical reference for unified API surface
- **CLI browser auth pattern**: `gh auth login` model — CLI starts local callback server, opens browser, captures redirect with code

### External Provider Free Tiers (estimated, must be verified at build time)

| Provider | Models | Free RPD | Free RPM |
|----------|--------|----------|----------|
| Groq | Llama 3.1/3.3, Mixtral | 14,400 (8B) / 1,000 (70B) | 30 |
| Together AI | Llama, Mixtral, Qwen | ~60 RPM (token-capped) | 60 |
| Cerebras | Llama 3.1/3.3 | ~14,400 | 30 |
| OpenRouter | Aggregated free models | Varies | Varies |

Combined: enough headroom for ~500–1,000 active users on free tiers if traffic is well-distributed.

## Key Technical Decisions

- **Firebase Auth + Firestore on free Spark tier; proxy runs on Vercel** — Cloud Functions require the paid Blaze plan for outbound HTTP calls (the proxy needs to reach Groq/Together/etc.). Vercel's free Hobby tier allows outbound HTTP from API routes. So: Firebase keeps auth + database (free); Vercel hosts the website + proxy as Next.js API routes (also free). Everything stays free for end users and the operator.

- **Next.js API routes for the proxy (not Cloud Functions)** — The proxy endpoint validates tokens, enforces quotas, selects a provider, makes the upstream call, and returns the response. Lives in `web/app/api/v1/` alongside the website. Provider API keys stored in Vercel env vars; Firestore accessed via `firebase-admin` with a service account.

- **Token-based auth for CLI, not Firebase ID tokens directly** — Firebase ID tokens expire in 1 hour; refreshing them from a CLI is awkward. Instead, on signup the function mints a long-lived CCR token (random opaque string) stored hashed in Firestore. CLI passes it as `Authorization: Bearer <ccr-token>`. Web uses Firebase ID tokens normally.

- **Multi-provider router with weighted round-robin** — Provider selection prefers cheapest/fastest with available capacity. Failures fall through to the next provider. Provider state (current QPS, recent errors) cached in Firestore + in-memory.

- **Per-user quota in Firestore, decremented atomically** — Each request increments a monthly counter on the user doc using `FieldValue.increment(1)`. Enforced server-side; client display is informational. Counter resets monthly via scheduled Cloud Function.

- **80% warning via response header** — Proxy includes `X-CCR-Quota-Used`, `X-CCR-Quota-Limit`, `X-CCR-Quota-Reset` headers on every response. CLI displays warnings when used > 80% × limit.

- **CLI browser auth via local callback server** — Following the `gh` pattern: CLI starts an ephemeral HTTP server on `localhost:<random-port>`, opens browser to website with `?cli_redirect=http://localhost:<port>`, website redirects back with token after auth. Falls back to terminal email/password prompt if `--no-browser` or browser unavailable.

- **Project structure** — Three top-level directories: `src/` (existing CLI, npm-published), `web/` (Next.js project deployed to Vercel — website + API routes + provider router), `service/` (Firebase project config: rules + indexes only, no functions on free tier).

## Open Questions

### Resolved During Planning

- **Backend stack**: Firebase (decided)
- **Quota size**: 2,000 req/month/user default, configurable in Firestore (decided based on Groq free tier × estimated user count)
- **CLI auth UX**: browser-default with terminal fallback (decided)
- **Multi-provider vs single-Groq**: multi-provider from MVP (decided to avoid ToS issues)
- **Token format**: opaque random string (32 bytes hex), hashed at rest (decided)

### Deferred to Implementation

- **Provider selection algorithm details** — Initial implementation: simple weighted random with health-check fallback. Refinement (latency-based routing, cost optimization) deferred until usage data exists.
- **Exact website framework** — Next.js 15 (App Router) is most familiar per CLAUDE.md, but a static site with Firebase Auth UI library may be simpler. Decide during Phase 3.
- **Quota reset timing** — Calendar-month reset (1st of month UTC) vs rolling 30-day window. Defer to Cloud Function implementation; calendar-month is simpler.
- **Domain name** — Pick during deployment (`ccr.dev`, `getccr.io`, `tryccr.com`, etc. — needs availability check)
- **Token revocation** — Out of scope for MVP. If a token is compromised, user can sign up again; old token gets invalidated by deleting the user doc.

## High-Level Technical Design

> *This illustrates the intended architecture and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌─────────────────┐                       ┌──────────────────┐
│   CCR CLI       │                       │   ccr-web (Next) │
│  (npm package)  │                       │   Login/Signup   │
└────────┬────────┘                       └────────┬─────────┘
         │                                         │
         │ Authorization: Bearer <ccr-token>       │ Firebase Auth
         │                                         │ (email + GitHub)
         ▼                                         ▼
   ┌──────────────────────────────────────────────────────┐
   │       Firebase Cloud Functions (proxy.ts)            │
   │  ┌────────────────────────────────────────────────┐  │
   │  │ 1. Validate token (hash lookup in Firestore)   │  │
   │  │ 2. Check quota (atomic read)                   │  │
   │  │ 3. Select provider (weighted router)           │  │
   │  │ 4. Make upstream call                          │  │
   │  │ 5. Increment usage (atomic write)              │  │
   │  │ 6. Return response + quota headers             │  │
   │  └────────────────────────────────────────────────┘  │
   └──────────┬───────────────────────────────────────────┘
              │
              ├─── Groq API
              ├─── Together AI
              ├─── Cerebras
              └─── OpenRouter
                          ▲
                          │
              ┌───────────┴────────────┐
              │   Firestore            │
              │  /users/{uid}          │
              │    - email, provider   │
              │    - tokenHash         │
              │    - quotaUsed, limit  │
              │    - quotaResetAt      │
              │  /providers/{name}     │
              │    - apiKey (encrypted)│
              │    - healthState       │
              └────────────────────────┘
```

**Auth flows:**

CLI browser flow:
```
ccr login → starts http://localhost:<port>/callback
         → opens https://ccr-web/cli-auth?port=<port>
         → user signs in (Firebase Auth)
         → web redirects to localhost with ?token=<ccr-token>
         → CLI saves to ~/.ccr/auth.json
```

CLI terminal flow:
```
ccr login --terminal
  → prompt: email
  → prompt: password (masked)
  → POST /signupOrLogin → { ccrToken }
  → save ~/.ccr/auth.json
```

## Implementation Units

### Phase 1: Foundation

- [ ] **Unit 1: Firebase project setup and Firestore schema**

**Goal:** Create the Firebase project, enable required services, and define the Firestore data model.

**Requirements:** R3, R4, R6

**Dependencies:** None

**Files:**
- Create: `service/firebase.json`
- Create: `service/firestore.rules`
- Create: `service/firestore.indexes.json`
- Create: `service/.firebaserc`
- Create: `service/README.md` (setup instructions)

**Approach:**
- Create new Firebase project (`ccr-managed` or similar)
- Enable Authentication → Email/Password + GitHub providers (configure GitHub OAuth app, store client ID/secret in Firebase config)
- Enable Firestore (Native mode, multi-region for resilience)
- Define collections:
  - `/users/{uid}`: `email`, `displayName`, `provider`, `tokenHash`, `quotaUsed`, `quotaLimit`, `quotaResetAt`, `createdAt`
  - `/providers/{name}`: `apiKey` (Cloud Functions config, NOT in Firestore for security), `enabled`, `weight`, `healthState`, `lastCheckedAt`
- Security rules: users can read their own `/users/{uid}` doc, no one can write directly (functions only)

**Patterns to follow:**
- Standard Firebase project layout (Firebase docs)

**Test scenarios:**
- Happy path: Firestore rules deny unauthenticated reads to `/users/{uid}` from another user
- Edge case: Rules deny writes from any client SDK (functions-only path)

**Verification:**
- `firebase deploy --only firestore:rules` succeeds
- Manual test in Firebase console: querying another user's doc as authenticated user is denied

---

- [ ] **Unit 2: Provider abstraction layer**

**Goal:** Build a backend module that exposes a unified chat-completion interface across Groq, Together AI, Cerebras, and OpenRouter.

**Requirements:** R5

**Dependencies:** Unit 1

**Files:**
- Create: `service/functions/src/providers/index.ts` (router + selection logic)
- Create: `service/functions/src/providers/groq.ts`
- Create: `service/functions/src/providers/together.ts`
- Create: `service/functions/src/providers/cerebras.ts`
- Create: `service/functions/src/providers/openrouter.ts`
- Create: `service/functions/src/providers/types.ts` (shared interfaces)
- Test: `service/functions/test/providers.test.ts`

**Approach:**
- Each provider exports: `name`, `chatCompletion(request) → response`, `healthCheck() → boolean`
- Router maintains weighted list of enabled providers; selects via weighted random
- On 429/5xx, mark provider unhealthy for 60s and fail through to next
- Provider keys read from Firebase Functions config (`functions.config().providers.groq.key`)
- All providers share OpenAI-compatible request shape (most do natively; OpenRouter is OpenAI-compat by default)

**Test scenarios:**
- Happy path: `chatCompletion` returns response from selected provider
- Edge case: All providers unhealthy → router returns 503 with retry-after
- Error path: One provider 429s → router falls through to next provider, request succeeds
- Integration scenario: Provider returns malformed response → router catches, marks unhealthy, retries with next

**Verification:**
- Unit tests cover selection logic and failover
- Manual integration test: deploy with real keys, run `curl` against deployed function, confirm successful completion

---

### Phase 2: Backend Auth & Proxy

- [ ] **Unit 3: Auth & user provisioning function**

**Goal:** Cloud Function that handles signup (creates Firebase user + Firestore user doc + CCR token).

**Requirements:** R1, R2, R3, R4

**Dependencies:** Unit 1

**Files:**
- Create: `service/functions/src/auth.ts` (signup, login, token exchange)
- Create: `service/functions/src/lib/token.ts` (token generation + hashing)
- Test: `service/functions/test/auth.test.ts`

**Approach:**
- HTTP function `POST /v1/signupOrLogin` accepts: `{ method: 'email'|'github', credentials }`
  - Email path: create/verify Firebase user via Admin SDK, return CCR token
  - GitHub path: receives Firebase ID token (already authenticated client-side via popup), verifies it, returns CCR token
- CCR token: 32 random bytes hex-encoded; SHA-256 hash stored in `tokenHash` field
- New users get default quota (2,000 req/month) and `quotaResetAt` set to first of next month UTC
- Function `POST /v1/exchangeFirebaseToken` for the website→CLI handoff: takes a Firebase ID token, returns CCR token (used in browser auth flow)

**Patterns to follow:**
- Firebase Admin SDK auth verification pattern from Firebase docs
- Cloud Functions onRequest handler structure

**Test scenarios:**
- Happy path: New email signup → user doc created, token returned, `quotaUsed=0`, `quotaLimit=2000`
- Happy path: Existing user login → returns same token (rotated only if explicitly requested)
- Edge case: Email already exists with different password → return auth error, no new doc created
- Error path: Invalid Firebase ID token in GitHub flow → return 401
- Error path: Malformed request body → return 400 with clear message
- Integration scenario: After signup, querying `/users/{uid}` returns the doc with hashed token (not plaintext)

**Verification:**
- Test suite passes
- Deployed function: `curl -X POST .../v1/signupOrLogin` with valid email creates Firestore doc and returns 200 with token

---

- [ ] **Unit 4: Proxy endpoint with rate limiting**

**Goal:** Cloud Function that validates CCR tokens, enforces per-user quotas, routes to providers, and tracks usage.

**Requirements:** R5, R6, R7

**Dependencies:** Unit 2, Unit 3

**Files:**
- Create: `service/functions/src/proxy.ts`
- Create: `service/functions/src/lib/quota.ts` (quota check + increment)
- Test: `service/functions/test/proxy.test.ts`

**Approach:**
- HTTP function `POST /v1/chat/completions` (OpenAI-compatible path):
  1. Extract bearer token from `Authorization` header
  2. Hash token, look up user by `tokenHash` (Firestore query with index)
  3. Check `quotaUsed < quotaLimit`; if exceeded, return 429 with `X-CCR-Quota-Reset` header
  4. Forward request to provider router (Unit 2)
  5. On success, atomic increment `quotaUsed` via `FieldValue.increment(1)`
  6. Add response headers: `X-CCR-Quota-Used`, `X-CCR-Quota-Limit`, `X-CCR-Quota-Reset`
  7. Return upstream response body unchanged
- Streaming responses: increment quota at stream start (not per-chunk); pass through SSE chunks
- Failed upstream calls: do NOT increment quota (user wasn't served)

**Execution note:** Implement quota check + increment as a single Firestore transaction to avoid race conditions on concurrent requests.

**Patterns to follow:**
- Firestore atomic transaction pattern from Firebase docs
- OpenAI-compatible streaming response handling

**Test scenarios:**
- Happy path: Valid token, under quota → 200 response, `quotaUsed` incremented by 1
- Happy path: Streaming request → SSE chunks pass through, quota incremented once at stream start
- Edge case: Two concurrent requests at quotaUsed=1999 → only one succeeds (transaction prevents over-quota)
- Edge case: Token valid but user doc missing → 401 (clear error, prompts re-signup)
- Error path: Invalid token → 401 with clear error message
- Error path: Quota exceeded → 429 with `Retry-After` and reset-at headers
- Error path: Upstream provider 500 → user gets 502, quota NOT incremented
- Integration scenario: After successful request, response includes correct quota headers (used+1, limit, resetAt)

**Verification:**
- Test suite passes including concurrency tests
- Deployed function: end-to-end curl test with real token returns 200 and headers

---

- [ ] **Unit 5: Quota reset scheduled function**

**Goal:** Reset all users' `quotaUsed` to 0 on the 1st of each month.

**Requirements:** R6

**Dependencies:** Unit 1

**Files:**
- Create: `service/functions/src/scheduled/quotaReset.ts`
- Test: `service/functions/test/quotaReset.test.ts`

**Approach:**
- Pub/Sub scheduled function with cron `0 0 1 * *` (UTC, 1st of month)
- Batch-update all user docs: `quotaUsed = 0`, `quotaResetAt = first of next month`
- Use Firestore batched writes (500 docs per batch) to handle large user counts

**Test scenarios:**
- Happy path: Function runs, all users' `quotaUsed` reset to 0
- Edge case: 1000+ users → batches correctly (no single-batch overflow)
- Error path: One batch fails → others still complete; failed batch logged for retry

**Verification:**
- Test simulates 600 user docs and verifies all reset
- Manual: trigger function via Firebase console, observe Firestore changes

---

### Phase 3: Website

- [ ] **Unit 6: Website auth pages and minimal dashboard**

**Goal:** Public site with login/signup (email + GitHub) and a logged-in page showing usage.

**Requirements:** R2, R3, R9

**Dependencies:** Unit 3

**Files:**
- Create: `web/` directory (Next.js 15 App Router)
- Create: `web/app/page.tsx` (landing)
- Create: `web/app/login/page.tsx`
- Create: `web/app/signup/page.tsx`
- Create: `web/app/dashboard/page.tsx` (shows usage)
- Create: `web/app/cli-auth/page.tsx` (CLI redirect handoff page)
- Create: `web/lib/firebase.ts` (client SDK init)
- Create: `web/lib/auth.ts` (login/signup helpers)

**Approach:**
- Use Firebase JS SDK + FirebaseUI for prebuilt auth widgets (or build minimal forms — decide during build)
- After successful Firebase auth, call `/v1/exchangeFirebaseToken` to get CCR token, store in Firestore under user doc
- Dashboard reads user doc, displays `quotaUsed / quotaLimit` and reset date
- `/cli-auth` page: reads `?cli_redirect=<localhost-url>` query param; after auth, redirects to `<cli_redirect>?token=<ccrToken>`
- Tailwind + shadcn/ui per CLAUDE.md preferences

**Patterns to follow:**
- CLAUDE.md user prefs: Server Components default, `"use client"` only when needed
- Standard Firebase Auth React patterns

**Test scenarios:**
- Happy path: New user signs up with email → redirected to dashboard, sees `quotaUsed: 0 / quotaLimit: 2000`
- Happy path: GitHub OAuth → returns to site logged in, dashboard renders
- Happy path: CLI redirect flow — visit `/cli-auth?cli_redirect=http://localhost:5050/cb`, sign in, browser redirects to localhost with token
- Edge case: User already logged in visits `/login` → redirects to `/dashboard`
- Error path: Wrong password → clear error message, no Firebase error code leaking through
- Error path: GitHub OAuth canceled → returns to login page with friendly error

**Verification:**
- Manual browser test: signup → dashboard shows usage
- Cli-auth flow: visit URL with `cli_redirect`, confirm token returned to mock localhost endpoint

---

### Phase 4: CLI Integration

- [ ] **Unit 7: CLI browser-based auth flow**

**Goal:** `ccr login` opens browser, captures token, stores it locally.

**Requirements:** R1, R3

**Dependencies:** Unit 6

**Files:**
- Modify: `src/cli.ts` (add `login` and `logout` commands)
- Create: `src/auth/browser.ts` (local callback server + browser opener)
- Modify: `src/config.ts` (read `~/.ccr/auth.json`)
- Test: `src/auth/browser.test.ts`

**Approach:**
- `ccr login` flow:
  1. Pick random port (e.g., 5050–5099 range, find one free)
  2. Start HTTP server on `localhost:<port>` with a single route `/callback`
  3. Open `https://ccr.example.com/cli-auth?cli_redirect=http://localhost:<port>/callback` via `open` package or platform fallback
  4. Wait for `/callback?token=<x>` (timeout 5 min); send "you can close this tab" HTML response
  5. Save `{ token, endpoint }` to `~/.ccr/auth.json` (mode 0600)
  6. Print: "✓ Logged in as <email>"
- `ccr logout` deletes `~/.ccr/auth.json`
- `--no-browser` flag forces fallback to terminal flow (Unit 8)

**Patterns to follow:**
- `gh auth login` for the browser handoff pattern
- Existing session storage in `src/session.ts` (file path conventions, perms)

**Test scenarios:**
- Happy path: Token received → file written with correct content + 0600 perms
- Edge case: Browser doesn't open (no DISPLAY) → fall back to terminal flow with helpful message
- Edge case: Port 5050 in use → tries next port; succeeds at 5051
- Error path: Timeout (5 min, no callback) → exit with clear error, no partial file
- Error path: Callback hits with no `token` param → exit with error
- Integration scenario: After login, `ccr` (no args) reads `~/.ccr/auth.json` and starts UI without prompting

**Verification:**
- Unit tests with mocked HTTP server + token injection
- Manual: `ccr login` from a fresh machine completes, then `ccr "hello"` works

---

- [ ] **Unit 8: CLI terminal-based auth fallback**

**Goal:** Terminal email/password prompt when browser flow isn't available.

**Requirements:** R1

**Dependencies:** Unit 3

**Files:**
- Create: `src/auth/terminal.ts` (Ink-based or readline prompts)
- Modify: `src/cli.ts` (route `--no-browser` and `--terminal` flags here)
- Test: `src/auth/terminal.test.ts`

**Approach:**
- Render Ink prompt for email (validated as RFC 5322 format)
- Render Ink password prompt (masked input, supports paste)
- POST to `/v1/signupOrLogin` with `{ method: 'email', credentials: { email, password } }`
- On success: save to `~/.ccr/auth.json` (same as browser flow)
- On 401: re-prompt with error
- No GitHub option in terminal flow (browser-required) — show message: "GitHub login requires browser; run `ccr login` (without --terminal)"

**Patterns to follow:**
- `ink-text-input` already a dependency (used in main UI)
- Same auth.json format as Unit 7

**Test scenarios:**
- Happy path: Valid creds → file written, "Logged in" message
- Edge case: Empty email → re-prompt, no API call
- Edge case: Malformed email → "invalid email format" error, re-prompt
- Error path: Wrong password → API returns 401 → "incorrect password" error, re-prompt (max 3 attempts)
- Error path: Network failure → clear error: "Cannot reach ccr service. Check connection."
- Integration scenario: After terminal signup, agent.ts uses the new token immediately

**Verification:**
- Unit tests with mocked stdin and HTTP responses
- Manual: `ccr login --terminal` works on a headless server

---

- [ ] **Unit 9: Switch CLI to managed proxy + quota display**

**Goal:** Replace direct Groq API client with managed proxy; display quota warnings inline.

**Requirements:** R5, R7, R8

**Dependencies:** Unit 7 OR Unit 8 (auth must be working)

**Files:**
- Modify: `src/agent.ts` (use `~/.ccr/auth.json` token; point base URL to proxy endpoint)
- Modify: `src/config.ts` (load endpoint from auth.json; allow `CCR_ENDPOINT` env override for dev)
- Modify: `src/app.tsx` (display quota status from response headers)
- Modify: `src/cli.ts` (if no auth.json, prompt for `ccr login`)
- Modify: `README.md` (replace "get Groq API key" with "run `ccr login`")
- Modify: `package.json` (bump version, update description)

**Approach:**
- `agent.ts`: read token from auth.json, set OpenAI client `baseURL` to `https://api.ccr.example.com/v1`, `apiKey` to CCR token
- Parse response headers (or trailing metadata for streaming) to extract quota state
- Pass quota state up to `app.tsx` via callback or context
- UI: show subtle indicator at top of REPL: `quota: 1,234 / 2,000`. When usage > 80%: yellow warning. When ≥ 100%: red banner + block (UI explains how to wait until reset).
- First-run experience: if `~/.ccr/auth.json` missing, render a friendly prompt → "Welcome to CCR! Run `ccr login` to get started." Exit cleanly.
- Backward-compat: if user sets `GROQ_API_KEY` env var explicitly, log a deprecation warning but still proceed using direct mode (escape hatch for offline / power users — defer this if scope creeps)

**Patterns to follow:**
- Existing config loading in `src/config.ts`
- Existing Ink layout in `src/app.tsx`

**Test scenarios:**
- Happy path: Authenticated, under quota → request flows through proxy, response renders, quota indicator updates
- Happy path: First run with no auth → friendly "run ccr login" message, exits 0 (not error)
- Edge case: Token invalid (e.g., user revoked / Firestore wiped) → 401 from proxy → CLI shows "Session expired, run `ccr login` again"
- Edge case: At 80% quota → yellow warning visible in UI
- Error path: Quota exceeded (429 from proxy) → red banner with reset date, request blocked, no spinner hang
- Error path: Network failure to proxy → "service unreachable" error, no crash
- Integration scenario: Run `ccr "test"` end-to-end on real deployment, observe response and quota header

**Verification:**
- Manual end-to-end: fresh user signs up → uses CLI → sees quota counter increment
- Test that quota warning thresholds render correctly at 80% and 100%

---

## System-Wide Impact

- **Interaction graph:** CLI no longer talks directly to Groq; all LLM calls go through Firebase Cloud Function. Adds a hop (latency +50–200ms typical for Cloud Functions cold start; mitigate with min-instances=1).
- **Error propagation:** Provider failures must surface as meaningful errors to CLI (not raw 500s). Add error mapping layer in `proxy.ts` that translates upstream errors to friendly CCR errors.
- **State lifecycle risks:** Quota counter is a hot write target — concurrent requests need transactional increments to prevent over-quota. Streaming requests increment once at start; if stream fails mid-way, no rollback (acceptable trade-off for free tier).
- **API surface parity:** CLI's existing `--model` flag still works; proxy must accept and forward the model name. Add allowlist of supported models in proxy to prevent users requesting expensive paid models.
- **Integration coverage:** End-to-end test from CLI → proxy → real provider → response is essential. Mocked tests alone won't catch auth header issues, header parsing, or streaming edge cases.
- **Unchanged invariants:** CLI's interactive UI, slash commands, session save/restore, and tool-calling all stay identical. Only the underlying LLM transport changes.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Provider free tiers change pricing or revoke free access | Multi-provider design isolates blast radius; can disable one and continue. Monitor provider announcements. |
| Cold-start latency makes CLI feel slow | Set Cloud Function `min_instances=1` (small ongoing cost — accept as part of running the service). |
| Token leakage in logs / error messages | Audit log statements; never log full tokens. Hash before logging. Tokens in `~/.ccr/auth.json` saved with mode 0600. |
| Quota counter race conditions | Firestore transactions for read-then-write of quota; documented in Unit 4. |
| Single user spams the service to exhaust shared provider quotas | Per-user quotas enforce upper bound. If still problematic, add daily sub-quota or burst protection (deferred). |
| Firestore costs scale with users | Firestore free tier = 50K reads/day. At 200 active users × 50 req/day = 10K writes/day. Within free tier. Re-evaluate at 500+ users. |
| GitHub OAuth app suspension | Have a backup OAuth client ID configured but unused; document failover steps. Defer real implementation until needed. |
| Service downtime kills CLI | Document `CCR_ENDPOINT` env var override + bring-your-own-key fallback in README so users can self-rescue. |

## Documentation / Operational Notes

- **README rewrite** — Replace API-key setup with "run `ccr login`" as the primary path; keep BYOK as an advanced option.
- **Service deployment guide** — `service/README.md` with steps: create Firebase project, enable services, set provider keys via `firebase functions:config:set`, deploy.
- **Status page** — Defer to post-MVP. For now, document a simple monitoring approach via Firebase console + Cloud Function logs.
- **Provider key rotation** — Document the `firebase functions:config:set` workflow for rotating provider API keys without redeployment.
- **Cost monitoring** — Set Firebase budget alert at $5/month; investigate any spikes immediately.

## Sources & References

- Origin: User conversation establishing decisions (Firebase, multi-provider, both CLI auth modes, free service)
- [Groq Rate Limits](https://console.groq.com/docs/rate-limits)
- [Firebase Auth GitHub Provider](https://firebase.google.com/docs/auth/web/github-auth)
- [firebase-functions-rate-limiter](https://www.npmjs.com/package/firebase-functions-rate-limiter)
- [OpenCode Zen](https://opencode.ai/docs/zen/) — reference for managed-key model
- [Junie BYOK](https://junie.jetbrains.com/docs/byok.html) — reference for hybrid auth
- [GitHub CLI auth flow](https://github.com/cli/cli) — reference for CLI browser-based auth
- Existing CCR codebase: `src/cli.ts`, `src/agent.ts`, `src/config.ts`, `src/session.ts`
