// Display half of issue #19: a session rooted at "/" (every session the
// packaged app created before the root-resolution fix) rendered as a "/"
// group, and legacy sessions that predate persisted projectRoot rendered as
// raw "(8882bdc3…)" hashes. Both are now labelled honestly.
import { describe, expect, it } from "vitest";
import type { ListedSession } from "../ipc-client.js";
import { fileBasename, groupSessionsByProject } from "../state/session-store.js";

function mockSession(
  opts: Partial<ListedSession> & Pick<ListedSession, "sessionPath" | "sessionId">,
): ListedSession {
  return {
    projectIdHash: "abcdef012345",
    projectRoot: "/tmp/proj-a",
    updatedAt: Date.now(),
    messageCount: 0,
    foreignLockPid: null,
    title: opts.sessionId,
    ...opts,
  };
}

describe("fileBasename", () => {
  it("returns the last path segment for a normal path", () => {
    expect(fileBasename("/Users/ryan/Documents/ccr-npm")).toBe("ccr-npm");
    expect(fileBasename("/tmp/proj-a/")).toBe("proj-a");
  });

  it("normalizes Windows separators", () => {
    expect(fileBasename("C:\\Users\\ryan\\code\\ccr")).toBe("ccr");
  });

  it("returns empty for roots rather than echoing the input", () => {
    // The bug: "/" has no basename, and the old `?? filepath` fallback
    // echoed "/" straight back, which is what put "/" in the rail.
    expect(fileBasename("/")).toBe("");
    expect(fileBasename("")).toBe("");
  });
});

describe("groupSessionsByProject labels", () => {
  it("uses the directory name for a real project root", () => {
    const groups = groupSessionsByProject([
      mockSession({ sessionPath: "/s/a.json", sessionId: "a", projectRoot: "/Users/ryan/code/ccr-npm" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].displayName).toBe("ccr-npm");
  });

  it("labels a filesystem-root session honestly instead of '/'", () => {
    const groups = groupSessionsByProject([
      mockSession({ sessionPath: "/s/root.json", sessionId: "root", projectRoot: "/" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].displayName).toBe("Filesystem root");
    // The underlying root is preserved — only the label changes.
    expect(groups[0].projectRoot).toBe("/");
  });

  it("labels a null-root (legacy) session as unknown, keeping the hash to disambiguate", () => {
    const groups = groupSessionsByProject([
      mockSession({
        sessionPath: "/s/legacy.json",
        sessionId: "legacy",
        projectRoot: null,
        projectIdHash: "8882bdc3aaaa",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].displayName).toBe("Unknown project (8882bdc3)");
    expect(groups[0].projectRoot).toBeNull();
  });

  it("keeps distinct null-root projects in separate, distinguishable groups", () => {
    const groups = groupSessionsByProject([
      mockSession({ sessionPath: "/s/x.json", sessionId: "x", projectRoot: null, projectIdHash: "8882bdc3aaaa" }),
      mockSession({ sessionPath: "/s/y.json", sessionId: "y", projectRoot: null, projectIdHash: "0945ace2bbbb" }),
    ]);
    expect(groups).toHaveLength(2);
    const names = groups.map((g) => g.displayName).sort();
    expect(names).toEqual(["Unknown project (0945ace2)", "Unknown project (8882bdc3)"]);
  });

  it("still groups sessions that share a root", () => {
    const now = Date.now();
    const groups = groupSessionsByProject([
      mockSession({ sessionPath: "/s/1.json", sessionId: "1", projectRoot: "/", updatedAt: now - 100 }),
      mockSession({ sessionPath: "/s/2.json", sessionId: "2", projectRoot: "/", updatedAt: now }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions).toHaveLength(2);
    expect(groups[0].displayName).toBe("Filesystem root");
  });
});
