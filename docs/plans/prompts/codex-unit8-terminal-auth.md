# Codex Brief — Unit 8: CLI Terminal Auth Fallback

**Model:** GPT-5-Codex
**Working directory:** `/Users/ryan/Documents/ccr` (the existing CLI project)
**Goal:** Add a terminal-based email/password auth fallback for when browser-based auth (Unit 7) isn't available. User runs `ccr login --terminal` and types credentials directly into Ink prompts.

---

## Context

CCR is moving to a managed-service auth model. The default `ccr login` opens a browser (built separately as Unit 7). This unit is the **fallback** for headless servers, SSH sessions, or `--no-browser` flag.

The CLI already uses Ink (React for terminals) and `ink-text-input`. Use those — don't add new TUI deps.

After successful auth, write `~/.ccr/auth.json` in the same format Unit 7 uses, so the rest of the CLI works regardless of which auth path was taken.

---

## Files to create / modify

- **Create:** `src/auth/terminal.ts`
- **Create:** `src/auth/terminal.test.ts`
- **Modify:** `src/cli.ts` — route `--terminal` and `--no-browser` flags to this module

Existing files to read first:
- `src/cli.ts` — see how flags and subcommands are parsed
- `src/app.tsx` — example of `ink-text-input` usage
- `src/session.ts` — example of writing files to `~/.ccr/`

---

## Interface contract (must match Unit 7)

After successful login, write `~/.ccr/auth.json`:
```json
{
  "token": "<32-hex-chars-from-server>",
  "endpoint": "https://ccr.vercel.app",
  "email": "user@example.com"
}
```

File mode: `0600` (user read/write only).

---

## API contract

POST to `${endpoint}/api/v1/signupOrLogin` with:
```json
{
  "method": "email",
  "credentials": { "email": "...", "password": "..." }
}
```

> **Note:** The proxy moved from Firebase Cloud Functions to Vercel API routes. The path is now `/api/v1/signupOrLogin` (was `/v1/signupOrLogin`). Default endpoint is the Vercel deployment URL — the user will set `CCR_ENDPOINT` env var to override during dev (`http://localhost:3000` for local Next.js).

Server responses:
- **200** — `{ "token": "<hex>", "email": "..." }` → save and exit successfully
- **401** — `{ "error": "invalid credentials" }` → re-prompt (max 3 attempts)
- **400** — `{ "error": "<message>" }` → show error, exit
- **5xx / network failure** — show "Cannot reach ccr service" and exit non-zero

The endpoint URL defaults to `https://ccr.vercel.app` (placeholder — final domain TBD) but accept override via `CCR_ENDPOINT` env var.

---

## UX flow

```
$ ccr login --terminal

CCR sign in / sign up

Email:    █
Password: ●●●●●●●●

✓ Logged in as user@example.com
```

Behavior:
1. Email prompt — validate as RFC 5322 (use simple regex, not full validator)
2. Password prompt — masked input (`ink-text-input` supports `mask="●"`)
3. POST to API
4. Show spinner while waiting
5. On 401: clear error, re-prompt password (max 3 attempts; on 4th failure, exit)
6. On success: write auth.json, print "✓ Logged in as <email>"
7. On network failure: print error, exit 1

GitHub OAuth is **not** available in terminal mode. If user passes `--method github` with `--terminal`, print: "GitHub login requires a browser. Run `ccr login` (without --terminal)."

---

## Test scenarios

Use `ink-testing-library` (add as devDep if not present) and mock `fetch`.

```typescript
describe('terminal auth', () => {
  // Happy path
  it('prompts for email + password and writes auth.json on success', async () => { ... });
  it('uses CCR_ENDPOINT env var when set', async () => { ... });

  // Validation
  it('rejects empty email and re-prompts', async () => { ... });
  it('rejects malformed email and re-prompts', async () => { ... });

  // Auth failure
  it('shows "incorrect password" on 401 and re-prompts', async () => { ... });
  it('exits with non-zero after 3 failed password attempts', async () => { ... });

  // Network errors
  it('shows "cannot reach service" on fetch rejection', async () => { ... });
  it('handles 5xx gracefully', async () => { ... });

  // File output
  it('writes auth.json with mode 0600', async () => { ... });
  it('writes correct token, endpoint, email fields', async () => { ... });

  // Edge: GitHub method in terminal mode
  it('prints helpful error when --method github is combined with --terminal', async () => { ... });
});
```

---

## Don't do

- Do NOT add a new prompt library — use the existing `ink-text-input`
- Do NOT implement the browser flow (Unit 7 owns that)
- Do NOT add password strength validation (server's job)
- Do NOT log passwords, even in error messages or debug output
- Do NOT touch any files outside `src/auth/` or `src/cli.ts`
- Do NOT change the existing `agent.ts` config-loading logic — Unit 9 handles that

---

## Done when

- [ ] `terminal.ts` exists, compiles via `npx tsc --noEmit`
- [ ] All test scenarios pass
- [ ] `ccr login --terminal` works end-to-end against a mocked API
- [ ] `~/.ccr/auth.json` written with correct shape and 0600 perms
- [ ] Re-prompts and errors render cleanly in Ink (no React warnings)
