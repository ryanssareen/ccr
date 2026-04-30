import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "./firebase-admin";
import { compareTokenHashes, hashToken, isValidTokenFormat } from "./token";

export interface QuotaState {
  used: number;
  limit: number;
  resetAt: Date;
}

export interface AuthenticatedUser {
  uid: string;
  email: string;
  quota: QuotaState;
}

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export class QuotaExceededError extends Error {
  readonly resetAt: Date;
  readonly limit: number;
  constructor(resetAt: Date, limit: number) {
    super("quota exceeded");
    this.resetAt = resetAt;
    this.limit = limit;
  }
}

/**
 * Looks up the user by hashing the bearer token and querying Firestore on the
 * tokenHash field. Returns the user's UID + current quota state. Throws AuthError
 * if the token is malformed or doesn't match any user.
 */
export async function authenticateBearer(
  bearer: string | null
): Promise<AuthenticatedUser> {
  if (!bearer) throw new AuthError("missing bearer token");
  if (!isValidTokenFormat(bearer)) throw new AuthError("malformed token");

  const tokenHash = hashToken(bearer);
  const snapshot = await adminDb
    .collection("users")
    .where("tokenHash", "==", tokenHash)
    .limit(1)
    .get();

  if (snapshot.empty) throw new AuthError("invalid token");

  const doc = snapshot.docs[0];
  const data = doc.data();

  // Defense-in-depth: the where() above is exact-match, but reconfirm with
  // constant-time hash compare so any future migration that adds a non-equal
  // index doesn't accidentally weaken auth.
  if (
    typeof data.tokenHash !== "string" ||
    !compareTokenHashes(data.tokenHash, tokenHash)
  ) {
    throw new AuthError("invalid token");
  }

  return {
    uid: doc.id,
    email: data.email as string,
    quota: {
      used: Number(data.quotaUsed ?? 0),
      limit: Number(data.quotaLimit ?? 0),
      resetAt: (data.quotaResetAt as Timestamp).toDate(),
    },
  };
}

/**
 * Atomically reserves one quota slot for the user. Throws QuotaExceededError
 * if the user is already at or above the limit. The reservation is the
 * authoritative "this request will be billed" decision; if the upstream call
 * later fails, refundQuotaSlot must be called to undo it.
 *
 * Implemented via Firestore transaction: the read-then-write retries on
 * concurrent modification, so two simultaneous requests at quotaUsed=1999 and
 * quotaLimit=2000 will result in exactly one success and one rejection.
 */
export async function reserveQuotaSlot(uid: string): Promise<QuotaState> {
  const userRef = adminDb.collection("users").doc(uid);

  return adminDb.runTransaction(async (tx) => {
    const snapshot = await tx.get(userRef);
    if (!snapshot.exists) {
      throw new AuthError("user record missing");
    }

    const data = snapshot.data() as {
      quotaUsed?: number;
      quotaLimit?: number;
      quotaResetAt?: Timestamp;
    };
    const used = Number(data.quotaUsed ?? 0);
    const limit = Number(data.quotaLimit ?? 0);
    const resetAt = (data.quotaResetAt ?? Timestamp.now()).toDate();

    if (used >= limit) {
      throw new QuotaExceededError(resetAt, limit);
    }

    tx.update(userRef, {
      quotaUsed: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { used: used + 1, limit, resetAt };
  });
}

/**
 * Refunds a previously-reserved slot when the upstream provider call failed.
 * Best-effort: a refund failure is logged but never re-thrown (the user
 * already saw their request fail; surfacing a refund error helps no one).
 */
export async function refundQuotaSlot(uid: string): Promise<void> {
  try {
    await adminDb
      .collection("users")
      .doc(uid)
      .update({
        quotaUsed: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error("[quota] refund failed for", uid, err);
  }
}

/**
 * Header constants and helpers so route handlers don't accidentally typo
 * the strings or get the formats out of sync.
 */
export const QUOTA_HEADERS = {
  used: "X-CCR-Quota-Used",
  limit: "X-CCR-Quota-Limit",
  resetAt: "X-CCR-Quota-Reset",
} as const;

export function quotaHeaders(state: QuotaState): Record<string, string> {
  return {
    [QUOTA_HEADERS.used]: String(state.used),
    [QUOTA_HEADERS.limit]: String(state.limit),
    [QUOTA_HEADERS.resetAt]: state.resetAt.toISOString(),
  };
}
