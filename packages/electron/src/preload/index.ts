import { contextBridge, ipcRenderer } from "electron";

function invoke<T>(channel: string, arg?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, arg) as Promise<T>;
}

function subscribe(channel: string, handler: (payload: unknown) => void): () => void {
  const listener = (_ev: unknown, payload: unknown) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bootstrapChannel = "bootstrap:state";

const bootstrap = async () =>
  invoke<import("../common/bootstrap-types.js").BootstrapPayload>(bootstrapChannel);

contextBridge.exposeInMainWorld("ccr", {
  bootstrap,
  invoke,
  subscribe,
});

export type CcrPreload = {
  bootstrap: typeof bootstrap;
  invoke: typeof invoke;
  subscribe: typeof subscribe;
};
