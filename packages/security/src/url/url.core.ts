/**
 * @zudojs/security — URL Validation
 *
 * Validates and normalizes URLs, prevents path traversal attacks,
 * and ensures request targets are safe.
 */

import type {
  UrlValidationConfig,
  UrlValidationResult,
} from "../types/security.type.js";

/** Default maximum URL length. */
const DEFAULT_MAX_URL_LENGTH = 2048;

/** Default allowed protocols. */
const DEFAULT_ALLOWED_PROTOCOLS = ["http:", "https:"];

/** Maximum percent-decoding rounds before input is considered hostile. */
const MAX_DECODE_ROUNDS = 8;

/**
 * Null byte patterns.
 *
 * Kept alongside full decoding because a caller may pass a target that is not
 * decodable (invalid escapes) and still contains a literal or encoded NUL.
 */
const NULL_BYTE_PATTERNS = [
  /\x00/, // Actual null byte
  /%00/i, // URL-encoded null byte
  /%2500/i, // Double-encoded null byte
];

/**
 * Invalid percent-encoding.
 *
 * A `%` must be followed by exactly two hex digits. The lookahead also catches
 * a truncated escape at the very end of the string, which a "`%` plus one
 * character" pattern silently accepts.
 */
const INVALID_PERCENT_ENCODING = /%(?![0-9a-fA-F]{2})/;

/**
 * Control characters that must never appear in a request target.
 *
 * Tab is tolerated; CR and LF are not. Leaving those two out of the class —
 * as an "everything except tab" range easily does — is what allows a target to
 * be reflected into a header and split the response.
 */
const TARGET_CONTROL_CHARS = /[\x00-\x08\x0A-\x1F\x7F]/;

/**
 * Fully percent-decodes a string, up to {@link MAX_DECODE_ROUNDS} times.
 *
 * Traversal sequences cannot be recognised reliably by pattern-matching an
 * encoded string: `..`, `%2e%2e`, `.%2e`, `%2e.` and their double-encoded
 * forms are all the same path, and the variant space grows with every round of
 * encoding. Decoding to a fixed point first collapses them into one shape.
 *
 * @param value - The string to decode.
 * @returns The decoded string and whether decoding terminated cleanly.
 */
export function fullyDecodeUri(value: string): {
  decoded: string;
  truncated: boolean;
  malformed: boolean;
} {
  let current = value;
  let malformed = INVALID_PERCENT_ENCODING.test(value);

  for (let round = 0; round < MAX_DECODE_ROUNDS; round++) {
    const { decoded: next, malformed: roundMalformed } = decodeOnce(current);
    if (roundMalformed) malformed = true;
    if (next === current) {
      return { decoded: current, truncated: false, malformed };
    }
    current = next;
  }

  // Still changing after the cap: treat as hostile rather than looping.
  return { decoded: current, truncated: true, malformed };
}

/**
 * One decoding round that survives a malformed escape.
 *
 * `decodeURIComponent` throws for the *whole* string if any escape in it is
 * bad, so a single stray `%` anywhere used to abort decoding entirely and
 * return the still-encoded input with `truncated: false`. Every downstream
 * check then ran against the encoded form: `/a/%2e%2e/etc/passwd%` was
 * reported valid, and so was `/a%0d%0aX-Evil:1%`. That is a fail-open guard.
 *
 * Decoding run-by-run instead keeps multi-byte sequences intact (a run of
 * valid triplets is a complete UTF-8 character) while leaving an invalid run
 * as literal text, so the rest of the string still collapses to its true
 * shape and `malformed` records that something was wrong.
 */
function decodeOnce(value: string): { decoded: string; malformed: boolean } {
  let malformed = false;
  const decoded = value.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      malformed = true;
      return run;
    }
  });
  return { decoded, malformed };
}

/**
 * Checks whether a path contains a traversal segment.
 *
 * Operates on the fully decoded form, and treats a backslash as a separator
 * because Windows and some proxies do.
 *
 * @param path - The path to inspect.
 * @returns True when a `..` segment is present.
 */
export function containsTraversal(path: string): boolean {
  const { decoded, truncated } = fullyDecodeUri(path);
  if (truncated) return true;


  return decoded
    .split(/[/\\]/)
    .some((segment) => segment === ".." || segment === "...");
}

/**
 * Validates a URL against security configuration.
 *
 * @param url - The URL string to validate.
 * @param config - Optional validation configuration.
 * @returns Validation result.
 */
