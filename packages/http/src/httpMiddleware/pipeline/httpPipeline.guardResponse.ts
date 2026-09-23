/**
 * Turns a `@zudojs/middleware` guard response into a real response.
 *
 * A middleware that refuses a request — the permissions `authorize()` guard,
 * the tenancy resolver — returns `createGuardResponse({ status, body })`.
 * Route middleware used to ignore any returned object that was not an
 * `HttpResponseContext`, so a plain `{ status: 403, body, headers }` reached
 * the client as `200`: the handler did not run, but clients, caches and
 * monitoring saw a success. Only the branded object is honoured; an unbranded
 * object keeps its previous meaning, so data that happens to carry a
 * `status` key is never read as a response.
 *
 * @module httpMiddleware/pipeline/guardResponse
 */

import type { GuardResponse } from "@zudojs/middleware";

import { HttpResponseContext } from "../../httpResponse/httpResponse.context.js";

import { isValidHeaderFieldValue } from "../../httpHeaders/security/index.js";

/**
 * Writes a guard response's status, headers and body onto `target`.
 *
 * Headers already on `target` (set by an outer middleware before it called
 * `next()`, such as CORS) are kept unless the guard response overrides them.
 *
 * @param target - The response that stays authoritative.
 * @param guard - The guard response to apply.
 * @returns `target`.
 * @throws {TypeError} If a header value contains a control character.
 */
export function applyGuardResponse(
  target: HttpResponseContext,
  guard: GuardResponse,
): HttpResponseContext {
  target.setStatus(guard.status);

  const body = guard.body;

  if (body === undefined) {
    target.setBody(undefined);
  } else if (typeof body === "string" || body instanceof Uint8Array) {
    target.setBody(body);
  } else {
    target.json(body);
  }

  for (const [name, value] of Object.entries(guard.headers)) {
    if (!isValidHeaderFieldValue(value)) {
      throw new TypeError(
        `Invalid value for response header "${name}": it contains a control character or surrounding whitespace.`,
      );
    }

    target.setHeader(name, value);
  }

  return target;
}

/**
 * Builds a fresh response context from a guard response.
 *
 * @param guard - The guard response to convert.
 * @returns A new response context.
 */
export function guardResponseToContext(
  guard: GuardResponse,
): HttpResponseContext {
  return applyGuardResponse(new HttpResponseContext(), guard);
}
