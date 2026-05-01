import { NextRequest, NextResponse } from "next/server";

import {
  createRouter,
  ProviderUnavailableError,
  type ChatRequest,
  type Router,
} from "@/lib/providers";
import {
  authenticateBearer,
  AuthError,
  QuotaExceededError,
  quotaHeaders,
  refundQuotaSlot,
  reserveQuotaSlot,
} from "@/lib/quota";

// Admin SDK requires Node runtime, not Edge.
export const runtime = "nodejs";

// Streaming responses can take longer than the default. 60s is generous;
// individual upstream providers respond in <10s for typical completions.
export const maxDuration = 60;

let cachedRouter: Router | null = null;
function getRouter(): Router {
  if (!cachedRouter) {
    cachedRouter = createRouter();
  }
  return cachedRouter;
}

interface RawBody {
  model?: unknown;
  messages?: unknown;
  stream?: unknown;
  tools?: unknown;
  tool_choice?: unknown;
  temperature?: unknown;
  max_tokens?: unknown;
}

function parseChatRequest(raw: RawBody): ChatRequest | string {
  if (typeof raw.model !== "string" || raw.model.length === 0) {
    return "model must be a non-empty string";
  }
  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    return "messages must be a non-empty array";
  }
  for (const message of raw.messages) {
    if (!message || typeof message !== "object") {
      return "each message must be an object";
    }
    if (typeof (message as { role?: unknown }).role !== "string") {
      return "each message must have a string role";
    }
    // `content` may legitimately be null on assistant messages that only carry
    // tool_calls (OpenAI Chat Completions spec). Accept string | null | array
    // (multimodal). Anything else is invalid.
    const content = (message as { content?: unknown }).content;
    const contentValid =
      content === null ||
      content === undefined ||
      typeof content === "string" ||
      Array.isArray(content);
    if (!contentValid) {
      return "each message content must be a string, array, or null";
    }
  }

  const stream = raw.stream === true;
  const temperature =
    typeof raw.temperature === "number" ? raw.temperature : undefined;
  const max_tokens =
    typeof raw.max_tokens === "number" ? raw.max_tokens : undefined;

  return {
    model: raw.model,
    messages: raw.messages as ChatRequest["messages"],
    stream,
    ...(Array.isArray(raw.tools) ? { tools: raw.tools } : {}),
    ...(raw.tool_choice !== undefined ? { tool_choice: raw.tool_choice } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(max_tokens !== undefined ? { max_tokens } : {}),
  };
}

function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

function errorResponse(
  status: number,
  message: string,
  extraHeaders: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    { error: { message, type: "ccr_proxy_error" } },
    { status, headers: extraHeaders }
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Parse + validate body BEFORE auth so malformed requests don't burn
  //    Firestore reads.
  let raw: RawBody;
  try {
    raw = (await req.json()) as RawBody;
  } catch {
    return errorResponse(400, "request body must be JSON");
  }

  const parsed = parseChatRequest(raw);
  if (typeof parsed === "string") {
    return errorResponse(400, parsed);
  }
  const chatRequest = parsed;

  // 2. Authenticate.
  const bearer = extractBearer(req);
  let user;
  try {
    user = await authenticateBearer(bearer);
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.status, err.message);
    }
    console.error("[proxy] auth failure", err);
    return errorResponse(500, "internal authentication error");
  }

  // 3. Reserve a quota slot transactionally. This is the authoritative
  //    "this request counts" decision and prevents over-quota under
  //    concurrent load.
  let quotaAfterReserve;
  try {
    quotaAfterReserve = await reserveQuotaSlot(user.uid);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      const retryAfter = Math.max(
        1,
        Math.ceil((err.resetAt.getTime() - Date.now()) / 1000)
      );
      return errorResponse(429, "quota exceeded", {
        ...quotaHeaders({
          used: user.quota.limit, // report at-limit
          limit: err.limit,
          resetAt: err.resetAt,
        }),
        "Retry-After": String(retryAfter),
      });
    }
    if (err instanceof AuthError) {
      return errorResponse(err.status, err.message);
    }
    console.error("[proxy] quota reservation failed", err);
    return errorResponse(500, "internal quota error");
  }

  // 4. Forward to the provider router. Refund on any failure since the
  //    user wasn't actually served.
  let providerResponse;
  try {
    providerResponse = await getRouter().route(chatRequest);
  } catch (err) {
    await refundQuotaSlot(user.uid);

    if (err instanceof ProviderUnavailableError) {
      return errorResponse(
        503,
        "all providers are currently unavailable; please retry shortly",
        {
          ...quotaHeaders(user.quota), // pre-reserve state, since we refunded
          "Retry-After": String(err.retryAfterSeconds),
        }
      );
    }
    console.error("[proxy] upstream failure", err);
    return errorResponse(502, "upstream provider error", {
      ...quotaHeaders(user.quota),
    });
  }

  // 5. Return the upstream response with quota headers attached.
  const headers = {
    ...quotaHeaders(quotaAfterReserve),
    "X-CCR-Provider": providerResponse.providerName,
  };

  if (providerResponse.body instanceof ReadableStream) {
    // Streaming SSE: pass the byte stream through unmodified. Headers must
    // be set on the Response we return; they'll arrive before the first
    // chunk.
    return new Response(providerResponse.body, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  return NextResponse.json(providerResponse.body, {
    status: 200,
    headers,
  });
}

// Optional: respond to OPTIONS for CORS preflight, in case the CLI runs from
// a context that triggers one. The CLI itself is Node and doesn't, but the
// website's dashboard might use this endpoint in the future.
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
