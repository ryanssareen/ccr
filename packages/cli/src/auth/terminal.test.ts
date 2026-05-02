import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";

import {
  authFilePath,
  DEFAULT_ENDPOINT,
  GITHUB_LOGIN_REQUIRES_BROWSER_MESSAGE,
  runTerminalAuth,
} from "./terminal.js";

class MockTTYInput extends PassThrough {
  isTTY = true;
  isRaw = false;

  setRawMode(value: boolean): void {
    this.isRaw = value;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

class MockTTYOutput extends PassThrough {
  isTTY = true;
  columns = 80;
  rows = 24;

  getColorDepth(): number {
    return 8;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

function stripAnsi(text: string): string {
  return text
    .replace(/\u001B\][^\u0007]*\u0007/g, "")
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001B[=>]/g, "")
    .replace(/\r/g, "");
}

function createMockTerminal() {
  const stdin = new MockTTYInput();
  const stdout = new MockTTYOutput();
  let buffer = "";

  stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
  });

  return {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    output: () => stripAnsi(buffer),
  };
}

async function waitFor(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for terminal output");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function typeAndSubmit(stdin: NodeJS.ReadStream, text: string): Promise<void> {
  for (const character of text) {
    (stdin as unknown as MockTTYInput).write(character);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  (stdin as unknown as MockTTYInput).write("\r");
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function readAuth(homeDir: string) {
  return JSON.parse(await readFile(authFilePath(homeDir), "utf8")) as {
    token: string;
    endpoint: string;
    email: string;
  };
}

describe("terminal auth", () => {
  it("prompts for email + password and writes auth.json on success", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "ccr-auth-"));
    const terminal = createMockTerminal();

    const authRun = runTerminalAuth({
      homeDir,
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      fetchImpl: async () => jsonResponse({ token: "abc123", email: "user@example.com" }),
    });

    await waitFor(() => terminal.output().includes("Email:"));
    await typeAndSubmit(terminal.stdin, "user@example.com");
    await waitFor(() => terminal.output().includes("Password:"));
    await typeAndSubmit(terminal.stdin, "supersecret");

    const code = await authRun;
    assert.equal(code, 0);
    assert.match(terminal.output(), /Logged in as user@example\.com/);

    const saved = await readAuth(homeDir);
    assert.deepEqual(saved, {
      token: "abc123",
      endpoint: DEFAULT_ENDPOINT,
      email: "user@example.com",
    });
  });

  it("uses CCR_ENDPOINT env var when set", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "ccr-auth-"));
    const terminal = createMockTerminal();
    const requests: string[] = [];

    const authRun = runTerminalAuth({
      homeDir,
      env: { CCR_ENDPOINT: "http://localhost:3000/" },
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      fetchImpl: async (input) => {
        requests.push(String(input));
        return jsonResponse({ token: "abc123", email: "dev@example.com" });
      },
    });

    await waitFor(() => terminal.output().includes("Email:"));
    await typeAndSubmit(terminal.stdin, "dev@example.com");
    await waitFor(() => terminal.output().includes("Password:"));
    await typeAndSubmit(terminal.stdin, "password123");

    const code = await authRun;
    assert.equal(code, 0);
    assert.equal(requests[0], "http://localhost:3000/api/v1/signupOrLogin");

    const saved = await readAuth(homeDir);
    assert.equal(saved.endpoint, "http://localhost:3000");
  });

  it("rejects empty email and re-prompts", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "ccr-auth-"));
    const terminal = createMockTerminal();
    let fetchCalls = 0;

    const authRun = runTerminalAuth({
      homeDir,
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      fetchImpl: async () => {
        fetchCalls += 1;
        return jsonResponse({ token: "abc123", email: "user@example.com" });
      },
    });

    await waitFor(() => terminal.output().includes("Email:"));
    await typeAndSubmit(terminal.stdin, "");
    await waitFor(() => terminal.output().includes("Email is required."));
    assert.equal(fetchCalls, 0);

    await typeAndSubmit(terminal.stdin, "user@example.com");
    await waitFor(() => terminal.output().includes("Password:"));
    await typeAndSubmit(terminal.stdin, "password123");

    const code = await authRun;
    assert.equal(code, 0);
    assert.equal(fetchCalls, 1);
  });

  it("rejects malformed email and re-prompts", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "ccr-auth-"));
    const terminal = createMockTerminal();
    let fetchCalls = 0;

    const authRun = runTerminalAuth({
      homeDir,
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      fetchImpl: async () => {
        fetchCalls += 1;
        return jsonResponse({ token: "abc123", email: "user@example.com" });
      },
    });

    await waitFor(() => terminal.output().includes("Email:"));
    await typeAndSubmit(terminal.stdin, "not-an-email");
    await waitFor(() => terminal.output().includes("Enter a valid email address."));
    assert.equal(fetchCalls, 0);

    await typeAndSubmit(terminal.stdin, "user@example.com");
    await waitFor(() => terminal.output().includes("Password:"));
    await typeAndSubmit(terminal.stdin, "password123");

    const code = await authRun;
    assert.equal(code, 0);
    assert.equal(fetchCalls, 1);
  });

  it('shows "incorrect password" on 401 and re-prompts', async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "ccr-auth-"));
    const terminal = createMockTerminal();
    let attempts = 0;

    const authRun = runTerminalAuth({
      homeDir,
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) {
          return jsonResponse({ error: "invalid credentials" }, 401);
        }
        return jsonResponse({ token: "abc123", email: "user@example.com" });
      },
    });

    await waitFor(() => terminal.output().includes("Email:"));
    await typeAndSubmit(terminal.stdin, "user@example.com");
    await waitFor(() => terminal.output().includes("Password:"));
    await typeAndSubmit(terminal.stdin, "wrongpass");
    await waitFor(() => terminal.output().includes("Incorrect password."));
    await typeAndSubmit(terminal.stdin, "correctpass");

    const code = await authRun;
    assert.equal(code, 0);
    assert.equal(attempts, 2);
  });

  it("exits with non-zero after 3 failed password attempts", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "ccr-auth-"));
    const terminal = createMockTerminal();
    let attempts = 0;

    const authRun = runTerminalAuth({
      homeDir,
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      fetchImpl: async () => {
        attempts += 1;
        return jsonResponse({ error: "invalid credentials" }, 401);
      },
    });

    await waitFor(() => terminal.output().includes("Email:"));
    await typeAndSubmit(terminal.stdin, "user@example.com");
    await waitFor(() => terminal.output().includes("Password:"));
    await typeAndSubmit(terminal.stdin, "wrongpass1");
    await waitFor(() => attempts === 1 && terminal.output().includes("Incorrect password."));
    await typeAndSubmit(terminal.stdin, "wrongpass2");
    await waitFor(() => attempts === 2 && terminal.output().includes("Incorrect password."));
    await typeAndSubmit(terminal.stdin, "wrongpass3");

    const code = await authRun;
    assert.equal(code, 1);
    assert.equal(attempts, 3);
    assert.match(terminal.output(), /Incorrect password\./);
  });

  it('shows "cannot reach service" on fetch rejection', async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "ccr-auth-"));
    const terminal = createMockTerminal();

    const authRun = runTerminalAuth({
      homeDir,
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });

    await waitFor(() => terminal.output().includes("Email:"));
    await typeAndSubmit(terminal.stdin, "user@example.com");
    await waitFor(() => terminal.output().includes("Password:"));
    await typeAndSubmit(terminal.stdin, "password123");

    const code = await authRun;
    assert.equal(code, 1);
    assert.match(terminal.output(), /Cannot reach ccr service/);
  });

  it("handles 5xx gracefully", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "ccr-auth-"));
    const terminal = createMockTerminal();

    const authRun = runTerminalAuth({
      homeDir,
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      fetchImpl: async () => jsonResponse({ error: "server exploded" }, 503),
    });

    await waitFor(() => terminal.output().includes("Email:"));
    await typeAndSubmit(terminal.stdin, "user@example.com");
    await waitFor(() => terminal.output().includes("Password:"));
    await typeAndSubmit(terminal.stdin, "password123");

    const code = await authRun;
    assert.equal(code, 1);
    assert.match(terminal.output(), /Cannot reach ccr service/);
  });

  it("writes auth.json with mode 0600", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "ccr-auth-"));
    const terminal = createMockTerminal();

    const authRun = runTerminalAuth({
      homeDir,
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      fetchImpl: async () => jsonResponse({ token: "abc123", email: "user@example.com" }),
    });

    await waitFor(() => terminal.output().includes("Email:"));
    await typeAndSubmit(terminal.stdin, "user@example.com");
    await waitFor(() => terminal.output().includes("Password:"));
    await typeAndSubmit(terminal.stdin, "password123");

    const code = await authRun;
    assert.equal(code, 0);

    const fileStats = await stat(authFilePath(homeDir));
    assert.equal(fileStats.mode & 0o777, 0o600);
  });

  it("writes correct token, endpoint, email fields", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "ccr-auth-"));
    const terminal = createMockTerminal();

    const authRun = runTerminalAuth({
      homeDir,
      env: { CCR_ENDPOINT: "https://preview.ccr.dev" },
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      fetchImpl: async () => jsonResponse({ token: "feedface", email: "writer@example.com" }),
    });

    await waitFor(() => terminal.output().includes("Email:"));
    await typeAndSubmit(terminal.stdin, "writer@example.com");
    await waitFor(() => terminal.output().includes("Password:"));
    await typeAndSubmit(terminal.stdin, "password123");

    const code = await authRun;
    assert.equal(code, 0);

    const saved = await readAuth(homeDir);
    assert.deepEqual(saved, {
      token: "feedface",
      endpoint: "https://preview.ccr.dev",
      email: "writer@example.com",
    });
  });

  it("prints helpful error when --method github is combined with --terminal", async () => {
    const terminal = createMockTerminal();

    const code = await runTerminalAuth({
      method: "github",
      stdin: terminal.stdin,
      stdout: terminal.stdout,
    });

    assert.equal(code, 1);
    assert.match(terminal.output(), new RegExp(GITHUB_LOGIN_REQUIRES_BROWSER_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});
