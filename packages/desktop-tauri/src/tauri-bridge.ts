// Thin wrappers around Tauri's `invoke()` that mirror the channel names from
// the Electron build's `shared/ipc.ts`. The renderer-facing API is identical;
// only the transport changes.

import { invoke } from "@tauri-apps/api/core";

export interface AuthRecord {
  token: string;
  endpoint: string;
  email: string;
}

export interface BashResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
}

export interface GrepHit {
  path: string;
  line: number;
  text: string;
}

export const bridge = {
  ping: () => invoke<string>("ping"),

  // Auth
  readAuth: () => invoke<AuthRecord | null>("read_auth_json"),
  clearAuth: () => invoke<void>("clear_auth_json"),

  // File ops
  readFile: (args: { path: string; offset?: number; limit?: number }) =>
    invoke<string>("read_file", { args }),
  writeFile: (args: { path: string; content: string }) =>
    invoke<void>("write_file", { args }),
  editFile: (args: {
    path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  }) => invoke<void>("edit_file", { args }),
  insertLines: (args: { path: string; line: number; content: string }) =>
    invoke<void>("insert_lines", { args }),

  // Search
  glob: (args: { pattern: string; path?: string }) =>
    invoke<string[]>("glob_search", { args }),
  grep: (args: { pattern: string; path?: string; glob?: string }) =>
    invoke<GrepHit[]>("grep_search", { args }),

  // Bash
  bash: (args: { command: string; timeout_secs?: number; cwd?: string }) =>
    invoke<BashResult>("bash_run", { args }),
};
