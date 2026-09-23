/**
 * HTTP middleware adapter for @zudojs/permissions.
 *
 * The HTTP types are mirrored locally in `httpTypes.ts` so this package has no
 * dependency on @zudojs/http at all — http sits in a higher architecture tier,
 * so it cannot be a dependency or a peer. The mirror is structural: anything
 * satisfying the real `HttpMiddlewareContext` satisfies the local one, so the
 * middleware composes with the real pipeline. A test runs the guard inside
 * the real `HttpMiddlewarePipeline` to keep the two in step.
 *
 * @module http
 */

export {
  createActorMiddleware,
  createRequirePermissionMiddleware,
  authorize,
  createRequirePermissionsMiddleware,
  ACTOR_STATE_KEY,
  DECISION_STATE_KEY,
  DECISIONS_STATE_KEY,
  type AuthorizeMiddlewareOptions,
  type ActorMiddlewareOptions,
  type RequirePermissionMiddlewareOptions,
  type RequirePermissionsMiddlewareOptions,
} from "./httpMiddleware.core.js";

export {
  createForbiddenResponse,
  createUnauthorizedResponse,
  createJsonResponse,
  createNotFoundResponse,
  type DeniedResponseOptions,
  type NotFoundResponseOptions,
  type PermissionHttpResponse,
} from "./httpHelpers.js";

export {
  loadResource,
  refuseMissingResource,
  RESOURCE_ERROR_DECISION,
  RESOURCE_NOT_FOUND_DECISION,
  type MissingResourceMode,
  type MissingResourceOptions,
  type MissingResourceRefusal,
  type ResourceExtractor,
  type ResourceOutcome,
} from "./httpResource.helper.js";

export type {
  HttpRequestBag,
  HttpMiddleware,
  HttpMiddlewareOutcome,
  HttpMiddlewareContext,
  HttpRequestContext,
  HttpResponseContext,
  HttpMiddlewareState,
} from "./httpTypes.js";
