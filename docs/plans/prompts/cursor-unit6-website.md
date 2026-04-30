# Cursor Brief — Unit 6: CCR Website (login / signup / dashboard / cli-auth)

**Model selection in Cursor:**
- Use **Auto** (cheap default) for routine UI work — Tailwind classes, layout, components
- Switch to **Claude Sonnet 4.6** *only* for the `/cli-auth` redirect logic (the trickiest part)

**Working directory:** `/Users/ryan/Documents/ccr/web/` (create if missing)
**Goal:** Build the public website that handles signup, login, a minimal dashboard showing usage, and the CLI auth handoff page.

---

## Context

CCR is becoming a managed service. Users sign up either via CLI (handled by Units 7/8) or via this website. The site also serves as the OAuth callback target for the CLI's browser-based login flow — that's the `/cli-auth` page.

The website is small. Five pages total. Don't over-engineer it.

---

## Stack

- **Next.js 15** (App Router, TypeScript strict)
- **TailwindCSS** + **shadcn/ui** components
- **Firebase JS SDK** (`firebase` package) for client-side auth
- **Server Components by default**; `"use client"` only for the auth pages

These match the user's defaults in `~/.claude/CLAUDE.md`.

---

## Files / pages to create

```
web/
├── app/
│   ├── layout.tsx                   # root layout, Tailwind setup
│   ├── page.tsx                     # landing page (simple hero + "Get started" → /signup)
│   ├── login/page.tsx               # email + GitHub login
│   ├── signup/page.tsx              # email + GitHub signup (same component, different mode)
│   ├── dashboard/page.tsx           # logged-in usage view
│   └── cli-auth/page.tsx            # CLI redirect handoff (read ?cli_redirect, redirect on auth)
├── lib/
│   ├── firebase.ts                  # Firebase client SDK init
│   └── auth.ts                      # signIn/signUp helpers
├── components/
│   └── ui/                          # shadcn components (use shadcn CLI to add)
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts
```

---

## Page specs

### `/` (landing)
- Hero: "CCR — terminal coding assistant. Free."
- Sub: "Sign up to get instant access. No API key needed."
- Two buttons: "Sign up" (→ /signup), "Install: `npm install -g @ryanisavibecoder/ccr`"
- Minimal styling. Server Component.

### `/signup` and `/login`
- Single shared component (`<AuthForm mode="signup" | "login" />`)
- Email + password fields
- GitHub button (uses `signInWithPopup(githubProvider)`)
- On success: redirect to `/dashboard` (or to `?cli_redirect=...` if present — see /cli-auth)
- Client component (`"use client"`). Firebase Auth requires browser context.
- Show inline errors from Firebase (translate codes to friendly messages — don't show "auth/wrong-password", show "Incorrect password")

### `/dashboard`
- Server Component that reads `requireAuth()` → user
- Display:
  - User email
  - "Logged in via: email | GitHub"
  - **Usage**: `{quotaUsed} / {quotaLimit} requests used` (as progress bar)
  - **Resets:** `<formatted quotaResetAt>`
  - "Sign out" button (Client component, calls `signOut()`)
- Read user doc from Firestore: `getDoc(doc(db, 'users', uid))`
- Skeleton loading state while user doc loads

### `/cli-auth` ⚠️ **THIS IS THE TRICKY PART — USE CLAUDE SONNET 4.6 IN CURSOR FOR THIS FILE**

This page bridges browser auth ↔ CLI. Flow:
1. CLI opens browser at: `https://ccr.example.com/cli-auth?cli_redirect=http://localhost:5050/callback`
2. If user is not logged in: show "Sign in to continue to CCR CLI" + auth form, preserving `cli_redirect` across navigation
3. After successful auth: call `/v1/exchangeFirebaseToken` (Cloud Function) with the Firebase ID token; receive a CCR token in response
4. Redirect browser to `<cli_redirect>?token=<ccrToken>` — CLI's local server captures it
5. Show: "✓ Authenticated. You can close this tab."

**Critical security checks:**
- `cli_redirect` MUST start with `http://localhost:` or `http://127.0.0.1:` — reject anything else (prevents token-stealing redirect attacks)
- Validate the port is in a sensible range (1024–65535)
- After redirect, do NOT also store the token in the dashboard's auth context (one-time handoff)

Client component. Use `useSearchParams()` to read `cli_redirect`.

---

## Firebase setup

`lib/firebase.ts`:
```typescript
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GithubAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  // ... etc
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const githubProvider = new GithubAuthProvider();
```

Get config values from Firebase Console (handed off by Unit 1). Store in `.env.local` (gitignored).

---

## Don't do

- Do NOT build the `/v1/exchangeFirebaseToken` Cloud Function — that's Unit 3 (Claude). Just call it.
- Do NOT add billing pages, settings pages, or admin tools (out of scope)
- Do NOT add a key management UI — users have one auto-token, period
- Do NOT use Pages Router (App Router only per CLAUDE.md)
- Do NOT skip security validation on `cli_redirect` (token theft vector)
- Do NOT put Firebase Admin SDK in this project (client SDK only)
- Do NOT create Storybook, Playwright tests, or any heavy tooling — manual test in browser is fine for MVP

---

## Done when

- [ ] All 5 pages render without errors
- [ ] Email signup creates Firebase user (verify in Firebase console)
- [ ] GitHub signup works via popup
- [ ] Dashboard shows correct quota numbers from Firestore
- [ ] `/cli-auth?cli_redirect=http://localhost:5050/cb` redirects to that URL with `?token=...` after auth
- [ ] `/cli-auth?cli_redirect=https://evil.com/steal` is **rejected** with an error
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] Deployed via `firebase deploy --only hosting` (or Vercel — your call)
