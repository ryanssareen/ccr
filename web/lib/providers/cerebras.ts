import {
  buildChatPayload,
  readErrorBody,
  resolveFirebaseParam,
  type ChatRequest,
  type ChatResponse,
  type Provider,
  type ProviderClientOptions,
  UpstreamProviderError,
} from './types';

const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1';
const CEREBRAS_API_KEY_PARAM = 'CEREBRAS_API_KEY';

export class CerebrasProvider implements Provider {
  readonly name = 'cerebras' as const;

  private readonly fetchImpl: typeof fetch;
  private readonly apiKeyResolver: (paramName: string) => Promise<string>;

  constructor(options: ProviderClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.apiKeyResolver = options.apiKeyResolver ?? resolveFirebaseParam;
  }

  async chatCompletion(req: ChatRequest): Promise<ChatResponse> {
    const apiKey = await this.apiKeyResolver(CEREBRAS_API_KEY_PARAM);
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await this.fetchImpl(`${CEREBRAS_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildChatPayload(req)),
      });
    } catch (error) {
      throw new UpstreamProviderError(
        this.name,
        undefined,
        error instanceof Error ? error.message : 'Failed to reach Cerebras.',
      );
    }

    const latency = Date.now() - startedAt;
    if (!response.ok) {
      throw new UpstreamProviderError(
        this.name,
        response.status,
        `Cerebras request failed with status ${response.status}.`,
        await readErrorBody(response),
      );
    }

    if (req.stream) {
      if (!response.body) {
        throw new UpstreamProviderError(
          this.name,
          response.status,
          'Cerebras returned an empty stream.',
          undefined,
          { retryable: true, markUnhealthy: false },
        );
      }

      return {
        body: response.body as ReadableStream<Uint8Array>,
        providerName: this.name,
        upstreamLatencyMs: latency,
      };
    }

    try {
      const body = (await response.json()) as unknown;
      if (!body || typeof body !== 'object') {
        throw new Error('Cerebras returned a non-object response body.');
      }

      return {
        body: body as object,
        providerName: this.name,
        upstreamLatencyMs: latency,
      };
    } catch (error) {
      throw new UpstreamProviderError(
        this.name,
        response.status,
        error instanceof Error ? error.message : 'Cerebras returned malformed JSON.',
        undefined,
        { retryable: true, markUnhealthy: false },
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const apiKey = await this.apiKeyResolver(CEREBRAS_API_KEY_PARAM);
      const response = await this.fetchImpl(`${CEREBRAS_BASE_URL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default CerebrasProvider;
