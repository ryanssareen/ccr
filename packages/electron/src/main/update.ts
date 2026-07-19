// Update check for the desktop app.
//
// The builds are unsigned (see RELEASING.md), so macOS refuses to let an
// updater self-install them — a silent auto-update would just fail at
// Gatekeeper. Instead we do the honest thing: ask GitHub for the newest
// `desktop-v*` release and, when it's newer than what's running, hand the user
// the release page so they can grab the DMG. This needs no signing, no
// electron-updater metadata (latest-mac.yml et al.), and no release server —
// only the GitHub Releases the CI workflow already publishes.
//
// `electron` is imported lazily (only openExternalSafe touches it) so the pure
// version logic stays unit-testable under `node --test`, where the electron
// module can't be required.
import type { OpenExternalResult, UpdateCheckResult } from "../common/ipc.js";

/** The repo whose releases we check — the app's own. */
const DEFAULT_REPO = "ryanssareen/ccr";

/** Desktop releases are tagged `desktop-vX.Y.Z`; npm and other tags are not. */
const DESKTOP_TAG_RE = /^desktop-v(\d+)\.(\d+)\.(\d+)$/;

/** Minimal shape of a GitHub Releases API item (only the fields we read). */
export interface GithubRelease {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
}

/** Parse a `x.y.z` (optionally `v`/`desktop-v` prefixed) string to a triple. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = v
    .trim()
    .replace(/^desktop-v/i, "")
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** -1 if a<b, 0 if equal (or either unparseable), 1 if a>b. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i]! > pb[i]! ? 1 : -1;
  }
  return 0;
}

/**
 * The newest published `desktop-v*` release, or null when there is none.
 * Drafts and prereleases are skipped — you can't download those.
 */
export function pickLatestDesktopRelease(releases: GithubRelease[]): GithubRelease | null {
  const candidates = releases.filter(
    (r) => r && !r.draft && !r.prerelease && DESKTOP_TAG_RE.test(r.tag_name),
  );
  if (candidates.length === 0) return null;
  return candidates
    .slice()
    .sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0]!;
}

/**
 * Look up the latest desktop release and compare it to `currentVersion`.
 * `fetchImpl` is injectable so tests never hit the network; production passes
 * the main-process global `fetch`.
 */
export async function checkForUpdate(
  currentVersion: string,
  opts: { fetchImpl?: typeof fetch; repo?: string } = {},
): Promise<UpdateCheckResult> {
  const repo = opts.repo ?? DEFAULT_REPO;
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(
      `https://api.github.com/repos/${repo}/releases?per_page=30`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "ccr-desktop",
        },
      },
    );
    if (!res.ok) {
      return { ok: false, current: currentVersion, error: `GitHub API returned ${res.status}` };
    }
    const releases = (await res.json()) as GithubRelease[];
    if (!Array.isArray(releases)) {
      return { ok: false, current: currentVersion, error: "Unexpected GitHub API response" };
    }
    const latest = pickLatestDesktopRelease(releases);
    if (!latest) {
      // No desktop release yet — not an error, just nothing to update to.
      return { ok: true, current: currentVersion, updateAvailable: false };
    }
    const parsed = parseVersion(latest.tag_name);
    const latestVer = parsed ? parsed.join(".") : latest.tag_name;
    return {
      ok: true,
      current: currentVersion,
      latest: latestVer,
      updateAvailable: compareVersions(latest.tag_name, currentVersion) > 0,
      releaseUrl: latest.html_url,
      publishedAt: latest.published_at,
    };
  } catch (err) {
    return {
      ok: false,
      current: currentVersion,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Only https GitHub URLs may be opened externally. The renderer passes back a
 * `releaseUrl` that main itself produced, but validating here keeps the
 * `shell.openExternal` seam from ever handing the OS an arbitrary or non-https
 * link.
 */
export function isAllowedExternalUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return host === "github.com" || host.endsWith(".github.com");
}

/** Validate then open an allowlisted URL in the user's default browser. */
export async function openExternalSafe(url: unknown): Promise<OpenExternalResult> {
  if (!isAllowedExternalUrl(url)) {
    return { ok: false, error: "Refusing to open a non-GitHub or non-https URL." };
  }
  try {
    const { shell } = await import("electron");
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
