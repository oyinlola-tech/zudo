import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Simple in-memory rate limiter.
 * Tracks request counts per IP within a sliding window.
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodically clean up expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 60_000);

/**
 * Rate limiting middleware.
 * Limits the number of requests per client IP within a time window.
 */
export function rateLimitMiddleware(
  windowMs = 60_000,
  maxRequests = 100,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, res, next) => {
    const clientIp = req.socket.remoteAddress ?? "unknown";
    const now = Date.now();

    let entry = store.get(clientIp);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(clientIp, entry);
    }

    entry.count += 1;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetSeconds);

    if (entry.count > maxRequests) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Too many requests",
          retryAfter: resetSeconds,
        }),
      );
      return;
    }

    next();
  };
}
