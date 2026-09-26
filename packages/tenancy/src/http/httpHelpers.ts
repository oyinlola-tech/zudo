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
 * Machine-readable `code` carried by every refusal body the tenancy
 * middleware produces, alongside `error`. They are tenant-specific on
 * purpose: a client (or a test) can tell "no tenant" from an application's
 * own `404`, which `{ "error": "Tenant not found" }` alone could not.
 */
export const TENANCY_RESPONSE_CODE = Object.freeze({
  /** The request names no tenant, or an unknown or non-active one. */
  NOT_FOUND: "ERR_TENANT_NOT_FOUND",
  /** A tenant was resolved but the route requires one it lacks. */
  REQUIRED: "ERR_TENANT_REQUIRED",
  /** The route forbids tenant context, or the resolution is not trusted. */
  FORBIDDEN: "ERR_TENANT_FORBIDDEN",
  /** The tenant exists but is not active (guard middleware). */
  UNAVAILABLE: "ERR_TENANT_UNAVAILABLE",
  /** Two request sources named different tenants. */
  RESOLUTION_CONFLICT: "ERR_TENANT_RESOLUTION_CONFLICT",
  /** A resolver rejected a credential or could not run. */
  RESOLUTION_FAILED: "ERR_TENANT_RESOLUTION_FAILED",
} as const);

/** One of the {@link TENANCY_RESPONSE_CODE} values. */
export type TenancyResponseCode =
  (typeof TENANCY_RESPONSE_CODE)[keyof typeof TENANCY_RESPONSE_CODE];

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
 * Create a JSON error response: `{ "error": message, "code": code }`, the
 * shape `@zudojs/http` uses for thrown errors. `code` is omitted only when
 * not given.
 */
export function createJsonErrorResponse(
  status: number,
  message: string,
  code?: string,
): GuardResponse {
  return createJsonResponse(
    status,
    code === undefined ? { error: message } : { error: message, code },
  );
}

/**
 * Create a 400 Bad Request response.
 */
export function createBadRequest(
  message: string,
  code: string = TENANCY_RESPONSE_CODE.RESOLUTION_FAILED,
): GuardResponse {
  return createJsonErrorResponse(400, message, code);
}

/**
 * Create a 401 Unauthorized response.
 */
export function createUnauthorized(
  message: string,
  code: string = TENANCY_RESPONSE_CODE.REQUIRED,
): GuardResponse {
  return createJsonErrorResponse(401, message, code);
}

/**
 * Create a 403 Forbidden response.
 */
export function createForbidden(
  message: string,
  code: string = TENANCY_RESPONSE_CODE.FORBIDDEN,
): GuardResponse {
  return createJsonErrorResponse(403, message, code);
}

/**
 * Create a 404 Not Found response.
 */
export function createNotFound(
  message: string,
  code: string = TENANCY_RESPONSE_CODE.NOT_FOUND,
): GuardResponse {
  return createJsonErrorResponse(404, message, code);
}
