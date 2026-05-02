import { defineConfig } from "tsup";

// Bundle the CLI entry into a single ESM module that inlines @ccr/core.
// External: every published npm dep (Ink, kleur, OpenAI, etc.). The published
// tarball ends up as just dist/cli.js + dist/index.js — a clean, modern
// monorepo CLI shape. node_modules deps still get fetched at install time
// the normal way.
//
// Type declarations are produced separately via tsc (see the typecheck
// script). tsup's DTS path doesn't resolve workspace symlinks reliably.
export default defineConfig({
  entry: {
    cli: "src/cli.ts",
  },
  format: ["esm"],
  target: "node18",
  platform: "node",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  noExternal: ["@ccr/core"],
  // Shebang lives at the top of src/cli.ts and tsup preserves it.
  // index.ts has no shebang, which is correct for a library entry.
});
