import { NextRequest, NextResponse } from "next/server";

import { adminAuth } from "@/lib/firebase-admin";
import { provisionOrRotateToken } from "@/lib/user";

// Admin SDK requires Node runtime, not Edge.
export const runtime = "nodejs";

interface EmailCredentials {
  email: string;
  password: string;
}

interface SignupOrLoginBody {
  method?: "email" | "github";
  credentials?: EmailCredentials | { idToken: string };
}

const FIREBASE_REST_BASE = "https://identitytoolkit.googleapis.com/v1";

const isEmail = (s: unknown): s is string =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const isPassword = (s: unknown): s is string =>
  typeof s === "string" && s.length >= 6 && s.length <= 1024;

function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Calls Firebase Auth REST API to verify an email/password pair.
 * Returns the local UID on success. Throws with a stable shape on failure.
 */
async function verifyEmailPassword(
  email: string,
  password: string
): Promise<{ uid: string; displayName: string | null }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new VerifyError("server_misconfigured", 500);
  }

  const res = await fetch(
    `${FIREBASE_REST_BASE}/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    }
  );

  if (res.ok) {
    const data = (await res.json()) as { localId: string; displayName?: string };
    return { uid: data.localId, displayName: data.displayName ?? null };
  }

  const errBody = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  const code = errBody.error?.message ?? "UNKNOWN";

  if (code === "EMAIL_NOT_FOUND") throw new VerifyError("not_found", 404);
  if (code === "INVALID_PASSWORD" || code === "INVALID_LOGIN_CREDENTIALS") {
    throw new VerifyError("invalid_credentials", 401);
  }
  if (code === "USER_DISABLED") throw new VerifyError("user_disabled", 403);
  if (code === "TOO_MANY_ATTEMPTS_TRY_LATER") {
    throw new VerifyError("rate_limited", 429);
  }
  throw new VerifyError("auth_failed", 401);
}

class VerifyError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function handleEmail(creds: EmailCredentials): Promise<NextResponse> {
  if (!isEmail(creds.email)) return bad("invalid email");
  if (!isPassword(creds.password)) {
    return bad("password must be 6–1024 characters");
  }

  // Try login first.
  let uid: string;
  let displayName: string | null = null;
  try {
    const result = await verifyEmailPassword(creds.email, creds.password);
    uid = result.uid;
    displayName = result.displayName;
  } catch (err) {
    if (!(err instanceof VerifyError)) throw err;

    if (err.code === "not_found") {
      // Signup path: create the user with Admin SDK.
      try {
        const created = await adminAuth.createUser({
          email: creds.email,
          password: creds.password,
        });
        uid = created.uid;
        displayName = created.displayName ?? null;
      } catch (createErr) {
        const code =
          (createErr as { code?: string }).code ?? "auth/internal-error";
        if (code === "auth/email-already-exists") {
          return bad("invalid credentials", 401);
        }
        if (code === "auth/invalid-password") {
          return bad("password too weak", 400);
        }
        return bad("could not create account", 500);
      }
    } else {
      return bad(err.code, err.status);
    }
  }

  const { token } = await provisionOrRotateToken({
    uid,
    email: creds.email,
    displayName,
    provider: "email",
  });

  return NextResponse.json({ token, email: creds.email });
}

async function handleGithub(creds: { idToken: string }): Promise<NextResponse> {
  if (typeof creds.idToken !== "string" || creds.idToken.length === 0) {
    return bad("idToken required");
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(creds.idToken);
  } catch {
    return bad("invalid idToken", 401);
  }

  if (decoded.firebase.sign_in_provider !== "github.com") {
    return bad("idToken is not a github sign-in", 400);
  }

  const email = decoded.email;
  if (!email) return bad("idToken has no email", 400);

  const { token } = await provisionOrRotateToken({
    uid: decoded.uid,
    email,
    displayName: decoded.name ?? null,
    provider: "github",
  });

  return NextResponse.json({ token, email });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SignupOrLoginBody;
  try {
    body = (await req.json()) as SignupOrLoginBody;
  } catch {
    return bad("body must be JSON");
  }

  if (body.method === "email") {
    if (!body.credentials || !("email" in body.credentials)) {
      return bad("credentials.email and credentials.password required");
    }
    return handleEmail(body.credentials);
  }

  if (body.method === "github") {
    if (!body.credentials || !("idToken" in body.credentials)) {
      return bad("credentials.idToken required");
    }
    return handleGithub(body.credentials);
  }

  return bad('method must be "email" or "github"');
}
