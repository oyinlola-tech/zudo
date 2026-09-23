/**
 * @zudojs/testing — one-call HTTP request factory.
 */

import type {
  HTTPMethod,
  HTTPRequestOptions,
  TestHTTPRequest,
} from "./httpRequest.type.js";

/**
 * Creates a simple test HTTP request without the builder pattern.
 *
 * `query` and `params` are copied, so mutating the object passed in after the
 * call does not change the request (the builder already behaved this way).
 *
 * @param method - HTTP method.
 * @param path - Request path.
 * @param options - Optional headers, query, params, and body.
 * @returns A TestHTTPRequest instance.
 */
export function createHTTPRequest(
  method: HTTPMethod,
  path: string,
  options: HTTPRequestOptions = {},
): TestHTTPRequest {
  return {
    method,
    path,
    headers: new Headers(options.headers),
    query: { ...options.query },
    body: options.body,
    params: { ...options.params },
  };
}
