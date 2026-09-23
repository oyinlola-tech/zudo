/**
 * @zudojs/testing — HTTP test client.
 *
 * `createHttpTestClient(target)` drives a real app over HTTP, supertest
 * style: fluent requests, a cookie jar that persists across requests, and
 * chained expectations with readable failures. Targets can be a base URL, a
 * Node server or listener, a fetch handler, or an `@zudojs/http` server,
 * adapter, router, pipeline or handler.
 */

export { createHttpTestClient } from "./httpTestClient.factory.js";

export { createHttpTestCookieJar } from "./httpTestClient.cookieJar.js";

export type { HttpTestCookieJar } from "./httpTestClient.cookieJar.js";

export type {
  HttpTestClient,
  HttpTestClientOptions,
  HttpTestTarget,
  HttpTestTargetKind,
} from "./httpTestClient.type.js";

export type {
  HttpTestBody,
  HttpTestQuery,
  HttpTestQueryValue,
  HttpTestRequest,
} from "./httpTestRequest/index.js";

export { findPartialDifference } from "./httpTestResponse/index.js";

export type {
  HttpTestExpectation,
  HttpTestRequestSummary,
  HttpTestResponse,
} from "./httpTestResponse/index.js";

export type {
  FetchApplication,
  FetchHandler,
  HttpTestAdapterOptions,
  NodeRequestListener,
} from "./httpTestTransport/index.js";
