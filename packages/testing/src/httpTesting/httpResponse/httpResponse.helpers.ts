/**
 * @zudojs/testing — HTTP response helper functions.
 *
 * Convenience functions for creating common test HTTP responses.
 */

import type { HTTPStatusCode } from "@zudojs/http";
import type { TestHTTPResponse } from "./httpResponse.type.js";

/**
 * Creates a simple test HTTP response without the builder pattern.
 */
export function createHTTPResponse(
  status: HTTPStatusCode,
  body?: unknown,
  headers?: Headers | Record<string, string>,
): TestHTTPResponse {
  return {
    status,
    headers: new Headers(headers as Record<string, string>),
    body,
    sent: true,
  };
}

/** Creates a 200 OK JSON response. */
export function jsonResponse(body: unknown): TestHTTPResponse {
  return createHTTPResponse(200, body, { "content-type": "application/json" });
}

/** Creates a 201 Created JSON response. */
export function createdResponse(body: unknown): TestHTTPResponse {
  return createHTTPResponse(201, body, { "content-type": "application/json" });
}

/** Creates a 204 No Content response. */
export function noContentResponse(): TestHTTPResponse {
  return createHTTPResponse(204);
}

/** Creates a 400 Bad Request response. */
export function badRequestResponse(message: string): TestHTTPResponse {
  return createHTTPResponse(
    400,
    { error: message },
    { "content-type": "application/json" },
  );
}

/** Creates a 404 Not Found response. */
export function notFoundResponse(message = "Not Found"): TestHTTPResponse {
  return createHTTPResponse(
    404,
    { error: message },
    { "content-type": "application/json" },
  );
}

/** Creates a 500 Internal Server Error response. */
export function serverErrorResponse(
  message = "Internal Server Error",
): TestHTTPResponse {
  return createHTTPResponse(
    500,
    { error: message },
    { "content-type": "application/json" },
  );
}
