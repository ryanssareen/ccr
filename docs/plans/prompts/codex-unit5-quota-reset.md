# Codex Brief — Unit 5: Monthly Quota Reset (Vercel Cron)

**Model:** GPT-5-Codex
**Working directory:** `/Users/ryan/Documents/ccr/web/`
**Goal:** A Vercel-Cron-triggered Next.js API route that resets every user's `quotaUsed` to 0 on the 1st of each month UTC.

> **Note:** The original plan called for a Firebase Scheduled Function. We pivoted to Vercel because Firebase Cloud Functions require the paid Blaze plan for outbound HTTP. Vercel Hobby tier supports cron jobs for free.

---

## Context

CCR uses Firestore at `/users/{uid}.quotaUsed` (number) and `quotaResetAt` (Timestamp) to track per-user request quotas. Users are blocked when `quotaUsed >= quotaLimit`. This unit is the cron job that wipes counters monthly.

Other units handle reads/writes during normal operation. Your route only runs on the cron tick.

---

## Files to create

- `web/app/api/cron/quota-reset/route.ts` — the API route
- `web/vercel.json` — cron schedule definition (create or merge if it exists)

You will also need to use `web/lib/firebase-admin.ts` (created by Claude in Unit 3). If it doesn't exist when you start, use this temporary stub and Claude will replace it:

```typescript
// web/lib/firebase-admin.ts (TEMPORARY STUB)
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_SDK_KEY!)),
  });
}
export const adminDb = getFirestore();
```

---

## Vercel cron config

`web/vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/quota-reset",
      "schedule": "0 0 1 * *"
    }
  ]
}
```

(00:00 UTC on the 1st of every month. Vercel automatically calls this endpoint on schedule.)

---

## Route spec

```typescript
// web/app/api/cron/quota-reset/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';        // Admin SDK requires Node, not Edge
export const maxDuration = 300;         // 5 min — enough for many users

export async function GET(req: NextRequest) {
  // 1. Verify request came from Vercel Cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Compute next reset date (first of next month UTC)
  // 3. Page through all users in batches of 500
  // 4. For each batch: writeBatch.update(userRef, { quotaUsed: 0, quotaResetAt: nextReset })
  // 5. Commit each batch; log progress
  // 6. On error in one batch: log and continue with next batch
  // 7. Return JSON: { ok: true, totalReset, batchesCommitted, errors }
}
```

---

## Behavior requirements

1. **Auth via `CRON_SECRET`** — Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` from cron triggers when the env var is set. Reject any other caller with 401. (User must set `CRON_SECRET` in Vercel project env settings to a long random string.)

2. **Batched writes** — Firestore allows max 500 ops per batch. Use `db.collection('users').limit(500).get()` with pagination via `startAfter(lastDoc)`.

3. **Idempotent** — Re-running on the same day must produce the same result.

4. **Resilient** — A single batch failing does NOT abort the whole run. Log the failed batch's first/last user IDs and continue.

5. **Observable** — Console.log: total users processed, batches committed, errors. (Vercel logs them automatically.)

6. **Compute reset date** — Always set `quotaResetAt` to the first of the *next* month UTC, not "now + 30 days":
   ```typescript
   const now = new Date();
   const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
   ```

---

## Don't do

- Do NOT touch user quota *limits* — only reset *used*
- Do NOT delete or modify any other fields on user docs
- Do NOT delete users with `quotaUsed = 0`
- Do NOT use Edge runtime (Admin SDK requires Node)
- Do NOT create Firebase Cloud Functions — we're not using them anymore
- Do NOT skip the `CRON_SECRET` check — without it, anyone can hit the endpoint and reset all quotas

---

## Done when

- [ ] Route file exists; project still builds (`cd web && npm run build`)
- [ ] `vercel.json` has the cron entry
- [ ] Hitting `/api/cron/quota-reset` without auth returns 401
- [ ] Hitting it with the right `Authorization: Bearer <secret>` resets all users
- [ ] Manual test: seed 3 test users with `quotaUsed: 500`, hit the endpoint with curl + secret, verify all reset to 0 in Firestore console
- [ ] Endpoint deployed to Vercel; cron entry visible in Vercel dashboard under "Cron Jobs"
