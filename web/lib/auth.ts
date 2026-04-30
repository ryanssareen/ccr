"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";

import { getFirebaseAuth, getGithubProvider } from "@/lib/firebase";

function mapFirebaseError(message: string) {
  const mapped = message.toLowerCase();
  if (mapped.includes("wrong-password")) return "Incorrect password.";
  if (mapped.includes("invalid-credential")) return "Incorrect email or password.";
  if (mapped.includes("email-already-in-use")) return "That email is already registered.";
  if (mapped.includes("invalid-email")) return "Please enter a valid email address.";
  if (mapped.includes("weak-password")) return "Password must be at least 6 characters.";
  if (mapped.includes("popup-closed-by-user")) return "GitHub sign-in was cancelled.";
  if (mapped.includes("network-request-failed"))
    return "Network error. Please try again.";
  return "Authentication failed. Please try again.";
}

export function toFriendlyAuthError(error: unknown) {
  if (error instanceof Error) return mapFirebaseError(error.message);
  return "Authentication failed. Please try again.";
}

export async function signUpWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signInWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signInWithGithub() {
  const auth = getFirebaseAuth();
  const githubProvider = getGithubProvider();
  return signInWithPopup(auth, githubProvider);
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  return signOut(auth);
}
