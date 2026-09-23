/**
 * @zudojs/http/httpFetchMount
 *
 * Serves web-standard fetch handlers (`Request` → `Response`) from an
 * `@zudojs/http` router: `mountFetchHandler` registers one under a path,
 * `toWebRequest` converts a request context into a `Request` on its own.
 */

export { mountFetchHandler } from "./httpFetchMount.core.js";

export { toWebRequest, contextUrl } from "./httpFetchMount.request.js";

export type {
  HttpFetchHandler,
  HttpFetchMountTarget,
  MountFetchHandlerOptions,
  ToWebRequestOptions,
} from "./httpFetchMount.type.js";
