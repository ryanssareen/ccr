"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const INSTALL_CMD = "npm install -g @ryanisavibecoder/ccr";
const GITHUB_URL = "https://github.com/ryanssareen/ccr";
const NPM_URL = "https://www.npmjs.com/package/@ryanisavibecoder/ccr";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <>
      <style>{landingStyles}</style>

      <nav className={`nav${scrolled ? " scrolled" : ""}`}>
        <div className="nav-inner">
          <Link href="/" className="wordmark">
            ccr
          </Link>
          <div className="nav-links">
            <a className="nav-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link className="nav-link" href="/docs">
              Docs
            </Link>
            <Link className="btn btn-bare" href="/login">
              Sign in
            </Link>
            <Link className="btn btn-primary" href="/signup">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-inner">
          <span className="caption caption-clay">Free forever · Open source</span>
          <h1 className="display">
            Vibe code, free<span className="period">.</span>
          </h1>
          <p className="hero-sub">
            A terminal coding assistant that reads your repo, proposes diffs, and runs commands
            with your approval. No API key required. Just sign up and <code>ccr</code>.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" href="/signup">
              Get started — it&apos;s free
            </Link>
            <a
              className="btn btn-ghost btn-lg"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub →
            </a>
          </div>
          <div
            className="install-chip"
            role="button"
            aria-label="Copy install command"
            onClick={copyInstall}
          >
            <span>{INSTALL_CMD}</span>
            <button
              className="copy-btn"
              aria-label="Copy"
              onClick={(e) => {
                e.stopPropagation();
                copyInstall();
              }}
              style={copied ? { color: "var(--accent-sage)" } : undefined}
            >
              {copied ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 8.5 6.5 12 13 4.5" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="5" y="5" width="9" height="9" rx="1.5" />
                  <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </section>

      <section className="terminal-section">
        <div className="terminal-wrap">
          <svg
            className="terminal-frame"
            viewBox="0 0 1100 540"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="pencil">
                <feTurbulence baseFrequency="0.05" numOctaves={2} seed={3} />
                <feDisplacementMap in="SourceGraphic" scale="1.2" />
              </filter>
            </defs>
            <path
              d="M 12 8 Q 8 8 8 12 L 8 528 Q 8 532 12 532 L 1088 532 Q 1092 532 1092 528 L 1092 12 Q 1092 8 1088 8 Z"
              stroke="#141413"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray="4 2"
              strokeLinecap="round"
              style={{ filter: "url(#pencil)" }}
            />
          </svg>
          <div className="terminal" role="img" aria-label="Terminal demonstration">
            <div>
              <span className="term-prompt">~/projects/atlas</span>{" "}
              <span className="term-dim">on</span> <span className="term-dim">main</span>
            </div>
            <div style={{ marginTop: 14 }}>
              <span className="term-prompt">›</span>{" "}
              <span className="term-user">
                ccr &quot;the rate limiter is dropping requests under burst load.
              </span>
            </div>
            <div style={{ paddingLeft: 16 }}>
              <span className="term-user">
                find the bug in src/limiter.ts and fix it. add a test that
              </span>
            </div>
            <div style={{ paddingLeft: 16 }}>
              <span className="term-user">
                covers the burst case. don&apos;t run anything yet — show me
              </span>
            </div>
            <div style={{ paddingLeft: 16 }}>
              <span className="term-user">the diff first.&quot;</span>
            </div>

            <div className="term-status-row">
              <span className="dot" />
              <span className="term-status-text">
                ccr is reading{" "}
                <span className="term-dim">
                  src/limiter.ts · src/limiter.test.ts · 4 imports
                </span>
              </span>
            </div>

            <div style={{ marginTop: 14, color: "var(--text-mid)" }}>
              Found it. The token bucket refills on every request instead of every tick, so
              concurrent calls all see the pre-refill state. Here&apos;s the fix:
            </div>

            <div className="diff-card">
              <div className="diff-head">
                <span className="file">src/limiter.ts</span>
                <span>−2 +5</span>
              </div>
              <div className="diff-body">
                <DiffLine ln="42" marker=" " code="  consume(n = 1) {" />
                <DiffLine
                  ln="43"
                  marker="−"
                  code="    this.tokens = Math.min(this.cap, this.tokens + this.rate);"
                  variant="del"
                />
                <DiffLine
                  ln="44"
                  marker="−"
                  code="    if (this.tokens < n) return false;"
                  variant="del"
                />
                <DiffLine
                  ln="43"
                  marker="+"
                  code="    const now = performance.now();"
                  variant="add"
                />
                <DiffLine
                  ln="44"
                  marker="+"
                  code="    const elapsed = (now - this.last) / 1000;"
                  variant="add"
                />
                <DiffLine
                  ln="45"
                  marker="+"
                  code="    this.tokens = Math.min(this.cap, this.tokens + elapsed * this.rate);"
                  variant="add"
                />
                <DiffLine ln="46" marker="+" code="    this.last = now;" variant="add" />
                <DiffLine
                  ln="47"
                  marker="+"
                  code="    if (this.tokens < n) return false;"
                  variant="add"
                />
                <DiffLine ln="48" marker=" " code="    this.tokens -= n;" />
              </div>
            </div>

            <div style={{ color: "var(--text-mid)" }}>
              Apply changes? <span className="term-dim">[y / n / edit]</span>{" "}
              <span className="term-user">y</span>
            </div>
            <div className="term-confirm" style={{ marginTop: 10 }}>
              <span className="check">✓</span>
              <span>
                Wrote 2 files. 1 test added — passing.
                <span className="term-blink" />
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="callout">
        <div className="callout-inner">
          <h2 className="h2 callout-line1">Tired of wrestling your tools?</h2>
          <div className="callout-line2-wrap">
            <h2 className="h2 callout-line2">
              Just type <span className="ccr-underline">ccr</span>.
            </h2>
            <svg
              className="ccr-squiggle"
              width="120"
              height="24"
              viewBox="0 0 120 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none"
            >
              <defs>
                <filter id="pencil2">
                  <feTurbulence baseFrequency="0.3" numOctaves={2} seed={7} />
                  <feDisplacementMap in="SourceGraphic" scale="0.8" />
                </filter>
              </defs>
              <path
                d="M 2 12 Q 30 8, 60 14 T 118 10"
                stroke="var(--accent-clay)"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                style={{ filter: "url(#pencil2)" }}
              />
            </svg>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="capabilities">
            <Capability num="01" title="Reads your repo">
              Indexes files, follows imports, surfaces what matters.
            </Capability>
            <Capability num="02" title="Proposes diffs">
              Shows you exactly what changes before anything touches disk.
            </Capability>
            <Capability num="03" title="Runs commands">
              Asks before executing. Approve, deny, or edit on the fly.
            </Capability>
          </div>
        </div>
      </section>

      <section className="free">
        <div className="wrap-narrow">
          <h2 className="h2">Free isn&apos;t a trick.</h2>
          <p className="body">
            CCR routes requests across a handful of LLM providers — Groq, Together AI, Cerebras,
            OpenRouter — and aggregates their free tiers so you don&apos;t have to manage API keys,
            top up balances, or pick a model on a Tuesday. Sign up, install, and it works.
          </p>
          <p className="body">
            We pay nothing extra to operate it; you pay nothing to use it. If a provider&apos;s free
            tier ever disappears, we route around it. The day that becomes impossible we&apos;ll
            tell you, in plain English, on this page.
          </p>

          <div className="providers" aria-label="LLM providers">
            <span className="provider">Groq</span>
            <span className="provider together">
              Together <em>AI</em>
            </span>
            <span className="provider">Cerebras</span>
            <span className="provider">OpenRouter</span>
          </div>
        </div>
      </section>

      <section className="quickstart">
        <div className="wrap">
          <span className="caption">Three commands to get started</span>
          <div className="qs-grid">
            <QuickstartBlock
              num="01"
              code="npm install -g @ryanisavibecoder/ccr"
              caption={
                <>
                  Installs the <code>ccr</code> binary globally. Node 20+.
                </>
              }
            />
            <QuickstartBlock
              num="02"
              code="ccr login"
              caption="Opens your browser. No API key, no credit card."
            />
            <QuickstartBlock
              num="03"
              code='ccr "explain this codebase"'
              caption="Run it from the root of any project. That's the whole tutorial."
            />
          </div>
        </div>
      </section>

      <footer>
        <div className="foot-inner">
          <div className="foot-left">
            <Link href="/" className="wordmark">
              ccr
            </Link>
            <span>MIT licensed · 2026</span>
          </div>
          <div className="foot-right">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={NPM_URL} target="_blank" rel="noreferrer">
              npm
            </a>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}

