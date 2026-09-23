/**
 * @zudojs/testing — fluent HTTP test request types.
 */

import type { HttpTestCookieJar } from "../httpTestClient.cookieJar.js";
import type {
  HttpTestExpectation,
  HttpTestResponse,
} from "../httpTestResponse/index.js";
import type { HttpTestTransport } from "../httpTestTransport/index.js";

/** A query-string value; arrays repeat the name, `null`/`undefined` are skipped. */
export type HttpTestQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean)[];

/** Query parameters for `.query()`. */
export type HttpTestQuery = Readonly<Record<string, HttpTestQueryValue>>;

/**
 * A request body for `.send()`: a string is sent as text, bytes as
 * `application/octet-stream`, `URLSearchParams` as a form, and anything else
 * as JSON. An explicit `Content-Type` header always wins.
 */
export type HttpTestBody =
  | string
  | Uint8Array
  | ArrayBuffer
  | URLSearchParams
  | object
  | number
  | boolean
  | null;

/** What a request needs from the client that created it. */
export interface HttpTestRequestContext {
  readonly transport: () => Promise<HttpTestTransport>;
  readonly jar: HttpTestCookieJar | undefined;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeout: number;
}

/**
 * A request being built. Await it (or call `.then`) to send it; it is sent
 * once, however many times it is awaited. Expectations run in the order they
 * were added, and the first failure rejects with an `AssertionError` whose
 * stack points at the `.expect…()` call.
 */
export interface HttpTestRequest extends PromiseLike<HttpTestResponse> {
  /** Sets one header, or several from a record. */
  set(name: string, value: string): HttpTestRequest;
  set(headers: Readonly<Record<string, string>>): HttpTestRequest;
  /** Adds query parameters (merged with any already in the path). */
  query(values: HttpTestQuery): HttpTestRequest;
  /** Sets the body. See {@link HttpTestBody}. */
  send(body: HttpTestBody): HttpTestRequest;
  /** `Authorization: Bearer <token>`, or Basic with a user and password. */
  auth(token: string): HttpTestRequest;
  auth(user: string, password: string): HttpTestRequest;
  /** Overrides the client's timeout for this request. */
  timeout(ms: number): HttpTestRequest;
  /** Expects a status code, a header value/pattern, or runs a custom check. */
  expect(status: number): HttpTestRequest;
  expect(header: string, value: string | RegExp): HttpTestRequest;
  expect(check: HttpTestExpectation): HttpTestRequest;
  /** Expects a JSON body containing `expected` (partial object match). */
  expectJson(expected: unknown): HttpTestRequest;
  /** Expects the body text to equal a string or match a pattern. */
  expectText(expected: string | RegExp): HttpTestRequest;
  catch<T = never>(
    onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
  ): Promise<HttpTestResponse | T>;
}
