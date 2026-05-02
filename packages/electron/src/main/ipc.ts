import type { IpcMainInvokeEvent, WebContents } from "electron";
import { AgentHost } from "./agent-host.js";
import type {
  AgentAbortInput,
  AgentApprovalResponseInput,
  AgentAskResponseInput,
  AgentStartInput,
  AgentStartResult,
  MainToRendererChannel,
  MainToRendererPayloads,
} from "../shared/ipc.js";
import { CHANNELS } from "../shared/ipc.js";

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, payload: unknown) => unknown | Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

export interface WebContentsLike {
  send<K extends MainToRendererChannel>(channel: K, payload: MainToRendererPayloads[K]): void;
  isDestroyed?(): boolean;
}

export function registerIpcHandlers(ipcMain: IpcMainLike, host: AgentHost): () => void {
  ipcMain.handle(CHANNELS.agentStart, (event, payload) =>
    host.start(createRendererSender(event.sender), payload as AgentStartInput),
  );
  ipcMain.handle(CHANNELS.agentAbort, (_event, payload) => host.abort(payload as AgentAbortInput));
  ipcMain.handle(CHANNELS.agentApprovalResponse, (_event, payload) =>
    host.respondToApproval(payload as AgentApprovalResponseInput),
  );
  ipcMain.handle(CHANNELS.agentAskResponse, (_event, payload) =>
    host.respondToAsk(payload as AgentAskResponseInput),
  );

  return () => {
    ipcMain.removeHandler(CHANNELS.agentStart);
    ipcMain.removeHandler(CHANNELS.agentAbort);
    ipcMain.removeHandler(CHANNELS.agentApprovalResponse);
    ipcMain.removeHandler(CHANNELS.agentAskResponse);
  };
}

export function createRendererSender(webContents: WebContents | WebContentsLike) {
  return {
    send<K extends MainToRendererChannel>(channel: K, payload: MainToRendererPayloads[K]): void {
      if (typeof webContents.isDestroyed === "function" && webContents.isDestroyed()) return;
      webContents.send(channel, payload);
    },
  };
}

export type { AgentStartInput, AgentStartResult };
