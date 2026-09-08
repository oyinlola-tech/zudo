/**
 * HTTP proxy utilities.
 *
 * Provides framework-agnostic proxy configuration, target resolution,
 * forwarded-header handling, and proxy request helpers.
 *
 * This module does not perform network I/O. Actual proxy transport belongs
 * to the server/client adapter layer.
 */

import type { HTTPHeader } from "../httpProtocol/http.protocol.js";
import {
  appendHeader,
  deleteHeader,
  getHeader,
  setHeader,
} from "../httpProtocol/http.protocol.js";
import { isValidHTTPURL, isValidHeaderValue } from "../httpValidation/index.js";
import {
  isLinkLocalAddress,
  isLoopbackAddress,
  isUniqueLocalAddress,
  parseIpAddress,
} from "../httpTrustProxy/httpTrustProxy.ip.js";
import { assertSafeHeaderValue } from "../httpHeaders/security/index.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ProxyTarget {
  readonly url: URL;
  readonly protocol: string;
  readonly hostname: string;
  readonly port: number | undefined;
  readonly pathname: string;
  readonly search: string;
}

/**
 * Controls which outbound targets this proxy may be pointed at.
 *
 * The default posture blocks the internal network. A proxy whose target is
 * derived from a request is a server-side request forgery primitive: the
 * classic payload is `http://169.254.169.254/latest/meta-data/iam/`, which
 * returns cloud credentials to whoever can steer the target.
 */
export interface ProxySecurityOptions {
  /**
   * Allow loopback, link-local, private/unique-local, multicast and reserved
   * destinations. Off by default. Turn it on only for a proxy whose target is
   * fixed configuration, never one influenced by a request.
   */
  readonly allowPrivateTargets?: boolean;
  /**
   * When present, the target host must appear here (compared case-insensitively
   * against the hostname). This is the only reliable control for a
   * request-derived target.
   */
  readonly allowedHosts?: readonly string[];
  /** Extra hostnames to refuse, on top of the built-in blocklist. */
  readonly blockedHosts?: readonly string[];
  /** Permit schemes other than http/https. Off by default. */
  readonly allowInsecureProtocols?: boolean;
}

