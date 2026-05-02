// Renderer-local copy of @ccr/core's KNOWN_MODELS. Mirrored here because
// importing from @ccr/core pulls in node-only modules (session io, agent
// loop) that won't bundle for the renderer. Keep this list in sync with
// packages/core/src/known-models.ts.
export const KNOWN_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "moonshotai/kimi-k2-instruct",
  "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
] as const;
