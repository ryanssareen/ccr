export {};

declare global {
  interface Window {
    ccr: {
      bootstrap: () => Promise<import("../common/bootstrap-types.js").BootstrapPayload>;
      invoke: <T>(channel: string, arg?: unknown) => Promise<T>;
      subscribe: (channel: string, handler: (payload: unknown) => void) => () => void;
    };
  }
}
