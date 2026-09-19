/**
 * Resource loading for the permission guards.
 *
 * @module http/httpResource.helper
 */

import type { PermissionDecision } from "../permissionTypes/index.js";
import type { HttpMiddlewareContext } from "./httpTypes.js";

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
