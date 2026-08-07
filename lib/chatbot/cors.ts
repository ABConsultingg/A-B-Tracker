// Shared CORS + rate limiting for the embeddable chatbot API routes
// (/api/chat, /api/book, /api/availability).
//
// The widget in public/chatbot.js is installed on client sites and calls these
// endpoints cross-origin. Without CORS headers the browser blocks every call,
// so the widget only ever worked on abconsultingg.com itself.

// Apex domains of sites allowed to embed the widget. The `www.` subdomain of
// each is accepted automatically; nothing else is.
const ALLOWED_HOSTS = new Set([
  "abconsultingg.com",
  // Culture's live site is cultureccc.com. cultureconstruction.com resolves to
  // a different host and is kept in case it is also in use.
  "cultureccc.com",
  "cultureconstruction.com",
  "apollosupplyevents.com",
  "mvpchiropractic.com",
  "richardsbuildingsupply.com",
  "kbcexteriors.com",
  "nicoroofingexteriors.com",
]);

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * True if `origin` is an allowlisted site.
 *
 * Only https is accepted in production (http://localhost is allowed in dev so
 * the widget can be tested locally). A single leading `www.` is stripped before
 * matching, so "https://evil-abconsultingg.com" and
 * "https://abconsultingg.com.evil.test" both correctly fail.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return process.env.NODE_ENV !== "production" && url.hostname === "localhost";
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_HOSTS.has(host);
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    // Responses differ by Origin, so caches must key on it. Next.js overwrites
    // Vary on route handlers with its own router values, so `no-store` is what
    // actually guarantees a shared cache never replays one origin's
    // Allow-Origin header to a different origin. These are dynamic POST
    // endpoints; they should not be cached under any circumstances.
    Vary: "Origin",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// ── Rate limiting ───────────────────────────────────────────────────────────
// In-memory sliding window, keyed by origin. NOTE: serverless functions do not
// share memory, so each warm instance keeps its own counter and the effective
// ceiling is higher than RATE_LIMIT_MAX under scale-out. This is a cost guard
// against runaway usage of A&B's Anthropic key, not a security boundary —
// Origin is trivially forged outside a browser. Move to Supabase or KV if a
// hard global limit is ever required.
type Bucket = number[];
const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 512) return;
  for (const [key, hits] of buckets) {
    if (hits.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) buckets.delete(key);
  }
}

export function checkRateLimit(key: string): {
  ok: boolean;
  remaining: number;
  retryAfter: number;
} {
  const now = Date.now();
  prune(now);

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (hits.length >= RATE_LIMIT_MAX) {
    buckets.set(key, hits);
    const oldest = hits[0];
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, remaining: RATE_LIMIT_MAX - hits.length, retryAfter: 0 };
}

// ── Route helpers ───────────────────────────────────────────────────────────

/** Handler for the CORS preflight request browsers send before a cross-origin POST. */
export function preflight(request: Request): Response {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    // No CORS headers: the browser blocks the real request, which is the point.
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin as string) });
}

/**
 * Origin + rate-limit gate. Returns a Response to send immediately, or null to
 * continue. Requests with no Origin header (same-origin navigation, or a
 * server-to-server call) are allowed through unchanged so abconsultingg.com's
 * own widget keeps working exactly as before.
 */
export function guard(request: Request): Response | null {
  const origin = request.headers.get("origin");

  if (origin && !isAllowedOrigin(origin)) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const key =
    origin ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "same-origin";

  const limit = checkRateLimit(key);
  if (!limit.ok) {
    const headers: Record<string, string> = {
      "Retry-After": String(limit.retryAfter),
      "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
      "X-RateLimit-Remaining": "0",
      // The 429 must carry CORS headers too, or the browser reports an opaque
      // CORS failure instead of the real rate-limit error.
      ...(origin ? corsHeaders(origin) : {}),
    };
    return Response.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers }
    );
  }

  return null;
}

/** Attach CORS headers to a handler's response when the caller is cross-origin. */
export function withCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return response;

  for (const [k, v] of Object.entries(corsHeaders(origin as string))) {
    response.headers.set(k, v);
  }
  return response;
}
