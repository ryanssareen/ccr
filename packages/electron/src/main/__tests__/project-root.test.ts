// Issue #19: a packaged app launched from Finder inherits cwd = "/", which
// used to become the project root of every session it created.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFilesystemRoot,
  isUsableProjectRoot,
  resolveProjectRoot,
  sanitizeProjectRoot,
} from "../project-root.js";

/** Pretend every path under these prefixes is a real directory. */
function fakeDirs(...dirs: string[]) {
  return (p: string) => dirs.includes(p);
}

const HOME = "/Users/ryan";
const REPO = "/Users/ryan/Documents/ccr-npm";
const TMP = "/tmp";

describe("isFilesystemRoot", () => {
  it("is true for the posix root", () => {
    assert.equal(isFilesystemRoot("/"), true);
  });

  it("is true for paths that resolve to the root", () => {
    assert.equal(isFilesystemRoot("/.."), true);
    assert.equal(isFilesystemRoot("/Users/.."), true);
  });

  it("is false for real directories", () => {
    assert.equal(isFilesystemRoot(REPO), false);
    assert.equal(isFilesystemRoot(HOME), false);
  });
});

describe("isUsableProjectRoot", () => {
  const isDirectory = fakeDirs(HOME, REPO);

  it("rejects the filesystem root even though it exists", () => {
    assert.equal(isUsableProjectRoot("/", () => true), false);
  });

  it("rejects empty, relative, and missing paths", () => {
    assert.equal(isUsableProjectRoot("", isDirectory), false);
    assert.equal(isUsableProjectRoot("   ", isDirectory), false);
    assert.equal(isUsableProjectRoot("relative/path", isDirectory), false);
    assert.equal(isUsableProjectRoot(null, isDirectory), false);
    assert.equal(isUsableProjectRoot(undefined, isDirectory), false);
    assert.equal(isUsableProjectRoot("/does/not/exist", isDirectory), false);
  });

  it("accepts an existing absolute directory", () => {
    assert.equal(isUsableProjectRoot(REPO, isDirectory), true);
  });
});

describe("resolveProjectRoot", () => {
  const isDirectory = fakeDirs(HOME, REPO, TMP, "/Users/ryan/pinned");

  it("passes a normal dev cwd through unchanged (npm run dev:desktop)", () => {
    const root = resolveProjectRoot({
      cwd: REPO,
      isPackaged: false,
      homeDir: HOME,
      tmpDir: TMP,
      isDirectory,
    });
    assert.equal(root, REPO);
  });

  it("never yields '/' when cwd is '/' — the packaged-from-Finder case", () => {
    const root = resolveProjectRoot({
      cwd: "/",
      isPackaged: true,
      homeDir: HOME,
      tmpDir: TMP,
      isDirectory,
    });
    assert.notEqual(root, "/");
    assert.equal(root, HOME);
  });

  it("never yields '/' even unpackaged with cwd '/'", () => {
    const root = resolveProjectRoot({
      cwd: "/",
      isPackaged: false,
      homeDir: HOME,
      tmpDir: TMP,
      isDirectory,
    });
    assert.notEqual(root, "/");
    assert.equal(root, HOME);
  });

  it("prefers a pinned config root over home when packaged", () => {
    const root = resolveProjectRoot({
      cwd: "/",
      isPackaged: true,
      configuredRoot: "/Users/ryan/pinned",
      homeDir: HOME,
      tmpDir: TMP,
      isDirectory,
    });
    assert.equal(root, "/Users/ryan/pinned");
  });

  it("ignores cwd entirely when packaged, even if cwd looks usable", () => {
    // A packaged Windows app launched from Explorer gets the install dir as
    // cwd; that is not the user's project.
    const root = resolveProjectRoot({
      cwd: REPO,
      isPackaged: true,
      homeDir: HOME,
      tmpDir: TMP,
      isDirectory,
    });
    assert.equal(root, HOME);
  });

  it("dev cwd wins over a pinned config root", () => {
    const root = resolveProjectRoot({
      cwd: REPO,
      isPackaged: false,
      configuredRoot: "/Users/ryan/pinned",
      homeDir: HOME,
      tmpDir: TMP,
      isDirectory,
    });
    assert.equal(root, REPO);
  });

  it("skips a pinned root of '/' rather than honouring it", () => {
    const root = resolveProjectRoot({
      cwd: "/",
      isPackaged: true,
      configuredRoot: "/",
      homeDir: HOME,
      tmpDir: TMP,
      isDirectory,
    });
    assert.equal(root, HOME);
  });

  it("skips a pinned root that no longer exists", () => {
    const root = resolveProjectRoot({
      cwd: "/",
      isPackaged: true,
      configuredRoot: "/Users/ryan/deleted-project",
      homeDir: HOME,
      tmpDir: TMP,
      isDirectory,
    });
    assert.equal(root, HOME);
  });

  it("falls back to tmp rather than '/' when home itself is the root", () => {
    // e.g. running as root in a container with HOME=/
    const root = resolveProjectRoot({
      cwd: "/",
      isPackaged: true,
      homeDir: "/",
      tmpDir: TMP,
      isDirectory,
    });
    assert.equal(root, TMP);
  });

  it("throws rather than returning '/' when nothing is usable", () => {
    assert.throws(
      () =>
        resolveProjectRoot({
          cwd: "/",
          isPackaged: true,
          homeDir: "/",
          tmpDir: "/",
          isDirectory: () => true,
        }),
      /Could not resolve a project root/,
    );
  });
});

describe("sanitizeProjectRoot", () => {
  it("replaces '/' with the fallback — legacy sessions carry projectRoot '/'", () => {
    assert.equal(sanitizeProjectRoot("/", HOME), HOME);
  });

  it("replaces null/undefined/empty/relative with the fallback", () => {
    assert.equal(sanitizeProjectRoot(null, HOME), HOME);
    assert.equal(sanitizeProjectRoot(undefined, HOME), HOME);
    assert.equal(sanitizeProjectRoot("", HOME), HOME);
    assert.equal(sanitizeProjectRoot("./relative", HOME), HOME);
  });

  it("passes a real root through, normalized", () => {
    assert.equal(sanitizeProjectRoot(REPO, HOME), REPO);
    assert.equal(sanitizeProjectRoot(`${REPO}/`, HOME), REPO);
  });

  it("does not require the candidate to exist", () => {
    // Structural guard only — see the note on sanitizeProjectRoot.
    assert.equal(sanitizeProjectRoot("/Users/ryan/moved-away", HOME), "/Users/ryan/moved-away");
  });
});
