// Renderer-side Firebase client. Initialized lazily once we have the config
// payload from bootstrap (main process reads it from env). Mirrors
// web/lib/firebase.ts so the in-app login behaves like the website.
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  GithubAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
} from "firebase/auth";

export interface RendererFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

let app: FirebaseApp | null = null;
let cachedConfig: RendererFirebaseConfig | null = null;

export function initFirebase(config: RendererFirebaseConfig): FirebaseApp {
  if (app && cachedConfig && configsEqual(cachedConfig, config)) return app;
  if (getApps().length > 0) {
    app = getApps()[0]!;
    cachedConfig = config;
    return app;
  }
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error(
      "Firebase config missing — set CCR_FIREBASE_API_KEY / CCR_FIREBASE_AUTH_DOMAIN / CCR_FIREBASE_PROJECT_ID / CCR_FIREBASE_APP_ID before launching the desktop app.",
    );
  }
  app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });
  cachedConfig = config;
  return app;
}

export function getRendererAuth(): Auth {
  if (!app) throw new Error("Firebase not initialized — call initFirebase() first.");
  return getAuth(app);
}

function configsEqual(a: RendererFirebaseConfig, b: RendererFirebaseConfig): boolean {
  return (
    a.apiKey === b.apiKey &&
    a.authDomain === b.authDomain &&
    a.projectId === b.projectId &&
    a.appId === b.appId
  );
}

export async function signInEmail(email: string, password: string) {
  return signInWithEmailAndPassword(getRendererAuth(), email, password);
}

export async function signUpEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(getRendererAuth(), email, password);
}

export async function signInGithub() {
  const provider = new GithubAuthProvider();
  return signInWithPopup(getRendererAuth(), provider);
}

export async function signOutFirebase() {
  // Best-effort: if firebase wasn't initialized this call no-ops.
  if (!app) return;
  try {
    await firebaseSignOut(getRendererAuth());
  } catch {
    // ignore
  }
}

export function toFriendlyAuthError(error: unknown): string {
  const m = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (m.includes("wrong-password")) return "Incorrect password.";
  if (m.includes("invalid-credential")) return "Incorrect email or password.";
  if (m.includes("email-already-in-use")) return "That email is already registered.";
  if (m.includes("invalid-email")) return "Please enter a valid email address.";
  if (m.includes("weak-password")) return "Password must be at least 6 characters.";
  if (m.includes("popup-closed-by-user")) return "GitHub sign-in was cancelled.";
  if (m.includes("popup-blocked")) return "GitHub sign-in popup was blocked. Try email instead.";
  if (m.includes("network-request-failed")) return "Network error. Please try again.";
  if (m.includes("missing")) return "Firebase auth isn't configured for this build.";
  return "Authentication failed. Please try again.";
}
