import { promises as fs } from "node:fs";
export declare const DEFAULT_ENDPOINT = "https://ccr-ebon.vercel.app";
export declare const SIGNUP_OR_LOGIN_PATH = "/api/v1/signupOrLogin";
export declare const GITHUB_LOGIN_REQUIRES_BROWSER_MESSAGE = "GitHub login requires a browser. Run `ccr login` (without --terminal).";
export interface AuthRecord {
    token: string;
    endpoint: string;
    email: string;
}
export interface TerminalAuthOptions {
    endpoint?: string;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    homeDir?: string;
    fsImpl?: Pick<typeof fs, "mkdir" | "writeFile" | "chmod">;
    stdin?: NodeJS.ReadStream;
    stdout?: NodeJS.WriteStream;
    method?: "email" | "github";
    maxAttempts?: number;
}
export declare function isValidEmail(email: string): boolean;
export declare function normalizeEndpoint(endpoint: string): string;
export declare function resolveEndpoint(env?: NodeJS.ProcessEnv, explicitEndpoint?: string): string;
export declare function authFilePath(homeDir?: string): string;
export declare function writeAuthFile(record: AuthRecord, options?: {
    homeDir?: string;
    fsImpl?: Pick<typeof fs, "mkdir" | "writeFile" | "chmod">;
}): Promise<void>;
export declare function runTerminalAuth(options?: TerminalAuthOptions): Promise<number>;
export default runTerminalAuth;
