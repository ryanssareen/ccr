import type { CcrBridgeApi } from "../shared/ipc.js";

declare global {
  interface Window {
    ccr: CcrBridgeApi;
  }
}

export {};
