import Link from "next/link";
import { CopyButton } from "./copy-button";

const VERSION = "0.1.4";
const RELEASE_URL =
  "https://github.com/ryanssareen/ccr/releases/tag/desktop-v0.1.4";
const RELEASE_BASE =
  "https://github.com/ryanssareen/ccr/releases/download/desktop-v0.1.4";

const DMG_ARM64_URL = `${RELEASE_BASE}/ccr-${VERSION}-mac-arm64.dmg`;
const DMG_X64_URL = `${RELEASE_BASE}/ccr-${VERSION}-mac-x64.dmg`;
const WIN_SETUP_URL = `${RELEASE_BASE}/ccr-setup-${VERSION}-win-x64.exe`;
const WIN_PORTABLE_URL = `${RELEASE_BASE}/ccr-portable-${VERSION}-win-x64.exe`;
const LINUX_APPIMAGE_URL = `${RELEASE_BASE}/ccr-${VERSION}-linux-x86_64.AppImage`;

const ONE_LINER = "curl -fsSL https://ccr-ebon.vercel.app/install.sh | bash";
const FIX_CMD = "sudo xattr -cr /Applications/ccr.app";

export const metadata = {
  title: "Download ccr",
  description: "Native desktop app for ccr — Mac, Windows, and CLI.",
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
        <span className="caption caption-clay">Desktop · v{VERSION}</span>
        <h1 className="display">
          ccr<span className="period">,</span> on your Dock<span className="period">.</span>
        </h1>
        <p className="lede">
          The full chat UI: in-app sign-in, session rail, command bar,
          live tool approvals, and live sync with sessions you start
          in your terminal.
        </p>

        <div className="pkg-grid">
          <PackageCard
            platform="macOS"
            icon={<AppleIcon />}
            requirement="macOS 11+"
            options={[
              {
                label: "Apple Silicon",
                hint: "M1, M2, M3, M4 — recommended",
                size: "103 MB",
                ext: "dmg",
                href: DMG_ARM64_URL,
                primary: true,
              },
              {
                label: "Intel",
                hint: "Older x86_64 Macs",
                size: "109 MB",
                ext: "dmg",
                href: DMG_X64_URL,
              },
            ]}
          />
          <PackageCard
            platform="Windows"
            icon={<WindowsIcon />}
            requirement="Windows 10+ · x64"
            options={[
              {
                label: "Installer",
                hint: "NSIS setup — pick install location",
                size: "91 MB",
                ext: "exe",
                href: WIN_SETUP_URL,
                primary: true,
              },
              {
                label: "Portable",
                hint: "Single-file, no install needed",
                size: "90 MB",
                ext: "exe",
                href: WIN_PORTABLE_URL,
              },
            ]}
          />
          <PackageCard
            platform="Linux"
            icon={<LinuxIcon />}
            requirement="Most distros · x86_64"
            options={[
              {
                label: "AppImage",
                hint: "Download, chmod +x, double-click to run",
                size: "85 MB",
                ext: "AppImage",
                href: LINUX_APPIMAGE_URL,
                primary: true,
              },
            ]}
          />
        </div>

        <p className="sub-meta">
          <a href={RELEASE_URL} target="_blank" rel="noreferrer">
            Release notes ↗
          </a>
          {" · "}
          <a href="https://github.com/ryanssareen/ccr" target="_blank" rel="noreferrer">
            Source on GitHub ↗
          </a>
        </p>

        <details className="installer-details">
          <summary>Mac one-line installer (handles Gatekeeper for you)</summary>
          <p className="installer-sub">
            Downloads the DMG, installs to <code>/Applications</code>, strips
            macOS quarantine so you skip the &ldquo;damaged&rdquo; warning.
          </p>
          <div className="cmd-row">
            <code className="cmd">{ONE_LINER}</code>
            <CopyButton text={ONE_LINER} />
          </div>
        </details>

        <section className="section">
          <h2 className="h2">First-launch warnings</h2>
          <p className="trouble-lede">
            Both binaries are unsigned (Apple and Microsoft both charge for
            code-signing certs). One small step on first launch and you&apos;re in.
          </p>
          <div className="trouble-grid">
            <div className="trouble-card">
              <div className="trouble-card-head">
                <AppleIcon className="trouble-icon" />
                <span>macOS · &ldquo;ccr is damaged&rdquo;</span>
              </div>
              <p>Run once in Terminal:</p>
              <div className="cmd-row">
                <code className="cmd">{FIX_CMD}</code>
                <CopyButton text={FIX_CMD} />
              </div>
              <p className="trouble-sub">
                Then double-click ccr to launch. The one-line installer above
                does this automatically.
              </p>
            </div>
            <div className="trouble-card">
              <div className="trouble-card-head">
                <WindowsIcon className="trouble-icon" />
                <span>Windows · &ldquo;Windows protected your PC&rdquo;</span>
              </div>
              <p>Two clicks, one time:</p>
              <ol className="trouble-steps">
                <li>
                  Click <strong>More info</strong>
                </li>
                <li>
                  Click <strong>Run anyway</strong>
                </li>
              </ol>
              <p className="trouble-sub">
                ccr launches. SmartScreen learns to trust it after that.
              </p>
            </div>
          </div>
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

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M17.05 20.28c-.98.96-2.05.81-3.08.36-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.36C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M2 4.83 11.42 3.5v8.93H2zm0 14.34L11.42 20.5v-8.93H2zm10.58 1.42L22 22V12.43h-9.42zm0-17.18V11.5H22V2z" />
    </svg>
  );
}

