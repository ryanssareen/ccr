// Background "is there a newer ccr on npm?" check. Best-effort: any failure
// (offline, registry down, parse error) silently returns null so we never
// block startup or pollute the UI with errors.
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PACKAGE_NAME } from "./version.js";

const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;
const CACHE_DIR = path.join(os.homedir(), ".ccr");
const CACHE_PATH = path.join(CACHE_DIR, "update-check.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2500;

interface CacheRecord {
  checkedAt: number;
  latest: string;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  available: boolean;
}

/** Compare two semver-like strings (x.y.z, no prerelease). */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

async function loadCache(): Promise<CacheRecord | null> {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const text = await fs.readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(text) as Partial<CacheRecord>;
    if (typeof parsed.checkedAt === "number" && typeof parsed.latest === "string") {
      return { checkedAt: parsed.checkedAt, latest: parsed.latest };
    }
  } catch {
    // ignore
  }
  return null;
}

async function saveCache(latest: string): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(
      CACHE_PATH,
      JSON.stringify({ checkedAt: Date.now(), latest }, null, 2),
      "utf8",
    );
  } catch {
    // best-effort
  }
}

export async function checkForUpdate(current: string): Promise<UpdateInfo | null> {
  // Honor an opt-out so users on metered connections / CI can disable.
  if (process.env.CCR_NO_UPDATE_CHECK === "1") return null;

  const cached = await loadCache();
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return {
      current,
      latest: cached.latest,
      available: compareSemver(current, cached.latest) < 0,
    };
  }

  let signal: AbortSignal;
  try {
    signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  } catch {
    // Older Node versions without AbortSignal.timeout — skip the check.
    return null;
  }

  try {
    const res = await fetch(REGISTRY_URL, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    if (typeof body.version !== "string" || body.version.length === 0) return null;
    const latest = body.version;
    await saveCache(latest);
    return { current, latest, available: compareSemver(current, latest) < 0 };
  } catch {
    return null;
  }
}
