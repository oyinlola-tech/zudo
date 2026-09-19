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
import { createIpKeyGenerator, ipRateLimitKey } from "./rateLimit.clientKey.js";

/** Default window: 1 minute. */
const DEFAULT_WINDOW_MS = 60_000;

/** Default rate limit message. */
const DEFAULT_MESSAGE = "Too many requests";

/** Default cap on tracked keys before least-recently-seen eviction. */
const DEFAULT_MAX_KEYS = 100_000;

/** Largest delay `setInterval` honours without overflowing to 1 ms. */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

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
 * The port is stripped, IPv4-mapped IPv6 is keyed as IPv4, and IPv6 is
 * bucketed by /64 (see {@link createIpKeyGenerator} for another prefix).
 *
 * @param request - The rate limit request.
 * @returns The rate limit key.
 * @throws {ConfigurationError} when `request.ip` is missing or not an IP
 *   address; requests used to share a single `"unknown"` bucket.
 */
export function defaultKeyGenerator(request: RateLimitRequest): string {
  return ipKeyGenerator(request);
}

const ipKeyGenerator = createIpKeyGenerator();

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
  /** Lets `reset`/`getCount` take a raw address under the default keys. */
  const storeKey = (key: string): string =>
    config.keyGenerator || store.has(key) ? key : (ipRateLimitKey(key) ?? key);
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

  // Cleanup old entries periodically. Bounded below so a very short window
  // does not schedule a near-continuous timer, and above because Node stores
  // timer delays as a signed 32-bit integer: a delay past 2^31 - 1 ms (about
  // 24.8 days) is silently replaced with 1 ms, so a month-long window used to
  // sweep the whole store a thousand times a second.
  const cleanupInterval = setInterval(
    () => {
      const cutoff = Date.now() - config.windowMs;
      for (const [key, entry] of store) {
        if (entry.lastSeen <= cutoff) {
          store.delete(key);
        }
      }
    },
    Math.min(Math.max(config.windowMs, 1_000), MAX_TIMER_DELAY_MS),
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
   *
   * The store is kept in recency order — `check` re-inserts an entry on every
   * hit — so the oldest key is always the first one iterated and eviction is
   * O(1). It used to copy and sort the whole map on every new key past the
   * cap, which turned the defence against key rotation into an O(n log n)
   * cost per rotated request: the attack it was meant to bound became the
   * cheapest way to burn the CPU.
   */
  function evictIfNeeded(): void {
    while (store.size > maxKeys) {
      const oldest = store.keys().next();
      if (oldest.done) break;
      store.delete(oldest.value);
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
    } else {
      // Move to the most-recent end so eviction order stays least-recent-first.
      store.delete(key);
      store.set(key, entry);
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
    store.delete(storeKey(key));
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
    const entry = store.get(storeKey(key));
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
