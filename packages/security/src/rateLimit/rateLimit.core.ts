/**
 * @zudojs/security — Rate Limiting
 *
 * Implements sliding window rate limiting to prevent abuse.
 */

import type {
  RateLimitConfig,
  RateLimitRequest,
  RateLimitResponse,
  RateLimitResult,
} from "../types/security.type.js";

/** Default window: 1 minute. */
const DEFAULT_WINDOW_MS = 60_000;

/** Default rate limit message. */
const DEFAULT_MESSAGE = "Too many requests";

/** Default cap on tracked keys before least-recently-seen eviction. */
const DEFAULT_MAX_KEYS = 100_000;

/**
 * In-memory rate limit store.
 *
 * `timestamps` holds only *allowed* requests inside the current window, so the
 * memory a single key can occupy is bounded by `max` no matter how hard it is
 * hammered. `lastSeen` drives eviction when the store hits its key cap.
 */
interface RateLimitEntry {
  timestamps: number[];
  lastSeen: number;
}

/**
 * Default key generator using IP address.
 *
 * @param request - The rate limit request.
 * @returns The rate limit key.
 */
export function defaultKeyGenerator(request: RateLimitRequest): string {
  return request.ip ?? "unknown";
}

/**
 * Default handler when rate limit is exceeded.
 *
 * `Retry-After` is derived from the decision that caused the rejection. It used
 * to be the string `"60"` regardless of configuration, so a limiter with an
 * hour-long window told every client to come back in a minute — and they did,
 * to another rejection.
 *
 * @param _request - The rate limit request.
 * @param response - The rate limit response to modify.
 * @param result - The decision being rejected, used for `Retry-After`.
 * @param message - The message to return, from `RateLimitConfig.message`.
 */
export function defaultHandler(
  _request: RateLimitRequest,
  response: {
    statusCode: number;
    headers: Record<string, string>;
    body?: string;
  },
  result?: RateLimitResult,
  message: string = DEFAULT_MESSAGE,
): void {
  response.statusCode = 429;
  response.headers["Retry-After"] = String(retryAfterSeconds(result));
  response.headers["X-RateLimit-Remaining"] = String(result?.remaining ?? 0);
  if (result) {
    response.headers["X-RateLimit-Limit"] = String(result.total);
    response.headers["X-RateLimit-Reset"] = String(
      Math.ceil(result.resetAt.getTime() / 1000),
    );
  }
  response.body = JSON.stringify({
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message,
    },
  });
}

/**
 * Whole seconds until the window frees up, as `Retry-After` requires.
 *
 * `RateLimitResult.resetAt` is a `Date`; putting it into a header or a JSON
 * body directly yields an ISO string or an object where an integer count of
 * seconds is expected. At least 1, never fractional, so a client never reads
 * `Retry-After: 0` and retries instantly.
 */
export function retryAfterSeconds(
  result?: Pick<RateLimitResult, "resetAt">,
  now: number = Date.now(),
): number {
  if (!result) return Math.ceil(DEFAULT_WINDOW_MS / 1000);
  const deltaMs = result.resetAt.getTime() - now;
  return Math.max(1, Math.ceil(deltaMs / 1000));
}

/** Extra options accepted by {@link createRateLimiter}. */
export interface RateLimiterOptions extends RateLimitConfig {
  /** Maximum number of distinct keys to track (default: 100,000). */
  readonly maxKeys?: number;
}

/**
 * Creates an in-memory rate limiter.
 *
 * The window genuinely slides: each check prunes timestamps older than
 * `windowMs` and decides against what remains, so a client cannot spend a full
 * allowance either side of a fixed boundary and get `2 × max` back to back.
 *
 * @param config - Rate limit configuration.
 * @returns A function that checks rate limits.
 */
