import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const firebaseAdminSdkKey = process.env.FIREBASE_ADMIN_SDK_KEY;

if (!getApps().length && firebaseAdminSdkKey) {
  try {
    initializeApp({
      credential: cert(JSON.parse(firebaseAdminSdkKey)),
    });
  } catch (err) {
    // Swallow init errors during build / when key is malformed.
    // The fallback exports below will throw a clear runtime error
    // the first time anyone tries to use the SDK.
    if (process.env.NODE_ENV !== "production" || process.env.VERCEL === "1") {
      console.warn(
        "[firebase-admin] init skipped:",
        err instanceof Error ? err.message : err
      );
    }
  }
}

const notConfigured = (label: string) => () => {
  throw new Error(`FIREBASE_ADMIN_SDK_KEY is not configured (${label}).`);
};

const fallbackAdminDb = {
  collection: notConfigured("adminDb"),
} as unknown as ReturnType<typeof getFirestore>;

const fallbackAdminAuth = {
  verifyIdToken: notConfigured("adminAuth"),
  createUser: notConfigured("adminAuth"),
  getUserByEmail: notConfigured("adminAuth"),
} as unknown as ReturnType<typeof getAuth>;

export const adminDb = getApps().length ? getFirestore() : fallbackAdminDb;
export const adminAuth = getApps().length ? getAuth() : fallbackAdminAuth;
