/**
 * @zudojs/testing — request target and body encoding.
 *
 * Bodies are encoded as they travel on the wire, so JSON is plain
 * `JSON.stringify` output (no serialization envelope).
 */

import type { HttpTestBody, HttpTestQuery } from "./httpTestRequest.type.js";

/** An encoded body and the content type it implies. */
export interface EncodedBody {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** Encodes a `.send()` body. */
export function encodeBody(body: HttpTestBody): EncodedBody {
  const encoder = new TextEncoder();
  if (typeof body === "string") {
    return {
      bytes: encoder.encode(body),
      contentType: "text/plain; charset=utf-8",
    };
  }
  if (body instanceof Uint8Array) {
    return { bytes: body, contentType: "application/octet-stream" };
  }
  if (body instanceof ArrayBuffer) {
    return {
      bytes: new Uint8Array(body),
      contentType: "application/octet-stream",
    };
  }
  if (body instanceof URLSearchParams) {
    return {
      bytes: encoder.encode(body.toString()),
      contentType: "application/x-www-form-urlencoded; charset=utf-8",
    };
  }
  return {
    bytes: encoder.encode(JSON.stringify(body)),
    contentType: "application/json",
  };
}

/**
 * Checks and normalises a request path. It must be origin-relative: the
 * target is chosen when the client is created, not per request.
 */
export function normalizePath(path: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) {
    throw new TypeError(
      `HTTP test client paths are origin-relative; got "${path}". Point createHttpTestClient() at the other origin instead.`,
    );
  }
  return path.startsWith("/") ? path : `/${path}`;
}

/** Substitutes `:name` segments with URI-encoded `params`. */
export function substituteParams(
  path: string,
  params: Readonly<Record<string, string>>,
): string {
  return path.replace(/:([A-Za-z_$][\w$]*)/g, (segment, name: string) =>
    Object.hasOwn(params, name)
      ? encodeURIComponent(params[name] as string)
      : segment,
  );
}

/** Appends query parameters to a path that may already carry a query. */
export function appendQuery(path: string, query: HttpTestQuery): string {
  const hash = path.indexOf("#");
  const bare = hash === -1 ? path : path.slice(0, hash);
  const split = bare.indexOf("?");
  const pathname = split === -1 ? bare : bare.slice(0, split);
  const search = new URLSearchParams(split === -1 ? "" : bare.slice(split + 1));
  for (const [name, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) search.append(name, String(item));
  }
  const encoded = search.toString();
  return encoded ? `${pathname}?${encoded}` : pathname;
}

/** Builds a Basic `Authorization` header value. */
export function basicAuthorization(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}
