import type { CcrBridgeApi } from "../common/ipc.js";

declare global {
  interface Window {
    ccr: CcrBridgeApi;
  }
}

export {};
