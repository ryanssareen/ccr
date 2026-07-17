// Issue #21: the packaged app had no in-app way to choose a project folder,
// so a Finder launch silently ran in $HOME. These cover the picker handler —
// the dialog is injected, so none of this needs Electron.
//
// The load-bearing one is "takes effect without a restart": the root used to
// be snapshotted at app.whenReady() and captured in a closure, so a pick that
// only wrote config would look like it worked while every new session kept
// using the old root.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { CcrConfig } from "@ccr/core";
import { CHANNELS } from "../../common/ipc.js";
import type { ProjectRootPickResult } from "../../common/ipc.js";
import { AgentHost } from "../agent-host.js";
import { registerIpcHandlers } from "../ipc.js";

const tempDirs: string[] = [];

function realDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-pick-"));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

interface Harness {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  dispose: () => void;
  /** What the app would use for a new session right now. */
  currentRoot: () => string;
  /** Every config written to disk, in order. */
  writes: CcrConfig[];
  host: AgentHost;
}

function setup(opts: {
  initialRoot: string;
  /** What the OS dialog returns. null = the user cancelled. */
  picked?: string | null;
  pickThrows?: Error;
  isPackaged?: boolean;
  config?: CcrConfig;
}): Harness {
  // Mirrors main/index.ts: one mutable root, read through a getter.
  let projectRoot = opts.initialRoot;
  let config: CcrConfig = opts.config ?? {};
  const writes: CcrConfig[] = [];

  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  const ipcMain = {
    handle(channel: string, listener: (event: any, payload: unknown) => unknown) {
      handlers.set(channel, listener);
    },
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
  };

  const currentRoot = () => projectRoot;
  // The real AgentHost, wired exactly as index.ts wires it — this is what
  // proves a live root actually reaches the agent.
  const host = new AgentHost({ projectRoot: currentRoot, deps: {} });

  const dispose = registerIpcHandlers(ipcMain as any, host, {
    defaultProjectRoot: currentRoot,
    setDefaultProjectRoot: (root) => {
      projectRoot = root;
    },
    isPackaged: () => opts.isPackaged ?? true,
    pickDirectory: async () => {
      if (opts.pickThrows) throw opts.pickThrows;
      return opts.picked ?? null;
    },
    saveConfig: async (cfg) => {
      writes.push(cfg);
      config = cfg;
    },
    loadConfigOnce: async () => config,
    firebaseConfig: () => ({ apiKey: "", authDomain: "", projectId: "", appId: "" }),
    authEndpoint: () => "https://example.test",
  });

  return {
    invoke: async (channel, payload) => {
      const handler = handlers.get(channel);
      assert.ok(handler, `no handler registered for ${channel}`);
      return handler({}, payload);
    },
    dispose,
    currentRoot,
    writes,
    host,
  };
}

function pick(h: Harness): Promise<ProjectRootPickResult> {
  return h.invoke(CHANNELS.dialogPickProjectRoot) as Promise<ProjectRootPickResult>;
}