type DiffLineProps = {
  ln: string;
  marker: string;
  code: string;
  variant?: "add" | "del";
};

function DiffLine({ ln, marker, code, variant }: DiffLineProps) {
  const variantClass = variant ? ` diff-${variant}` : "";
  return (
    <div className={`diff-line${variantClass}`}>
      <span className="ln">{ln}</span>
      <span className="marker">{marker}</span>
      <span className="code">{code}</span>
    </div>
  );
}

function Capability({
  num,
  title,
  children
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="cap">
      <div className="cap-num">{num}</div>
      <h3 className="h3">{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function QuickstartBlock({
  num,
  code,
  caption
}: {
  num: string;
  code: string;
  caption: React.ReactNode;
}) {
  return (
    <div className="qs-block">
      <div className="qs-num">{num}</div>
      <div className="qs-code">{code}</div>
      <div className="qs-cap">{caption}</div>
    </div>
  );
}

const landingStyles = `
  *, *::before, *::after { box-sizing: border-box; }

  .display {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: clamp(72px, 10vw, 108px);
    line-height: 1.05;
    letter-spacing: -0.01em;
    color: var(--text-ink);
    margin: 0;
    transform: rotate(-1deg);
  }
  .display .period { color: var(--accent-clay); font-style: italic; }

  .h2 {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: clamp(40px, 5.5vw, 56px);
    line-height: 1.15;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .h3 {
    font-family: var(--font-sans), Inter, system-ui, sans-serif;
    font-weight: 600;
    font-size: 24px;
    line-height: 1.2;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .body { font-size: 17px; line-height: 1.6; color: var(--text-ink); }
  .caption {
    font-family: var(--font-sans), Inter, sans-serif;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text-mid);
  }
  .caption-clay { color: var(--accent-clay); }

  .wrap { max-width: var(--max-w); margin: 0 auto; padding: 0 32px; }
  .wrap-narrow { max-width: 720px; margin: 0 auto; padding: 0 32px; }
  section { padding: var(--rhythm) 0; }
  @media (max-width: 720px) {
    section { padding: var(--rhythm-sm) 0; }
    .wrap, .wrap-narrow { padding: 0 24px; }
  }

  .nav {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--bg-cream);
    transition: border-color 200ms ease, box-shadow 200ms ease;
    border-bottom: 1px solid transparent;
  }
  .nav.scrolled { border-bottom-color: var(--border-soft); }
  .nav-inner {
    max-width: var(--max-w);
    margin: 0 auto;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .wordmark {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 28px;
    letter-spacing: -0.01em;
    color: var(--text-ink);
    text-decoration: none;
    transform: rotate(-1.5deg);
    display: inline-block;
  }
  .nav-links { display: flex; align-items: center; gap: 6px; }
  .nav-link {
    font-size: 15px;
    color: var(--text-ink);
    text-decoration: none;
    padding: 8px 14px;
    border-radius: 8px;
    transition: color 150ms ease, background 150ms ease;
  }
  .nav-link:hover { color: var(--accent-clay); }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-sans), Inter, sans-serif;
    font-size: 15px;
    font-weight: 500;
    text-decoration: none;
    border-radius: 8px;
    padding: 11px 18px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
    line-height: 1;
  }
  .btn-primary { background: var(--accent-clay); color: #fff; }
  .btn-primary:hover { background: var(--accent-clay-hover); }
  .btn-ghost { background: transparent; color: var(--text-ink); border-color: var(--border-soft); }
  .btn-ghost:hover { border-color: var(--text-ink); }
  .btn-bare { background: transparent; color: var(--text-ink); padding: 11px 14px; }
  .btn-bare:hover { color: var(--accent-clay); }
  .btn-lg { padding: 14px 22px; font-size: 16px; }

  .hero { padding-top: 120px; padding-bottom: 96px; text-align: center; }
  @media (max-width: 720px) { .hero { padding-top: 72px; padding-bottom: 64px; } }
  .hero-inner { max-width: 880px; margin: 0 auto; padding: 0 32px; }
  .hero .caption { margin-bottom: 28px; display: block; }
  .hero .display { margin-bottom: 28px; }
  .hero-sub {
    max-width: 580px;
    margin: 0 auto 36px;
    color: #5b5a55;
    font-size: 17px;
    line-height: 1.6;
  }
  .hero-sub code {
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 0.92em;
    background: var(--border-soft);
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--text-ink);
  }
  .hero-cta {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 40px;
  }
  .install-chip {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    background: var(--bg-cream);
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 10px 14px 10px 18px;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 14px;
    color: var(--text-ink);
    cursor: pointer;
    transition: border-color 150ms ease;
    user-select: all;
  }
  .install-chip:hover { border-color: var(--text-mid); }
  .install-chip .copy-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px; height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease;
  }
  .install-chip .copy-btn:hover { color: var(--text-ink); background: var(--border-soft); }

  .terminal-section { padding-top: 0; }
  .terminal-wrap { max-width: var(--max-w); margin: 0 auto; position: relative; padding: 0 24px; }
  .terminal-frame {
    position: absolute;
    top: -8px; left: 16px; right: 16px; bottom: -8px;
    pointer-events: none;
    width: calc(100% - 32px);
    height: calc(100% + 16px);
  }
  .terminal {
    position: relative;
    background: var(--bg-cream-2);
    padding: 36px 40px;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 14.5px;
    line-height: 1.65;
    color: var(--text-ink);
    overflow: hidden;
  }
  @media (max-width: 720px) {
    .terminal { padding: 24px 22px; font-size: 13px; }
  }
  .term-prompt { color: var(--accent-clay); }
  .term-user { color: var(--text-ink); }
  .term-dim { color: #7d7c75; }
  .term-status-row {
    margin-top: 16px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    color: var(--text-mid);
    font-style: italic;
  }
  .term-status-row .dot {
    flex: 0 0 auto;
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent-clay);
    animation: ccr-pulse 1.4s ease-in-out infinite;
    transform: translateY(-2px);
  }
  .term-status-text { flex: 1 1 auto; }
  @keyframes ccr-pulse {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 1; }
  }

  .diff-card {
    margin: 18px 0;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: var(--bg-cream);
    overflow: hidden;
  }
  .diff-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-soft);
    font-size: 13px;
    color: var(--text-mid);
  }
  .diff-head .file { color: var(--text-ink); font-family: var(--font-mono), ui-monospace, monospace; }
  .diff-body { padding: 8px 0; }
  .diff-line {
    display: grid;
    grid-template-columns: 44px 16px 1fr;
    align-items: baseline;
    padding: 1px 16px;
    font-size: 13.5px;
    white-space: pre;
  }
  .diff-line .ln { color: var(--text-mid); user-select: none; }
  .diff-line .marker { user-select: none; }
  .diff-add { background: rgba(217, 119, 87, 0.09); }
  .diff-add .marker, .diff-add .code { color: var(--accent-clay); }
  .diff-add .ln { color: var(--accent-clay); opacity: 0.7; }
  .diff-del { background: rgba(106, 155, 204, 0.10); }
  .diff-del .marker, .diff-del .code { color: var(--accent-sky); }
  .diff-del .ln { color: var(--accent-sky); opacity: 0.7; }

  .term-confirm {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--accent-sage);
    font-family: var(--font-sans), Inter, sans-serif;
    font-size: 14px;
  }
  .term-confirm .check {
    width: 18px; height: 18px;
    border-radius: 50%;
    border: 1.5px solid var(--accent-sage);
    display: inline-flex; align-items: center; justify-content: center;
    color: var(--accent-sage);
    font-size: 11px;
  }
  .term-blink::after {
    content: '▍';
    color: var(--text-ink);
    margin-left: 2px;
    animation: ccr-blink 1s steps(2) infinite;
  }
  @keyframes ccr-blink { 50% { opacity: 0; } }

  .callout { padding: 128px 0; text-align: center; }
  @media (max-width: 720px) { .callout { padding: 80px 0; } }
  .callout-inner { max-width: 780px; margin: 0 auto; padding: 0 32px; }
  .callout-line1 { color: var(--text-ink); margin-bottom: 24px; }
  .callout-line2-wrap { position: relative; display: inline-block; }
  .callout-line2 { color: var(--accent-clay); }
  .ccr-underline { position: relative; display: inline-block; }
  .ccr-squiggle {
    position: absolute;
    left: 50%;
    bottom: -8px;
    transform: translateX(-50%);
    width: 110%;
    height: auto;
    pointer-events: none;
  }

  .capabilities {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 56px;
  }
  @media (max-width: 720px) {
    .capabilities { grid-template-columns: 1fr; gap: 40px; }
  }
  .cap-num {
    font-family: var(--font-display), "Caveat", cursive;
    font-style: italic;
    font-weight: 400;
    font-size: 28px;
    color: var(--accent-clay);
    margin-bottom: 14px;
    letter-spacing: -0.01em;
  }
  .cap h3 { margin-bottom: 10px; }
  .cap p { color: #5b5a55; margin: 0; max-width: 30ch; }

  .free .h2 { text-align: center; margin-bottom: 28px; }
  .free p { color: #3f3e3a; margin: 0 0 18px; }
  .providers {
    margin-top: 56px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    color: var(--text-mid);
  }
  .providers .provider {
    font-family: var(--font-sans), Inter, sans-serif;
    font-weight: 600;
    font-size: 15px;
    letter-spacing: -0.005em;
    color: var(--text-mid);
  }
  .providers .provider.together { font-weight: 500; }
  .providers .provider em {
    font-family: var(--font-display), "Caveat", cursive;
    font-style: italic;
    font-weight: 400;
  }

  .quickstart .caption { margin-bottom: 36px; display: block; }
  .qs-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  @media (max-width: 880px) { .qs-grid { grid-template-columns: 1fr; } }
  .qs-block { display: flex; flex-direction: column; gap: 12px; }
  .qs-num {
    font-family: var(--font-display), "Caveat", cursive;
    font-style: italic;
    color: var(--accent-clay);
    font-size: 22px;
  }
  .qs-code {
    background: var(--bg-cream-2);
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 18px 20px;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 14.5px;
    color: var(--text-ink);
    overflow-x: auto;
  }
  .qs-cap {
    font-size: 13.5px;
    color: var(--text-mid);
    line-height: 1.5;
  }
  .qs-cap code {
    font-family: var(--font-mono), ui-monospace, monospace;
  }

  footer {
    border-top: 1px solid var(--border-soft);
    padding: 64px 0;
  }
  .foot-inner {
    max-width: var(--max-w);
    margin: 0 auto;
    padding: 0 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    color: var(--text-mid);
    font-size: 14px;
  }
  .foot-left { display: flex; align-items: baseline; gap: 16px; }
  .foot-left .wordmark { font-size: 22px; color: var(--text-mid); }
  .foot-right { display: flex; gap: 22px; }
  .foot-right a {
    color: var(--text-mid);
    text-decoration: none;
    transition: color 150ms ease;
  }
  .foot-right a:hover { color: var(--text-ink); }
  @media (max-width: 600px) {
    .foot-inner { flex-direction: column; align-items: flex-start; }
  }
`;
