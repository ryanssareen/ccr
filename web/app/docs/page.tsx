import type { Metadata } from "next";
import Link from "next/link";

const GITHUB_URL = "https://github.com/ryanssareen/ccr";

export const metadata: Metadata = {
  title: "Docs — ccr"
};

export default function DocsPage() {
  return (
    <>
      <style>{docsStyles}</style>

      <nav className="docs-nav">
        <div className="docs-nav-inner">
          <Link href="/" className="docs-wordmark">
            ccr
          </Link>
          <div className="docs-nav-links">
            <a className="docs-nav-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link className="docs-nav-link active" href="/docs">
              Docs
            </Link>
          </div>
        </div>
      </nav>

      <div className="docs-container">
        <aside className="docs-sidebar">
          <h2 className="docs-sidebar-title">Docs</h2>
          <nav className="docs-sidebar-nav">
            <a href="#install" className="docs-sidebar-link">
              Installation
            </a>
            <a href="#usage" className="docs-sidebar-link">
              Basic usage
            </a>
            <a href="#commands" className="docs-sidebar-link">
              Commands
            </a>
            <a href="#config" className="docs-sidebar-link">
              Configuration
            </a>
            <a href="#faq" className="docs-sidebar-link">
              FAQ
            </a>
          </nav>
        </aside>

        <main className="docs-content">
          <h1 className="docs-title">Documentation</h1>
          <p className="docs-subtitle">
            Everything you need to know to get started with ccr.
          </p>

          <h2 id="install">Installation</h2>
          <p>Install ccr globally via npm. Requires Node 20 or higher.</p>
          <pre>
            <code>npm install -g @ryanisavibecoder/ccr</code>
          </pre>

          <p>Once installed, authenticate with your ccr account:</p>
          <pre>
            <code>ccr login</code>
          </pre>

          <p>This opens your browser and walks you through sign-in. No API key required.</p>

          <div className="docs-tip">
            <p>
              <strong>Tip:</strong> If you&apos;re behind a corporate proxy, set{" "}
              <code>HTTP_PROXY</code> and <code>HTTPS_PROXY</code> environment variables before
              running <code>ccr login</code>.
            </p>
          </div>

          <h2 id="usage">Basic usage</h2>
          <p>
            Run ccr from the root of any project. The simplest form takes a single instruction:
          </p>
          <pre>
            <code>ccr &quot;add a README explaining this codebase&quot;</code>
          </pre>
          <p>
            ccr reads your project, proposes changes, and asks for approval before writing
            anything to disk.
          </p>

          <h3>Multi-step tasks</h3>
          <p>You can give ccr complex instructions and it will break them down:</p>
          <pre>
            <code>
              ccr &quot;refactor the auth module to use JWT, update the tests, and add a
              migration script&quot;
            </code>
          </pre>

          <h3>Interactive mode</h3>
          <p>Run ccr without arguments to start an interactive session:</p>
          <pre>
            <code>ccr</code>
          </pre>
          <p>
            Type your instructions at the prompt. Use <code>exit</code> or <code>Ctrl+C</code> to
            quit.
          </p>

          <h2 id="commands">Commands</h2>

          <h3>
            <code>ccr &lt;instruction&gt;</code>
          </h3>
          <p>Execute a single instruction and exit.</p>

          <h3>
            <code>ccr login</code>
          </h3>
          <p>Authenticate with your ccr account. Opens a browser window.</p>

          <h3>
            <code>ccr logout</code>
          </h3>
          <p>Clear stored credentials.</p>

          <h3>
            <code>ccr status</code>
          </h3>
          <p>Check authentication status and current quota.</p>

          <h3>
            <code>ccr version</code>
          </h3>
          <p>Print the installed version.</p>

          <h2 id="config">Configuration</h2>
          <p>
            ccr reads configuration from <code>.ccrrc</code> in your project root or home
            directory. Example:
          </p>
          <pre>
            <code>{`{
  "ignore": [
    "node_modules/**",
    "dist/**",
    "*.log"
  ],
  "model": "auto"
}`}</code>
          </pre>

          <h3>Options</h3>
          <ul>
            <li>
              <code>ignore</code> — Array of glob patterns. Files matching these are never read or
              modified.
            </li>
            <li>
              <code>model</code> — Model preference. Default is <code>&quot;auto&quot;</code>{" "}
              (ccr picks based on task). Advanced users can specify a provider.
            </li>
          </ul>

          <h2 id="faq">FAQ</h2>

          <h3>How does ccr stay free?</h3>
          <p>
            ccr routes requests across several LLM providers (Groq, Together AI, Cerebras,
            OpenRouter) and aggregates their free tiers. We pay nothing to run it; you pay nothing
            to use it. If that ever changes, we&apos;ll tell you here.
          </p>

          <h3>What files does ccr read?</h3>
          <p>
            ccr indexes text files (source code, config, markdown, etc.) and ignores binaries,
            images, and common build artifacts. You can customize this with the{" "}
            <code>ignore</code> config.
          </p>

          <h3>Can I use my own API key?</h3>
          <p>
            Not yet. The free routing is baked into ccr&apos;s backend. If you need enterprise
            features or guaranteed capacity, reach out.
          </p>

          <h3>Is my code private?</h3>
          <p>
            Yes. Code you send to ccr is processed by our LLM providers under their respective
            privacy policies. We don&apos;t train on your data and we don&apos;t share it. See
            our <Link href="/privacy">Privacy Policy</Link> for details.
          </p>
        </main>
      </div>
    </>
  );
}