describe("dialog:pick-project-root", () => {
  it("rejects a '/' pick and changes nothing", async () => {
    const home = realDir();
    const h = setup({ initialRoot: home, picked: "/" });

    const result = await pick(h);

    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /not a usable project folder/);
    // The dialog is not trusted — "openDirectory" happily returns "/".
    assert.deepEqual(h.writes, [], "a rejected pick must not write config");
    assert.equal(h.currentRoot(), home, "a rejected pick must not move the root");
    h.dispose();
  });

  it("rejects a path that is not an existing directory", async () => {
    const home = realDir();
    const h = setup({ initialRoot: home, picked: path.join(home, "deleted-since") });

    const result = await pick(h);

    assert.equal(result.ok, false);
    assert.deepEqual(h.writes, []);
    assert.equal(h.currentRoot(), home);
    h.dispose();
  });

  it("persists a valid pick to config.projectRoot", async () => {
    const home = realDir();
    const project = realDir();
    const h = setup({
      initialRoot: home,
      picked: project,
      config: { model: "keep-me", nickname: "ryan" },
    });

    const result = await pick(h);

    assert.deepEqual(result, { ok: true, projectRoot: project });
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0]!.projectRoot, project);
    // Read-modify-write: a projectRoot patch must not drop siblings.
    assert.equal(h.writes[0]!.model, "keep-me");
    assert.equal(h.writes[0]!.nickname, "ryan");
    h.dispose();
  });

  it("cancelling changes nothing", async () => {
    const home = realDir();
    const h = setup({ initialRoot: home, picked: null });

    const result = await pick(h);

    assert.deepEqual(result, { ok: false, canceled: true });
    assert.deepEqual(h.writes, [], "a cancel must not write config");
    assert.equal(h.currentRoot(), home, "a cancel must not move the root");
    h.dispose();
  });

  it("reports a dialog failure as an error rather than throwing", async () => {
    const home = realDir();
    const h = setup({ initialRoot: home, pickThrows: new Error("dialog exploded") });

    const result = await pick(h);

    assert.deepEqual(result, { ok: false, error: "dialog exploded" });
    assert.equal(h.currentRoot(), home);
    h.dispose();
  });

  it("does not go live when persisting fails", async () => {
    // Publishing a root the disk rejected would survive until restart and
    // then silently revert.
    const home = realDir();
    const project = realDir();
    let projectRoot = home;
    const handlers = new Map<string, (e: unknown, p: unknown) => unknown>();
    const dispose = registerIpcHandlers(
      {
        handle: (c: string, l: any) => handlers.set(c, l),
        removeHandler: (c: string) => handlers.delete(c),
      } as any,
      new AgentHost({ projectRoot: () => projectRoot }),
      {
        defaultProjectRoot: () => projectRoot,
        setDefaultProjectRoot: (r) => {
          projectRoot = r;
        },
        isPackaged: () => true,
        pickDirectory: async () => project,
        saveConfig: async () => {
          throw new Error("EACCES: config is read-only");
        },
        loadConfigOnce: async () => ({}),
        firebaseConfig: () => ({ apiKey: "", authDomain: "", projectId: "", appId: "" }),
        authEndpoint: () => "https://example.test",
      },
    );

    const result = (await handlers.get(CHANNELS.dialogPickProjectRoot)!({}, undefined)) as ProjectRootPickResult;

    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /read-only/);
    assert.equal(projectRoot, home, "root must not go live if the write failed");
    dispose();
  });

  it("removes its handler on dispose", async () => {
    const h = setup({ initialRoot: realDir(), picked: null });
    h.dispose();
    await assert.rejects(() => pick(h), /no handler registered/);
  });
});

describe("pick takes effect without a restart", () => {
  it("changes what defaultProjectRoot() returns", async () => {
    const home = realDir();
    const project = realDir();
    const h = setup({ initialRoot: home, picked: project });

    assert.equal(h.currentRoot(), home);

    await pick(h);

    // The whole point of #21: no app relaunch between these two lines.
    assert.equal(h.currentRoot(), project);
    h.dispose();
  });

  it("bootstrap reports the new root to the renderer without a rehydrate gap", async () => {
    const home = realDir();
    const project = realDir();
    const h = setup({ initialRoot: home, picked: project });

    await pick(h);

    // sessions:create resolves its fallback root through the same getter, but
    // exercising it here would write into the real ~/.ccr/sessions. bootstrap
    // reads the identical closure, so it proves the same seam without the
    // side effect.
    const payload = (await h.invoke(CHANNELS.bootstrap)) as { defaultProjectRoot: string };
    assert.equal(payload.defaultProjectRoot, project);
    h.dispose();
  });

  it("AgentHost reads the live root rather than its construction-time one", () => {
    // AgentHost used to store `private readonly projectRoot` set in the
    // constructor. index.ts builds it once at app.whenReady(), so a picked
    // root would never have reached the agent's file tools — the rail would
    // show the new project while the agent still read the old one.
    const home = realDir();
    const project = realDir();
    let root = home;
    const host = new AgentHost({ projectRoot: () => root });
    const readRoot = () => (host as unknown as { projectRoot: string }).projectRoot;

    assert.equal(readRoot(), home);
    root = project;
    assert.equal(readRoot(), project, "AgentHost cached the root — a pick would not reach the agent");
  });

  it("AgentHost still accepts a fixed string root", () => {
    const project = realDir();
    const host = new AgentHost({ projectRoot: project });
    assert.equal((host as unknown as { projectRoot: string }).projectRoot, project);
  });

  it("AgentHost sanitizes a live root of '/' rather than running tools there", () => {
    // The getter is re-sanitized on every read, not once at construction.
    const host = new AgentHost({ projectRoot: () => "/" });
    const root = (host as unknown as { projectRoot: string }).projectRoot;
    assert.notEqual(root, "/");
    assert.equal(root, os.homedir());
  });
});

