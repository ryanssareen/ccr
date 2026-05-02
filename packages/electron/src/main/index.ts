import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@ccr/core";
import { AgentHost } from "./agent-host.js";
import { registerIpcHandlers, registerSessionWatcher } from "./ipc.js";

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
