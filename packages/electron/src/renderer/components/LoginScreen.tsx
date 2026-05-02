import { FormEvent, useEffect, useState } from "react";
import {
  initFirebase,
  signInEmail,
  signUpEmail,
  signInGithub,
  toFriendlyAuthError,
  type RendererFirebaseConfig,
} from "../firebase-client.js";
import { ccrIpcClient } from "../ipc-client.js";
import { useSessionStore } from "../state/session-store.js";

type AuthMode = "login" | "signup";

interface LoginScreenProps {
  firebaseConfig: RendererFirebaseConfig;
}

/** Drop-in port of `web/components/auth-form.tsx` + `auth-shell.tsx`.
 * Same Caveat wordmark, same pencil-frame card, same flow:
 *   email/pw or GitHub popup → Firebase ID token → main IPC →
 *   /api/v1/exchangeFirebaseToken → write ~/.ccr/auth.json → bootstrap reload. */
export function LoginScreen({ firebaseConfig }: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const hydrateBootstrap = useSessionStore((s) => s.hydrateBootstrap);

  useEffect(() => {
    try {
      initFirebase(firebaseConfig);
    } catch (e) {
      setInitError(e instanceof Error ? e.message : String(e));
    }
  }, [firebaseConfig]);

  async function handleSuccess(idToken: string, userEmail: string | null) {
    const res = await ccrIpcClient.saveAuthFromFirebase({
      idToken,
      email: userEmail ?? "",
    });
    if (!res.ok) {
      setError(res.error ?? "Token exchange failed.");
      setSubmitting(false);
      return;
    }
    await hydrateBootstrap();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const credential = mode === "signup"
        ? await signUpEmail(email, password)
        : await signInEmail(email, password);
      const idToken = await credential.user.getIdToken();
      await handleSuccess(idToken, credential.user.email);
    } catch (e) {
      setError(toFriendlyAuthError(e));
      setSubmitting(false);
    }
  }

  async function handleGithub() {
    setError(null);
    setSubmitting(true);
    try {
      const credential = await signInGithub();
      const idToken = await credential.user.getIdToken();
      await handleSuccess(idToken, credential.user.email);
    } catch (e) {
      setError(toFriendlyAuthError(e));
      setSubmitting(false);
    }
  }

  const isSignup = mode === "signup";
  const frameHeight = isSignup ? 620 : 560;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-cream)",
        ["WebkitAppRegion" as any]: "no-drag",
      }}
    >
      {/* Nav */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 32px",
          ["WebkitAppRegion" as any]: "drag",
        }}
      >
        <span className="wordmark">ccr</span>
        <span style={{ fontSize: 12, color: "var(--text-mid)" }}>desktop</span>
      </header>

      {/* Centered auth card */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px 80px",
        }}
      >
        <div className="pencil-card">
          <svg
            className="pencil-frame"
            viewBox={`0 0 440 ${frameHeight}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="auth-pencil">
                <feTurbulence baseFrequency="0.05" numOctaves={2} seed={3} />
                <feDisplacementMap in="SourceGraphic" scale="1.2" />
              </filter>
            </defs>
            <path
              d={`M 12 8 Q 8 8 8 12 L 8 ${frameHeight - 12} Q 8 ${frameHeight - 8} 12 ${
                frameHeight - 8
              } L 428 ${frameHeight - 8} Q 432 ${frameHeight - 8} 432 ${
                frameHeight - 12
              } L 432 12 Q 432 8 428 8 Z`}
              stroke="#141413"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray="4 2"
              strokeLinecap="round"
              style={{ filter: "url(#auth-pencil)" }}
            />
          </svg>

          <div className="pencil-inner">
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 48,
                lineHeight: 1.1,
                margin: "0 0 12px",
                transform: "rotate(-1deg)",
                letterSpacing: "-0.01em",
              }}
            >
              {isSignup ? "Get started." : "Sign in."}
            </h1>
            <p style={{ fontSize: 15, color: "var(--text-mid)", margin: "0 0 32px" }}>
              {isSignup ? (
                <>
                  No API key, no credit card. Just sign up and{" "}
                  <code
                    className="mono"
                    style={{
                      background: "var(--border-soft-2)",
                      padding: "1px 6px",
                      borderRadius: 4,
                    }}
                  >
                    ccr
                  </code>
                  .
                </>
              ) : (
                "Welcome back — pick up where you left off."
              )}
            </p>

            {initError && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "10px 12px",
                  border: "1px solid var(--accent-red)",
                  borderRadius: 8,
                  background: "rgba(180, 44, 44, 0.06)",
                  fontSize: 13,
                  color: "var(--accent-red)",
                }}
              >
                {initError}
              </div>
            )}

            <form onSubmit={submit}>
              <div style={{ marginBottom: 18 }}>
                <label
                  htmlFor="ccr-email"
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Email
                </label>
                <input
                  id="ccr-email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label
                  htmlFor="ccr-password"
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Password
                </label>
                <input
                  id="ccr-password"
                  type="password"
                  className="input"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !!initError}
                style={{ width: "100%" }}
              >
                {submitting ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
              </button>
            </form>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                margin: "20px 0",
                color: "var(--text-mid)",
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
              <span>or</span>
              <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleGithub}
              disabled={submitting || !!initError}
              style={{ width: "100%" }}
            >
              Continue with GitHub
            </button>

            {error && (
              <p style={{ fontSize: 13, color: "var(--accent-red)", margin: "16px 0 0" }}>
                {error}
              </p>
            )}

            <div
              style={{
                marginTop: 22,
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-mid)",
              }}
            >
              {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(isSignup ? "login" : "signup");
                  setError(null);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--accent-clay)",
                  fontWeight: 500,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {isSignup ? "Sign in" : "Sign up"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
