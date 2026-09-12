/**
 * Node.js HTTP request parsing helpers.
 *
 * @module httpAdapter/node/request
 */

import type { IncomingMessage } from "node:http";

import {
  HttpRequestContext,
  createRequestContext,
} from "../../httpRequest/httpRequest.context.js";

import {
  getClientIp,
  isTrustedProxy,
} from "../../httpTrustProxy/httpTrustProxy.core.js";

import type { ProxyRequest } from "../../httpTrustProxy/httpTrustProxy.core.js";

import type { NodeRequestOptions } from "./httpNode.type.js";

import { removePort, extractPort } from "./httpNode.server.js";

import { decodeQueryComponent } from "../../httpQuery/http.query.js";

/* -------------------------------------------------------------------------- */
/* Proxy Trust                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Decides whether the *immediate peer* of this connection is a configured
 * trusted proxy.
 *
 * Every `X-Forwarded-*` header is written by whoever opened the socket. Unless
 * that peer is a proxy the operator has declared trustworthy, the headers are
 * attacker-controlled and must be ignored entirely — checking only "is a
 * trustProxy value configured?" lets any direct client spoof its own address,
 * protocol and host.
 */
function isPeerTrusted(
  request: IncomingMessage,
  trustProxy: NodeRequestOptions["trustProxy"],
): boolean {
  if (trustProxy === undefined || trustProxy === false) {
    return false;
  }

  const peer = request.socket?.remoteAddress;

  if (!peer) {
    return false;
  }

  return isTrustedProxy(peer, trustProxy);
}

/* -------------------------------------------------------------------------- */
/* Node Request Helpers                                                       */
/* -------------------------------------------------------------------------- */

export function getNodeRequestHeaders(
  request: IncomingMessage,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      headers[name] = value.join(", ");
    } else if (value !== undefined) {
      headers[name] = value;
    }
  }

  return Object.freeze(headers);
}

export function getNodeRequestProtocol(
  request: IncomingMessage,
  options: NodeRequestOptions = {},
): string {
  const trustProxy = options.trustProxy ?? false;

  if (isPeerTrusted(request, trustProxy)) {
    const forwardedProto = request.headers["x-forwarded-proto"];

    if (typeof forwardedProto === "string") {
      const proto = forwardedProto.split(",")[0]?.trim().toLowerCase();

      if (proto === "http" || proto === "https") {
        return proto;
      }
    }
  }

  return (request.socket as unknown as { encrypted?: boolean })?.encrypted
    ? "https"
    : "http";
}

export function getNodeRequestHostname(
  request: IncomingMessage,
  options: NodeRequestOptions = {},
): string {
  const trustProxy = options.trustProxy ?? false;

  if (isPeerTrusted(request, trustProxy)) {
    const forwardedHost = request.headers["x-forwarded-host"];

    if (typeof forwardedHost === "string") {
      const host = forwardedHost.split(",")[0]?.trim();

      if (host) {
        return removePort(host);
      }
    }
  }

  const hostHeader = request.headers.host;

  if (typeof hostHeader === "string") {
    return removePort(hostHeader);
  }

  return request.socket?.localAddress ?? "127.0.0.1";
}

export function getNodeRequestPort(
  request: IncomingMessage,
  options: NodeRequestOptions = {},
): number {
  const trustProxy = options.trustProxy ?? false;

  if (isPeerTrusted(request, trustProxy)) {
    const forwardedHost = request.headers["x-forwarded-host"];

    if (typeof forwardedHost === "string") {
      const host = forwardedHost.split(",")[0]?.trim();

      if (host) {
        const port = extractPort(host);

        if (port !== undefined) {
          return port;
        }
      }
    }
  }

  const hostHeader = request.headers.host;

  if (typeof hostHeader === "string") {
    const port = extractPort(hostHeader);

    if (port !== undefined) {
      return port;
    }
  }

  return request.socket?.localPort ?? 80;
}

/**
 * Resolves the client address for a Node request.
 *
 * The socket peer is authoritative. Forwarded headers are consulted only when
 * that peer is itself a trusted proxy, and the chain walk is delegated to
 * `getClientIp` so there is a single implementation of the hop logic.
 */
export function getNodeRemoteAddress(
  request: IncomingMessage,
  options: NodeRequestOptions = {},
): string | undefined {
  const trustProxy = options.trustProxy ?? false;

  const peer = request.socket?.remoteAddress ?? undefined;

  if (!isPeerTrusted(request, trustProxy)) {
    return peer;
  }

  const proxyRequest: ProxyRequest = {
    headers: request.headers,
    socket: { remoteAddress: peer },
  };

  return getClientIp(proxyRequest, trustProxy) ?? peer;
}

/**
 * Parses the request-target's query string into a flat record.
 *
 * Every value is attacker-controlled. `decodeURIComponent` throws on a
 * malformed sequence such as `%E0`, and this ran before the adapter's
 * try/catch, so one such request tore the connection down instead of being
 * answered. Decoding is delegated to the query module's non-throwing
 * decoder, which also gives `+` its form-encoding meaning. A pair is split on
 * its **first** `=` so `a=b=c` keeps the value `b=c`.
 */
export function parseNodeQuery(
  request: IncomingMessage,
): Readonly<Record<string, string>> {
  const url = request.url;

  if (!url) {
    return Object.freeze({});
  }

  const questionIndex = url.indexOf("?");

  if (questionIndex === -1) {
    return Object.freeze({});
  }

  const hashIndex = url.indexOf("#", questionIndex + 1);

  const queryString = url.slice(
    questionIndex + 1,
    hashIndex === -1 ? undefined : hashIndex,
  );

  if (!queryString) {
    return Object.freeze({});
  }

  const params: Record<string, string> = {};

  for (const pair of queryString.split("&")) {
    if (pair === "") {
      continue;
    }

    const separator = pair.indexOf("=");

    const rawKey = separator === -1 ? pair : pair.slice(0, separator);

    const rawValue = separator === -1 ? "" : pair.slice(separator + 1);

    const key = decodeQueryComponent(rawKey);

    if (key) {
      params[key] = decodeQueryComponent(rawValue);
    }
  }

  return Object.freeze(params);
}

/* -------------------------------------------------------------------------- */
/* Request Context                                                            */
/* -------------------------------------------------------------------------- */

export function createNodeRequestContext(
  request: IncomingMessage,
  options: NodeRequestOptions = {},
): HttpRequestContext {
  const headers = getNodeRequestHeaders(request);

  const protocol = getNodeRequestProtocol(request, options);

  const hostname = getNodeRequestHostname(request, options);

  const port = getNodeRequestPort(request, options);

  const remoteAddress = getNodeRemoteAddress(request, options);

  const query = parseNodeQuery(request);

  const url = request.url ?? "/";

  return createRequestContext({
    method: (request.method as string)?.toUpperCase() ?? "GET",
    url,
    protocol,
    hostname,
    port,
    headers,
    query,
    remoteAddress,
  });
}
