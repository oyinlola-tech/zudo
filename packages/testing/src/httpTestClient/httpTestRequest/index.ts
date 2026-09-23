/**
 * @zudojs/testing — fluent HTTP test requests.
 *
 * The awaitable request builder returned by `client.get()` and friends, and
 * the helpers that encode its path, query and body.
 */

export { createHttpTestRequest } from "./httpTestRequest.core.js";

export { executeHttpTestRequest } from "./httpTestRequest.execute.js";

export type {
  HttpTestRequestState,
  RegisteredExpectation,
} from "./httpTestRequest.execute.js";

export {
  appendQuery,
  basicAuthorization,
  encodeBody,
  normalizePath,
  substituteParams,
} from "./httpTestRequest.encode.js";

export type { EncodedBody } from "./httpTestRequest.encode.js";

export type {
  HttpTestBody,
  HttpTestQuery,
  HttpTestQueryValue,
  HttpTestRequest,
  HttpTestRequestContext,
} from "./httpTestRequest.type.js";
