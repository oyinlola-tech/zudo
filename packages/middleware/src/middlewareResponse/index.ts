/**
 * Guard responses: the contract a middleware uses to answer a request itself
 * (a 401, 403, 404 …) instead of calling `next()`, and that `@zudojs/http`
 * honours.
 *
 * @module middlewareResponse
 */

export {
  GUARD_RESPONSE,
  type GuardResponse,
  type GuardResponseInit,
} from "./guardResponse.type.js";
export {
  createGuardResponse,
  isGuardResponse,
} from "./guardResponse.factory.js";
