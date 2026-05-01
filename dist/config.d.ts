export interface CcrConfig {
    groqApiKey?: string;
    model?: string;
}
export interface CcrAuth {
    token: string;
    endpoint: string;
    email: string;
}
export declare function loadConfig(): Promise<CcrConfig>;
export declare function saveConfig(cfg: CcrConfig): Promise<void>;
export declare function loadAuth(): Promise<CcrAuth | null>;
export declare function clearAuth(): Promise<void>;
/** Apply config values to process.env if not already set. */
export declare function applyConfig(cfg: CcrConfig): void;
export declare function configPath(): string;
export declare function authPath(): string;
