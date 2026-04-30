import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useApp } from "ink";
import { render } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";

export const DEFAULT_ENDPOINT = "https://ccr.vercel.app";
export const SIGNUP_OR_LOGIN_PATH = "/api/v1/signupOrLogin";
export const GITHUB_LOGIN_REQUIRES_BROWSER_MESSAGE =
  "GitHub login requires a browser. Run `ccr login` (without --terminal).";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthRecord {
  token: string;
  endpoint: string;
  email: string;
}

export interface TerminalAuthOptions {
  endpoint?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  homeDir?: string;
  fsImpl?: Pick<typeof fs, "mkdir" | "writeFile" | "chmod">;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  method?: "email" | "github";
  maxAttempts?: number;
}

interface TerminalAuthResult {
  code: number;
}

interface TerminalAuthAppProps {
  endpoint: string;
  fetchImpl: typeof fetch;
  homeDir: string;
  fsImpl: Pick<typeof fs, "mkdir" | "writeFile" | "chmod">;
  maxAttempts: number;
  onFinish: (result: TerminalAuthResult) => void;
}

type Step = "email" | "password" | "submitting" | "success" | "fatal";

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  const normalized = trimmed.replace(/\/+$/, "");
  return normalized || DEFAULT_ENDPOINT;
}

export function resolveEndpoint(
  env: NodeJS.ProcessEnv = process.env,
  explicitEndpoint?: string,
): string {
  return normalizeEndpoint(explicitEndpoint ?? env.CCR_ENDPOINT ?? DEFAULT_ENDPOINT);
}

export function authFilePath(homeDir = os.homedir()): string {
  return path.join(homeDir, ".ccr", "auth.json");
}

