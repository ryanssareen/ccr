import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "./firebase-admin";
import { generateToken, hashToken } from "./token";

export const DEFAULT_QUOTA_LIMIT = 2000;

export type AuthProvider = "email" | "github";

export interface UserDoc {
  email: string;
  displayName: string | null;
  provider: AuthProvider;
  tokenHash: string;
  quotaUsed: number;
  quotaLimit: number;
  quotaResetAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export function firstOfNextMonthUTC(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
}

/**
 * Creates the user doc on first sign-in or rotates the CCR token on subsequent
 * sign-ins. Returns the plaintext CCR token. The token is only ever returned
 * here — the rest of the system reads its hash from Firestore.
 */
export async function provisionOrRotateToken(args: {
  uid: string;
  email: string;
  displayName: string | null;
  provider: AuthProvider;
}): Promise<{ token: string; isNewUser: boolean }> {
  const { uid, email, displayName, provider } = args;
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = FieldValue.serverTimestamp();

  const userRef = adminDb.collection("users").doc(uid);
  const snapshot = await userRef.get();

  if (!snapshot.exists) {
    const userDoc: Omit<UserDoc, "createdAt" | "updatedAt" | "quotaResetAt"> & {
      createdAt: FieldValue;
      updatedAt: FieldValue;
      quotaResetAt: Timestamp;
    } = {
      email,
      displayName,
      provider,
      tokenHash,
      quotaUsed: 0,
      quotaLimit: DEFAULT_QUOTA_LIMIT,
      quotaResetAt: Timestamp.fromDate(firstOfNextMonthUTC()),
      createdAt: now,
      updatedAt: now,
    };
    await userRef.set(userDoc);
    return { token, isNewUser: true };
  }

  await userRef.update({
    tokenHash,
    email,
    displayName,
    provider,
    updatedAt: now,
  });
  return { token, isNewUser: false };
}
