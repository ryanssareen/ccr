import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// Output dirs match electron-vite v5 defaults (out/main, out/preload,
// out/renderer) so package.json's `main: ./out/main/index.js` resolves.
export default defineConfig({
  main: {
    resolve: {
      alias: {
        "@ccr/core": path.resolve(rootDir, "../core/src/index.ts"),
      },
    },
    build: {
      externalizeDeps: {
        exclude: ["@ccr/core"],
      },
      rollupOptions: {
        input: {
          index: path.resolve(rootDir, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        "@ccr/core": path.resolve(rootDir, "../core/src/index.ts"),
      },
    },
    build: {
      externalizeDeps: {
        exclude: ["@ccr/core"],
      },
      rollupOptions: {
        input: {
          index: path.resolve(rootDir, "src/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    root: path.resolve(rootDir, "src/renderer"),
    plugins: [react()],
  },
});
