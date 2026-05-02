import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as core from "../index.js";

// Snapshot of @ccr/core's public surface. If you intentionally add or
// remove a public name, update both lists in the same commit. Anything
// outside these lists is considered internal and other packages must not
// rely on it.
//
// Runtime exports (functions, values, classes — anything that exists at
// runtime as a property on the namespace).
const EXPECTED_RUNTIME = [
  // agent / runtime
  "GROQ_BASE_URL",
  "PROXY_API_PATH",
  "DEFAULT_MODEL",
  "buildClient",
  "initialMessages",
  "runAgent",
  "makeSubagentRunner",
  // tools / agent context
  "TOOLS",
  "TOOL_BY_NAME",
  "toolSchemas",
  "dispatch",
  // session io
  "sessionPath",
  "newSessionId",
  "listSessions",
  "loadSession",
  "saveSession",
  "projectId",
  // session lock + watcher
  "acquireLock",
  "releaseLock",
  "readLock",
  "lockPath",
  "LockOwnedElsewhereError",
  "watchSessions",
  // config / auth
  "loadConfig",
  "saveConfig",
  "loadAuth",
  "clearAuth",
  "applyConfig",
  "configPath",
  "authPath",
  // version + update notifier
  "VERSION",
  "PACKAGE_NAME",
  "checkForUpdate",
] as const;

describe("@ccr/core public surface", () => {
  it("exports exactly the expected runtime symbols", () => {
    const actual = Object.keys(core).sort();
    const expected = [...EXPECTED_RUNTIME].sort();
    assert.deepEqual(
      actual,
      expected,
      "Public surface drifted. Either revert the export change or update EXPECTED_RUNTIME in this file (and the barrel index.ts) in the same commit.",
    );
  });

  it("each runtime export is defined", () => {
    for (const name of EXPECTED_RUNTIME) {
      const value = (core as Record<string, unknown>)[name];
      assert.notEqual(value, undefined, `expected core.${name} to be defined`);
    }
  });

  it("VERSION is a non-empty semver-like string", () => {
    assert.match(core.VERSION, /^\d+\.\d+\.\d+/);
  });

  it("PACKAGE_NAME points at the published CLI package", () => {
    assert.equal(core.PACKAGE_NAME, "@ryanisavibecoder/ccr");
  });

  it("TOOLS is a non-empty array of ToolDef objects", () => {
    assert.ok(Array.isArray(core.TOOLS) && core.TOOLS.length > 0);
    for (const t of core.TOOLS) {
      assert.equal(typeof t.name, "string");
      assert.equal(typeof t.description, "string");
      assert.equal(typeof t.run, "function");
    }
  });
});