function LinuxIcon({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M12.5 2c-1.94 0-3.4 1.62-3.4 3.6 0 .4.06.78.18 1.14-.5.31-.97.7-1.4 1.16-.6.66-1.05 1.4-1.34 2.18-.16.42-.27.86-.34 1.32-.07.46-.1.94-.1 1.42 0 .94.13 1.85.38 2.7L4.36 18.5c-.49.66-.42 1.59.16 2.18.59.58 1.51.66 2.18.18l1.96-1.4c.74.36 1.55.62 2.4.74.48.07.97.1 1.46.1.93 0 1.83-.13 2.66-.38l1.95 1.4c.66.48 1.59.41 2.18-.18.58-.59.65-1.52.16-2.18l-2.12-2.98c.25-.85.38-1.76.38-2.7 0-.48-.03-.96-.1-1.42-.07-.46-.18-.9-.34-1.32-.29-.78-.74-1.52-1.34-2.18-.43-.46-.9-.85-1.4-1.16.12-.36.18-.74.18-1.14 0-1.98-1.46-3.6-3.4-3.6zm-1.5 6.5c.55 0 1 .67 1 1.5s-.45 1.5-1 1.5-1-.67-1-1.5.45-1.5 1-1.5zm3 0c.55 0 1 .67 1 1.5s-.45 1.5-1 1.5-1-.67-1-1.5.45-1.5 1-1.5zm-1.5 4.5c1.1 0 2.1.4 2.7 1-.5.5-1.5 1-2.7 1s-2.2-.5-2.7-1c.6-.6 1.6-1 2.7-1z" />
    </svg>
  );
}

interface PackageOption {
  label: string;
  hint: string;
  size: string;
  ext: string;
  href: string;
  primary?: boolean;
}

interface PackageCardProps {
  platform: string;
  icon: React.ReactNode;
  requirement: string;
  options: PackageOption[];
}

