# Claude (myself) — Units 3, 4, 7, 9 (Vercel architecture)

**Model:** Opus 4.7 for #3, #4, #7. Sonnet 4.6 for #9.
**Plan reference:** `docs/plans/2026-04-30-001-feat-ccr-managed-service-plan.md`

> **Architecture note:** Pivoted from Firebase Cloud Functions to Vercel API routes (Cloud Functions require the paid Blaze plan for outbound HTTP). All backend logic now lives in `web/app/api/...` next to the website. Firebase still owns Auth + Firestore.

## How to invoke
Tell me to work on the Claude-assigned units in this order:

1. **Unit 3** — Auth API routes in `web/app/api/v1/signupOrLogin/route.ts` and `web/app/api/v1/exchangeFirebaseToken/route.ts` + `web/lib/firebase-admin.ts` + `web/lib/token.ts`
2. **Unit 4** — Proxy route at `web/app/api/v1/chat/completions/route.ts` + `web/lib/quota.ts`. Move providers from `service/functions/src/providers/` to `web/lib/providers/`.
3. **Unit 7** — CLI browser auth: `src/auth/browser.ts` + modifications to `src/cli.ts`
4. **Unit 9** — Switch CLI to managed proxy + quota display: modify `src/agent.ts`, `src/config.ts`, `src/app.tsx`, README

## Standing instructions
- Use `~/.ccr/auth.json` (mode 0600) for token storage
- All Firestore writes go through transactions where there's a read-then-write
- Never log tokens — hash before logging
- Use `firebase-admin` with service account from `FIREBASE_ADMIN_SDK_KEY` env var (JSON string)
- Use `runtime = 'nodejs'` on all API routes (Admin SDK doesn't run on Edge)
- For #9: keep `GROQ_API_KEY` env var path as escape hatch with deprecation warning

## Critical interface contracts I own
- **API routes:** `POST /api/v1/signupOrLogin`, `POST /api/v1/exchangeFirebaseToken`, `POST /api/v1/chat/completions`
- **Auth header format:** `Authorization: Bearer <ccr-token>` (32 hex bytes)
- **Quota response headers:** `X-CCR-Quota-Used`, `X-CCR-Quota-Limit`, `X-CCR-Quota-Reset` (ISO timestamp)
- **Token storage shape:** `~/.ccr/auth.json` = `{ "token": "...", "endpoint": "https://ccr.vercel.app", "email": "..." }`
- **Provider router import path:** `@/lib/providers` (after move from `service/functions/src/providers/`)

## Files I will create / modify in `web/`

```
web/
├── app/api/v1/
│   ├── signupOrLogin/route.ts          # Unit 3
│   ├── exchangeFirebaseToken/route.ts  # Unit 3
│   └── chat/completions/route.ts       # Unit 4
├── lib/
│   ├── firebase-admin.ts               # Unit 3 (Admin SDK init)
│   ├── token.ts                        # Unit 3 (gen + hash)
│   ├── quota.ts                        # Unit 4 (check + atomic increment)
│   └── providers/                      # Unit 4 (moved from service/)
└── package.json                        # add firebase-admin dep
```

## Files I will modify in CLI (`src/`)

```
src/
├── auth/browser.ts                     # Unit 7 (new file)
├── cli.ts                              # Units 7 + 9
├── config.ts                           # Unit 9 (load auth.json)
├── agent.ts                            # Unit 9 (use managed proxy)
└── app.tsx                             # Unit 9 (quota display)
```

These are the contracts Codex's Unit 5 and Unit 8 need to match.
