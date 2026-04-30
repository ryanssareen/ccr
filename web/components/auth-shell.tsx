import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{authShellStyles}</style>

      <nav className="auth-nav">
        <div className="auth-nav-inner">
          <Link href="/" className="auth-wordmark">
            ccr
          </Link>
          <Link href="/" className="auth-nav-back">
            ← Back
          </Link>
        </div>
      </nav>

      <main className="auth-main">{children}</main>
    </>
  );
}

const authShellStyles = `
  .auth-nav { border-bottom: 1px solid var(--border-soft); }
  .auth-nav-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .auth-wordmark {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 28px;
    letter-spacing: -0.01em;
    color: var(--text-ink);
    text-decoration: none;
    transform: rotate(-1.5deg);
    display: inline-block;
  }
  .auth-nav-back {
    font-size: 15px;
    color: var(--text-mid);
    text-decoration: none;
    transition: color 150ms ease;
  }
  .auth-nav-back:hover { color: var(--text-ink); }

  .auth-main {
    min-height: calc(100vh - 65px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 64px 24px;
  }
`;
