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
    // 4xx (except 401/403) usually means "this provider can't serve this
    // specific request" — wrong model name, unsupported feature, etc.
    // Treat those as retryable so the router falls through to the next
    // provider, but don't mark unhealthy (the provider itself is fine).
    // 401/403 indicates a misconfigured key — also retryable, also not
    // a transient health issue, so we try other providers without burning
    // the health budget. 5xx and 429 mean the provider is genuinely sad
    // and should be cooled off.
    const is4xx = status !== undefined && status >= 400 && status < 500;
    const is5xx = status !== undefined && status >= 500;
    this.retryable =
      options?.retryable ?? (status === undefined || status === 429 || is4xx || is5xx);
    this.markUnhealthy =
      options?.markUnhealthy ?? (status === 429 || is5xx);
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

export async function resolveEnvParam(paramName: string): Promise<string> {
  const value = process.env[paramName];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing environment variable ${paramName}.`);
  }
  return value;
}

// Default resolver: reads from process.env (Vercel pattern). Falls through
// to firebase-functions/params if that module happens to be loaded — kept
// as a soft fallback so the provider files remain portable.
export async function resolveFirebaseParam(paramName: string): Promise<string> {
  const paramsModule = await loadOptionalModule<{
    defineString?: (name: string) => { value: () => string };
  }>('firebase-functions/params');

  if (paramsModule?.defineString) {
    try {
      const value = paramsModule.defineString(paramName).value();
      if (typeof value === 'string' && value.length > 0) return value;
    } catch {
      // fall through to env
    }
  }

  return resolveEnvParam(paramName);
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
