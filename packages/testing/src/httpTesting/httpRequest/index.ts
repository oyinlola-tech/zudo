/**
 * @zudojs/testing — HTTP request test doubles.
 *
 * A fluent request builder and a one-call factory. Built requests can be sent
 * to a real app with `createHttpTestClient(app).request(built)`.
 */

export { createTestHTTPRequest } from "./httpRequest.builder.js";

export { createHTTPRequest } from "./httpRequest.factory.js";

export type {
  HTTPMethod,
  HTTPRequestBuilder,
  HTTPRequestOptions,
  TestHTTPRequest,
} from "./httpRequest.type.js";
