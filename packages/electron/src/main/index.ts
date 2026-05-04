import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig } from "@ccr/core";
import { AgentHost } from "./agent-host.js";
import { registerIpcHandlers, registerSessionWatcher } from "./ipc.js";

interface PublicFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

const FIREBASE_FILE = path.join(os.homedir(), ".ccr", "firebase.json");

// Public Firebase web config — same values the website ships in its JS
// bundle as NEXT_PUBLIC_FIREBASE_*. Safe to embed; that's the whole point
// of the "public" prefix. Lets the packaged DMG sign users in out of the
// box without requiring a per-machine ~/.ccr/firebase.json.
const BUNDLED_FIREBASE_CONFIG: PublicFirebaseConfig = {
  apiKey: "AIzaSyCOVLDvzYv6GkVzYMbjobhH0aso93grVB8",
  authDomain: "ccr-managed.firebaseapp.com",
  projectId: "ccr-managed",
  storageBucket: "ccr-managed.firebasestorage.app",
  messagingSenderId: "34569369048",
  appId: "1:34569369048:web:ef3b89c2a6f7c3ff406ead",
};

/** Resolve Firebase web config: env vars → ~/.ccr/firebase.json → bundled
 * default. The bundled default mirrors the website's NEXT_PUBLIC_FIREBASE_*
 * values; env / file overrides exist for development against a different
 * Firebase project. */
function resolveFirebaseConfig(): PublicFirebaseConfig {
  const fromEnv: PublicFirebaseConfig = {
    apiKey: process.env.CCR_FIREBASE_API_KEY ?? "",
    authDomain: process.env.CCR_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.CCR_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.CCR_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.CCR_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.CCR_FIREBASE_APP_ID ?? "",
  };
  if (fromEnv.apiKey && fromEnv.authDomain && fromEnv.projectId && fromEnv.appId) {
    return fromEnv;
  }
  if (existsSync(FIREBASE_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(FIREBASE_FILE, "utf8")) as Partial<PublicFirebaseConfig>;
      if (parsed.apiKey && parsed.authDomain && parsed.projectId && parsed.appId) {
        return {
          apiKey: parsed.apiKey,
          authDomain: parsed.authDomain,
          projectId: parsed.projectId,
          storageBucket: parsed.storageBucket,
          messagingSenderId: parsed.messagingSenderId,
          appId: parsed.appId,
        };
      }
    } catch (err) {
      console.error(`[ccr] Failed to read ${FIREBASE_FILE}:`, err);
    }
  }
  return BUNDLED_FIREBASE_CONFIG;
}

let mainWindow: BrowserWindow | null = null;
let disposeIpcHandlers: (() => void) | null = null;
let disposeSessionWatcher: (() => Promise<void>) | null = null;

function preloadPath(): string {
  return fileURLToPath(new URL("../preload/index.mjs", import.meta.url));
}

function rendererIndexPath(): string {
  return fileURLToPath(new URL("../renderer/index.html", import.meta.url));
}

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    resizable: true,
    backgroundColor: "#141311",
    title: "CCR",
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const } : {}),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(rendererIndexPath());
  }

  return window;
}

app.whenReady().then(async () => {
  const projectRoot = process.cwd();
  const host = new AgentHost({ projectRoot });

  disposeIpcHandlers = registerIpcHandlers(ipcMain, host, {
    defaultProjectRoot: () => projectRoot,
    loadConfigOnce: () => loadConfig(),
    firebaseConfig: resolveFirebaseConfig,
    authEndpoint: () => process.env.CCR_ENDPOINT ?? "https://ccr-ebon.vercel.app",
  });

  // One watcher, broadcast to every open window's webContents.
  disposeSessionWatcher = registerSessionWatcher(() =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed())
      .map((w) => w.webContents),
  );

  mainWindow = await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length !== 0) return;
    mainWindow = await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", async (event) => {
  if (disposeSessionWatcher) {
    event.preventDefault();
    try {
      await disposeSessionWatcher();
    } catch {
      // best effort
    }
    disposeSessionWatcher = null;
    disposeIpcHandlers?.();
    disposeIpcHandlers = null;
    app.quit();
    return;
  }
  disposeIpcHandlers?.();
  disposeIpcHandlers = null;
});
