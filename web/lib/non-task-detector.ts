// Detect when the latest user message is a pure greeting / acknowledgement /
// other non-task filler. When true, the proxy forces tool_choice: "none" so
// the model physically cannot emit a tool call for that turn.
//
// This file is also mirrored client-side in src/agent.ts for defense in depth;
// keep the two in sync if you change the heuristic.

const GREETING_RE =
  /^(?:hi+|hey+|hello+|yo+|sup|howdy|thanks?(?:\s+(?:you|so\s+much|a\s+lot|man|dude))?|thx|ty|cheers|cool|nice|ok(?:ay)?|got\s*it|sure|sounds\s+good|np|no\s+problem|gm|gn|good\s+(?:morning|night|afternoon|evening)|great|awesome|perfect|amazing|wonderful|excellent|fantastic|alright|right|fine|wow|lol|haha|👋|👍|🙏|❤️)\b[\s.!?,👋👍🙏❤️🤝]*$/i;

// Words that signal an actual task. If any appear, we never treat the message
// as a greeting, even if it's short.
const TASK_SIGNALS = new Set([
  "read",
  "write",
  "edit",
  "fix",
  "build",
  "test",
  "run",
  "list",
  "show",
  "find",
  "grep",
  "search",
  "check",
  "do",
  "make",
  "get",
  "install",
  "deploy",
  "create",
  "update",
  "delete",
  "remove",
  "refactor",
  "explain",
  "describe",
  "review",
  "debug",
  "help",
  "can",
  "could",
  "would",
  "will",
  "please",
  "what",
  "why",
  "how",
  "when",
  "where",
  "who",
  "which",
]);

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    // OpenAI-style multimodal content parts: pull out any text parts.
    return content
      .map((part) => {
        if (part && typeof part === "object") {
          const p = part as { type?: string; text?: unknown };
          if (typeof p.text === "string") return p.text;
        }
        return "";
      })
      .join(" ");
  }
  return "";
}

export function isLikelyNonTask(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Long messages are presumed to be tasks regardless of greeting prefixes.
  if (trimmed.length > 60) return false;

  // Strict greeting: the entire message matches a greeting/ack pattern.
  if (GREETING_RE.test(trimmed)) return true;

  // Looser fallback for very short messages (≤30 chars) without task signals.
  if (trimmed.length <= 30) {
    if (trimmed.includes("?")) return false; // questions are tasks
    const tokens = trimmed.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (tokens.length === 0) return true; // pure punctuation/emoji
    if (tokens.some((t) => TASK_SIGNALS.has(t))) return false;
    return true;
  }

  return false;
}

export interface MinimalMessage {
  role?: unknown;
  content?: unknown;
}

/**
 * Walk the message list back-to-front and return true iff the latest user
 * message looks like pure filler.
 */
export function lastUserIsNonTask(messages: readonly MinimalMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || typeof m !== "object") continue;
    if (m.role !== "user") continue;
    return isLikelyNonTask(extractText(m.content));
  }
  return false;
}
