/**
 * @zudojs/testing — HTTP request test double types.
 */

/** HTTP method accepted by the request builders and the test client. */
export type HTTPMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * A test HTTP request.
 */
export interface TestHTTPRequest {
  readonly method: HTTPMethod;
  readonly path: string;
  readonly headers: Headers;
  readonly query: Record<string, string>;
  readonly body: unknown;
  readonly params: Record<string, string>;
}

/**
 * Fluent builder for test HTTP requests.
 *
 * @example
 * ```ts
 * const request = createTestHTTPRequest()
 *   .GET("/api/users")
 *   .withHeader("Authorization", "Bearer token123")
 *   .withQuery({ page: "1", limit: "10" })
 *   .build();
 *
 * expect(request.method).toBe("GET");
 * expect(request.path).toBe("/api/users");
 * ```
 */
export interface HTTPRequestBuilder {
  GET: (path: string) => HTTPRequestBuilder;
  POST: (path: string) => HTTPRequestBuilder;
  PUT: (path: string) => HTTPRequestBuilder;
  PATCH: (path: string) => HTTPRequestBuilder;
  DELETE: (path: string) => HTTPRequestBuilder;
  HEAD: (path: string) => HTTPRequestBuilder;
  OPTIONS: (path: string) => HTTPRequestBuilder;
  withHeader: (key: string, value: string) => HTTPRequestBuilder;
  withHeaders: (
    headers: Headers | Record<string, string>,
  ) => HTTPRequestBuilder;
  withQuery: (query: Record<string, string>) => HTTPRequestBuilder;
  withParam: (key: string, value: string) => HTTPRequestBuilder;
  withBody: (body: unknown) => HTTPRequestBuilder;
  build: () => TestHTTPRequest;
}

/** Options accepted by `createHTTPRequest`. */
export interface HTTPRequestOptions {
  readonly headers?: Headers | Record<string, string>;
  readonly query?: Record<string, string>;
  readonly body?: unknown;
  readonly params?: Record<string, string>;
}
