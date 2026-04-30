"use client";

import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { getFirestoreDb } from "@/lib/firebase";
import { SessionUser } from "@/lib/session";

const GITHUB_URL = "https://github.com/ryanssareen/ccr";

type UsageData = {
  quotaUsed: number;
  quotaLimit: number;
  quotaResetAt: string;
};

export function DashboardClient({ user }: { user: SessionUser }) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const db = getFirestoreDb();
        const snapshot = await getDoc(doc(db, "users", user.uid));
        const data = snapshot.data();
        const quotaUsed = typeof data?.quotaUsed === "number" ? data.quotaUsed : 0;
        const quotaLimit = typeof data?.quotaLimit === "number" ? data.quotaLimit : 100;
        const rawReset = data?.quotaResetAt;
        let quotaResetAt = "Unknown";
        if (typeof rawReset?.toDate === "function") {
          quotaResetAt = rawReset.toDate().toLocaleString();
        } else if (typeof rawReset === "string") {
          quotaResetAt = new Date(rawReset).toLocaleString();
        }
        setUsage({ quotaUsed, quotaLimit, quotaResetAt });
      } catch {
        setError("Unable to load usage data.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [user.uid]);

  const firstName = user.email.split("@")[0];

  return (
    <>
      <style>{dashboardStyles}</style>

      <nav className="dash-nav">
        <div className="dash-nav-inner">
          <Link href="/dashboard" className="dash-wordmark">
            ccr
          </Link>
          <div className="dash-nav-right">
            <span className="dash-nav-user">{user.email}</span>
            <SignOutButton className="dash-nav-logout" />
          </div>
        </div>
      </nav>

      <div className="dash-container">
        <header className="dash-header">
          <h1 className="dash-title">Welcome back, {firstName}.</h1>
          <p className="dash-subtitle">
            Here&apos;s what&apos;s happening with your account.
          </p>
        </header>

        <div className="dash-stats">
          <StatCard
            label="Requests used"
            value={isLoading ? "…" : error ? "—" : `${usage?.quotaUsed ?? 0}`}
            note={
              isLoading
                ? "Loading…"
                : error
                ? error
                : `of ${usage?.quotaLimit ?? 0} this period`
            }
          />
          <StatCard
            label="Quota limit"
            value={isLoading ? "…" : error ? "—" : `${usage?.quotaLimit ?? 0}`}
            note="Free tier"
          />
          <StatCard
            label="Signed in via"
            value={user.provider === "github" ? "GitHub" : "Email"}
            note={
              isLoading
                ? "Loading reset…"
                : error
                ? "—"
                : `Resets ${usage?.quotaResetAt ?? "Unknown"}`
            }
          />
        </div>

        <section className="dash-section">
          <h2 className="dash-section-title">Quick start</h2>
          <div className="dash-quickstart">
            <p>From any project directory, run:</p>
            <pre>
              <code>ccr &quot;your instruction here&quot;</code>
            </pre>
            <p className="dash-quickstart-note">
              Need help? Check the <Link href="/docs">docs</Link> or{" "}
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="dash-stat-card">
      <div className="dash-stat-label">{label}</div>
      <div className="dash-stat-value">{value}</div>
      <div className="dash-stat-note">{note}</div>
    </div>
  );
}

const dashboardStyles = `
  .dash-nav { border-bottom: 1px solid var(--border-soft); }
  .dash-nav-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .dash-wordmark {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 28px;
    letter-spacing: -0.01em;
    color: var(--text-ink);
    text-decoration: none;
    transform: rotate(-1.5deg);
    display: inline-block;
  }
  .dash-nav-right { display: flex; align-items: center; gap: 20px; }
  .dash-nav-user { font-size: 14px; color: var(--text-mid); }
  .dash-nav-logout {
    font-size: 14px;
    color: var(--text-mid);
    text-decoration: none;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    transition: color 150ms ease;
  }
  .dash-nav-logout:hover:not(:disabled) { color: var(--text-ink); }
  .dash-nav-logout:disabled { opacity: 0.6; cursor: not-allowed; }

  .dash-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 64px 32px;
  }
  @media (max-width: 720px) {
    .dash-container { padding: 48px 24px; }
  }

  .dash-header { margin-bottom: 48px; }
  .dash-title {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: clamp(48px, 6vw, 64px);
    line-height: 1.1;
    margin: 0 0 12px;
    transform: rotate(-1deg);
  }
  .dash-subtitle {
    font-size: 16px;
    color: #5b5a55;
    margin: 0;
  }

  .dash-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 24px;
    margin-bottom: 56px;
  }
  .dash-stat-card {
    background: var(--bg-cream-2);
    padding: 28px 32px;
    border-radius: 12px;
    border: 1px solid var(--border-soft);
  }
  .dash-stat-label {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text-mid);
    margin-bottom: 8px;
  }
  .dash-stat-value {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-size: 44px;
    font-weight: 600;
    color: var(--text-ink);
    line-height: 1;
    transform: rotate(-1deg);
    display: inline-block;
  }
  .dash-stat-note {
    font-size: 13px;
    color: var(--text-mid);
    margin-top: 8px;
  }

  .dash-section { margin-bottom: 56px; }
  .dash-section-title {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 36px;
    margin: 0 0 24px;
    transform: rotate(-0.5deg);
  }

  .dash-quickstart {
    background: var(--bg-cream-2);
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 24px 28px;
  }
  .dash-quickstart p {
    margin: 0 0 16px;
    color: #3f3e3a;
  }
  .dash-quickstart pre {
    margin: 0;
    background: var(--bg-cream);
    padding: 16px 20px;
    border-radius: 8px;
    overflow-x: auto;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 14.5px;
  }
  .dash-quickstart-note {
    margin: 16px 0 0 !important;
    font-size: 14px;
    color: var(--text-mid) !important;
  }
  .dash-quickstart-note a {
    color: var(--accent-clay);
    text-decoration: none;
  }
  .dash-quickstart-note a:hover { text-decoration: underline; }
`;