export function validateUrl(
  url: string,
  config?: UrlValidationConfig,
): UrlValidationResult {
  const errors: string[] = [];
  const allowedProtocols =
    config?.allowedProtocols ?? DEFAULT_ALLOWED_PROTOCOLS;
  const maxLength = config?.maxLength ?? DEFAULT_MAX_URL_LENGTH;

  // Check length
  if (url.length > maxLength) {
    errors.push(`URL length ${url.length} exceeds maximum ${maxLength}`);
  }

  // Check for null bytes
  for (const pattern of NULL_BYTE_PATTERNS) {
    if (pattern.test(url)) {
      errors.push("URL contains null bytes");
      break;
    }
  }

  // Check for invalid percent encoding
  if (INVALID_PERCENT_ENCODING.test(url)) {
    errors.push("URL contains invalid percent encoding");
  }

  // Try to parse as URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    errors.push("URL is malformed");
    return { valid: false, errors };
  }

  // Check protocol
  if (!allowedProtocols.includes(parsed.protocol)) {
    errors.push(
      `Protocol "${parsed.protocol}" is not allowed (allowed: ${allowedProtocols.join(", ")})`,
    );
  }

  // Check for path traversal against the raw path, decoded to a fixed point.
  if (config?.blockTraversal !== false) {
    const rawPath = url.split("?")[0]?.split("#")[0] ?? "";
    if (containsTraversal(rawPath)) {
      errors.push("URL contains path traversal attempts");
    }
  }

  // `normalizePaths` was declared on UrlValidationConfig and read only by
  // validateRequestTarget, so `UrlValidationResult.normalized` was never once
  // populated by this function — the field looked optional-by-chance rather
  // than opt-in.
  let normalized: string | undefined;
  if (config?.normalizePaths === true) {
    const rebuilt = new URL(parsed.href);
    rebuilt.pathname = normalizePath(parsed.pathname);
    normalized = rebuilt.href;
  }

  return {
    valid: errors.length === 0,
    normalized,
    errors,
  };
}

/**
 * Normalizes a URL path by resolving . and .. segments.
 *
 * `..` never escapes the root: at depth zero it is discarded rather than
 * popping into the parent.
 *
 * @param pathname - The path to normalize.
 * @returns The normalized path.
 */
export function normalizePath(pathname: string): string {
  // Split into segments
  const segments = pathname.split("/");
  const normalized: string[] = [];

  for (const segment of segments) {
    if (segment === "." || segment === "") {
      // Skip current directory references and empty segments
      continue;
    }
    if (segment === "..") {
      // Go up one level if possible
      normalized.pop();
    } else {
      normalized.push(segment);
    }
  }

  return "/" + normalized.join("/");
}

/**
 * Options accepted by {@link validateRequestTarget}.
 *
 * A request target is origin-form (`/users?page=1`) and carries no scheme, so
 * `allowedProtocols` can never apply to it. Declaring the full
 * {@link UrlValidationConfig} advertised a knob this function cannot honour.
 */
export type RequestTargetConfig = Omit<
  UrlValidationConfig,
  "allowedProtocols"
>;

/**
 * Validates a request target (URI path + query).
 *
 * @param target - The request target (e.g., "/users?page=1").
 * @param config - Optional validation configuration.
 * @returns Validation result.
 */
export function validateRequestTarget(
  target: string,
  config?: RequestTargetConfig,
): UrlValidationResult {
  const errors: string[] = [];

  // `maxLength` was accepted and discarded here, leaving the request target —
  // the one input that arrives straight off the wire — with no length bound
  // at all.
  const maxLength = config?.maxLength ?? DEFAULT_MAX_URL_LENGTH;
  if (target.length > maxLength) {
    errors.push(
      `Request target length ${target.length} exceeds maximum ${maxLength}`,
    );
  }

  // Check for null bytes
  for (const pattern of NULL_BYTE_PATTERNS) {
    if (pattern.test(target)) {
      errors.push("Request target contains null bytes");
      break;
    }
  }

  // Check for path traversal
  if (config?.blockTraversal !== false) {
    if (containsTraversal(target.split("?")[0] ?? "")) {
      errors.push("Request target contains path traversal attempts");
    }
  }

  // Check for control characters (tab is tolerated; CR and LF are not)
  if (TARGET_CONTROL_CHARS.test(target)) {
    errors.push("Request target contains control characters");
  }

  // `validateUrl` has always rejected a malformed escape; the request-target
  // path did not, which is how a single trailing `%` used to disable both the
  // traversal and the encoded-CRLF checks below.
  if (INVALID_PERCENT_ENCODING.test(target)) {
    errors.push(
      "Request target contains invalid percent encoding (a % must be followed by two hex digits)",
    );
  }

  // A decoded CR/LF is just as dangerous as a literal one. Run this whenever
  // decoding produced anything, rather than only when the whole string
  // changed.
  const { decoded } = fullyDecodeUri(target);
  if (
    !TARGET_CONTROL_CHARS.test(target) &&
    TARGET_CONTROL_CHARS.test(decoded)
  ) {
    errors.push("Request target contains encoded control characters");
  }

  // Normalize if requested
  let normalized: string | undefined;
  if (config?.normalizePaths) {
    const [path, ...queryParts] = target.split("?");
    const query = queryParts.join("?");
    normalized = normalizePath(path ?? "");
    if (query) {
      normalized += "?" + query;
    }
  }

  return {
    valid: errors.length === 0,
    normalized,
    errors,
  };
}

