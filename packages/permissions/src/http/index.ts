/**
 * HTTP middleware adapter for @zudojs/permissions.
 *
 * The HTTP types are mirrored locally in `httpTypes.ts` so this package has no
 * hard dependency on @zudojs/http, which is an optional peer. The mirror is
 * structural: anything satisfying the real `HttpMiddlewareContext` satisfies
 * the local one, so the middleware composes with the real pipeline. Keep the
 * two in step when @zudojs/http changes — nothing here can check it for you.
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
  type DeniedResponseOptions,
  type PermissionHttpResponse,
} from "./httpHelpers.js";

export type {
  HttpMiddleware,
  HttpMiddlewareContext,
  HttpRequestContext,
  HttpResponseContext,
  HttpMiddlewareState,
} from "./httpTypes.js";