export async function writeAuthFile(
  record: AuthRecord,
  options: {
    homeDir?: string;
    fsImpl?: Pick<typeof fs, "mkdir" | "writeFile" | "chmod">;
  } = {},
): Promise<void> {
  const fsImpl = options.fsImpl ?? fs;
  const filePath = authFilePath(options.homeDir);

  await fsImpl.mkdir(path.dirname(filePath), { recursive: true });
  await fsImpl.writeFile(filePath, JSON.stringify(record, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await fsImpl.chmod(filePath, 0o600);
}

function buildSignupOrLoginUrl(endpoint: string): string {
  return new URL(SIGNUP_OR_LOGIN_PATH, `${normalizeEndpoint(endpoint)}/`).toString();
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function TerminalAuthApp({
  endpoint,
  fetchImpl,
  homeDir,
  fsImpl,
  maxAttempts,
  onFinish,
}: TerminalAuthAppProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  const completionRef = useRef<TerminalAuthResult | null>(null);
  const failedAttemptsRef = useRef(0);
  const didFinishRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!completionRef.current || didFinishRef.current) {
      return;
    }
    if (step !== "success" && step !== "fatal") {
      return;
    }

    didFinishRef.current = true;
    const result = completionRef.current;
    const timer = setTimeout(() => {
      onFinish(result);
      exit();
    }, 0);

    return () => clearTimeout(timer);
  }, [exit, onFinish, step]);

  const submitPassword = useCallback(
    async (submittedPassword: string) => {
      setError(null);
      setStep("submitting");

      try {
        const response = await fetchImpl(buildSignupOrLoginUrl(endpoint), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            method: "email",
            credentials: {
              email: email.trim(),
              password: submittedPassword,
            },
          }),
        });

        if (!isMountedRef.current) {
          return;
        }

        if (response.status >= 500) {
          completionRef.current = { code: 1 };
          setFinalMessage("Cannot reach ccr service");
          setStep("fatal");
          return;
        }

        if (response.status === 401) {
          failedAttemptsRef.current += 1;
          if (failedAttemptsRef.current >= maxAttempts) {
            completionRef.current = { code: 1 };
            setFinalMessage("Incorrect password.");
            setStep("fatal");
            return;
          }

          setError("Incorrect password.");
          setPassword("");
          setStep("password");
          return;
        }

        const body = await parseJson(response);

        if (response.status === 400) {
          completionRef.current = { code: 1 };
          setFinalMessage(typeof body.error === "string" ? body.error : "Authentication failed.");
          setStep("fatal");
          return;
        }

        if (!response.ok) {
          completionRef.current = { code: 1 };
          setFinalMessage("Cannot reach ccr service");
          setStep("fatal");
          return;
        }

        const token = typeof body.token === "string" ? body.token : null;
        const responseEmail = typeof body.email === "string" ? body.email : email.trim();

        if (!token) {
          completionRef.current = { code: 1 };
          setFinalMessage("Authentication failed.");
          setStep("fatal");
          return;
        }

        await writeAuthFile(
          {
            token,
            endpoint,
            email: responseEmail,
          },
          { homeDir, fsImpl },
        );

        if (!isMountedRef.current) {
          return;
        }

        completionRef.current = { code: 0 };
        setFinalMessage(`✓ Logged in as ${responseEmail}`);
        setStep("success");
      } catch {
        if (!isMountedRef.current) {
          return;
        }
        completionRef.current = { code: 1 };
        setFinalMessage("Cannot reach ccr service");
        setStep("fatal");
      }
    },
    [email, endpoint, fetchImpl, fsImpl, homeDir, maxAttempts],
  );

  const handleEmailSubmit = useCallback(
    (submittedEmail: string) => {
      const trimmedEmail = submittedEmail.trim();
      if (!trimmedEmail) {
        setError("Email is required.");
        return;
      }
      if (!isValidEmail(trimmedEmail)) {
        setError("Enter a valid email address.");
        return;
      }

      setEmail(trimmedEmail);
      setPassword("");
      setError(null);
      failedAttemptsRef.current = 0;
      setStep("password");
    },
    [],
  );

  const emailDisplay =
    step === "email"
      ? React.createElement(TextInput, {
          value: email,
          onChange: setEmail,
          onSubmit: handleEmailSubmit,
        })
      : React.createElement(Text, null, email);

  const passwordDisplay =
    step === "password"
      ? React.createElement(TextInput, {
          value: password,
          onChange: setPassword,
          onSubmit: submitPassword,
          mask: "●",
        })
      : step === "submitting"
        ? React.createElement(Text, null, "●".repeat(password.length))
        : null;

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { bold: true }, "CCR sign in / sign up"),
    React.createElement(
      Box,
      { marginTop: 1 },
      React.createElement(Text, null, "Email: "),
      emailDisplay,
    ),
    step !== "email"
      ? React.createElement(
          Box,
          null,
          React.createElement(Text, null, "Password: "),
          passwordDisplay,
        )
      : null,
    error
      ? React.createElement(
          Box,
          { marginTop: 1 },
          React.createElement(Text, { color: "red" }, error),
        )
      : null,
    step === "submitting"
      ? React.createElement(
          Box,
          { marginTop: 1 },
          React.createElement(
            Text,
            { color: "cyan" },
            React.createElement(Spinner, { type: "dots" }),
            " Signing in...",
          ),
        )
      : null,
    finalMessage
      ? React.createElement(
          Box,
          { marginTop: 1 },
          React.createElement(Text, { color: step === "success" ? "green" : "red" }, finalMessage),
        )
      : null,
  );
}

export async function runTerminalAuth(options: TerminalAuthOptions = {}): Promise<number> {
  const method = options.method ?? "email";
  const stdout = options.stdout ?? process.stdout;

  if (method === "github") {
    stdout.write(`${GITHUB_LOGIN_REQUIRES_BROWSER_MESSAGE}\n`);
    return 1;
  }

  const endpoint = resolveEndpoint(options.env, options.endpoint);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const homeDir = options.homeDir ?? os.homedir();
  const fsImpl = options.fsImpl ?? fs;
  const maxAttempts = options.maxAttempts ?? 3;

  let finish!: (result: TerminalAuthResult) => void;
  const resultPromise = new Promise<TerminalAuthResult>((resolve) => {
    finish = resolve;
  });

  const app = render(
    React.createElement(TerminalAuthApp, {
      endpoint,
      fetchImpl,
      homeDir,
      fsImpl,
      maxAttempts,
      onFinish: finish,
    }),
    {
      exitOnCtrlC: false,
      stdin: options.stdin ?? process.stdin,
      stdout,
    },
  );

  const [result] = await Promise.all([resultPromise, app.waitUntilExit()]);
  return result.code;
}

export default runTerminalAuth;
