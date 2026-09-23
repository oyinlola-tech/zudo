/**
 * HTTP response helpers for tenancy middleware.
 *
 * Every helper returns a `GuardResponse` from `@zudojs/middleware`, which
 * `@zudojs/http` sends with its own status. They used to return plain
 * `{ status, body, headers }` objects, which a route middleware's caller
 * ignored: a refused request reached the client as `200`.
 *
 * @module http/httpHelpers
 */

import { createGuardResponse, type GuardResponse } from "@zudojs/middleware";

const JSON_HEADERS = { "content-type": "application/json" } as const;

/**
 * Create a JSON response with a caller-built body.
 */
export function createJsonResponse(
  status: number,
  body: unknown,
): GuardResponse {
  return createGuardResponse({ status, body, headers: JSON_HEADERS });
}

/**
 * Create a JSON error response: `{ "error": message }`.
 */
export function createJsonErrorResponse(
  status: number,
  message: string,
): GuardResponse {
  return createJsonResponse(status, { error: message });
}

/**
 * Create a 400 Bad Request response.
 */
export function createBadRequest(message: string): GuardResponse {
  return createJsonErrorResponse(400, message);
}

/**
 * Create a 401 Unauthorized response.
 */
export function createUnauthorized(message: string): GuardResponse {
  return createJsonErrorResponse(401, message);
}

/**
 * Create a 403 Forbidden response.
 */
export function createForbidden(message: string): GuardResponse {
  return createJsonErrorResponse(403, message);
}

/**
 * Create a 404 Not Found response.
 */
export function createNotFound(message: string): GuardResponse {
  return createJsonErrorResponse(404, message);
}
