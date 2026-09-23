/**
 * @zudojs/testing — HTTP response test doubles.
 *
 * A fluent response builder plus one-line helpers for the common responses
 * (`jsonResponse`, `notFoundResponse`, ...).
 */

export { createTestHTTPResponse } from "./httpResponse.core.js";

export type {
  HTTPResponseBuilder,
  TestHTTPResponse,
} from "./httpResponse.type.js";

export {
  createHTTPResponse,
  jsonResponse,
  createdResponse,
  noContentResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from "./httpResponse.helpers.js";
