/**
 * Conversion of a request context into a WHATWG `Request`.
 */

import type { HttpRequestContext } from "../httpRequest/httpRequest.context.js";
import { parseRequestTarget } from "../httpRequest/target/httpRequest.target.js";
import type { ToWebRequestOptions } from "./httpFetchMount.type.js";

/**
 * Connection-scoped headers. They describe the hop between the client and
 * this server, not the request, and `content-length` is recomputed from the
 * body actually passed on.
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "content-length",
]);

const DEFAULT_ORIGIN = "http://localhost";

const JSON_TYPE = /^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i;

/**
 * The origin of the web request: `pinned` when the caller configured one,
 * otherwise the context's own (from the `Host` header, or a trusted
 * proxy's `X-Forwarded-Host`), otherwise `http://localhost`.
 */
function resolveOrigin(context: HttpRequestContext, pinned: string | undefined): string {
  for (const candidate of [pinned, context.origin, DEFAULT_ORIGIN]) {
    if (candidate === undefined) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      continue;
    }
  }
  return DEFAULT_ORIGIN;
}

/**
 * The context's URL as an absolute URL. The request target is never read
 * as an authority; the origin is `origin` when given, else the context's.
 */
export function contextUrl(context: HttpRequestContext, origin?: string): URL {
  const target = parseRequestTarget(context.url);
  const url = new URL(resolveOrigin(context, origin));
  url.pathname = target.pathname;
  url.search = target.search;
  return url;
}

function toBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return body as Uint8Array<ArrayBuffer>;
  if (body instanceof ArrayBuffer) return body;
  if (
    body instanceof ReadableStream ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  ) {
    return body;
  }
  if (!JSON_TYPE.test(headers.get("content-type") ?? "")) {
    headers.set("content-type", "application/json");
  }
  return JSON.stringify(body);
}

/**
 * Builds a web `Request` from a request context.
 *
 * Headers are copied except connection-scoped ones; the body is the one the
 * adapter read (bytes, text, a stream, or a parsed value re-encoded as JSON,
 * labelled `application/json` unless it already had a JSON content type)
 * and is never attached to `GET` / `HEAD`; the signal aborts the request
 * when the client disconnects.
 */
export function toWebRequest(
  context: HttpRequestContext,
  options: ToWebRequestOptions = {},
): Request {
  const method = context.method.toUpperCase();
  const headers = new Headers();
  for (const [name, value] of Object.entries(context.headers)) {
    if (!HOP_BY_HOP.has(name.toLowerCase())) headers.append(name, value);
  }
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers.set(name, value);
  }

  const body =
    method === "GET" || method === "HEAD" ? undefined : toBody(context.body, headers);
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
    ...(body instanceof ReadableStream ? { duplex: "half" as const } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };

  return new Request(options.url ?? contextUrl(context, options.origin), init);
}
