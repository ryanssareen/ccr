import { getApps, initializeApp } from "firebase/app";
import { getAuth, GithubAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

let appInstance: ReturnType<typeof initializeApp> | null = null;

function getConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };
}

function getFirebaseApp() {
  if (appInstance) return appInstance;
  const existing = getApps();
  if (existing.length > 0) {
    appInstance = existing[0];
    return appInstance;
  }

  const config = getConfig();
  if (!config.apiKey || !config.authDomain || !config.projectId) {
    throw new Error("Firebase config is missing. Set NEXT_PUBLIC_FIREBASE_* environment variables.");
  }

  appInstance = initializeApp(config);
  return appInstance;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirestoreDb() {
  return getFirestore(getFirebaseApp());
}

export function getGithubProvider() {
  return new GithubAuthProvider();
}
