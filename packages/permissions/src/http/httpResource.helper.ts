/**
 * Resource loading for the permission guards.
 *
 * @module http/httpResource.helper
 */

import type { PermissionDecision } from "../permissionTypes/index.js";
import type { HttpMiddlewareContext } from "./httpTypes.js";
import {
  createForbiddenResponse,
  createNotFoundResponse,
  type DeniedResponseOptions,
  type NotFoundResponseOptions,
  type PermissionHttpResponse,
} from "./httpHelpers.js";

/** Loads the resource a permission is checked against. May be async. */
export type ResourceExtractor = (
  context: HttpMiddlewareContext,
) => unknown | Promise<unknown>;

/** The resource, or the denial to answer with when it could not be loaded. */
export type ResourceOutcome =
  | { readonly ok: true; readonly resource: unknown }
  | { readonly ok: false; readonly decision: PermissionDecision };

/** The decision recorded when the resource loader fails. */
export const RESOURCE_ERROR_DECISION: PermissionDecision = Object.freeze({
  allowed: false,
  reason: "resource_error",
  publicReason: "Access denied",
});

/**
 * Run the extractor and await it.
 *
 * The guard used to hand the engine whatever the extractor returned — for an
 * async loader, a Promise — so every resource condition saw `undefined`:
 * deny rules on a locked or foreign resource never fired, and a loader that
 * rejected let the request through while its rejection went unhandled. A
 * loader that throws or rejects now denies; the error goes to `onError`.
 */
export async function loadResource(
  context: HttpMiddlewareContext,
  extract: ResourceExtractor | undefined,
  onError?: (error: unknown, source: string) => void,
): Promise<ResourceOutcome> {
  if (!extract) return { ok: true, resource: undefined };
  try {
    return { ok: true, resource: await extract(context) };
  } catch (error) {
    onError?.(error, "extractResource");
    return { ok: false, decision: RESOURCE_ERROR_DECISION };
  }
}

/**
 * What a guard does when `extractResource` returns `undefined` or `null`.
 *
 * - `"check"` (default): evaluate the permission with no resource, as the
 *   guards always have. Rules and policies that read the resource see
 *   nothing, so the answer depends on the rest of the model: a role grant
 *   alone lets the request through to the handler.
 * - `"forbid"`: answer 403 without evaluating.
 * - `"notFound"`: answer 404 without evaluating.
 */
export type MissingResourceMode = "check" | "forbid" | "notFound";

/**
 * Options for a guard with a resource loader.
 *
 * A 404 for a missing resource hides nothing on its own. An authenticated
 * caller who lacks the permission still gets 404 for an id that does not
 * exist and 403 for one that does, so the pair of statuses confirms which
 * ids exist. It conceals existence only when it is used consistently: every
 * route over the resource answers the same way, and a denial on an existing
 * resource is also answered 404 (not something these guards do for you).
 * Use it to take the not-found check out of the handler, not as concealment.
 */
export interface MissingResourceOptions extends NotFoundResponseOptions {
  /** What a missing resource answers. Default: `"check"`. */
  readonly onMissingResource?: MissingResourceMode;
}

/** The decision recorded when `onMissingResource` refuses the request. */
export const RESOURCE_NOT_FOUND_DECISION: PermissionDecision = Object.freeze({
  allowed: false,
  reason: "resource_not_found",
  publicReason: "Access denied",
});

/** The refusal for a missing resource, and the decision to record. */
export interface MissingResourceRefusal {
  readonly decision: PermissionDecision;
  readonly response: PermissionHttpResponse;
}

/**
 * Decide whether a loaded resource counts as missing, and answer for it.
 *
 * Only a guard that has an `extractResource` can have a missing resource: a
 * route without one never loads anything, so it is always checked.
 *
 * @returns The refusal to send, or `undefined` to evaluate as usual.
 */
export function refuseMissingResource(
  extract: ResourceExtractor | undefined,
  resource: unknown,
  options: MissingResourceOptions & DeniedResponseOptions,
): MissingResourceRefusal | undefined {
  const mode = options.onMissingResource ?? "check";
  if (!extract || mode === "check") return undefined;
  if (resource !== undefined && resource !== null) return undefined;

  const decision = RESOURCE_NOT_FOUND_DECISION;
  const response =
    mode === "notFound"
      ? createNotFoundResponse(options)
      : createForbiddenResponse(decision, options);
  return { decision, response };
}
