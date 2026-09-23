/**
 * Creation and detection of guard responses.
 *
 * @module middlewareResponse/guardResponse.factory
 */

import {
  GUARD_RESPONSE,
  type GuardResponse,
  type GuardResponseInit,
} from "./guardResponse.type.js";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function isStatus(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
  );
}

function isRawBody(body: unknown): boolean {
  return typeof body === "string" || body instanceof Uint8Array;
}

function normalizeHeaders(
  headers: Readonly<Record<string, string>> | undefined,
  body: unknown,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (typeof value !== "string") {
      throw new TypeError(`Guard response header "${name}" must be a string.`);
    }
    result[name.toLowerCase()] = value;
  }
  if (body !== undefined && !isRawBody(body) && !result["content-type"]) {
    result["content-type"] = JSON_CONTENT_TYPE;
  }
  return Object.freeze(result);
}

/**
 * Create a response a middleware returns to answer the request itself.
 *
 * Use it for a refusal — 400, 401, 403, 404, 423, 429 — so the transport
 * sends that status. A plain `{ status, body, headers }` object is not
 * recognised as a response: it is ordinary data.
 *
 * @param init - Status, optional body and headers.
 * @returns A frozen, branded response.
 * @throws {RangeError} If `status` is not an integer in 100–599.
 * @throws {TypeError} If a header value is not a string.
 *
 * @example
 * ```ts
 * return createGuardResponse({ status: 403, body: { error: "Forbidden" } });
 * ```
 */
export function createGuardResponse(init: GuardResponseInit): GuardResponse {
  if (!isStatus(init.status)) {
    throw new RangeError(
      `Guard response status must be an integer in 100-599, got ${String(init.status)}.`,
    );
  }
  return Object.freeze({
    [GUARD_RESPONSE]: true as const,
    status: init.status,
    body: init.body,
    headers: normalizeHeaders(init.headers, init.body),
  });
}

/**
 * Whether a value is a {@link GuardResponse}.
 *
 * Only the brand counts. An object with `status`, `body` and `headers` keys
 * but no brand is not a guard response, so JSON data is never mistaken for
 * one.
 */
export function isGuardResponse(value: unknown): value is GuardResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly [GUARD_RESPONSE]?: unknown })[GUARD_RESPONSE] ===
      true &&
    isStatus((value as { readonly status?: unknown }).status)
  );
}
