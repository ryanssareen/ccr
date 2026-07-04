export interface ChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatResponse {
  body: object | ReadableStream<Uint8Array>;
  providerName: string;
  upstreamLatencyMs: number;
}

export interface Provider {
  name: 'groq' | 'together' | 'cerebras' | 'openrouter';
  chatCompletion(req: ChatRequest): Promise<ChatResponse>;
  healthCheck(): Promise<boolean>;
}

export interface Router {
  route(req: ChatRequest): Promise<ChatResponse>;
}

export type ProviderName = Provider['name'];
export type FetchLike = typeof fetch;
export type ApiKeyResolver = (paramName: string) => Promise<string>;

// Each provider hosts models under its own catalog IDs — the same model
// forwarded verbatim to every provider only ever works on the one whose
// naming happened to match, so the rest reject it with a 4xx and the
// request silently falls back to the next candidate. If the lucky provider
// is also cooling down, every provider fails and the router reports "all
// providers unavailable" even though the model — not provider health — was
// the actual problem. This table translates our canonical (Groq) model IDs
// into each provider's equivalent, so all providers are genuinely usable in
// the rotation. `null` means the provider has no equivalent model (verified
// against provider docs as of 2026-07); the router excludes it for that
// model instead of wasting a request on a guaranteed 404. Models not listed
// here (e.g. a custom CCR_MODEL override) pass through unchanged, same as
// before this table existed.
const MODEL_ALIASES: Record<string, Partial<Record<ProviderName, string | null>>> = {
  'openai/gpt-oss-120b': {
    groq: 'openai/gpt-oss-120b',
    cerebras: 'gpt-oss-120b',
    together: 'openai/gpt-oss-120b',
    openrouter: 'openai/gpt-oss-120b',
  },
  'llama-3.3-70b-versatile': {
    groq: 'llama-3.3-70b-versatile',
    cerebras: null, // deprecated on Cerebras Feb 2026, no replacement in their catalog
    together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    openrouter: 'meta-llama/llama-3.3-70b-instruct',
  },
  'moonshotai/kimi-k2-instruct': {
    groq: 'moonshotai/kimi-k2-instruct',
    cerebras: null, // never offered on Cerebras
    together: null, // superseded upstream by versioned Kimi-K2.6/K2.7 IDs; no stable 1:1 match
    openrouter: 'moonshotai/kimi-k2',
  },
};

/**
 * Returns the model ID to send to `providerName` for the given canonical
 * model, or `null` if that provider has no equivalent and should be skipped
 * for this request. Unrecognized models pass through unchanged.
 */
export function resolveModelForProvider(providerName: ProviderName, model: string): string | null {
  const entry = MODEL_ALIASES[model];
  if (!entry || !(providerName in entry)) {
    return model;
  }
  return entry[providerName] ?? null;
}

export interface ProviderClientOptions {
  fetch?: FetchLike;
  apiKeyResolver?: ApiKeyResolver;
}

export class UpstreamProviderError extends Error {
  readonly providerName: ProviderName;
  readonly status: number | undefined;
  readonly responseBody: unknown;
  readonly retryable: boolean;
  readonly markUnhealthy: boolean;

  constructor(
    providerName: ProviderName,
    status: number | undefined,
    message: string,
    responseBody?: unknown,
    options?: { retryable?: boolean; markUnhealthy?: boolean },
  ) {
    super(message);
    this.name = 'UpstreamProviderError';
    this.providerName = providerName;
    this.status = status;
    this.responseBody = responseBody;
    this.retryable = options?.retryable ?? (status === undefined || status === 429 || status >= 500);
    this.markUnhealthy =
      options?.markUnhealthy ?? (status === 429 || (status !== undefined && status >= 500));
  }
}

export class ProviderUnavailableError extends Error {
  readonly retryAfterSeconds: number;
  readonly failures: string[];

  constructor(message: string, retryAfterSeconds: number, failures: string[] = []) {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.failures = failures;
  }
}

export async function loadOptionalModule<T>(specifier: string): Promise<T | undefined> {
  try {
    return (await import(specifier)) as T;
  } catch {
    return undefined;
  }
}

export async function resolveFirebaseParam(paramName: string): Promise<string> {
  const paramsModule = await loadOptionalModule<{
    defineString?: (name: string) => { value: () => string };
  }>('firebase-functions/params');

  if (!paramsModule?.defineString) {
    throw new Error(`firebase-functions/params is unavailable while reading ${paramName}.`);
  }

  const value = paramsModule.defineString(paramName).value();
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing Firebase Functions config value for ${paramName}.`);
  }

  return value;
}

export async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function buildChatPayload(req: ChatRequest): object {
  return {
    model: req.model,
    messages: req.messages,
    ...(req.stream !== undefined ? { stream: req.stream } : {}),
    ...(req.tools !== undefined ? { tools: req.tools } : {}),
    ...(req.tool_choice !== undefined ? { tool_choice: req.tool_choice } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.max_tokens !== undefined ? { max_tokens: req.max_tokens } : {}),
  };
}
