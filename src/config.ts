import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".ccr");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export interface CcrConfig {
  groqApiKey?: string;
  model?: string;
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
