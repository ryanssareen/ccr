import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const USERS_BATCH_SIZE = 500;

type BatchError = {
  batchNumber: number;
  firstUserId: string;
  lastUserId: string;
  message: string;
};

function computeNextReset(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const nextReset = computeNextReset();
  const errors: BatchError[] = [];
  let totalReset = 0;
  let batchesCommitted = 0;
  let batchNumber = 0;
  let lastDoc: QueryDocumentSnapshot | undefined;

  while (true) {
    let query = adminDb.collection("users").limit(USERS_BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    batchNumber += 1;
    const docs = snapshot.docs;
    const firstUserId = docs[0]?.id ?? "";
    const lastUserId = docs[docs.length - 1]?.id ?? "";
    const batch = adminDb.batch();

    for (const doc of docs) {
      batch.update(doc.ref, {
        quotaUsed: 0,
        quotaResetAt: nextReset,
      });
    }

    try {
      await batch.commit();
      batchesCommitted += 1;
      totalReset += docs.length;

      console.log("quota reset batch committed", {
        batchNumber,
        count: docs.length,
        firstUserId,
        lastUserId,
        totalReset,
        nextResetAt: nextReset.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown batch commit error";
      errors.push({
        batchNumber,
        firstUserId,
        lastUserId,
        message,
      });

      console.error("quota reset batch failed", {
        batchNumber,
        firstUserId,
        lastUserId,
        message,
      });
    }

    lastDoc = docs[docs.length - 1];
    if (docs.length < USERS_BATCH_SIZE) {
      break;
    }
  }

  console.log("quota reset complete", {
    totalReset,
    batchesCommitted,
    errors: errors.length,
    nextResetAt: nextReset.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    totalReset,
    batchesCommitted,
    errors,
  });
}
