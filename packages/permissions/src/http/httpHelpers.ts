/**
 * HTTP response helpers for permission middleware.
 *
 * @module http/httpHelpers
 */

import { createGuardResponse, type GuardResponse } from "@zudojs/middleware";

import type { PermissionDecision } from "../permissionTypes/index.js";

/** Options for creating denied responses. */
export interface DeniedResponseOptions {
  /**
   * Builds the 403 body. Receives the real decision, not a reconstruction of
   * it, so `policy`, `matchedPermission` and `metadata` are all available.
   */
  readonly deniedResponse?: (decision: PermissionDecision) => unknown;
  /** Builds the 401 body for an unauthenticated request. */
  readonly unauthenticatedResponse?: () => unknown;
  /** Value for the `WWW-Authenticate` header on a 401. */
  readonly authenticateChallenge?: string;
}

/**
 * A framework-agnostic response: a `GuardResponse` from `@zudojs/middleware`,
 * which `@zudojs/http` sends with its own status. It still has the
 * `status`, `body` and `headers` fields this type always had.
 */
export type PermissionHttpResponse = GuardResponse;

const JSON_HEADERS = { "content-type": "application/json" } as const;

/**
 * Create a 403 Forbidden JSON response for a decision.
 *
 * The default body carries `decision.publicReason`, never `decision.reason`:
 * the internal reason names policies and rules (`policy_error:billingOwner`),
 * which tells a prober about the authorization model.
 */
export function createForbiddenResponse(
  decision: PermissionDecision,
  options?: DeniedResponseOptions,
): PermissionHttpResponse {
  const body = options?.deniedResponse
    ? options.deniedResponse(decision)
    : {
        error: "Forbidden",
        message: decision.publicReason ?? "Access denied",
      };

  return createGuardResponse({ status: 403, body, headers: JSON_HEADERS });
}

/**
 * Create a 401 Unauthorized JSON response.
 *
 * A missing actor is not the same as a denied one: answering both with 403
 * leaves a client unable to tell "log in" from "you may not do this".
 */
export function createUnauthorizedResponse(
  options?: DeniedResponseOptions,
): PermissionHttpResponse {
  const body = options?.unauthenticatedResponse
    ? options.unauthenticatedResponse()
    : { error: "Unauthorized", message: "Authentication required" };

  return createGuardResponse({
    status: 401,
    body,
    headers: {
      ...JSON_HEADERS,
      "www-authenticate": options?.authenticateChallenge ?? "Bearer",
    },
  });
}

/** Options for {@link createNotFoundResponse}. */
export interface NotFoundResponseOptions {
  /** Builds the 404 body for a resource that does not exist. */
  readonly notFoundResponse?: () => unknown;
}

/**
 * Create a 404 Not Found JSON response, for a guard whose resource loader
 * found nothing (`onMissingResource: "notFound"`).
 */
export function createNotFoundResponse(
  options?: NotFoundResponseOptions,
): PermissionHttpResponse {
  const body = options?.notFoundResponse
    ? options.notFoundResponse()
    : { error: "Not Found", message: "Resource not found" };

  return createGuardResponse({ status: 404, body, headers: JSON_HEADERS });
}

/**
 * Create a JSON response.
 */
export function createJsonResponse(
  status: number,
  body: unknown,
): PermissionHttpResponse {
  return createGuardResponse({ status, body, headers: JSON_HEADERS });
}
