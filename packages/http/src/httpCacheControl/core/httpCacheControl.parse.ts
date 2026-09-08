/**
 * Cache control header parsing and formatting.
 *
 * @module httpCacheControl/parsing
 */

import type {
  CacheControlDirectives,
  CacheControlOptions,
} from "./httpCacheControl.type.js";

/**
 * RFC 9111 section 1.2.2 recommends clamping `delta-seconds` to this value.
 */
const MAX_DELTA_SECONDS = 2_147_483_648;

/**
 * Maximum number of directives parsed from one header.
 */
const MAX_DIRECTIVES = 64;

/**
 * Parses a Cache-Control header value into directives.
 *
 * The comma split honours `quoted-string`, so the qualified form
 * `no-cache="Set-Cookie, Authorization"` survives instead of being torn into
 * an unqualified `no-cache` — which would let a shared cache store and replay
 * a response's `Set-Cookie` and `Authorization` headers to other users.
 *
 * A directive that appears more than once with conflicting values is dropped
 * entirely, per RFC 9111 section 4.2.1; taking the last value is the
 * attacker-favourable choice.
 *
 * @param header - The raw header value.
 * @returns The parsed directives.
 */
export function parseCacheControl(
  header: string | undefined,
): CacheControlDirectives {
  if (!header) {
    return {};
  }

  const directives = Object.create(null) as Record<string, string | boolean>;

  const conflicting = new Set<string>();

  for (const part of splitDirectives(header).slice(0, MAX_DIRECTIVES)) {
    const trimmed = part.trim();

    if (trimmed.length === 0) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");

    const key =
      eqIndex === -1
        ? trimmed.toLowerCase()
        : trimmed.slice(0, eqIndex).trim().toLowerCase();

    const value: string | boolean =
      eqIndex === -1 ? true : unquoteDirective(trimmed.slice(eqIndex + 1));

    if (Object.prototype.hasOwnProperty.call(directives, key)) {
      if (directives[key] !== value) {
        conflicting.add(key);
      }

      continue;
    }

    directives[key] = value;
  }

  for (const key of conflicting) {
    delete directives[key];
  }

  return {
    noCache:
      directives["no-cache"] === true ||
      typeof directives["no-cache"] === "string",
    noStore: directives["no-store"] === true,
    noTransform: directives["no-transform"] === true,
    onlyIfCached: directives["only-if-cached"] === true,
    maxAge: parseDirectiveValue(directives["max-age"]),
    maxStale: parseDirectiveValue(directives["max-stale"]),
    minFresh: parseDirectiveValue(directives["min-fresh"]),
    sMaxAge: parseDirectiveValue(directives["s-maxage"]),
    mustRevalidate: directives["must-revalidate"] === true,
    proxyRevalidate: directives["proxy-revalidate"] === true,
    mustUnderstand: directives["must-understand"] === true,
    private: directives["private"] === true,
    public: directives["public"] === true,
    immutable: directives["immutable"] === true,
    staleWhileRevalidate: parseDirectiveValue(
      directives["stale-while-revalidate"],
    ),
    staleIfError: parseDirectiveValue(directives["stale-if-error"]),
    noCacheHeaders: parseNoCacheHeaders(directives["no-cache"]),
  };
}

/**
 * Splits a Cache-Control header on commas outside a `quoted-string`.
 *
 * @param header - The raw header value.
 * @returns The directive fragments, quotes preserved.
 */
function splitDirectives(header: string): string[] {
  const result: string[] = [];

  let current = "";
  let quoted = false;
  let escaped = false;

  for (const character of header) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (quoted && character === "\\") {
      current += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }

    if (character === "," && !quoted) {
      result.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  result.push(current);

  return result;
}

/**
 * Strips the surrounding quotes from a directive value.
 *
 * @param raw - The raw value, possibly a `quoted-string`.
 * @returns The unquoted value.
 */
function unquoteDirective(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * Parses a `delta-seconds` directive value.
 *
 * RFC 9111 section 1.2.2 defines `delta-seconds` as a non-negative integer,
 * so `-1`, `100abc` and `1e20` are rejected rather than silently coerced into
 * date arithmetic that then computes a time in the past or overflows.
 *
 * @param value - The raw directive value.
 * @returns The clamped seconds, or `undefined` if malformed.
 */
function parseDirectiveValue(
  value: string | boolean | undefined,
): number | undefined {
  if (typeof value === "boolean") {
    return value ? 0 : undefined;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return undefined;
  }

  return Math.min(Number(value.trim()), MAX_DELTA_SECONDS);
}

/**
 * Parses the field-name list of a qualified `no-cache` directive.
 *
 * @param value - The `no-cache` directive value.
 * @returns The listed field names, or `undefined` when unqualified.
 */
function parseNoCacheHeaders(
  value: string | boolean | undefined,
): readonly string[] | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return value
    .split(",")
    .map((name) => name.trim().replace(/"/g, ""))
    .filter((name) => name.length > 0);
}

/**
 * Formats CacheControlDirectives into a Cache-Control header string.
 */
export function formatCacheControl(directives: CacheControlOptions): string {
  const parts: string[] = [];

  if (directives.maxAge !== undefined) {
    parts.push(`max-age=${directives.maxAge}`);
  }
  if (directives.sMaxAge !== undefined) {
    parts.push(`s-maxage=${directives.sMaxAge}`);
  }
  if (directives.noCache) {
    parts.push("no-cache");
  }
  if (directives.noStore) {
    parts.push("no-store");
  }
  if (directives.mustRevalidate) {
    parts.push("must-revalidate");
  }
  if (directives.proxyRevalidate) {
    parts.push("proxy-revalidate");
  }
  if (directives.private) {
    parts.push("private");
  }
  if (directives.public) {
    parts.push("public");
  }
  if (directives.immutable) {
    parts.push("immutable");
  }
  if (directives.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${directives.staleWhileRevalidate}`);
  }
  if (directives.staleIfError !== undefined) {
    parts.push(`stale-if-error=${directives.staleIfError}`);
  }
  if (directives.noTransform) {
    parts.push("no-transform");
  }
  if (directives.onlyIfCached) {
    parts.push("only-if-cached");
  }
  if (directives.mustUnderstand) {
    parts.push("must-understand");
  }
  if (directives.maxStale !== undefined) {
    parts.push(`max-stale=${directives.maxStale}`);
  }
  if (directives.minFresh !== undefined) {
    parts.push(`min-fresh=${directives.minFresh}`);
  }

  if (directives.noCacheHeaders && directives.noCacheHeaders.length > 0) {
    /*
     * The qualified form replaces the bare no-cache emitted above.
     */
    const index = parts.indexOf("no-cache");

    const qualified = `no-cache="${directives.noCacheHeaders.join(", ")}"`;

    if (index === -1) {
      parts.push(qualified);
    } else {
      parts[index] = qualified;
    }
  }

  return parts.join(", ");
}
