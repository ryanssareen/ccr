import { describe, expect, it } from 'vitest';

import { GroqProvider } from '../src/providers/groq';
import {
  ProviderRouter,
  ProviderUnavailableError,
  UpstreamProviderError,
  type HealthState,
  type HealthStateStore,
} from '../src/providers/index';
import type { ChatRequest, ChatResponse, Provider } from '../src/providers/types';

class InMemoryHealthStateStore implements HealthStateStore {
  readonly values = new Map<Provider['name'], HealthState>();

  async get(name: Provider['name']): Promise<HealthState | undefined> {
    return this.values.get(name);
  }

  async set(name: Provider['name'], state: HealthState): Promise<void> {
    this.values.set(name, state);
  }
}

class StubProvider implements Provider {
  readonly name: Provider['name'];
  private readonly implementation: (req: ChatRequest) => Promise<ChatResponse>;

  constructor(name: Provider['name'], implementation: (req: ChatRequest) => Promise<ChatResponse>) {
    this.name = name;
    this.implementation = implementation;
  }

  async chatCompletion(req: ChatRequest): Promise<ChatResponse> {
    return this.implementation(req);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

const baseRequest: ChatRequest = {
  model: 'test-model',
  messages: [{ role: 'user', content: 'hello' }],
};

function makeResponse(providerName: Provider['name'], body: object = { ok: true }): ChatResponse {
  return {
    body,
    providerName,
    upstreamLatencyMs: 5,
  };
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

async function readStreamBody(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    output += decoder.decode(chunk.value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

describe('provider router', () => {
  it('returns response from selected provider', async () => {
    const router = new ProviderRouter({
      providers: [
        new StubProvider('groq', async () => makeResponse('groq', { provider: 'groq' })),
        new StubProvider('cerebras', async () => makeResponse('cerebras')),
        new StubProvider('together', async () => makeResponse('together')),
        new StubProvider('openrouter', async () => makeResponse('openrouter')),
      ],
      random: () => 0,
      healthStateStore: new InMemoryHealthStateStore(),
    });

    const response = await router.route(baseRequest);

    expect(response.providerName).toBe('groq');
    expect(response.body).toEqual({ provider: 'groq' });
  });

  it('selects providers proportional to weights over many calls', async () => {
    const counts: Record<Provider['name'], number> = {
      groq: 0,
      cerebras: 0,
      together: 0,
      openrouter: 0,
    };

    const router = new ProviderRouter({
      providers: [
        new StubProvider('groq', async () => {
          counts.groq += 1;
          return makeResponse('groq');
        }),
        new StubProvider('cerebras', async () => {
          counts.cerebras += 1;
          return makeResponse('cerebras');
        }),
        new StubProvider('together', async () => {
          counts.together += 1;
          return makeResponse('together');
        }),
        new StubProvider('openrouter', async () => {
          counts.openrouter += 1;
          return makeResponse('openrouter');
        }),
      ],
      random: createSeededRandom(42),
      healthStateStore: new InMemoryHealthStateStore(),
    });

    const totalCalls = 10_000;
    for (let index = 0; index < totalCalls; index += 1) {
      await router.route(baseRequest);
    }

    expect(counts.groq / totalCalls).toBeCloseTo(0.4, 1);
    expect(counts.cerebras / totalCalls).toBeCloseTo(0.3, 1);
    expect(counts.together / totalCalls).toBeCloseTo(0.2, 1);
    expect(counts.openrouter / totalCalls).toBeCloseTo(0.1, 1);
  });

  it('falls through to next provider on 429', async () => {
    const router = new ProviderRouter({
      providers: [
        new StubProvider('groq', async () => {
          throw new UpstreamProviderError('groq', 429, 'rate limited');
        }),
        new StubProvider('cerebras', async () => makeResponse('cerebras', { recovered: true })),
        new StubProvider('together', async () => makeResponse('together')),
        new StubProvider('openrouter', async () => makeResponse('openrouter')),
      ],
      random: () => 0,
      healthStateStore: new InMemoryHealthStateStore(),
    });

    const response = await router.route(baseRequest);

    expect(response.providerName).toBe('cerebras');
    expect(response.body).toEqual({ recovered: true });
  });

  it('falls through to next provider on 503', async () => {
    const router = new ProviderRouter({
      providers: [
        new StubProvider('groq', async () => {
          throw new UpstreamProviderError('groq', 503, 'service unavailable');
        }),
        new StubProvider('cerebras', async () => makeResponse('cerebras', { fallback: true })),
        new StubProvider('together', async () => makeResponse('together')),
        new StubProvider('openrouter', async () => makeResponse('openrouter')),
      ],
      random: () => 0,
      healthStateStore: new InMemoryHealthStateStore(),
    });

    const response = await router.route(baseRequest);

    expect(response.providerName).toBe('cerebras');
    expect(response.body).toEqual({ fallback: true });
  });

  it('marks provider unhealthy for 60s after failure', async () => {
    const store = new InMemoryHealthStateStore();
    let now = 1_000;
    let groqCalls = 0;

    const router = new ProviderRouter({
      providers: [
        new StubProvider('groq', async () => {
          groqCalls += 1;
          throw new UpstreamProviderError('groq', 429, 'rate limited');
        }),
        new StubProvider('cerebras', async () => makeResponse('cerebras')),
        new StubProvider('together', async () => makeResponse('together')),
        new StubProvider('openrouter', async () => makeResponse('openrouter')),
      ],
      random: () => 0,
      now: () => now,
      healthStateStore: store,
    });

    await router.route(baseRequest);
    now = 1_500;
    const secondResponse = await router.route(baseRequest);

    expect(groqCalls).toBe(1);
    expect(store.values.get('groq')).toEqual({ unhealthyUntil: 61_000, updatedAt: 1_000 });
    expect(secondResponse.providerName).toBe('cerebras');
  });

  it('recovers when provider becomes healthy again', async () => {
    const store = new InMemoryHealthStateStore();
    let now = 5_000;
    let groqShouldFail = true;

    const router = new ProviderRouter({
      providers: [
        new StubProvider('groq', async () => {
          if (groqShouldFail) {
            groqShouldFail = false;
            throw new UpstreamProviderError('groq', 429, 'rate limited');
          }

          return makeResponse('groq', { recovered: true });
        }),
        new StubProvider('cerebras', async () => makeResponse('cerebras')),
        new StubProvider('together', async () => makeResponse('together')),
        new StubProvider('openrouter', async () => makeResponse('openrouter')),
      ],
      random: () => 0,
      now: () => now,
      healthStateStore: store,
    });

    const firstResponse = await router.route(baseRequest);
    now += 60_001;
    const secondResponse = await router.route(baseRequest);

    expect(firstResponse.providerName).toBe('cerebras');
    expect(secondResponse.providerName).toBe('groq');
    expect(secondResponse.body).toEqual({ recovered: true });
  });

  it('throws ProviderUnavailableError when all providers fail', async () => {
    const router = new ProviderRouter({
      providers: [
        new StubProvider('groq', async () => {
          throw new UpstreamProviderError('groq', 429, 'rate limited');
        }),
        new StubProvider('cerebras', async () => {
          throw new UpstreamProviderError('cerebras', 503, 'service unavailable');
        }),
        new StubProvider('together', async () => {
          throw new UpstreamProviderError('together', 503, 'service unavailable');
        }),
        new StubProvider('openrouter', async () => {
          throw new UpstreamProviderError('openrouter', 503, 'service unavailable');
        }),
      ],
      random: () => 0,
      now: () => 20_000,
      healthStateStore: new InMemoryHealthStateStore(),
    });

    await expect(router.route(baseRequest)).rejects.toMatchObject({
      name: 'ProviderUnavailableError',
      retryAfterSeconds: 60,
    });
  });

  it('handles malformed upstream response gracefully', async () => {
    const malformedProvider = new GroqProvider({
      apiKeyResolver: async () => 'test-key',
      fetch: async () =>
        new Response('not-json', {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
    });

    const router = new ProviderRouter({
      providers: [
        malformedProvider,
        new StubProvider('cerebras', async () => makeResponse('cerebras', { fallback: true })),
        new StubProvider('together', async () => makeResponse('together')),
        new StubProvider('openrouter', async () => makeResponse('openrouter')),
      ],
      random: () => 0,
      healthStateStore: new InMemoryHealthStateStore(),
    });

    const response = await router.route(baseRequest);

    expect(response.providerName).toBe('cerebras');
    expect(response.body).toEqual({ fallback: true });
  });

  it('passes through SSE chunks for streaming requests', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"chunk":1}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const router = new ProviderRouter({
      providers: [
        new GroqProvider({
          apiKeyResolver: async () => 'test-key',
          fetch: async () => new Response(stream, { status: 200 }),
        }),
        new StubProvider('cerebras', async () => makeResponse('cerebras')),
        new StubProvider('together', async () => makeResponse('together')),
        new StubProvider('openrouter', async () => makeResponse('openrouter')),
      ],
      random: () => 0,
      healthStateStore: new InMemoryHealthStateStore(),
    });

    const response = await router.route({ ...baseRequest, stream: true });

    expect(response.providerName).toBe('groq');
    expect(await readStreamBody(response.body as ReadableStream<Uint8Array>)).toBe(
      'data: {"chunk":1}\n\ndata: [DONE]\n\n',
    );
  });
});
