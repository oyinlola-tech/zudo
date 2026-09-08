/**
 * Trust proxy helper functions.
 *
 * Every `X-Forwarded-*` / `Forwarded` header on a request was written by
 * whoever opened the socket. The single rule these helpers enforce is:
 * **the socket peer is authoritative, and forwarded headers are consulted only
 * when that peer is a configured trusted proxy.**
 *
 * @module httpTrustProxy/helpers
 */

import type {
  TrustProxy,
  ProxyRequest,
  ProxyInfo,
  ForwardedAddress,
} from "./httpTrustProxy.type.js";

import {
  X_FORWARDED_PROTO,
  X_FORWARDED_HOST,
  X_FORWARDED_PORT,
} from "./httpTrustProxy.type.js";

import { compileTrustProxy } from "./httpTrustProxy.compilation.js";
import {
  getForwardedClientAddresses,
  splitAddressAndPort,
} from "./httpTrustProxy.parsing.js";

const ALLOWED_PROTOCOLS = Object.freeze(["http", "https"]);

function firstHeaderValue(
  header: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;

  if (typeof value !== "string") {
    return undefined;
  }

  /*
   * A proxy that appends rather than overwrites produces `https, http`. The
   * left-most entry is whatever the *client* sent, so it cannot be trusted on
   * its own; it is only read after the peer has been verified as a proxy that
   * is expected to prepend the true value.
   */
  const first = value.split(",")[0];

  return typeof first === "string" ? first.trim() : undefined;
}

/**
 * Determines if the given address is a trusted proxy.
 *
 * `index` defaults to `0`, the immediate socket peer.
 */
export function isTrustedProxy(
  address: string,
  trustProxy: TrustProxy,
  index = 0,
): boolean {
  if (!address) {
    return false;
  }

  return compileTrustProxy(trustProxy)(address, index);
}

/**
 * Determines whether the immediate socket peer is a configured trusted proxy.
 *
 * This is the gate for every forwarded-header helper below. When it is false,
 * no `X-Forwarded-*` value may influence the result, because the peer writing
 * them is an ordinary (possibly hostile) client.
 */
export function isTrustedPeer(
  request: ProxyRequest,
  trustProxy: TrustProxy = false,
): boolean {
  if (!trustProxy) {
    return false;
  }

  const peer = request.socket?.remoteAddress;

  if (!peer) {
    return false;
  }

  return isTrustedProxy(peer, trustProxy, 0);
}

/**
 * Builds the full hop chain, ordered left (originating client) to right
 * (immediate socket peer). The peer is appended because it is the one address
 * in the chain that the client cannot forge, and it must be the first hop the
 * trust walk examines.
 */
function buildChain(request: ProxyRequest): readonly string[] {
  const forwarded = getForwardedClientAddresses(request).map(
    (entry) => entry.address,
  );

  const peer = request.socket?.remoteAddress;

  return peer ? [...forwarded, peer] : forwarded;
}

/**
 * Gets the client IP address from the request.
 *
 * Walks the chain right to left starting at the socket peer, skipping hops the
 * `trustProxy` predicate accepts, and returns the first hop it does not. The
 * hop index passed to a custom predicate is counted **from the peer** (`0` is
 * the peer), matching the `proxy-addr` / Express convention.
 *
 * With `trustProxy: false` (the default) the socket peer is returned and
 * forwarded headers are ignored entirely.
 */
export function getClientIp(
  request: ProxyRequest,
  trustProxy: TrustProxy = false,
): string | undefined {
  const peer = request.socket?.remoteAddress;

  if (!trustProxy) {
    return peer;
  }

  const chain = buildChain(request);

  if (chain.length === 0) {
    return peer;
  }

  const checker = compileTrustProxy(trustProxy);

  for (let position = chain.length - 1; position >= 0; position -= 1) {
    const address = chain[position];

    if (!address) {
      return peer;
    }

    if (checker(address, chain.length - 1 - position)) {
      continue;
    }

    return address;
  }

  /* Every hop is trusted, so the left-most entry is the originating client. */
  return chain[0] ?? peer;
}

/**
 * Gets the proxy chain from the request, left to right, including the socket
 * peer as the final hop.
 */
export function getProxyChain(request: ProxyRequest): readonly string[] {
  return buildChain(request);
}

