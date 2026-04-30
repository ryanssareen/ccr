import Link from "next/link";
import type { ReactNode } from "react";

export function StaticPage({
  title,
  updated,
  intro,
  children
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <style>{staticPageStyles}</style>

      <nav className="sp-nav">
        <div className="sp-nav-inner">
          <Link href="/" className="sp-wordmark">
            ccr
          </Link>
        </div>
      </nav>

      <div className="sp-container">
        <h1 className="sp-title">{title}</h1>
        <p className="sp-meta">Last updated: {updated}</p>
        <p>{intro}</p>
        {children}
      </div>
    </>
  );
}

const staticPageStyles = `
  .sp-nav { border-bottom: 1px solid var(--border-soft); }
  .sp-nav-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .sp-wordmark {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 28px;
    letter-spacing: -0.01em;
    color: var(--text-ink);
    text-decoration: none;
    transform: rotate(-1.5deg);
    display: inline-block;
  }
  .sp-container {
    max-width: 720px;
    margin: 0 auto;
    padding: 64px 32px 96px;
  }
  @media (max-width: 720px) {
    .sp-container { padding: 48px 24px 80px; }
  }
  .sp-title {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: clamp(48px, 6vw, 64px);
    line-height: 1.1;
    margin: 0 0 12px;
    transform: rotate(-1deg);
  }
  .sp-meta {
    font-size: 14px;
    color: var(--text-mid);
    margin: 0 0 48px;
  }
  .sp-container h2 {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 32px;
    line-height: 1.2;
    margin: 48px 0 16px;
    transform: rotate(-0.5deg);
  }
  .sp-container p {
    margin: 0 0 20px;
    color: #3f3e3a;
  }
  .sp-container ul {
    margin: 0 0 20px;
    padding-left: 28px;
    color: #3f3e3a;
  }
  .sp-container li { margin-bottom: 8px; }
  .sp-container a { color: var(--accent-clay); text-decoration: none; }
  .sp-container a:hover { text-decoration: underline; }
`;
