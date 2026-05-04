import Link from "next/link";
import { CopyButton } from "./copy-button";

const DMG_URL =
  "https://github.com/ryanssareen/ccr/releases/download/desktop-v0.1.1/ccr-0.1.1-arm64.dmg";
const RELEASE_URL =
  "https://github.com/ryanssareen/ccr/releases/tag/desktop-v0.1.1";
const VERSION = "0.1.1";
const ONE_LINER = "curl -fsSL https://ccr-ebon.vercel.app/install.sh | bash";
const FIX_CMD = "sudo xattr -cr /Applications/ccr.app";

export const metadata = {
  title: "Download ccr for Mac",
  description: "Native macOS desktop app for ccr — Apple Silicon DMG.",
};

export default function DownloadPage() {
  return (
    <>
      <style>{styles}</style>

      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="wordmark">
            ccr
          </Link>
          <div className="nav-links">
            <Link className="nav-link" href="/">
              Home
            </Link>
            <Link className="nav-link" href="/docs">
              Docs
            </Link>
            <Link className="btn btn-bare" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <main className="page">
        <span className="caption caption-clay">Desktop · Apple Silicon · {VERSION}</span>
        <h1 className="display">
          ccr<span className="period">,</span> on your Dock<span className="period">.</span>
        </h1>
        <p className="lede">
          Same Groq-backed agent as the CLI, in a native macOS dashboard.
          Live-syncs with sessions you start in your terminal.
        </p>

        <section className="installer">
          <p className="installer-label">One-line install (recommended)</p>
          <div className="cmd-row">
            <code className="cmd">{ONE_LINER}</code>
            <CopyButton text={ONE_LINER} />
          </div>
          <p className="installer-sub">
            Downloads the DMG, installs to <code>/Applications</code>, strips
            macOS quarantine — no &ldquo;damaged&rdquo; warning, just launch.
          </p>
        </section>

        <div className="or"><span>or</span></div>

        <a className="btn btn-ghost btn-lg btn-download" href={DMG_URL}>
          <DownloadIcon />
          <span>Download .dmg manually (Apple Silicon)</span>
          <span className="size">133 MB</span>
        </a>
        <p className="sub">
          Requires macOS 11+. Intel build coming soon.{" "}
          <a href={RELEASE_URL} target="_blank" rel="noreferrer">
            Release notes ↗
          </a>
        </p>

        <section className="section trouble">
          <h2 className="h2">
            <span className="warn-dot" /> Got &ldquo;ccr is damaged&rdquo;?
          </h2>
          <p className="trouble-lede">
            macOS does this for any unsigned app. The fix is one Terminal
            command:
          </p>
          <div className="cmd-row">
            <code className="cmd">{FIX_CMD}</code>
            <CopyButton text={FIX_CMD} />
          </div>
          <p className="trouble-sub">
            Then double-click ccr — it&apos;ll launch. (The one-line installer
            above does this automatically; you only need this if you
            downloaded the DMG manually.)
          </p>
        </section>

        <section className="section">
          <h2 className="h2">Manual install steps</h2>
          <ol className="steps">
            <li>
              <span className="step-num">1</span>
              <div>
                <strong>Open the DMG</strong> and drag <code>ccr</code> to your
                <code> Applications</code> folder.
              </div>
            </li>
            <li>
              <span className="step-num">2</span>
              <div>
                <strong>Strip the quarantine bit</strong> in Terminal (one-time):
                <pre className="codeblock">{FIX_CMD}</pre>
                Without this, macOS will refuse to launch with &ldquo;ccr is
                damaged.&rdquo; This isn&apos;t a real issue — Apple flags every
                app from a developer who hasn&apos;t paid the $99/yr cert. The
                command tells macOS to trust the file you just chose to install.
              </div>
            </li>
            <li>
              <span className="step-num">3</span>
              <div>
                <strong>Sign in</strong> with the same email or GitHub account
                you use here. Sessions started in the CLI show up automatically.
              </div>
            </li>
          </ol>
        </section>

        <section className="section">
          <h2 className="h2">What&apos;s included</h2>
          <ul className="features">
            <li>
              <span className="bullet">●</span> In-app sign-in (email + GitHub)
            </li>
            <li>
              <span className="bullet">●</span> Sessions grouped by project + date
            </li>
            <li>
              <span className="bullet">●</span> Chat with model picker, file
              attach, mode toggle
            </li>
            <li>
              <span className="bullet">●</span> Settings: nickname, custom
              instructions, toggles
            </li>
            <li>
              <span className="bullet">●</span> Live sync with the CLI
            </li>
          </ul>
        </section>

        <section className="section section-cli">
          <h2 className="h2">Or stay in the terminal</h2>
          <p className="body">
            The CLI is the same agent and a one-liner away.
          </p>
          <pre className="codeblock">npm install -g @ryanisavibecoder/ccr</pre>
        </section>

        <footer className="foot">
          <Link href="/" className="wordmark small">
            ccr
          </Link>
          <span>MIT licensed · 2026</span>
        </footer>
      </main>
    </>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

const styles = `
  .nav {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--bg-cream);
    border-bottom: 1px solid var(--border-soft);
  }
  .nav-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .wordmark {
    font-family: var(--font-display), "Caveat", cursive;
    font-weight: 600;
    font-size: 28px;
    color: var(--text-ink);
    text-decoration: none;
    transform: rotate(-1.5deg);
    display: inline-block;
  }
  .wordmark.small { font-size: 22px; color: var(--text-mid); }
  .nav-links { display: flex; align-items: center; gap: 6px; }
  .nav-link {
    font-size: 15px;
    color: var(--text-ink);
    text-decoration: none;
    padding: 8px 14px;
    border-radius: 8px;
  }
  .nav-link:hover { color: var(--accent-clay); }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-sans), Inter, sans-serif;
    font-size: 15px;
    font-weight: 500;
    text-decoration: none;
    border-radius: 10px;
    padding: 11px 18px;
    border: 1px solid transparent;
    cursor: pointer;
    line-height: 1;
    transition: background 150ms ease, border-color 150ms ease;
  }
  .btn-primary { background: var(--accent-clay); color: #fff; }
  .btn-primary:hover { background: var(--accent-clay-hover); }
  .btn-bare { background: transparent; color: var(--text-ink); padding: 11px 14px; }
  .btn-bare:hover { color: var(--accent-clay); }
  .btn-lg { padding: 16px 22px; font-size: 16px; border-radius: 12px; }

  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: 80px 32px 96px;
  }
  @media (max-width: 720px) { .page { padding: 56px 24px 72px; } }

  .caption {
    display: block;
    font-family: var(--font-sans), Inter, sans-serif;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text-mid);
    margin-bottom: 18px;
  }
  .caption-clay { color: var(--accent-clay); }
  .display {
    font-family: var(--font-display), "Caveat", cursive;
    font-weight: 600;
    font-size: clamp(56px, 8vw, 84px);
    line-height: 1.05;
    letter-spacing: -0.01em;
    margin: 0 0 22px;
    transform: rotate(-1deg);
  }
  .display .period { color: var(--accent-clay); }
  .lede {
    font-size: 18px;
    line-height: 1.55;
    color: var(--text-mid);
    margin: 0 0 36px;
    max-width: 60ch;
  }

  .btn-download .size {
    margin-left: auto;
    padding-left: 14px;
    font-size: 13px;
    opacity: 0.65;
    font-weight: 400;
  }

  .installer {
    margin: 8px 0 18px;
    padding: 22px;
    background: var(--bg-cream-2);
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    box-shadow: 0 6px 18px rgba(217, 119, 87, 0.12);
  }
  .installer-label {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-clay);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .installer-sub {
    margin: 12px 0 0;
    font-size: 13.5px;
    color: var(--text-mid);
    line-height: 1.5;
  }
  .installer-sub code {
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 0.92em;
    background: var(--border-soft);
    padding: 1px 5px;
    border-radius: 3px;
  }
  .cmd-row {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-cream);
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 10px 12px 10px 16px;
  }
  .cmd {
    flex: 1;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 13.5px;
    color: var(--text-ink);
    overflow-x: auto;
    white-space: nowrap;
    user-select: all;
  }
  .copy {
    flex-shrink: 0;
    background: var(--accent-clay);
    color: #fff;
    border: none;
    border-radius: 7px;
    padding: 7px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 140ms ease;
    font-family: var(--font-sans), Inter, sans-serif;
  }
  .copy:hover { background: var(--accent-clay-hover); }

  .or {
    text-align: center;
    margin: 16px 0;
    color: var(--text-mid);
    font-size: 13px;
    font-style: italic;
  }
  .or span {
    background: var(--bg-cream);
    padding: 0 12px;
  }

  .trouble {
    background: rgba(217, 119, 87, 0.06);
    border: 1px solid var(--accent-clay-mute, rgba(217, 119, 87, 0.3));
    border-radius: 14px;
    padding: 24px 26px;
    margin-top: 56px;
  }
  .trouble .h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .warn-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent-clay);
    flex-shrink: 0;
  }
  .trouble-lede {
    margin: 0 0 12px;
    font-size: 15px;
    color: var(--text-ink);
    line-height: 1.5;
  }
  .trouble-sub {
    margin: 12px 0 0;
    font-size: 13.5px;
    color: var(--text-mid);
    line-height: 1.5;
  }
  .sub {
    margin: 14px 0 0;
    font-size: 13.5px;
    color: var(--text-mid);
  }
  .sub a { color: var(--accent-clay); text-decoration: none; }
  .sub a:hover { text-decoration: underline; }

  .section { margin-top: 64px; }
  .h2 {
    font-family: var(--font-serif), Georgia, serif;
    font-weight: 500;
    font-size: 28px;
    line-height: 1.2;
    letter-spacing: -0.015em;
    margin: 0 0 20px;
  }

  .steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .steps li {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    line-height: 1.55;
    color: var(--text-ink);
    font-size: 15.5px;
  }
  .step-num {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent-clay);
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 13px;
    font-weight: 600;
    margin-top: 1px;
  }
  .steps code {
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 0.92em;
    background: var(--border-soft);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .steps em { color: var(--text-mid); font-style: italic; }

  .advanced {
    margin-top: 22px;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 12px 16px;
    background: var(--bg-cream-2);
  }
  .advanced summary {
    cursor: pointer;
    font-size: 14px;
    color: var(--text-mid);
    user-select: none;
  }
  .advanced summary:hover { color: var(--text-ink); }
  .codeblock {
    margin: 12px 0 0;
    padding: 14px 16px;
    background: var(--bg-cream);
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 13.5px;
    color: var(--text-ink);
    overflow-x: auto;
    white-space: pre-wrap;
  }

  .features {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 24px;
  }
  @media (max-width: 600px) { .features { grid-template-columns: 1fr; } }
  .features li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 15px;
    line-height: 1.5;
    color: var(--text-ink);
  }
  .bullet { color: var(--accent-clay); font-size: 10px; margin-top: 7px; }

  .section-cli .codeblock {
    background: var(--bg-cream-2);
  }

  .foot {
    margin-top: 80px;
    padding-top: 32px;
    border-top: 1px solid var(--border-soft);
    display: flex;
    align-items: baseline;
    gap: 16px;
    color: var(--text-mid);
    font-size: 14px;
  }
`;
