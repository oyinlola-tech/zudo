/**
 * HTTP response helpers for permission middleware.
 *
 * @module http/httpHelpers
 */

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

/** A framework-agnostic response. */
export interface PermissionHttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
}

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

  return Object.freeze({
    status: 403,
    body,
    headers: JSON_HEADERS,
  });
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

  return Object.freeze({
    status: 401,
    body,
    headers: Object.freeze({
      ...JSON_HEADERS,
      "www-authenticate": options?.authenticateChallenge ?? "Bearer",
    }),
  });
}

/**
 * Create a JSON response.
 */
export function createJsonResponse(
  status: number,
  body: unknown,
): PermissionHttpResponse {
  return Object.freeze({
    status,
    body,
    headers: JSON_HEADERS,
  });
}
