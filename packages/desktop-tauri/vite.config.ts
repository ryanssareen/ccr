import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));

// https://tauri.app/v1/api/config/#vite
export default defineConfig({
  plugins: [react()],
  root: path.resolve(dir, "src"),
  // Tauri expects the build output here.
  build: {
    outDir: path.resolve(dir, "dist"),
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 1500,
  },
  // The tauri dev server proxies to this port.
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  clearScreen: false,
});
