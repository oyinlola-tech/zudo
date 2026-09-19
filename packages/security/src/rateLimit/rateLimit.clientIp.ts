/**
 * @zudojs/security — Client address extraction from forwarding headers.
 */

import { parseClientIp } from "./rateLimit.clientKey.js";

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
 * The returned address has any port and IPv6 brackets removed: some proxies
 * append `client-ip:port`, and returning that verbatim gave every new TCP
 * source port its own rate-limit bucket. Values that are not IP addresses
 * are ignored.
 *
 * @param headers - Request headers.
 * @param options - Proxy trust configuration.
 * @returns The client IP address, or "unknown". Note that the default
 *   rate-limit key generator refuses `"unknown"`; pass `remoteAddress`.
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
    const ip = candidate === undefined ? undefined : parseClientIp(candidate);
    if (ip !== undefined) return ip;
  }

  const realIp = lookupHeader(headers, "x-real-ip");
  const ip = realIp === undefined ? undefined : parseClientIp(realIp);
  if (ip !== undefined) return ip;

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