export function createRateLimiter(config: RateLimiterOptions) {
  if (!Number.isFinite(config.max) || config.max < 1) {
    throw new RangeError(
      `Rate limit max must be a positive number, got: ${config.max}`,
    );
  }
  if (!Number.isFinite(config.windowMs) || config.windowMs < 1) {
    throw new RangeError(
      `Rate limit windowMs must be a positive number, got: ${config.windowMs}`,
    );
  }

  const store = new Map<string, RateLimitEntry>();
  const keyGenerator = config.keyGenerator ?? defaultKeyGenerator;
  // `config.message` was declared and documented but never read: the default
  // handler always emitted the built-in string.
  const message = config.message ?? DEFAULT_MESSAGE;
  const handler =
    config.handler ??
    ((
      request: RateLimitRequest,
      response: RateLimitResponse,
      result: RateLimitResult,
    ) => {
      defaultHandler(request, response, result, message);
    });
  const skip = config.skip;
  const maxKeys = config.maxKeys ?? DEFAULT_MAX_KEYS;

  // Cleanup old entries periodically. Bounded so a very short window does not
  // schedule a near-continuous timer.
  const cleanupInterval = setInterval(
    () => {
      const cutoff = Date.now() - config.windowMs;
      for (const [key, entry] of store) {
        if (entry.lastSeen <= cutoff) {
          store.delete(key);
        }
      }
    },
    Math.max(config.windowMs, 1_000),
  );

  // Allow cleanup to not keep process alive
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  /**
   * Evicts the least-recently-seen keys once the store exceeds its cap.
   *
   * Without this, a caller rotating the key (a spoofed forwarding header, a
   * per-request identifier) grows the map without limit between sweeps.
   */
  function evictIfNeeded(): void {
    if (store.size <= maxKeys) return;

    const entries = [...store.entries()].sort(
      (a, b) => a[1].lastSeen - b[1].lastSeen,
    );
    const excess = store.size - maxKeys;
    for (let i = 0; i < excess; i++) {
      const entry = entries[i];
      if (entry) store.delete(entry[0]);
    }
  }

  /**
   * Checks if a request is allowed and updates the counter.
   */
  function check(request: RateLimitRequest): RateLimitResult {
    // Skip if configured
    if (skip && skip(request)) {
      return {
        allowed: true,
        remaining: config.max,
        resetAt: new Date(Date.now() + config.windowMs),
        total: config.max,
      };
    }

    const key = keyGenerator(request);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [], lastSeen: now };
      store.set(key, entry);
      evictIfNeeded();
    }

    // Prune everything that has slid out of the window.
    const timestamps = entry.timestamps.filter((t) => t > windowStart);
    entry.lastSeen = now;

    const allowed = timestamps.length < config.max;

    // Only an allowed request consumes an allowance slot. Recording denied
    // requests too would let a client already over the limit keep growing its
    // own bucket, so the cost of an attack would scale with the attack.
    if (allowed) {
      timestamps.push(now);
    }
    entry.timestamps = timestamps;

    const remaining = Math.max(0, config.max - timestamps.length);

    // The window frees up when its oldest surviving request ages out.
    const oldest = timestamps[0];
    const resetAt = new Date((oldest ?? now) + config.windowMs);

    return {
      allowed,
      remaining,
      resetAt,
      total: config.max,
    };
  }

  /**
   * Middleware-like function that checks and optionally handles rate limiting.
   */
  function middleware(
    request: RateLimitRequest,
    response?: RateLimitResponse,
  ): RateLimitResult {
    const result = check(request);

    if (!result.allowed && response) {
      handler(request, response, result);
    }

    return result;
  }

  /**
   * Resets the rate limit for a specific key.
   */
  function reset(key: string): void {
    store.delete(key);
  }

  /**
   * Clears all rate limit data.
   */
  function clear(): void {
    store.clear();
  }

  /**
   * Gets the current count for a key.
   */
  function getCount(key: string): number {
    const entry = store.get(key);
    if (!entry) return 0;

    const windowStart = Date.now() - config.windowMs;
    return entry.timestamps.filter((t) => t > windowStart).length;
  }

  /**
   * Destroys the rate limiter and cleans up resources.
   */
  function destroy(): void {
    clearInterval(cleanupInterval);
    store.clear();
  }

  return {
    check,
    middleware,
    reset,
    clear,
    getCount,
    destroy,
    /** Number of keys currently tracked. */
    get size(): number {
      return store.size;
    },
  };
}

/** Options controlling how far forwarding headers are trusted. */
export interface ClientIpOptions {
  /**
   * Number of reverse proxies you operate in front of this service.
   *
   * `X-Forwarded-For` is appended to by every hop, so the entries closest to
   * the right are the ones your own infrastructure added. With `trustProxy: 1`
   * the last entry is used, with `2` the second-to-last, and so on. Entries to
   * the left of your proxies were supplied by the client and are ignored.
   *
   * Defaults to `0`: no forwarding header is trusted at all.
   */
  readonly trustProxy?: number;
  /** The connection's remote address, used when no header is trusted. */
  readonly remoteAddress?: string;
}

/**
 * Extracts the client IP from request headers.
 *
 * **Forwarding headers are not trusted by default.** Any client can send
 * `X-Forwarded-For`, so taking its leftmost entry — the historical behaviour —
 * hands the caller control of their own rate-limit bucket, and rotating it
 * defeats the limiter entirely. Pass `trustProxy` set to the number of proxies
 * you actually run, together with the socket's `remoteAddress`.
 *
 * @param headers - Request headers.
 * @param options - Proxy trust configuration.
 * @returns The client IP address, or "unknown".
 */
export function extractClientIp(
  headers: Record<string, string | string[] | undefined>,
  options?: ClientIpOptions,
): string {
  const trustProxy = options?.trustProxy ?? 0;
  const fallback = options?.remoteAddress ?? "unknown";

  if (trustProxy <= 0) {
    return fallback;
  }

  const raw = lookupHeader(headers, "x-forwarded-for");
  if (raw !== undefined) {
    const chain = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    // Walk in from the right: index 0 from the end is the address our own
    // outermost proxy observed, and each additional trusted hop steps left.
    const index = chain.length - trustProxy;
    const candidate = chain[Math.max(0, index)];
    if (candidate && isPlausibleIp(candidate)) {
      return candidate;
    }
  }

  const realIp = lookupHeader(headers, "x-real-ip");
  if (realIp !== undefined && isPlausibleIp(realIp.trim())) {
    return realIp.trim();
  }

  return fallback;
}

/** Case-insensitive header lookup that flattens repeated fields. */
function lookupHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== name) continue;
    const value = headers[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return value.join(",");
  }
  return undefined;
}

/**
 * Rejects values that are not addresses at all.
 *
 * A forwarding header is text, and a hostname or arbitrary string in it would
 * otherwise become a rate-limit key of the attacker's choosing.
 */
function isPlausibleIp(value: string): boolean {
  const host = value.startsWith("[")
    ? value.slice(1, value.indexOf("]") === -1 ? undefined : value.indexOf("]"))
    : value.split(":").length > 2
      ? value
      : (value.split(":")[0] ?? value);

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host.split(".").every((octet) => Number(octet) <= 255);
  }

  // Any hex-and-colon string is accepted as an IPv6 candidate.
  return /^[0-9a-fA-F:]+$/.test(host) && host.includes(":");
}