function PackageCard({ platform, icon, requirement, options }: PackageCardProps) {
  return (
    <div className="pkg-card">
      <header className="pkg-card-head">
        <span className="pkg-card-icon">{icon}</span>
        <div>
          <h3 className="pkg-card-title">{platform}</h3>
          <p className="pkg-card-meta">{requirement}</p>
        </div>
      </header>
      <ul className="pkg-card-options">
        {options.map((opt) => (
          <li key={opt.href} className="pkg-option">
            <div className="pkg-option-info">
              <span className="pkg-option-label">
                {opt.label}
                {opt.primary && <span className="pkg-option-badge">Recommended</span>}
              </span>
              <span className="pkg-option-hint">{opt.hint}</span>
              <span className="pkg-option-meta">
                {opt.size}
                <span className="pkg-option-dot">·</span>
                <span className="pkg-option-ext">.{opt.ext}</span>
              </span>
            </div>
            <a
              className={`btn btn-lg btn-pkg ${opt.primary ? "btn-primary" : "btn-ghost"}`}
              href={opt.href}
            >
              <DownloadIcon />
              <span>Download</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
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

  .pkg-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 0 0 16px;
  }

  @media (max-width: 760px) {
    .pkg-grid {
      grid-template-columns: 1fr;
    }
  }

  .pkg-card {
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    background: rgba(0, 0, 0, 0.012);
    overflow: hidden;
    transition: border-color 0.18s ease;
  }

  .pkg-card:hover {
    border-color: rgba(0, 0, 0, 0.18);
  }

  .pkg-card-head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border-soft);
  }

  .pkg-card-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.06);
    color: var(--text-ink);
  }

  .pkg-card-title {
    margin: 0;
    font-family: var(--font-display, Georgia, serif);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--text-ink);
  }

  .pkg-card-meta {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--text-mid);
  }

  .pkg-card-options {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .pkg-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    border-top: 1px solid var(--border-soft);
  }

  .pkg-option:first-child {
    border-top: none;
  }

  .pkg-option-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .pkg-option-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-ink);
  }

  .pkg-option-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(217, 119, 87, 0.12);
    color: var(--accent-clay);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .pkg-option-hint {
    font-size: 13px;
    color: var(--text-mid);
  }

  .pkg-option-meta {
    font-size: 12px;
    color: var(--text-mid);
    opacity: 0.8;
    font-family: var(--font-mono, monospace);
  }

  .pkg-option-dot {
    margin: 0 6px;
  }

  .pkg-option-ext {
    text-transform: lowercase;
  }

  .btn-pkg {
    flex-shrink: 0;
    padding: 10px 18px;
    font-size: 14px;
    gap: 8px;
  }

  .sub-meta {
    font-size: 13px;
    color: var(--text-mid);
    margin: 0 0 28px;
  }

  .sub-meta a {
    color: var(--text-mid);
    border-bottom: 1px solid var(--border-soft);
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .sub-meta a:hover {
    color: var(--accent-clay);
    border-bottom-color: var(--accent-clay);
  }

  /* Trouble cards (Mac + Windows side by side) */
  .trouble-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 18px;
  }

  @media (max-width: 760px) {
    .trouble-grid {
      grid-template-columns: 1fr;
    }
  }

  .trouble-card {
    padding: 18px 20px;
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.01);
  }

  .trouble-card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    font-weight: 600;
    color: var(--text-ink);
  }

  .trouble-icon {
    color: var(--text-mid);
  }

  .trouble-card p {
    margin: 0 0 10px;
    color: var(--text-mid);
    font-size: 14px;
  }

  .trouble-steps {
    margin: 0 0 10px;
    padding-left: 22px;
    color: var(--text-mid);
    font-size: 14px;
  }

  .trouble-steps li {
    margin-bottom: 4px;
  }

  .installer-details {
    margin-top: 32px;
    padding: 18px 20px;
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.015);
  }

  .installer-details summary {
    cursor: pointer;
    color: var(--text-mid);
    font-size: 14px;
    font-weight: 500;
    user-select: none;
  }

  .installer-details summary:hover {
    color: var(--accent-clay);
  }

  .installer-details[open] summary {
    margin-bottom: 12px;
  }

  .installer-details .cmd-row {
    margin-top: 8px;
  }

  .tight-steps li {
    margin-bottom: 12px;
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