/* ─── Private network detection ──────────────────────────────────────────── */

/**
 * Parses a dotted-quad IPv4 address into its four octets.
 *
 * Returns undefined for anything that is not already in canonical form —
 * decimal (`2130706433`) and octal (`0177.0.0.1`) hosts are normalised to
 * dotted-quad by the WHATWG URL parser before this is reached.
 */
function parseIpv4(hostname: string): readonly number[] | undefined {
  const parts = hostname.split(".");
  if (parts.length !== 4) return undefined;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const n = Number(part);
    if (n > 255) return undefined;
    octets.push(n);
  }
  return octets;
}

/** True when the dotted-quad address falls in a private or special-use range. */
function isPrivateIpv4(octets: readonly number[]): boolean {
  const [a = 0, b = 0] = octets;

  return (
    a === 0 || // 0.0.0.0/8 "this network" — resolves to localhost on Linux
    a === 10 || // 10.0.0.0/8 private
    a === 127 || // 127.0.0.0/8 loopback (all of it, not just 127.0.0.1)
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 168) || // 192.168.0.0/16 private
    (a === 192 && b === 0) || // 192.0.0.0/24 + 192.0.2.0/24 special-use
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 benchmarking
    a >= 224 // 224/4 multicast, 240/4 reserved, 255.255.255.255 broadcast
  );
}

/**
 * True when an IPv6 hostname (already stripped of brackets) is private.
 *
 * Also unwraps IPv4-mapped and IPv4-compatible forms, so `::ffff:127.0.0.1`
 * is recognised as loopback rather than treated as an opaque v6 address.
 */
function isPrivateIpv6(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === "::1" || host === "::" || host === "::0") return true;

  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible (::127.0.0.1)
  const mapped = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  if (mapped?.[1]) {
    const octets = parseIpv4(mapped[1]);
    return octets ? isPrivateIpv4(octets) : true;
  }

  // Hex-form IPv4-mapped: ::ffff:7f00:1
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (hexMapped?.[1] && hexMapped[2]) {
    const high = parseInt(hexMapped[1], 16);
    const low = parseInt(hexMapped[2], 16);
    const octets = [high >> 8, high & 0xff, low >> 8, low & 0xff];
    return isPrivateIpv4(octets);
  }

  const firstGroup = host.split(":")[0] ?? "";
  const leading = parseInt(firstGroup.padEnd(4, "0"), 16);

  // fc00::/7 unique local
  if ((leading & 0xfe00) === 0xfc00) return true;
  // fe80::/10 link-local
  if ((leading & 0xffc0) === 0xfe80) return true;

  return false;
}

/**
 * Hostnames that resolve inside the local network or to a metadata service.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

/** Hostname suffixes reserved for local or internal resolution. */
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
];

/**
 * Checks whether a hostname points at a private, loopback, link-local or
 * otherwise internal destination.
 *
 * @param hostname - The hostname to check (as produced by `URL.hostname`).
 * @returns True when the hostname is not safe to reach outward.
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (host.length === 0) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)))
    return true;

  // URL.hostname keeps IPv6 literals in brackets.
  if (host.startsWith("[") && host.endsWith("]")) {
    return isPrivateIpv6(host.slice(1, -1));
  }
  if (host.includes(":")) {
    return isPrivateIpv6(host);
  }

  const octets = parseIpv4(host);
  if (octets) {
    return isPrivateIpv4(octets);
  }

  return false;
}

/**
 * Checks if a URL is safe to follow (not pointing to internal resources).
 *
 * Only `http:` and `https:` are allowed by default — every other scheme,
 * including `file:`, `gopher:`, `data:` and `blob:`, is rejected rather than
 * denied one at a time.
 *
 * **This cannot stop DNS rebinding.** A public hostname may resolve to a
 * private address, and may resolve differently between this check and the
 * connection. For outbound requests that must be safe, resolve the hostname
 * yourself, run {@link isPrivateHostname} against the resolved address, and
 * connect to that address directly.
 *
 * @param url - The URL to check.
 * @param allowedProtocols - Protocols to permit (default: http and https).
 * @returns True if the URL appears safe.
 */
export function isSafeUrl(
  url: string,
  allowedProtocols: readonly string[] = DEFAULT_ALLOWED_PROTOCOLS,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    return false;
  }

  // Credentials in a URL are a redirect-laundering vector and never needed
  // for a target this function is asked to vouch for.
  if (parsed.username || parsed.password) {
    return false;
  }

  return !isPrivateHostname(parsed.hostname);
}
