import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".ccr");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const AUTH_PATH = path.join(CONFIG_DIR, "auth.json");

export interface CcrConfig {
  groqApiKey?: string;
  model?: string;
  nickname?: string;
  customInstructions?: string;
  toggles?: {
    autoAcceptEdits?: boolean;
    sendTelemetry?: boolean;
  };
}

export interface CcrAuth {
  token: string;
  endpoint: string;
  email: string;
}

export async function loadConfig(): Promise<CcrConfig> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const text = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(text) as CcrConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(cfg: CcrConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export async function loadAuth(): Promise<CcrAuth | null> {
  if (!existsSync(AUTH_PATH)) return null;
  try {
    const text = await fs.readFile(AUTH_PATH, "utf8");
    const parsed = JSON.parse(text) as Partial<CcrAuth>;
    if (
      typeof parsed.token === "string" &&
      typeof parsed.endpoint === "string" &&
      parsed.token.length > 0 &&
      parsed.endpoint.length > 0
    ) {
      return {
        token: parsed.token,
        endpoint: parsed.endpoint,
        email: typeof parsed.email === "string" ? parsed.email : "",
      };
    }
  } catch {}
  return null;
}

export async function saveAuth(auth: CcrAuth): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(AUTH_PATH, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

export async function clearAuth(): Promise<void> {
  if (existsSync(AUTH_PATH)) {
    await fs.unlink(AUTH_PATH);
  }
}

/** Apply config values to process.env if not already set. */
export function applyConfig(cfg: CcrConfig): void {
  if (cfg.groqApiKey && !process.env.GROQ_API_KEY) {
    process.env.GROQ_API_KEY = cfg.groqApiKey;
  }
  if (cfg.model && !process.env.CCR_MODEL) {
    process.env.CCR_MODEL = cfg.model;
  }
}

export function configPath(): string {
  return CONFIG_PATH;
}

export function authPath(): string {
  return AUTH_PATH;
}
