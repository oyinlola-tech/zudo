/**
 * Forwarded header parsing.
 *
 * @module httpTrustProxy/parsing
 */

import type { ProxyRequest, ForwardedAddress } from "./httpTrustProxy.type.js";

import { X_FORWARDED_FOR, FORWARDED_HEADER } from "./httpTrustProxy.type.js";

import { isIpAddress, normalizeIpAddress } from "./httpTrustProxy.ip.js";

function headerValue(
  header: string | string[] | undefined,
): string | undefined {
  /*
   * Node collapses repeated `X-Forwarded-For` headers into an array. The full
   * chain is every entry in order, not just the first — taking `[0]` would
   * drop the hops an attacker most wants dropped.
   */
  if (Array.isArray(header)) {
    return header.join(", ");
  }

  return header;
}

/**
 * Splits an address literal into address and port.
 *
 * Handles `1.2.3.4`, `1.2.3.4:8080`, `[::1]`, `[::1]:8080` and bare `::1`.
 * A bare IPv6 literal is never split on `:` — that is what turned `[::1]:8080`
 * into `[` in the previous host parsing.
 */
export function splitAddressAndPort(value: string): {
  readonly address: string;
  readonly port: number | undefined;
} {
  const trimmed = value.trim().replace(/^"|"$/g, "");

  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");

    if (end !== -1) {
      const address = trimmed.slice(1, end);
      const rest = trimmed.slice(end + 1);

      if (rest.startsWith(":")) {
        const port = Number.parseInt(rest.slice(1), 10);

        return {
          address,
          port: Number.isInteger(port) ? port : undefined,
        };
      }

      return { address, port: undefined };
    }
  }

  const colon = trimmed.indexOf(":");

  /* More than one colon means a bare IPv6 literal, which carries no port. */
  if (colon === -1 || trimmed.indexOf(":", colon + 1) !== -1) {
    return { address: trimmed, port: undefined };
  }

  const port = Number.parseInt(trimmed.slice(colon + 1), 10);

  return {
    address: trimmed.slice(0, colon),
    port: Number.isInteger(port) ? port : undefined,
  };
}

/**
 * Parses the X-Forwarded-For header into individual addresses, left to right
 * (client first, nearest proxy last).
 */
export function parseForwardedFor(
  request: ProxyRequest,
): readonly ForwardedAddress[] {
  const value = headerValue(request.headers[X_FORWARDED_FOR]);

  if (!value) {
    return [];
  }

  const result: ForwardedAddress[] = [];

  for (const entry of value.split(",")) {
    const { address, port } = splitAddressAndPort(entry);

    if (address.length === 0) {
      continue;
    }

    result.push({
      address: isIpAddress(address) ? normalizeIpAddress(address) : address,
      port,
      source: X_FORWARDED_FOR,
    });
  }

  return result;
}

/**
 * Parses the Forwarded header (RFC 7239).
 */
export function parseForwarded(
  request: ProxyRequest,
): readonly ForwardedAddress[] {
  const value = headerValue(request.headers[FORWARDED_HEADER]);

  if (!value) {
    return [];
  }

  const result: ForwardedAddress[] = [];

  for (const entry of value.split(",")) {
    let rawFor = "";

    let protocol: string | undefined;

    let host: string | undefined;

    for (const part of entry.split(";")) {
      const separator = part.indexOf("=");

      if (separator === -1) {
        continue;
      }

      const key = part.slice(0, separator).trim().toLowerCase();

      const raw = part
        .slice(separator + 1)
        .trim()
        .replace(/^"|"$/g, "");

      if (key === "for" && raw) {
        rawFor = raw;
        continue;
      }

      if (key === "proto" && raw) {
        protocol = raw.toLowerCase();
        continue;
      }

      if (key === "host" && raw) {
        host = raw;
      }
    }

    if (rawFor.length === 0 && protocol === undefined && host === undefined) {
      continue;
    }

    const { address, port } = splitAddressAndPort(rawFor);

    result.push({
      address: isIpAddress(address) ? normalizeIpAddress(address) : address,
      port,
      protocol,
      host,
      source: FORWARDED_HEADER,
    });
  }

  return result;
}

/**
 * Gets all forwarded client addresses from the request, ordered left to right
 * (originating client first, nearest proxy last).
 */
export function getForwardedClientAddresses(
  request: ProxyRequest,
): readonly ForwardedAddress[] {
  return [...parseForwarded(request), ...parseForwardedFor(request)].filter(
    (entry) => entry.address.length > 0,
  );
}