function trustedForwardedEntries(
  request: ProxyRequest,
  trustProxy: TrustProxy,
): readonly ForwardedAddress[] {
  if (!isTrustedPeer(request, trustProxy)) {
    return [];
  }

  return getForwardedClientAddresses(request);
}

/**
 * Gets the request protocol from proxy headers.
 *
 * Returns `"http"` unless the socket peer is a trusted proxy *and* the
 * forwarded value is `http` or `https`. An unrecognised value such as
 * `gopher` is discarded rather than propagated.
 */
export function getRequestProtocol(
  request: ProxyRequest,
  trustProxy: TrustProxy = false,
): string {
  if (!isTrustedPeer(request, trustProxy)) {
    return "http";
  }

  for (const entry of getForwardedClientAddresses(request)) {
    const protocol = entry.protocol?.toLowerCase();

    if (protocol && ALLOWED_PROTOCOLS.includes(protocol)) {
      return protocol;
    }
  }

  const value = firstHeaderValue(request.headers[X_FORWARDED_PROTO])
    ?.trim()
    .toLowerCase();

  if (value && ALLOWED_PROTOCOLS.includes(value)) {
    return value;
  }

  return "http";
}

/**
 * Determines if the request is secure (HTTPS).
 */
export function isSecureRequest(
  request: ProxyRequest,
  trustProxy: TrustProxy = false,
): boolean {
  return getRequestProtocol(request, trustProxy) === "https";
}

/**
 * Gets the request hostname from proxy headers, without the port.
 *
 * IPv6 literals are handled: `[::1]:8080` yields `::1`, not `[`.
 */
export function getRequestHostname(
  request: ProxyRequest,
  trustProxy: TrustProxy = false,
): string | undefined {
  if (!isTrustedPeer(request, trustProxy)) {
    return undefined;
  }

  for (const entry of trustedForwardedEntries(request, trustProxy)) {
    if (entry.host) {
      return splitAddressAndPort(entry.host).address;
    }
  }

  const value = firstHeaderValue(request.headers[X_FORWARDED_HOST]);

  if (!value) {
    return undefined;
  }

  const { address } = splitAddressAndPort(value);

  return address.length > 0 ? address : undefined;
}

/**
 * Gets the request port from proxy headers.
 */
export function getRequestPort(
  request: ProxyRequest,
  trustProxy: TrustProxy = false,
): number | undefined {
  if (!isTrustedPeer(request, trustProxy)) {
    return undefined;
  }

  const portHeader = firstHeaderValue(request.headers[X_FORWARDED_PORT]);

  if (portHeader) {
    const port = Number.parseInt(portHeader, 10);

    if (Number.isInteger(port) && port >= 0 && port <= 65535) {
      return port;
    }
  }

  for (const entry of trustedForwardedEntries(request, trustProxy)) {
    if (entry.host) {
      const { port } = splitAddressAndPort(entry.host);

      if (port !== undefined) {
        return port;
      }
    }
  }

  const hostHeader = firstHeaderValue(request.headers[X_FORWARDED_HOST]);

  if (hostHeader) {
    const { port } = splitAddressAndPort(hostHeader);

    if (port !== undefined) {
      return port;
    }
  }

  return undefined;
}

/**
 * Gets the port the client connected from, when a forwarded entry carries one.
 */
export function getClientPort(
  request: ProxyRequest,
  trustProxy: TrustProxy = false,
): number | undefined {
  const clientIp = getClientIp(request, trustProxy);

  if (!clientIp) {
    return undefined;
  }

  for (const entry of trustedForwardedEntries(request, trustProxy)) {
    if (entry.address === clientIp && entry.port !== undefined) {
      return entry.port;
    }
  }

  return undefined;
}

/**
 * Gets comprehensive proxy information from the request.
 */
export function getProxyInfo(
  request: ProxyRequest,
  trustProxy: TrustProxy = false,
): ProxyInfo {
  return {
    clientIp: getClientIp(request, trustProxy),
    clientPort: getClientPort(request, trustProxy),
    protocol: getRequestProtocol(request, trustProxy),
    hostname: getRequestHostname(request, trustProxy),
    port: getRequestPort(request, trustProxy),
    chain: getProxyChain(request),
  };
}
