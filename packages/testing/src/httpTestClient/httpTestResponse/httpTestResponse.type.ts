/**
 * @zudojs/testing — HTTP test client response type.
 */

import type { TestHTTPResponse } from "../../httpTesting/index.js";

/** What was sent, kept on the response for failure messages. */
export interface HttpTestRequestSummary {
  readonly method: string;
  readonly path: string;
}

/**
 * A response received by the test client.
 *
 * It is a `TestHTTPResponse`, so `assertResponseStatus`, `assertResponseBody`
 * and the other response assertions accept it directly.
 */
export interface HttpTestResponse extends TestHTTPResponse {
  readonly status: number;
  readonly statusText: string;
  /** True for 2xx statuses. */
  readonly ok: boolean;
  readonly headers: Headers;
  /** Media type without parameters, e.g. `application/json`. */
  readonly type: string | undefined;
  /** Body decoded as UTF-8. */
  readonly text: string;
  /** Raw body bytes. */
  readonly bytes: Uint8Array;
  /**
   * Parsed JSON for `application/json` and `+json` responses, the text for
   * any other non-empty body, `undefined` for an empty one.
   */
  readonly body: unknown;
  readonly sent: true;
  /** Raw `Set-Cookie` values from this response. */
  readonly setCookies: readonly string[];
  /** Cookies this response set, as `name → value`. */
  readonly cookies: Readonly<Record<string, string>>;
  readonly request: HttpTestRequestSummary;
  /** A header value, or `undefined` when absent. */
  header(name: string): string | undefined;
  /** Parses the body as JSON; throws a readable error when it is not JSON. */
  json<T = unknown>(): T;
}
