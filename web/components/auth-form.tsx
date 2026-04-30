"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  signInWithEmail,
  signInWithGithub,
  signUpWithEmail,
  toFriendlyAuthError
} from "@/lib/auth";
import { validateCliRedirect } from "@/lib/cli-redirect";

type AuthMode = "login" | "signup";

type AuthFormProps = {
  mode: AuthMode;
  cliRedirect?: string | null;
  title?: string;
  description?: string;
};

function saveSessionCookies(uid: string, email: string | null, provider: "email" | "github") {
  document.cookie = `ccr_uid=${encodeURIComponent(uid)}; path=/; max-age=604800; samesite=lax`;
  if (email) {
    document.cookie = `ccr_email=${encodeURIComponent(email)}; path=/; max-age=604800; samesite=lax`;
  }
  document.cookie = `ccr_provider=${provider}; path=/; max-age=604800; samesite=lax`;
}

export function AuthForm({ mode, cliRedirect, title, description }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const safeCliRedirect = validateCliRedirect(cliRedirect ?? null);
  const destination = safeCliRedirect
    ? `/cli-auth?cli_redirect=${encodeURIComponent(safeCliRedirect)}`
    : "/dashboard";

  const handleAuthSuccess = (
    uid: string,
    userEmail: string | null,
    provider: "email" | "github"
  ) => {
    saveSessionCookies(uid, userEmail, provider);
    router.push(destination);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result =
        mode === "signup"
          ? await signUpWithEmail(email, password)
          : await signInWithEmail(email, password);
      handleAuthSuccess(result.user.uid, result.user.email, "email");
    } catch (authError) {
      setError(toFriendlyAuthError(authError));
      setIsSubmitting(false);
    }
  };

  const handleGithub = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signInWithGithub();
      handleAuthSuccess(result.user.uid, result.user.email, "github");
    } catch (authError) {
      setError(toFriendlyAuthError(authError));
      setIsSubmitting(false);
    }
  };

  const isSignup = mode === "signup";
  const altHref = `${isSignup ? "/login" : "/signup"}${
    safeCliRedirect ? `?cli_redirect=${encodeURIComponent(safeCliRedirect)}` : ""
  }`;
  const frameHeight = isSignup ? 620 : 560;

  return (
    <>
      <style>{authFormStyles}</style>

      <div className="form-card">
        <svg
          className="form-frame"
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

        <div className="form-inner">
          <h1 className="form-title">{title ?? (isSignup ? "Get started." : "Sign in.")}</h1>
          <p className="form-subtitle">
            {description ?? (isSignup ? (
              <>
                No API key, no credit card. Just sign up and <code className="inline-code">ccr</code>.
              </>
            ) : (
              "Welcome back — pick up where you left off."
            ))}
          </p>

          <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="form-input"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="form-input"
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting
                ? "Please wait..."
                : isSignup
                ? "Create account"
                : "Sign in"}
            </button>

            {isSignup ? (
              <p className="tos">
                By creating an account, you agree to our{" "}
                <Link href="/terms">Terms</Link> and{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </p>
            ) : null}
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleGithub}
            disabled={isSubmitting}
          >
            Continue with GitHub
          </button>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="form-footer">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link href={altHref}>{isSignup ? "Sign in" : "Sign up"}</Link>
          </div>
        </div>
      </div>
    </>
  );
}

const authFormStyles = `
  .form-card {
    width: 100%;
    max-width: 420px;
    position: relative;
  }
  .form-frame {
    position: absolute;
    top: -10px; left: -10px; right: -10px; bottom: -10px;
    pointer-events: none;
    width: calc(100% + 20px);
    height: calc(100% + 20px);
  }
  .form-inner {
    position: relative;
    background: var(--bg-cream-2);
    padding: 48px 40px;
  }
  @media (max-width: 520px) {
    .form-inner { padding: 36px 28px; }
  }
  .form-title {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 48px;
    line-height: 1.1;
    letter-spacing: -0.01em;
    margin: 0 0 12px;
    transform: rotate(-1deg);
  }
  .form-subtitle {
    font-size: 15px;
    color: #5b5a55;
    margin: 0 0 36px;
  }
  .inline-code {
    font-family: var(--font-mono), ui-monospace, monospace;
    background: var(--border-soft);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .form-group { margin-bottom: 20px; }
  .form-label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-ink);
    margin-bottom: 8px;
  }
  .form-input {
    width: 100%;
    font-family: var(--font-sans), Inter, sans-serif;
    font-size: 15px;
    padding: 11px 14px;
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    background: var(--bg-cream);
    color: var(--text-ink);
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  .form-input:focus {
    outline: none;
    border-color: var(--accent-clay);
    box-shadow: 0 0 0 3px rgba(217, 119, 87, 0.1);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: var(--font-sans), Inter, sans-serif;
    font-size: 15px;
    font-weight: 500;
    text-decoration: none;
    border-radius: 8px;
    padding: 12px 18px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
    line-height: 1;
    width: 100%;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary { background: var(--accent-clay); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: var(--accent-clay-hover); }
  .btn-ghost {
    background: transparent;
    color: var(--text-ink);
    border-color: var(--border-soft);
  }
  .btn-ghost:hover:not(:disabled) { border-color: var(--text-ink); }
  .auth-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 20px 0;
    color: var(--text-mid);
    font-size: 13px;
  }
  .auth-divider::before, .auth-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-soft);
  }
  .tos {
    font-size: 13px;
    color: #5b5a55;
    margin: 16px 0 0;
  }
  .tos a, .form-footer a {
    color: var(--accent-clay);
    text-decoration: none;
    font-weight: 500;
  }
  .tos a:hover, .form-footer a:hover { text-decoration: underline; }
  .form-error {
    font-size: 14px;
    color: #b42c2c;
    margin: 16px 0 0;
  }
  .form-footer {
    margin-top: 24px;
    text-align: center;
    font-size: 14px;
    color: #5b5a55;
  }
`;
