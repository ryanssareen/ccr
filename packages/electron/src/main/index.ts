import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { AgentHost } from "./agent-host.js";
import { registerIpcHandlers } from "./ipc.js";

let mainWindow: BrowserWindow | null = null;
let disposeIpcHandlers: (() => void) | null = null;

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
  const host = new AgentHost();
  disposeIpcHandlers = registerIpcHandlers(ipcMain, host);
  mainWindow = await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length !== 0) return;
    mainWindow = await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  disposeIpcHandlers?.();
  disposeIpcHandlers = null;
});
