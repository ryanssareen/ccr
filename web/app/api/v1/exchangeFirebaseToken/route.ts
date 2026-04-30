import { NextRequest, NextResponse } from "next/server";

import { adminAuth } from "@/lib/firebase-admin";
import { provisionOrRotateToken, AuthProvider } from "@/lib/user";

// Admin SDK requires Node runtime, not Edge.
export const runtime = "nodejs";

interface ExchangeBody {
  idToken?: string;
}

function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Browser → CLI handoff: client sends a Firebase ID token (obtained via the
 * Firebase JS SDK after sign-in). We verify it and mint a fresh CCR bearer
 * token. Each call rotates the token; the previous one is invalidated.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ExchangeBody;
  try {
    body = (await req.json()) as ExchangeBody;
  } catch {
    return bad("body must be JSON");
  }

  if (typeof body.idToken !== "string" || body.idToken.length === 0) {
    return bad("idToken required");
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(body.idToken, true);
  } catch {
    return bad("invalid or expired idToken", 401);
  }

  const email = decoded.email;
  if (!email) return bad("idToken has no email", 400);

  const signInProvider = decoded.firebase.sign_in_provider;
  const provider: AuthProvider =
    signInProvider === "github.com" ? "github" : "email";

  const { token } = await provisionOrRotateToken({
    uid: decoded.uid,
    email,
    displayName: decoded.name ?? null,
    provider,
  });

  return NextResponse.json({ token, email });
}
