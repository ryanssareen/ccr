import { spawn } from "node:child_process";
import { createServer } from "node:http";
import kleur from "kleur";
import { authFilePath, resolveEndpoint, writeAuthFile, } from "./terminal.js";
// Range we try when binding the local callback server. We want a stable-ish
// range so users can predictably allow it through any local firewall, but
// wide enough to survive collisions when multiple ccr logins run at once.
const PORT_RANGE_START = 5050;
const PORT_RANGE_END = 5099;
const CALLBACK_PATH = "/callback";
const CLI_AUTH_PATH = "/cli-auth";
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for the user to complete login
class BrowserAuthError extends Error {
}
/**
 * Cross-platform "open URL in default browser". Returns true if we believe
 * the spawn succeeded; the OS will silently swallow truly broken cases, but
 * this is good enough to detect "no DISPLAY / no browser available" up front.
 */
function defaultOpen(url) {
    let cmd;
    let args;
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
        child.on("error", () => { });
        child.unref();
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Tries each port in the configured range until one binds. Returns the live
 * server (already listening) and the port it picked. Throws if every port
 * is in use.
 */
async function startCallbackServer(handler, rangeStart, rangeEnd) {
    for (let port = rangeStart; port <= rangeEnd; port++) {
        const server = createServer(handler);
        const ok = await new Promise((resolve) => {
            const onError = (err) => {
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
            const address = server.address();
            return { server, port: address.port };
        }
    }
    throw new BrowserAuthError(`No free port in range ${rangeStart}-${rangeEnd} for the callback server.`);
}
const successPage = (email) => `<!doctype html>
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
const errorPage = (message) => `<!doctype html>
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
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
/**
 * Drives the full browser-based login flow. Returns the AuthRecord (already
 * persisted to ~/.ccr/auth.json before resolving). Throws BrowserAuthError
 * on cancellation, timeout, or upstream errors.
 */
async function authenticateViaBrowser(options) {
    const endpoint = resolveEndpoint(options.fetchEnv ?? process.env, options.endpoint);
    const open = options.openImpl ?? defaultOpen;
    const rangeStart = options.rangeStart ?? PORT_RANGE_START;
    const rangeEnd = options.rangeEnd ?? PORT_RANGE_END;
    const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    let resolveResult;
    let rejectResult;
    const result = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    const handler = (req, res) => {
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
        rejectResult(new BrowserAuthError(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for browser sign-in.`));
    }, timeoutMs);
    // Build the auth URL. We always send the user to /cli-auth on the website
    // with a cli_redirect pointing back to this local server. The website does
    // the Firebase + ID-token-exchange dance and redirects back with the token.
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
    // Tell the user what's happening so they're not staring at a frozen prompt.
    process.stdout.write(kleur.dim("Waiting for browser sign-in… ") +
        kleur.dim(`(if it didn't open, visit:\n${authUrl.toString()})\n`));
    let callbackResult;
    try {
        callbackResult = await result;
    }
    finally {
        clearTimeout(timer);
        server.close();
    }
    const record = {
        token: callbackResult.token,
        endpoint,
        email: callbackResult.email ?? "",
    };
    await writeAuthFile(record);
    return record;
}
/**
 * Public entry point used by `ccr login`. Returns a process exit code
 * (0 = success). All user-facing output is printed here so callers don't
 * have to know about UI vs error handling.
 */
export async function runBrowserAuth(options = {}) {
    let record;
    try {
        record = await authenticateViaBrowser(options);
    }
    catch (err) {
        if (err instanceof BrowserAuthError) {
            console.error(kleur.red("✗ ") + err.message);
            return 1;
        }
        console.error(kleur.red("✗ Browser login failed: ") +
            (err instanceof Error ? err.message : String(err)));
        return 1;
    }
    const where = authFilePath();
    const who = record.email ? ` as ${kleur.bold(record.email)}` : "";
    process.stdout.write(kleur.green("✓ Logged in") + who + kleur.dim(` (${where})\n`));
    return 0;
}
//# sourceMappingURL=browser.js.map