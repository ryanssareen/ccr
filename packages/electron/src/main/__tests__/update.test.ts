// Update-check logic: version parsing/compare, which release wins, the
// external-URL allowlist, and the GitHub lookup against an injected fetch.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkForUpdate,
  compareVersions,
  isAllowedExternalUrl,
  parseVersion,
  pickLatestDesktopRelease,
  type GithubRelease,
} from "../update.js";

function release(tag: string, extra: Partial<GithubRelease> = {}): GithubRelease {
  return {
    tag_name: tag,
    html_url: `https://github.com/ryanssareen/ccr/releases/tag/${tag}`,
    ...extra,
  };
}

/** A fetch stub returning a canned JSON body with the given status. */
function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return (async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("parseVersion", () => {
  it("parses bare, v-prefixed, and desktop-v-prefixed versions", () => {
    assert.deepEqual(parseVersion("1.2.3"), [1, 2, 3]);
    assert.deepEqual(parseVersion("v0.1.6"), [0, 1, 6]);
    assert.deepEqual(parseVersion("desktop-v0.1.10"), [0, 1, 10]);
  });

  it("returns null for garbage", () => {
    assert.equal(parseVersion("nightly"), null);
    assert.equal(parseVersion(""), null);
  });
});

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    assert.equal(compareVersions("0.1.6", "0.1.5"), 1);
    assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
    assert.equal(compareVersions("1.0.0", "0.9.9"), 1);
    assert.equal(compareVersions("0.1.5", "0.1.6"), -1);
    assert.equal(compareVersions("0.1.6", "0.1.6"), 0);
  });

  it("does not treat 0.1.10 as older than 0.1.9 (numeric, not lexical)", () => {
    assert.equal(compareVersions("0.1.10", "0.1.9"), 1);
  });

  it("treats unparseable input as equal rather than throwing", () => {
    assert.equal(compareVersions("weird", "0.1.6"), 0);
  });
});

describe("pickLatestDesktopRelease", () => {
  it("picks the highest desktop-v version", () => {
    const latest = pickLatestDesktopRelease([
      release("desktop-v0.1.4"),
      release("desktop-v0.1.6"),
      release("desktop-v0.1.5"),
    ]);
    assert.equal(latest?.tag_name, "desktop-v0.1.6");
  });

  it("ignores non-desktop tags, drafts, and prereleases", () => {
    const latest = pickLatestDesktopRelease([
      release("v1.4.6"), // an npm release tag, not a desktop build
      release("desktop-v0.2.0", { draft: true }),
      release("desktop-v0.1.9", { prerelease: true }),
      release("desktop-v0.1.6"),
    ]);
    assert.equal(latest?.tag_name, "desktop-v0.1.6");
  });

  it("returns null when there is no desktop release", () => {
    assert.equal(pickLatestDesktopRelease([release("v1.4.6")]), null);
    assert.equal(pickLatestDesktopRelease([]), null);
  });
});

describe("isAllowedExternalUrl", () => {
  it("accepts https github.com URLs", () => {
    assert.equal(isAllowedExternalUrl("https://github.com/ryanssareen/ccr/releases/tag/desktop-v0.1.6"), true);
    assert.equal(isAllowedExternalUrl("https://www.github.com/x"), true);
  });

  it("rejects other hosts, http, and non-strings", () => {
    assert.equal(isAllowedExternalUrl("https://evil.example.com"), false);
    assert.equal(isAllowedExternalUrl("http://github.com/x"), false);
    assert.equal(isAllowedExternalUrl("file:///etc/passwd"), false);
    assert.equal(isAllowedExternalUrl("not a url"), false);
    assert.equal(isAllowedExternalUrl(42), false);
    // Guards against a "github.com.evil.com" lookalike.
    assert.equal(isAllowedExternalUrl("https://github.com.evil.com"), false);
  });
});

describe("checkForUpdate", () => {
  it("reports an update when the latest release is newer", async () => {
    const res = await checkForUpdate("0.1.5", {
      fetchImpl: fakeFetch([release("desktop-v0.1.6"), release("desktop-v0.1.5")]),
    });
    assert.equal(res.ok, true);
    assert.equal(res.updateAvailable, true);
    assert.equal(res.latest, "0.1.6");
    assert.equal(res.current, "0.1.5");
    assert.match(res.releaseUrl ?? "", /desktop-v0\.1\.6$/);
  });

  it("reports no update when already on the latest", async () => {
    const res = await checkForUpdate("0.1.6", {
      fetchImpl: fakeFetch([release("desktop-v0.1.6")]),
    });
    assert.equal(res.ok, true);
    assert.equal(res.updateAvailable, false);
  });

  it("surfaces a GitHub API error without throwing", async () => {
    const res = await checkForUpdate("0.1.6", {
      fetchImpl: fakeFetch(null, false, 403),
    });
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /403/);
  });

  it("returns ok with no update when there are no desktop releases", async () => {
    const res = await checkForUpdate("0.1.6", {
      fetchImpl: fakeFetch([release("v1.4.6")]),
    });
    assert.equal(res.ok, true);
    assert.equal(res.updateAvailable, false);
  });

  it("treats a thrown fetch (offline) as a soft failure", async () => {
    const res = await checkForUpdate("0.1.6", {
      fetchImpl: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /offline/);
  });
});
