import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

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
      outDir: path.resolve(rootDir, "dist/main"),
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
      outDir: path.resolve(rootDir, "dist/preload"),
      rollupOptions: {
        input: {
          index: path.resolve(rootDir, "src/main/preload.ts"),
        },
      },
    },
  },
  renderer: {
    root: path.resolve(rootDir, "src/renderer"),
    plugins: [react()],
    build: {
      outDir: path.resolve(rootDir, "dist/renderer"),
    },
  },
});
