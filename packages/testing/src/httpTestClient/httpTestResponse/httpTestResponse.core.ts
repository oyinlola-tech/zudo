/**
 * @zudojs/testing — builds `HttpTestResponse` objects from raw responses.
 */

import type { RawHttpResponse } from "../httpTestTransport/index.js";
import type {
  HttpTestRequestSummary,
  HttpTestResponse,
} from "./httpTestResponse.type.js";

const MAX_PREVIEW = 500;

function mediaType(headers: Headers): string | undefined {
  const value = headers.get("content-type");
  return value ? value.split(";")[0]?.trim().toLowerCase() : undefined;
}

function isJsonType(type: string | undefined): boolean {
  return type === "application/json" || (type?.endsWith("+json") ?? false);
}

function tryParse(text: string): {
  readonly ok: boolean;
  readonly value: unknown;
} {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, value: undefined };
  }
}

/** A short, single-line preview of a body for failure messages. */
export function previewBody(text: string): string {
  if (text.length === 0) return "(empty)";
  const flat = text.replace(/\s+/g, " ");
  return flat.length > MAX_PREVIEW ? `${flat.slice(0, MAX_PREVIEW)}…` : flat;
}

function cookiesOf(
  setCookies: readonly string[],
): Readonly<Record<string, string>> {
  const cookies: Record<string, string> = {};
  for (const header of setCookies) {
    const pair = header.split(";")[0] ?? "";
    const equals = pair.indexOf("=");
    if (equals > 0)
      cookies[pair.slice(0, equals).trim()] = pair.slice(equals + 1).trim();
  }
  return Object.freeze(cookies);
}

/**
 * Wraps a raw response.
 *
 * @param raw - The response as received.
 * @param request - The method and path that produced it.
 */
export function createHttpTestResponse(
  raw: RawHttpResponse,
  request: HttpTestRequestSummary,
): HttpTestResponse {
  const text = new TextDecoder().decode(raw.body);
  const type = mediaType(raw.headers);
  const parsed =
    text.length > 0 && isJsonType(type) ? tryParse(text) : undefined;
  const setCookies = Object.freeze([...raw.headers.getSetCookie()]);

  return Object.freeze({
    status: raw.status,
    statusText: raw.statusText,
    ok: raw.status >= 200 && raw.status < 300,
    headers: raw.headers,
    type,
    text,
    bytes: raw.body,
    body: parsed?.ok ? parsed.value : text.length > 0 ? text : undefined,
    sent: true as const,
    setCookies,
    cookies: cookiesOf(setCookies),
    request: Object.freeze({ ...request }),
    header: (name: string) => raw.headers.get(name) ?? undefined,
    json: <T = unknown>(): T => {
      const result = tryParse(text);
      if (!result.ok) {
        throw new SyntaxError(
          `${request.method} ${request.path} answered ${raw.status} with a body that is not JSON (content-type: ${type ?? "none"}): ${previewBody(text)}`,
        );
      }
      return result.value as T;
    },
  });
}