const docsStyles = `
  .docs-nav {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--bg-cream);
    border-bottom: 1px solid var(--border-soft);
  }
  .docs-nav-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .docs-wordmark {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 28px;
    letter-spacing: -0.01em;
    color: var(--text-ink);
    text-decoration: none;
    transform: rotate(-1.5deg);
    display: inline-block;
  }
  .docs-nav-links { display: flex; align-items: center; gap: 6px; }
  .docs-nav-link {
    font-size: 15px;
    color: var(--text-ink);
    text-decoration: none;
    padding: 8px 14px;
    border-radius: 8px;
    transition: color 150ms ease;
  }
  .docs-nav-link:hover { color: var(--accent-clay); }
  .docs-nav-link.active { color: var(--accent-clay); font-weight: 500; }

  .docs-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 64px 32px;
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 80px;
  }
  @media (max-width: 880px) {
    .docs-container { grid-template-columns: 1fr; gap: 48px; padding: 48px 24px; }
    .docs-sidebar { display: none; }
  }

  .docs-sidebar {
    position: sticky;
    top: 100px;
    align-self: start;
  }
  .docs-sidebar-title {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 24px;
    margin: 0 0 20px;
    transform: rotate(-1deg);
  }
  .docs-sidebar-nav { display: flex; flex-direction: column; gap: 4px; }
  .docs-sidebar-link {
    font-size: 15px;
    color: var(--text-mid);
    text-decoration: none;
    padding: 6px 12px;
    border-radius: 6px;
    transition: color 150ms ease, background 150ms ease;
  }
  .docs-sidebar-link:hover {
    color: var(--text-ink);
    background: var(--bg-cream-2);
  }

  .docs-content { max-width: 680px; }
  .docs-title {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: clamp(48px, 6vw, 64px);
    line-height: 1.1;
    margin: 0 0 16px;
    transform: rotate(-1deg);
  }
  .docs-subtitle {
    font-size: 18px;
    color: #5b5a55;
    margin: 0 0 48px;
  }

  .docs-content h2 {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 36px;
    line-height: 1.2;
    margin: 56px 0 16px;
    transform: rotate(-0.5deg);
  }
  .docs-content h2:first-of-type { margin-top: 0; }
  .docs-content h3 {
    font-family: var(--font-sans), Inter, sans-serif;
    font-weight: 600;
    font-size: 20px;
    margin: 36px 0 12px;
  }
  .docs-content p {
    margin: 0 0 20px;
    color: #3f3e3a;
  }
  .docs-content code {
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 0.92em;
    background: var(--bg-cream-2);
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--text-ink);
  }
  .docs-content pre {
    background: var(--bg-cream-2);
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 20px 22px;
    overflow-x: auto;
    margin: 24px 0;
  }
  .docs-content pre code {
    background: none;
    padding: 0;
    font-size: 14.5px;
  }
  .docs-content ul, .docs-content ol {
    margin: 0 0 20px;
    padding-left: 28px;
    color: #3f3e3a;
  }
  .docs-content li { margin-bottom: 8px; }
  .docs-content a {
    color: var(--accent-clay);
    text-decoration: none;
  }
  .docs-content a:hover { text-decoration: underline; }

  .docs-tip {
    background: rgba(120, 140, 93, 0.08);
    border-left: 3px solid var(--accent-sage);
    padding: 16px 20px;
    margin: 24px 0;
    border-radius: 6px;
  }
  .docs-tip p:last-child { margin-bottom: 0; }
`;
