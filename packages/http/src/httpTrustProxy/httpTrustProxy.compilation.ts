/**
 * Trust proxy compilation.
 *
 * @module httpTrustProxy/compilation
 */

import type { TrustProxy } from "./httpTrustProxy.type.js";

import {
  LINK_LOCAL_RANGES,
  LOOPBACK_RANGES,
  UNIQUE_LOCAL_RANGES,
  ipEquals,
  ipMatchesCidr,
  parseCidr,
  parseIpAddress,
} from "./httpTrustProxy.ip.js";

import type { ParsedIp } from "./httpTrustProxy.ip.js";

/**
 * A compiled trust predicate.
 *
 * `index` is the hop distance from the socket peer: `0` is the immediate peer,
 * `1` the proxy in front of it, and so on. This matches the convention used by
 * `proxy-addr` and Express; counting from the left of the header list would
 * make `(addr, hop) => hop < 1` trust the attacker-controlled end of the chain.
 */
export type TrustProxyPredicate = (value: string, index: number) => boolean;

type PresetName = "loopback" | "linklocal" | "uniquelocal" | "private";

const PRESET_RANGES: Readonly<Record<PresetName, readonly string[]>> =
  Object.freeze({
    loopback: LOOPBACK_RANGES,
    linklocal: LINK_LOCAL_RANGES,
    uniquelocal: UNIQUE_LOCAL_RANGES,
    private: UNIQUE_LOCAL_RANGES,
  });

function isPresetName(value: string): value is PresetName {
  return Object.prototype.hasOwnProperty.call(PRESET_RANGES, value);
}

const compilationCache = new Map<unknown, TrustProxyPredicate>();

const MAX_CACHE_ENTRIES = 64;

function splitTokens(trustProxy: string | readonly string[]): string[] {
  const values = typeof trustProxy === "string" ? [trustProxy] : trustProxy;

  const tokens: string[] = [];

  for (const value of values) {
    for (const token of value.split(",")) {
      const trimmed = token.trim();

      if (trimmed.length > 0) {
        tokens.push(trimmed);
      }
    }
  }

  return tokens;
}

function buildListPredicate(
  trustProxy: string | readonly string[],
): TrustProxyPredicate {
  const tokens = splitTokens(trustProxy);

  const matchers: ((address: ParsedIp) => boolean)[] = [];

  let trustAll = false;

  for (const token of tokens) {
    const lower = token.toLowerCase();

    if (lower === "all" || lower === "*") {
      trustAll = true;
      continue;
    }

    if (isPresetName(lower)) {
      for (const range of PRESET_RANGES[lower]) {
        const cidr = parseCidr(range);

        if (cidr) {
          matchers.push((address) => ipMatchesCidr(address, cidr));
        }
      }

      continue;
    }

    const cidr = parseCidr(token);

    if (cidr) {
      matchers.push((address) => ipMatchesCidr(address, cidr));
      continue;
    }

    const exact = parseIpAddress(token);

    if (exact) {
      matchers.push((address) => ipEquals(address, exact));
      continue;
    }

    /*
     * Silently compiling an unmatchable predicate is how `trustProxy:
     * "10.0.0.0/8"` used to become "trust nothing" (or, in the adapter,
     * "trust everything") with no diagnostic. Fail at configuration time.
     */
    throw new TypeError(
      `Invalid trustProxy entry: ${token}. Expected an IP address, a CIDR range, or one of: all, loopback, linklocal, uniquelocal, private.`,
    );
  }

  if (trustAll) {
    return () => true;
  }

  if (matchers.length === 0) {
    return () => false;
  }

  return (value) => {
    const address = parseIpAddress(value);

    if (!address) {
      return false;
    }

    return matchers.some((matcher) => matcher(address));
  };
}

/**
 * Compiles a trust proxy configuration into a predicate that decides whether a
 * given hop address is a trusted proxy.
 *
 * Supported forms:
 * - `false` (default) — trust nothing.
 * - `true` / `"all"` / `"*"` — trust every hop.
 * - `"loopback"`, `"linklocal"`, `"uniquelocal"` / `"private"` — named ranges.
 * - an IP address, a CIDR range, a comma-separated list of either, or an array
 *   of the same.
 * - a custom predicate `(address, hopIndexFromPeer) => boolean`.
 *
 * Throws `TypeError` on a string that is none of the above rather than
 * returning a predicate that can never match.
 */
export function compileTrustProxy(trustProxy: TrustProxy): TrustProxyPredicate {
  if (typeof trustProxy === "function") {
    return trustProxy;
  }

  if (trustProxy === true) {
    return () => true;
  }

  /* Anything that is not a string or a list (including `false`, `undefined`
   * and any malformed runtime value) trusts nothing. */
  if (typeof trustProxy !== "string" && !Array.isArray(trustProxy)) {
    return () => false;
  }

  const cached = compilationCache.get(trustProxy);

  if (cached) {
    return cached;
  }

  const predicate = buildListPredicate(trustProxy);

  if (compilationCache.size >= MAX_CACHE_ENTRIES) {
    compilationCache.clear();
  }

  compilationCache.set(trustProxy, predicate);

  return predicate;
}
