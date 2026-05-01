interface BrowserAuthOptions {
    endpoint?: string;
    method?: "email" | "github";
    fetchEnv?: NodeJS.ProcessEnv;
    openImpl?: (url: string) => boolean;
    rangeStart?: number;
    rangeEnd?: number;
    timeoutMs?: number;
}
/**
 * Public entry point used by `ccr login`. Returns a process exit code
 * (0 = success). All user-facing output is printed here so callers don't
 * have to know about UI vs error handling.
 */
export declare function runBrowserAuth(options?: BrowserAuthOptions): Promise<number>;
export {};
