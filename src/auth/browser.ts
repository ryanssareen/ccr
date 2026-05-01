import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import kleur from "kleur";
import { authFilePath, resolveEndpoint, writeAuthFile, type AuthRecord } from "./terminal.js";

interface BrowserAuthOptions {
  endpoint?: string;
  method?: "email" | "github";
  fetchEnv?: NodeJS.ProcessEnv;
  openImpl?: (url: string) => boolean;
  rangeStart?: number;
  rangeEnd?: number;
  timeoutMs?: number;
}

const PORT_RANGE_START = 5050;
const PORT_RANGE_END = 5099;
const CALLBACK_PATH = "/callback";
const CLI_AUTH_PATH = "/cli-auth";
const TIMEOUT_MS = 5 * 60 * 1000;

class BrowserAuthError extends Error {}

function defaultOpen(url: string): boolean {
  let cmd: string;
  let args: string[];
  switch (process.platform) {
    case "darwin":
      cmd = "open";
      args = [url];
      break;
    case "win32":
      cmd = "cmd";
      args = ["/c", "start", "", url];
      break;
    default:
      cmd = "xdg-open";
      args = [url];
      break;
  }
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function startCallbackServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  rangeStart: number,
  rangeEnd: number,
): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  for (let port = rangeStart; port <= rangeEnd; port++) {
    const server = createServer(handler);
    const ok = await new Promise<boolean>((resolve) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.close();
        resolve(err.code === "EADDRINUSE" ? false : false);
      };
      server.once("error", onError);
      server.listen(port, "127.0.0.1", () => {
        server.removeListener("error", onError);
        resolve(true);
      });
    });
    if (ok) {
      const address = server.address() as AddressInfo;
      return { server, port: address.port };
    }
  }
  throw new BrowserAuthError(
    `No free port in range ${rangeStart}-${rangeEnd} for the callback server.`,
  );
}

const successPage = (email: string | null) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>CCR — signed in</title>
<style>
  :root { color-scheme: light; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #faf9f5; color: #141413;
    display: grid; place-items: center; min-height: 100vh; margin: 0;
  }
  .card { text-align: center; padding: 3rem 2.5rem; max-width: 28rem; }
  h1 { font-family: "Fraunces", Georgia, serif; font-weight: 400;
       font-size: 2.25rem; margin: 0 0 0.5rem 0; letter-spacing: -0.02em; }
  .check { color: #788c5d; font-size: 2.5rem; line-height: 1; }
  p  { color: #b0aea5; line-height: 1.6; margin: 0.5rem 0; }
  code { font-family: ui-monospace, "Geist Mono", monospace;
         font-size: 0.9rem; color: #d97757; }
</style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>All set.</h1>
    <p>Your terminal is now connected. You can close this tab.</p>
    ${email ? `<p><code>${escapeHtml(email)}</code></p>` : ""}
  </div>
</body>
</html>`;

const errorPage = (message: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>CCR — error</title>
<style>
  body {
    font-family: ui-sans-serif, system-ui, sans-serif;
    background: #faf9f5; color: #141413;
    display: grid; place-items: center; min-height: 100vh; margin: 0;
  }
  .card { text-align: center; padding: 3rem 2.5rem; max-width: 28rem; }
  h1 { font-family: "Fraunces", Georgia, serif; font-weight: 400;
       font-size: 2.25rem; margin: 0; }
  p  { color: #a85440; line-height: 1.6; }
</style>
</head>
<body>
  <div class="card">
    <h1>Sign-in failed.</h1>
    <p>${escapeHtml(message)}</p>
    <p>You can close this tab and try again with <code>ccr login --terminal</code>.</p>
  </div>
</body>
</html>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function authenticateViaBrowser(options: BrowserAuthOptions): Promise<AuthRecord> {
  const endpoint = resolveEndpoint(options.fetchEnv ?? process.env, options.endpoint);
  const open = options.openImpl ?? defaultOpen;
  const rangeStart = options.rangeStart ?? PORT_RANGE_START;
  const rangeEnd = options.rangeEnd ?? PORT_RANGE_END;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  let resolveResult!: (v: { token: string; email: string | null }) => void;
  let rejectResult!: (err: Error) => void;
  const result = new Promise<{ token: string; email: string | null }>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end();
      return;
    }
    const parsed = new URL(req.url, "http://127.0.0.1");
    if (parsed.pathname !== CALLBACK_PATH) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const errParam = parsed.searchParams.get("error");
    if (errParam) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(errorPage(errParam));
      rejectResult(new BrowserAuthError(`Browser reported error: ${errParam}`));
      return;
    }
    const token = parsed.searchParams.get("token");
    if (!token) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(errorPage("Missing token in callback."));
      rejectResult(new BrowserAuthError("Callback missing token parameter."));
      return;
    }
    const email = parsed.searchParams.get("email");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(successPage(email));
    resolveResult({ token, email });
  };

  const { server, port } = await startCallbackServer(handler, rangeStart, rangeEnd);
  const timer = setTimeout(() => {
    rejectResult(
      new BrowserAuthError(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for browser sign-in.`,
      ),
    );
  }, timeoutMs);

  const authUrl = new URL(CLI_AUTH_PATH, `${endpoint}/`);
  authUrl.searchParams.set("cli_redirect", `http://127.0.0.1:${port}${CALLBACK_PATH}`);
  if (options.method === "github") {
    authUrl.searchParams.set("method", "github");
  }
  const opened = open(authUrl.toString());
  if (!opened) {
    clearTimeout(timer);
    server.close();
    throw new BrowserAuthError("Could not open a web browser. Run `ccr login --terminal` instead.");
  }
  process.stdout.write(
    kleur.dim("Waiting for browser sign-in… ") +
      kleur.dim(`(if it didn't open, visit:\n${authUrl.toString()})\n`),
  );

  let callbackResult: { token: string; email: string | null };
  try {
    callbackResult = await result;
  } finally {
    clearTimeout(timer);
    server.close();
  }

  const record: AuthRecord = {
    token: callbackResult.token,
    endpoint,
    email: callbackResult.email ?? "",
  };
  await writeAuthFile(record);
  return record;
}

export async function runBrowserAuth(options: BrowserAuthOptions = {}): Promise<number> {
  let record: AuthRecord;
  try {
    record = await authenticateViaBrowser(options);
  } catch (err) {
    if (err instanceof BrowserAuthError) {
      console.error(kleur.red("✗ ") + err.message);
      return 1;
    }
    console.error(
      kleur.red("✗ Browser login failed: ") +
        (err instanceof Error ? err.message : String(err)),
    );
    return 1;
  }
  const where = authFilePath();
  const who = record.email ? ` as ${kleur.bold(record.email)}` : "";
  process.stdout.write(kleur.green("✓ Logged in") + who + kleur.dim(` (${where})\n`));
  return 0;
}
