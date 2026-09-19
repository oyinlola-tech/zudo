/**
 * @zudojs/security — Rate-limit keys derived from client addresses.
 *
 * An address is only a useful bucket if one client cannot cheaply become
 * many. Two things made that cheap: a `host:port` string (some proxies
 * append the client's source port to `X-Forwarded-For`), which gave every
 * new TCP connection its own bucket, and full /128 IPv6 keys, which let any
 * host rotate through the 2^64 addresses of its own /64.
 */

import { isIPv4, isIPv6 } from "node:net";

import { ConfigurationError } from "@zudojs/errors";

import type { RateLimitRequest } from "../types/security.type.js";
import { expandIpv6 } from "../url/url.ipv6.js";

/** Default IPv6 prefix a single client is bucketed by. */
export const DEFAULT_IPV6_PREFIX_LENGTH = 64;

/** Options for {@link createIpKeyGenerator} and {@link ipRateLimitKey}. */
export interface IpKeyOptions {
  /**
   * IPv6 prefix length, in bits, that counts as one client (default: 64,
   * the smallest allocation an end site normally receives). 128 keys every
   * address separately.
   */
  readonly ipv6PrefixLength?: number;
}

/**
 * Parses an address as it appears in a forwarding header or socket, with
 * any port and IPv6 brackets or zone id removed.
 *
 * Accepts `1.2.3.4`, `1.2.3.4:5678`, `2001:db8::1`, `[2001:db8::1]` and
 * `[2001:db8::1]:443`.
 *
 * @returns The bare address, or `undefined` if the value is not an IP.
 */
export function parseClientIp(value: string): string | undefined {
  const raw = value.trim();
  let host = raw;
  if (raw.startsWith("[")) {
    const close = raw.indexOf("]");
    if (close === -1) return undefined;
    const rest = raw.slice(close + 1);
    if (rest !== "" && !/^:\d{1,5}$/.test(rest)) return undefined;
    host = raw.slice(1, close);
  } else if (raw.split(":").length === 2) {
    const [address, port] = raw.split(":");
    if (!/^\d{1,5}$/.test(port ?? "")) return undefined;
    host = address ?? "";
  }
  const zone = host.indexOf("%");
  if (zone !== -1) host = host.slice(0, zone);
  if (isIPv4(host)) return host;
  if (isIPv6(host)) return host.toLowerCase();
  return undefined;
}

/**
 * The rate-limit key for a client address: IPv4 as-is (port stripped),
 * IPv4-mapped IPv6 as its IPv4 address, and other IPv6 addresses truncated
 * to their `ipv6PrefixLength` network, e.g. `2001:db8:0:1:0:0:0:0/64`.
 *
 * @returns The key, or `undefined` when `value` is not an IP address.
 */
export function ipRateLimitKey(
  value: string,
  options?: IpKeyOptions,
): string | undefined {
  const prefix = options?.ipv6PrefixLength ?? DEFAULT_IPV6_PREFIX_LENGTH;
  const ip = parseClientIp(value);
  if (ip === undefined) return undefined;
  if (isIPv4(ip)) return ip;
  const groups = expandIpv6(ip);
  if (!groups) return undefined;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [a = 0, b = 0] = groups.slice(6);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  const masked = groups.map((group, index) => {
    const bits = Math.min(16, Math.max(0, prefix - index * 16));
    return bits === 0 ? 0 : group & ((0xffff << (16 - bits)) & 0xffff);
  });
  return `${masked.map((g) => g.toString(16)).join(":")}/${prefix}`;
}

/**
 * Creates a key generator that buckets requests by `request.ip`.
 *
 * Throws a `ConfigurationError` when `request.ip` is missing or is not an IP
 * address (including the `"unknown"` placeholder `extractClientIp` returns).
 * Keying such requests under one shared `"unknown"` bucket let a single
 * client starve every other client whose address was not available.
 *
 * @throws {RangeError} when `ipv6PrefixLength` is not an integer in 1–128.
 */
export function createIpKeyGenerator(
  options?: IpKeyOptions,
): (request: RateLimitRequest) => string {
  const prefix = options?.ipv6PrefixLength ?? DEFAULT_IPV6_PREFIX_LENGTH;
  if (!Number.isInteger(prefix) || prefix < 1 || prefix > 128) {
    throw new RangeError(`ipv6PrefixLength must be an integer in 1-128, got: ${prefix}`);
  }
  return (request: RateLimitRequest): string => {
    const key =
      typeof request.ip === "string"
        ? ipRateLimitKey(request.ip, { ipv6PrefixLength: prefix })
        : undefined;
    if (key === undefined) {
      throw new ConfigurationError(
        "Rate limiting by IP needs RateLimitRequest.ip to be a client address; " +
          "pass the socket's remoteAddress (or extractClientIp with it), or supply a keyGenerator.",
      );
    }
    return key;
  };
}
