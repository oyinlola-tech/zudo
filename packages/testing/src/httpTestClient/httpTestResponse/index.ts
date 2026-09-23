/**
 * @zudojs/testing — HTTP test client responses.
 *
 * The response object the test client resolves with, and the expectations
 * `.expect()` / `.expectJson()` / `.expectText()` run against it.
 */

export type {
  HttpTestRequestSummary,
  HttpTestResponse,
} from "./httpTestResponse.type.js";

export {
  createHttpTestResponse,
  previewBody,
} from "./httpTestResponse.core.js";

export { findPartialDifference } from "./httpTestResponse.match.js";

export {
  expectHeader,
  expectJson,
  expectStatus,
  expectText,
} from "./httpTestResponse.expect.js";

export type { HttpTestExpectation } from "./httpTestResponse.expect.js";
