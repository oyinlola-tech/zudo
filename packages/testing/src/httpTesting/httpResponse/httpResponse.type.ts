/**
 * @zudojs/testing — HTTP response types.
 *
 * Types for test HTTP responses and response builders.
 */

import type { HTTPStatusCode } from "@zudojs/http";

/** A test HTTP response. */
export interface TestHTTPResponse {
  readonly status: HTTPStatusCode;
  readonly headers: Headers;
  readonly body: unknown;
  readonly sent: boolean;
}

/** Fluent builder for test HTTP responses. */
export interface HTTPResponseBuilder {
  status: (code: HTTPStatusCode) => HTTPResponseBuilder;
  header: (key: string, value: string) => HTTPResponseBuilder;
  headers: (headers: Headers | Record<string, string>) => HTTPResponseBuilder;
  json: (body: unknown) => HTTPResponseBuilder;
  text: (body: string) => HTTPResponseBuilder;
  html: (body: string) => HTTPResponseBuilder;
  empty: () => HTTPResponseBuilder;
  build: () => TestHTTPResponse;
}
