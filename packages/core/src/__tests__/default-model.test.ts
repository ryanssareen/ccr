import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { DEFAULT_MODEL, KNOWN_MODELS } from "../index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGENT_MODULE = path.join(HERE, "..", "agent.ts");

// Reads DEFAULT_MODEL out of a fresh process. DEFAULT_MODEL is resolved once
// at module load, so the CCR_MODEL override can't be exercised by mutating
// process.env in-process — the binding is already frozen by the time this
// test file's imports run.
function defaultModelWithEnv(env: Record<string, string | undefined>): string {
  const script = `import(${JSON.stringify(AGENT_MODULE)}).then((m) => process.stdout.write(m.DEFAULT_MODEL));`;
  return execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    {
      encoding: "utf8",
      env: { ...process.env, ...env },
      cwd: path.join(HERE, "..", ".."),
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

describe("DEFAULT_MODEL", () => {
  it("defaults to openai/gpt-oss-120b", () => {
    // Guards the choice made in issue #18: gpt-oss-120b is our most reliable
    // tool-caller (first in TOOL_CALL_FALLBACKS) and the only model with all
    // four providers in MODEL_ALIASES. Don't flip this to a model that maps
    // to null on a provider without re-reading that issue.
    assert.equal(DEFAULT_MODEL, "openai/gpt-oss-120b");
  });

  it("is offered in the KNOWN_MODELS picker", () => {
    assert.ok(
      (KNOWN_MODELS as readonly string[]).includes(DEFAULT_MODEL),
      `DEFAULT_MODEL ${DEFAULT_MODEL} must be selectable in the /model dropdown`,
    );
  });

  it("uses openai/gpt-oss-120b when CCR_MODEL is unset", () => {
    assert.equal(defaultModelWithEnv({ CCR_MODEL: undefined }), "openai/gpt-oss-120b");
  });

  it("honours the CCR_MODEL override", () => {
    assert.equal(
      defaultModelWithEnv({ CCR_MODEL: "moonshotai/kimi-k2-instruct" }),
      "moonshotai/kimi-k2-instruct",
    );
  });

  it("ignores an empty CCR_MODEL and falls back to the default", () => {
    assert.equal(defaultModelWithEnv({ CCR_MODEL: "" }), "openai/gpt-oss-120b");
  });
});
