# Codex Brief — Unit 2: Provider Abstraction Layer

**Model:** GPT-5-Codex
**Working directory:** `/Users/ryan/Documents/ccr/service/functions/`
**Goal:** Build a backend module that exposes a unified chat-completion interface across Groq, Together AI, Cerebras, and OpenRouter. The Cloud Function proxy (built separately by Claude) will use this module.

---

## Context

CCR is being transformed from a Groq-only CLI into a managed multi-provider service. Users hit a single Cloud Functions endpoint (`/v1/chat/completions`); the proxy delegates to your provider router, which selects a healthy provider and forwards an OpenAI-compatible chat-completion request.

This unit is **only** the provider abstraction. Do **not** build the auth check, quota tracking, or the HTTP function — those are separate units done elsewhere.

---

## Files to create

- `service/functions/src/providers/types.ts` — shared interfaces
- `service/functions/src/providers/groq.ts`
- `service/functions/src/providers/together.ts`
- `service/functions/src/providers/cerebras.ts`
- `service/functions/src/providers/openrouter.ts`
- `service/functions/src/providers/index.ts` — router (selection + failover)
- `service/functions/test/providers.test.ts`

---

## Interface contract (must match exactly — Claude depends on this)

```typescript
// types.ts
export interface ChatRequest {
  model: string;
  messages: Array<{ role: 'system'|'user'|'assistant'|'tool'; content: string }>;
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatResponse {
  // Pass through provider response unchanged in OpenAI format
  // For streaming: return ReadableStream<Uint8Array> instead
  body: object | ReadableStream<Uint8Array>;
  providerName: string;  // which provider answered
  upstreamLatencyMs: number;
}

export interface Provider {
  name: 'groq' | 'together' | 'cerebras' | 'openrouter';
  chatCompletion(req: ChatRequest): Promise<ChatResponse>;
  healthCheck(): Promise<boolean>;
}

export interface Router {
  // Selects a healthy provider (weighted random); falls through on 429/5xx
  // Throws ProviderUnavailableError if all providers fail
  route(req: ChatRequest): Promise<ChatResponse>;
}
```

---

## Provider configuration

Read API keys from Firebase Functions config at runtime:
```typescript
import { defineString } from 'firebase-functions/params';
const groqKey = defineString('GROQ_API_KEY');
// ... etc for TOGETHER_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY
```

All four providers expose OpenAI-compatible `/v1/chat/completions` endpoints. Base URLs:
- Groq: `https://api.groq.com/openai/v1`
- Together AI: `https://api.together.xyz/v1`
- Cerebras: `https://api.cerebras.ai/v1`
- OpenRouter: `https://openrouter.ai/api/v1`

Use `node-fetch` or built-in `fetch` (Cloud Functions Node 20+ has it native).

---

## Router behavior

1. Maintain weighted list (default: Groq=4, Cerebras=3, Together=2, OpenRouter=1)
2. On `route()`: pick provider via weighted random from currently-healthy ones
3. On 429 or 5xx response: mark provider unhealthy for 60s (in-memory cache + Firestore `/providers/{name}.healthState`); retry with next provider
4. On all providers failing: throw `ProviderUnavailableError` with retry-after hint
5. `healthCheck()` per provider: cheap GET to `/v1/models` or similar, returns boolean

---

## Test scenarios (write all of these)

```typescript
// providers.test.ts
describe('provider router', () => {
  // Happy path
  it('returns response from selected provider', async () => { ... });
  it('selects providers proportional to weights over many calls', async () => { ... });

  // Failover
  it('falls through to next provider on 429', async () => { ... });
  it('falls through to next provider on 503', async () => { ... });
  it('marks provider unhealthy for 60s after failure', async () => { ... });
  it('recovers when provider becomes healthy again', async () => { ... });

  // Error cases
  it('throws ProviderUnavailableError when all providers fail', async () => { ... });
  it('handles malformed upstream response gracefully', async () => { ... });

  // Streaming
  it('passes through SSE chunks for streaming requests', async () => { ... });
});
```

Use `vitest` (already standard for Firebase Functions). Mock fetch with `msw` or simple `vi.spyOn(global, 'fetch')`.

---

## Don't do

- Do NOT build the HTTP function (that's Unit 4, done separately)
- Do NOT read user tokens or check quota (Unit 4 does that before calling you)
- Do NOT log API keys or full request bodies
- Do NOT add a per-user rate limiter (proxy handles that — you're stateless w.r.t. users)
- Do NOT touch any files outside `service/functions/src/providers/` or its test file

---

## Done when

- [ ] All 7 files exist and TypeScript compiles (`tsc --noEmit`)
- [ ] All test scenarios pass
- [ ] `Router.route()` returns ChatResponse for happy-path call to any provider
- [ ] Failover demonstrated by test: kill provider 1, observe call to provider 2
- [ ] No API keys hardcoded — all from Firebase Functions config
