import OpenAI from "openai";
import { type ToolContext } from "./tools.js";
export declare const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export declare const PROXY_API_PATH = "/api/v1";
export declare const DEFAULT_MODEL: string;
export interface QuotaState {
    used: number;
    limit: number;
    resetAt: Date;
}
export type QuotaListener = (state: QuotaState) => void;
export interface BuildClientOptions {
    /** Managed-mode token from ~/.ccr/auth.json. */
    authToken?: string;
    /** Managed-mode service endpoint (e.g., https://ccr.vercel.app). */
    endpoint?: string;
    /** Direct-mode Groq API key (legacy / escape hatch). */
    apiKey?: string;
    /** Called after every chat completion that returns CCR quota headers. */
    onQuota?: QuotaListener;
}
export declare function buildClient(options?: BuildClientOptions): OpenAI;
export declare function initialMessages(root: string, projectContext: string): any[];
export interface Reporter {
    /** Streaming token from the model. */
    token(s: string): void;
    /** Called once when the assistant produces a non-empty content turn. */
    assistantTurnEnd(content: string): void;
    /** Called when a tool call begins. */
    toolCallStart(name: string, argsPreview: string): void;
    /** Called when a tool call completes. */
    toolCallEnd(name: string, result: string, isError: boolean): void;
    /** Called when the agent loop hits the iteration cap. */
    iterationCap?(): void;
    /** Transient status line (e.g., 'retrying in 30s'). Pass null to clear. */
    setStatus?(text: string | null): void;
    /** Updated whenever the proxy returns fresh quota headers. */
    setQuota?(state: QuotaState): void;
}
export interface AgentRun {
    client: OpenAI;
    model: string;
    ctx: ToolContext;
    reporter: Reporter;
    signal?: AbortSignal;
}
export declare function runAgent(run: AgentRun, messages: any[]): Promise<void>;