export interface ProxyOptions extends ProxySecurityOptions {
  readonly target: string | URL;
  readonly changeOrigin?: boolean;
  readonly preserveHost?: boolean;
  readonly xfwd?: boolean;
  readonly secure?: boolean;
  readonly timeout?: number;
  readonly rewritePath?: (path: string, requestURL: URL) => string;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * The front-end request a proxied request is being made on behalf of.
 *
 * `X-Forwarded-Proto` / `-Host` / `-For` describe the hop the **client** made,
 * not the hop the proxy is about to make, so these values have to come from
 * the incoming request.
 */
export interface ProxyClientContext {
  /** Scheme the client used: `http` or `https`. */
  readonly protocol?: string;
  /** Host (with optional port) the client addressed. */
  readonly host?: string;
  /** Resolved client IP — see `httpTrustProxy.getClientIp`. */
  readonly clientIp?: string;
  /** Port the client connected to. */
  readonly port?: number;
}

export interface ProxyRequest {
  readonly method: string;
  readonly target: ProxyTarget;
  readonly path: string;
  readonly headers: readonly HTTPHeader[];
}

export interface ForwardedAddress {
  readonly protocol?: string;
  readonly host?: string;
  readonly port?: number;
  readonly for?: string;
}

export interface ProxyRewriteOptions {
  readonly stripPrefix?: string;
  readonly prependPrefix?: string;
}

/* -------------------------------------------------------------------------- */
/* Target                                                                     */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* SSRF Guard                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Host names that name the local machine or a cloud instance-metadata service.
 * Compared after lower-casing and stripping a trailing dot.
 */
export const BLOCKED_PROXY_HOSTS: readonly string[] = Object.freeze([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "169.254.169.254",
  "fd00:ec2::254",
]);

/**
 * Host suffixes that only ever resolve inside a private network.
 */
export const BLOCKED_PROXY_HOST_SUFFIXES: readonly string[] = Object.freeze([
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
]);

function normalizeHostname(hostname: string): string {
  let value = hostname.trim().toLowerCase();

  if (value.startsWith("[") && value.endsWith("]")) {
    value = value.slice(1, -1);
  }

  while (value.endsWith(".")) {
    value = value.slice(0, -1);
  }

  return value;
}

function isBlockedLiteralAddress(hostname: string): boolean {
  const address = parseIpAddress(hostname);

  if (!address) {
    return false;
  }

  if (
    isLoopbackAddress(hostname) ||
    isLinkLocalAddress(hostname) ||
    isUniqueLocalAddress(hostname)
  ) {
    return true;
  }

  if (address.family === 4) {
    const first = address.bytes[0] ?? 0;

    /* 0.0.0.0/8 "this network", 100.64/10 CGNAT, 224/4 multicast,
     * 240/4 reserved (which includes 255.255.255.255). */
    if (first === 0 || first >= 224) {
      return true;
    }

    if (
      first === 100 &&
      (address.bytes[1] ?? 0) >= 64 &&
      (address.bytes[1] ?? 0) <= 127
    ) {
      return true;
    }

    return false;
  }

  const first = address.bytes[0] ?? 0;

  /* :: unspecified, and ff00::/8 multicast. */
  if (first === 0xff) {
    return true;
  }

  return address.bytes.every((byte) => byte === 0);
}

/**
 * Explains why a proxy target is refused, or returns `undefined` when it is
 * acceptable.
 *
 * **Limitation, by design:** this module performs no I/O, so a hostname is
 * checked as a literal only. A name that *resolves* to `169.254.169.254`
 * passes here. The transport layer must re-apply this check against the
 * resolved address immediately before connecting (and again on every
 * redirect), or the DNS-rebinding variant of the same attack still works.
 * `isBlockedProxyAddress` is exported for exactly that call.
 */
export function getProxyTargetRejection(
  target: string | URL,
  options: ProxySecurityOptions = {},
): string | undefined {
  let url: URL;

  try {
    url = target instanceof URL ? new URL(target.href) : new URL(target);
  } catch {
    return "Proxy target is not a valid absolute URL.";
  }

  if (
    !options.allowInsecureProtocols &&
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    return `Proxy target protocol ${url.protocol} is not permitted. Only http and https are allowed.`;
  }

  const hostname = normalizeHostname(url.hostname);

  if (hostname.length === 0) {
    return "Proxy target has no host.";
  }

  if (options.allowedHosts && options.allowedHosts.length > 0) {
    const permitted = options.allowedHosts.some(
      (host) => normalizeHostname(host) === hostname,
    );

    if (!permitted) {
      return `Proxy target host ${hostname} is not in the configured allowedHosts.`;
    }

    return undefined;
  }

  const blocked = [
    ...BLOCKED_PROXY_HOSTS,
    ...(options.blockedHosts ?? []),
  ].some((host) => normalizeHostname(host) === hostname);

  if (blocked) {
    return `Proxy target host ${hostname} is blocked.`;
  }

  if (BLOCKED_PROXY_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return `Proxy target host ${hostname} resolves inside a private network.`;
  }

  if (!options.allowPrivateTargets && isBlockedLiteralAddress(hostname)) {
    return `Proxy target address ${hostname} is loopback, link-local, private, multicast or reserved. Set allowPrivateTargets to override.`;
  }

  return undefined;
}

/**
 * True when a resolved IP address must not be connected to.
 *
 * Call this from the transport layer with the address DNS actually returned.
 */
export function isBlockedProxyAddress(address: string): boolean {
  return isBlockedLiteralAddress(normalizeHostname(address));
}

export function isSafeProxyTarget(
  target: string | URL,
  options: ProxySecurityOptions = {},
): boolean {
  return getProxyTargetRejection(target, options) === undefined;
}

/**
 * Throws unless the target passes {@link getProxyTargetRejection}.
 */
export function assertSafeProxyTarget(
  target: string | URL,
  options: ProxySecurityOptions = {},
): void {
  const rejection = getProxyTargetRejection(target, options);

  if (rejection) {
    throw new TypeError(rejection);
  }
}

/**
 * Validates a redirect the upstream returned before it is followed.
 *
 * A redirect re-crosses the trust boundary: the first request may be to an
 * allowlisted host, and its `302` to `http://169.254.169.254/`. The location is
 * resolved against the current URL and then subjected to the same guard as the
 * original target.
 */
export function assertSafeProxyRedirect(
  location: string | URL,
  currentURL: string | URL,
  options: ProxySecurityOptions = {},
): URL {
  const base = currentURL instanceof URL ? currentURL : new URL(currentURL);

  let resolved: URL;

  try {
    resolved = new URL(
      location instanceof URL ? location.href : location,
      base,
    );
  } catch {
    throw new TypeError("Proxy redirect Location is not resolvable.");
  }

  assertSafeProxyTarget(resolved, options);

  return resolved;
}

export function resolveProxyTarget(
  target: string | URL,
  options: ProxySecurityOptions = {},
): ProxyTarget {
  const url =
    target instanceof URL ? new URL(target.href) : parseProxyURL(target);

  assertSafeProxyTarget(url, options);

  return {
    url,
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port.length > 0 ? Number(url.port) : undefined,
    pathname: normalizeProxyPath(url.pathname),
    search: url.search,
  };
}

export function isValidProxyTarget(
  target: string | URL | undefined | null,
): boolean {
  if (target === undefined || target === null) {
    return false;
  }

  try {
    const url = target instanceof URL ? target : new URL(target);

    return (
      isValidHTTPURL(url.href) &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

function parseProxyURL(target: string): URL {
  if (!isValidProxyTarget(target)) {
    throw new TypeError(`Invalid proxy target: ${target}`);
  }

  return new URL(target);
}

/* -------------------------------------------------------------------------- */
/* Path Handling                                                              */
/* -------------------------------------------------------------------------- */

export function joinProxyPath(basePath: string, requestPath: string): string {
  const base = normalizeProxyPath(basePath);

  const request = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;

  if (base === "/") {
    return request;
  }

  return `${base}${request}`.replace(/\/{2,}/g, "/");
}

export function rewriteProxyPath(
  path: string,
  options: ProxyRewriteOptions = {},
): string {
  let result = path.length > 0 ? path : "/";

  if (options.stripPrefix && result.startsWith(options.stripPrefix)) {
    result = result.slice(options.stripPrefix.length);

    if (!result.startsWith("/")) {
      result = `/${result}`;
    }
  }

  if (options.prependPrefix) {
    result = joinProxyPath(options.prependPrefix, result);
  }

  return normalizeProxyPath(result);
}

export function normalizeProxyPath(path: string): string {
  if (path.length === 0) {
    return "/";
  }

  let normalized = path.startsWith("/") ? path : `/${path}`;

  normalized = normalized.replace(/\/{2,}/g, "/");

  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/* -------------------------------------------------------------------------- */
/* Request Path                                                               */
/* -------------------------------------------------------------------------- */

export function buildProxyRequestPath(
  target: ProxyTarget,
  requestPath: string,
  rewritePath?: (path: string, requestURL: URL) => string,
): string {
  let path = requestPath.length > 0 ? requestPath : "/";

  if (rewritePath) {
    path = rewritePath(path, target.url);
  }

  const targetPath = target.pathname === "/" ? "" : target.pathname;

  const normalized = joinProxyPath(targetPath, path);

  return `${normalized}${target.search}`;
}

/* -------------------------------------------------------------------------- */
/* Proxy Headers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Builds the header list for the upstream request.
 *
 * Hop-by-hop headers are removed **first**. Forwarding `Transfer-Encoding`
 * alongside the front end's `Content-Length` is the canonical CL.TE
 * request-smuggling setup; forwarding `Proxy-Authorization` leaks the proxy's
 * own credentials upstream; forwarding `Connection: close` destroys upstream
 * keep-alive pooling.
 */
export function prepareProxyHeaders(
  headers: readonly HTTPHeader[],
  target: ProxyTarget,
  options: Pick<ProxyOptions, "changeOrigin" | "preserveHost" | "xfwd"> = {},
  client: ProxyClientContext = {},
): HTTPHeader[] {
  let result = removeHopByHopHeaders(headers);

  if (options.changeOrigin && !options.preserveHost) {
    result = setHeader(result, "host", formatHost(target.url));
  }

  if (options.xfwd) {
    result = setForwardedHeaders(result, target, client);
  }

  return result;
}

export function applyProxyHeaders(
  headers: readonly HTTPHeader[],
  additionalHeaders: Readonly<Record<string, string>> | undefined,
): HTTPHeader[] {
  if (!additionalHeaders) {
    return [...headers];
  }

  let result = [...headers];

  for (const [name, value] of Object.entries(additionalHeaders)) {
    if (!isValidHeaderValue(value)) {
      throw new TypeError(`Invalid proxy header value for ${name}`);
    }

    result = setHeader(result, name, value);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Forwarded Headers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Sets the `X-Forwarded-*` headers on an outbound proxy request.
 *
 * `X-Forwarded-Proto` and `X-Forwarded-Host` describe **the scheme and host
 * the client originally used**, not the upstream this proxy is about to call,
 * and they are *overwritten* rather than appended to. Appending lets a client
 * that sends `X-Forwarded-Proto: https` to a plain-HTTP proxy produce
 * `https, http`, and every consumer in this package reads `[0]` — so the
 * upstream concludes the request arrived over TLS and issues `Secure` cookies
 * over cleartext.
 *
 * `X-Forwarded-For` is the one header that is appended, because it is a chain:
 * the client address is added to whatever trusted hops already recorded. It is
 * only added when `client.clientIp` is supplied — the caller must resolve it
 * with `httpTrustProxy.getClientIp` rather than copying the raw header.
 */
export function setForwardedHeaders(
  headers: readonly HTTPHeader[],
  target: ProxyTarget,
  client: ProxyClientContext = {},
): HTTPHeader[] {
  let result = [...headers];

  const protocol =
    client.protocol === "http" || client.protocol === "https"
      ? client.protocol
      : undefined;

  if (protocol) {
    result = overwriteForwardedValue(result, "x-forwarded-proto", protocol);
  } else {
    result = deleteHeader(result, "x-forwarded-proto");
  }

  if (client.host) {
    result = overwriteForwardedValue(result, "x-forwarded-host", client.host);
  } else {
    result = deleteHeader(result, "x-forwarded-host");
  }

  if (client.port !== undefined) {
    result = overwriteForwardedValue(
      result,
      "x-forwarded-port",
      String(client.port),
    );
  } else {
    result = deleteHeader(result, "x-forwarded-port");
  }

  if (client.clientIp) {
    result = appendForwardedValue(result, "x-forwarded-for", client.clientIp);
  } else {
    /*
     * No resolved client address means the existing chain came from an
     * unverified peer. Dropping it is safer than relaying a forged chain.
     */
    result = deleteHeader(result, "x-forwarded-for");
  }

  return result;
}

function overwriteForwardedValue(
  headers: readonly HTTPHeader[],
  name: string,
  value: string,
): HTTPHeader[] {
  assertSafeHeaderValue(value);

  return setHeader(headers, name, value);
}

function appendForwardedValue(
  headers: readonly HTTPHeader[],
  name: string,
  value: string,
): HTTPHeader[] {
  assertSafeHeaderValue(value);

  const existing = getHeader(headers, name);

  if (existing) {
    return setHeader(headers, name, `${existing}, ${value}`);
  }

  return appendHeader(headers, name, value);
}

/* -------------------------------------------------------------------------- */
/* Standard Forwarded Header                                                  */
/* -------------------------------------------------------------------------- */

export function createForwardedHeader(address: ForwardedAddress): string {
  const parts: string[] = [];

  if (address.for) {
    parts.push(`for=${formatForwardedIdentifier(address.for)}`);
  }

  if (address.host) {
    parts.push(`host=${formatForwardedValue(address.host)}`);
  }

  if (address.port !== undefined) {
    parts.push(`port=${address.port}`);
  }

  if (address.protocol) {
    parts.push(`proto=${formatForwardedValue(address.protocol)}`);
  }

  return parts.join("; ");
}

export function parseForwardedHeader(
  value: string | undefined | null,
): ForwardedAddress[] {
  if (!value || value.trim().length === 0) {
    return [];
  }

  return value.split(",").map((entry) => parseForwardedEntry(entry));
}

function parseForwardedEntry(value: string): ForwardedAddress {
  const result: {
    protocol?: string;
    host?: string;
    port?: number;
    for?: string;
  } = {};

  const parameters = value.split(";");

  for (const parameter of parameters) {
    const separator = parameter.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = parameter.slice(0, separator).trim().toLowerCase();

    const rawValue = parameter.slice(separator + 1).trim();

    const parsed = unquoteForwardedValue(rawValue);

    switch (key) {
      case "proto":
        result.protocol = parsed;
        break;

      case "host":
        result.host = parsed;
        break;

      case "port": {
        const port = Number(parsed);

        if (Number.isInteger(port) && port >= 0 && port <= 65535) {
          result.port = port;
        }

        break;
      }

      case "for":
        result.for = parsed;
        break;
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Proxy Request                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Builds an upstream request description.
 *
 * The target passes the SSRF guard, hop-by-hop headers are stripped, and the
 * `X-Forwarded-*` values come from `client` (the incoming request), not from
 * the upstream target.
 */
export function createProxyRequest(
  method: string,
  requestPath: string,
  headers: readonly HTTPHeader[],
  options: ProxyOptions,
  client: ProxyClientContext = {},
): ProxyRequest {
  const target = resolveProxyTarget(options.target, options);

  const path = buildProxyRequestPath(target, requestPath, options.rewritePath);

  const proxyHeaders = prepareProxyHeaders(headers, target, options, client);

  const finalHeaders = applyProxyHeaders(proxyHeaders, options.headers);

  return {
    method,
    target,
    path,
    headers: finalHeaders,
  };
}

/* -------------------------------------------------------------------------- */
/* Host Handling                                                              */
/* -------------------------------------------------------------------------- */

export function formatHost(url: URL): string {
  const hostname = url.hostname.includes(":")
    ? `[${url.hostname}]`
    : url.hostname;

  if (!url.port) {
    return hostname;
  }

  return `${hostname}:${url.port}`;
}

export function getProxyHost(target: string | URL): string {
  return formatHost(resolveProxyTarget(target).url);
}

/* -------------------------------------------------------------------------- */
/* Proxy Header Cleanup                                                       */
/* -------------------------------------------------------------------------- */

export function removeHopByHopHeaders(
  headers: readonly HTTPHeader[],
): HTTPHeader[] {
  const connection = getHeader(headers, "connection");

  const connectionTokens =
    connection
      ?.split(",")
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean) ?? [];

  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    ...connectionTokens,
  ]);

  return headers.filter((header) => !hopByHop.has(header.name.toLowerCase()));
}

/* -------------------------------------------------------------------------- */
/* Proxy URL Helpers                                                          */
/* -------------------------------------------------------------------------- */

export function resolveProxyURL(target: string | URL, path: string): URL {
  const proxyTarget = resolveProxyTarget(target);

  const result = new URL(proxyTarget.url.href);

  result.pathname = joinProxyPath(proxyTarget.pathname, path);

  return result;
}

export function isSameOrigin(left: string | URL, right: string | URL): boolean {
  try {
    const leftURL = left instanceof URL ? left : new URL(left);

    const rightURL = right instanceof URL ? right : new URL(right);

    return (
      leftURL.protocol === rightURL.protocol &&
      leftURL.hostname === rightURL.hostname &&
      effectivePort(leftURL) === effectivePort(rightURL)
    );
  } catch {
    return false;
  }
}

function effectivePort(url: URL): string {
  if (url.port) {
    return url.port;
  }

  if (url.protocol === "https:") {
    return "443";
  }

  if (url.protocol === "http:") {
    return "80";
  }

  return "";
}

/* -------------------------------------------------------------------------- */
/* Proxy Configuration                                                        */
/* -------------------------------------------------------------------------- */

export function normalizeProxyOptions(options: ProxyOptions): ProxyOptions {
  const target = resolveProxyTarget(options.target, options);

  if (
    options.timeout !== undefined &&
    (!Number.isFinite(options.timeout) || options.timeout < 0)
  ) {
    throw new RangeError("Proxy timeout must be a non-negative finite number.");
  }

  return {
    ...options,
    target: target.url,
    changeOrigin: options.changeOrigin ?? false,
    preserveHost: options.preserveHost ?? false,
    xfwd: options.xfwd ?? false,
    secure: options.secure ?? target.url.protocol === "https:",
  };
}

/* -------------------------------------------------------------------------- */
/* Internal Forwarded Helpers                                                 */
/* -------------------------------------------------------------------------- */

function formatForwardedIdentifier(value: string): string {
  if (/^[A-Za-z0-9._:-]+$/.test(value)) {
    return value;
  }

  return formatForwardedValue(value);
}

function formatForwardedValue(value: string): string {
  if (/^[A-Za-z0-9._:-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unquoteForwardedValue(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  return value;
}
