/**
 * URL validation and SSRF guards.
 *
 * @module oauthSecurity/oauthUrl
 *
 * An `OAuthConfig` is frequently operator- or tenant-supplied, and the token
 * and user-info URLs are fetched *by your server*. That makes them a
 * server-side request forgery sink: an attacker who can set `tokenUrl` to
 * `http://169.254.169.254/latest/meta-data/iam/...` would have your process
 * fetch cloud credentials and hand the body back. Every URL is therefore
 * checked before any request is made.
 *
 * Two policies:
 *
 * - **Browser-facing URLs** (`authorizeUrl`, redirect URIs) must be `https`,
 *   or `http` when the host is exactly `localhost` / `127.0.0.1` / `[::1]`
 *   (local development), and must not embed credentials.
 * - **Server-fetched URLs** (`tokenUrl`, `userInfoUrl`) must additionally be
 *   `https` unconditionally and resolve — by literal inspection — to a public
 *   host: no loopback, private, carrier-grade-NAT, link-local, unique-local,
 *   multicast, reserved or cloud-metadata address, and no `localhost`,
 *   `*.local`, `*.internal` or `metadata.google.internal` name.
 *
 * **Known limit.** These checks are on the literal host in the URL. They do
 * not resolve DNS, so a hostname that resolves to a private address (DNS
 * rebinding) is not caught here. Pair this with network egress controls if
 * you accept endpoint URLs from untrusted operators.
 */

import { OAuthEndpointNotAllowedError } from "../oauthErrors/index.js";

/** Hostnames that are always refused for a server-fetched endpoint. */
const BLOCKED_HOST_NAMES: ReadonlySet<string> = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

/** Suffixes that are always refused for a server-fetched endpoint. */
const BLOCKED_HOST_SUFFIXES: readonly string[] = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
];

/** Hosts for which plain `http` is tolerated on browser-facing URLs. */
const LOCAL_DEV_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);

/** Parse a dotted-quad IPv4 literal, or `undefined` if it is not one. */
function parseIpv4(host: string): readonly number[] | undefined {
  const parts = host.split(".");
  if (parts.length !== 4) return undefined;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) return undefined;
    octets.push(value);
  }
  return octets;
}

/** Whether an IPv4 literal is outside the publicly routable space. */
function isNonPublicIpv4(octets: readonly number[]): boolean {
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/** Whether an IPv6 literal (already stripped of brackets) is non-public. */
function isNonPublicIpv6(raw: string): boolean {
  const host = raw.toLowerCase();
  if (host === "::" || host === "::1") return true;
  // IPv4-mapped / -compatible: judge the embedded IPv4 address.
  const mapped = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  const embedded = mapped?.[1];
  if (embedded !== undefined) {
    const octets = parseIpv4(embedded);
    return octets === undefined ? true : isNonPublicIpv4(octets);
  }
  // The WHATWG URL parser rewrites `::ffff:127.0.0.1` as `::ffff:7f00:1`,
  // so the hex form has to be decoded back to its embedded IPv4 address.
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  const high = hexMapped?.[1];
  const low = hexMapped?.[2];
  if (high !== undefined && low !== undefined) {
    const word1 = Number.parseInt(high, 16);
    const word2 = Number.parseInt(low, 16);
    return isNonPublicIpv4([
      (word1 >> 8) & 0xff,
      word1 & 0xff,
      (word2 >> 8) & 0xff,
      word2 & 0xff,
    ]);
  }
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true; // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}:/.test(host)) return true; // ff00::/8 multicast
  return false;
}

/**
 * Whether a host literal is one this package refuses to fetch from.
 *
 * Exported for the SSRF tests; not part of the supported surface.
 */
export function isBlockedFetchHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const unbracketed = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
  // A trailing dot marks a fully-qualified name (`localhost.`,
  // `metadata.google.internal.`). DNS resolves it to the same address as
  // the undotted form, but the WHATWG parser keeps the dot on domain
  // hosts, so without stripping it every name-based rule below was one
  // character away from being bypassed.
  const bare = unbracketed.replace(/\.+$/, "");
  if (BLOCKED_HOST_NAMES.has(bare)) return true;
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (bare.endsWith(suffix)) return true;
  }
  const octets = parseIpv4(bare);
  if (octets !== undefined) return isNonPublicIpv4(octets);
  if (bare.includes(":")) return isNonPublicIpv6(bare);
  return false;
}

/** What a URL is used for, which decides how strict the check is. */
export type UrlUse = "browser" | "fetch";

/**
 * Validate a URL and return its parsed, normalised form.
 *
 * @param raw - The URL string from the configuration.
 * @param label - Field name, used only in the (secret-free) error message.
 * @param use - `browser` for redirect targets, `fetch` for endpoints your
 *   server calls (adds the SSRF host policy and forbids `http` entirely).
 * @throws {OAuthEndpointNotAllowedError} If the URL fails any check.
 */
export function assertSafeUrl(raw: string, label: string, use: UrlUse): URL {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new OAuthEndpointNotAllowedError(`${label} must be a non-empty URL.`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OAuthEndpointNotAllowedError(`${label} is not a valid absolute URL.`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new OAuthEndpointNotAllowedError(
      `${label} must not embed credentials.`,
    );
  }
  const isLocalDev = LOCAL_DEV_HOSTS.has(url.hostname.toLowerCase());
  if (url.protocol === "http:") {
    if (use === "fetch" || !isLocalDev) {
      throw new OAuthEndpointNotAllowedError(
        use === "fetch"
          ? `${label} must use https.`
          : `${label} must use https (http is allowed only for localhost).`,
      );
    }
  } else if (url.protocol !== "https:") {
    throw new OAuthEndpointNotAllowedError(`${label} must use https.`);
  }
  if (use === "fetch" && isBlockedFetchHost(url.hostname)) {
    throw new OAuthEndpointNotAllowedError(
      `${label} resolves to a non-public host, which is not allowed.`,
    );
  }
  return url;
}