describe("bootstrap: needsProjectRootChoice", () => {
  it("is true when packaged with no configured root — the Finder case", async () => {
    const h = setup({ initialRoot: realDir(), isPackaged: true, config: {} });
    const payload = (await h.invoke(CHANNELS.bootstrap)) as { needsProjectRootChoice: boolean };
    assert.equal(payload.needsProjectRootChoice, true);
    h.dispose();
  });

  it("is false when packaged with a usable configured root", async () => {
    const project = realDir();
    const h = setup({ initialRoot: project, isPackaged: true, config: { projectRoot: project } });
    const payload = (await h.invoke(CHANNELS.bootstrap)) as { needsProjectRootChoice: boolean };
    assert.equal(payload.needsProjectRootChoice, false);
    h.dispose();
  });

  it("is true when the configured root is '/' — resolveProjectRoot would skip it", async () => {
    // Config says "/", so the app is really running on the $HOME fallback.
    // Reporting "configured" here would suppress the prompt for exactly the
    // user issue #19 was about.
    const h = setup({ initialRoot: realDir(), isPackaged: true, config: { projectRoot: "/" } });
    const payload = (await h.invoke(CHANNELS.bootstrap)) as { needsProjectRootChoice: boolean };
    assert.equal(payload.needsProjectRootChoice, true);
    h.dispose();
  });

  it("is true when the configured root no longer exists", async () => {
    const h = setup({
      initialRoot: realDir(),
      isPackaged: true,
      config: { projectRoot: "/Users/nobody/deleted-project" },
    });
    const payload = (await h.invoke(CHANNELS.bootstrap)) as { needsProjectRootChoice: boolean };
    assert.equal(payload.needsProjectRootChoice, true);
    h.dispose();
  });

  it("is false in dev — cwd is the repo, which is the root a developer wants", async () => {
    const h = setup({ initialRoot: realDir(), isPackaged: false, config: {} });
    const payload = (await h.invoke(CHANNELS.bootstrap)) as { needsProjectRootChoice: boolean };
    assert.equal(payload.needsProjectRootChoice, false);
    h.dispose();
  });

  it("stops asking once a pick lands", async () => {
    const project = realDir();
    const h = setup({ initialRoot: realDir(), isPackaged: true, config: {}, picked: project });

    const before = (await h.invoke(CHANNELS.bootstrap)) as { needsProjectRootChoice: boolean };
    assert.equal(before.needsProjectRootChoice, true);

    await pick(h);

    const after = (await h.invoke(CHANNELS.bootstrap)) as {
      needsProjectRootChoice: boolean;
      defaultProjectRoot: string;
    };
    assert.equal(after.needsProjectRootChoice, false);
    assert.equal(after.defaultProjectRoot, project);
    h.dispose();
  });
});
