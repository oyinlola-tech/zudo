/**
 * @zudojs/testing — HTTP testing helpers.
 *
 * Request and response builders for HTTP testing. To drive a running app,
 * see `createHttpTestClient` in `httpTestClient/`.
 */

export {
  createTestHTTPRequest,
  createHTTPRequest,
} from "./httpRequest/index.js";

export type {
  HTTPRequestBuilder,
  TestHTTPRequest,
} from "./httpRequest/index.js";

export {
  createTestHTTPResponse,
  createHTTPResponse,
  jsonResponse,
  createdResponse,
  noContentResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from "./httpResponse/index.js";

export type {
  HTTPResponseBuilder,
  TestHTTPResponse,
} from "./httpResponse/index.js";
