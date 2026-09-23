/**
 * @zudojs/testing — HTTP response builder for testing.
 *
 * Provides a fluent API for constructing test HTTP responses.
 */

import type { HTTPStatusCode } from "@zudojs/http";
import type {
  TestHTTPResponse,
  HTTPResponseBuilder,
} from "./httpResponse.type.js";

/**
 * Creates a new HTTP response builder.
 *
 * @example
 * ```ts
 * const response = createTestHTTPResponse()
 *   .status(200)
 *   .header("Content-Type", "application/json")
 *   .json({ id: "123", name: "John" })
 *   .build();
 * ```
 */
export function createTestHTTPResponse(): HTTPResponseBuilder {
  let status: HTTPStatusCode = 200;
  const responseHeaders = new Headers();
  let body: unknown = undefined;
  let sent = false;

  const builder: HTTPResponseBuilder = {
    status: (code: HTTPStatusCode) => {
      status = code;
      return builder;
    },
    header: (key: string, value: string) => {
      responseHeaders.set(key.toLowerCase(), value);
      return builder;
    },
    headers: (h: Headers | Record<string, string>) => {
      if (h instanceof Headers) {
        h.forEach((value, key) => {
          responseHeaders.set(key, value);
        });
      } else {
        for (const [key, value] of Object.entries(h)) {
          responseHeaders.set(key.toLowerCase(), value);
        }
      }
      return builder;
    },
    json: (b: unknown) => {
      body = b;
      responseHeaders.set("content-type", "application/json");
      sent = true;
      return builder;
    },
    text: (b: string) => {
      body = b;
      responseHeaders.set("content-type", "text/plain");
      sent = true;
      return builder;
    },
    html: (b: string) => {
      body = b;
      responseHeaders.set("content-type", "text/html");
      sent = true;
      return builder;
    },
    empty: () => {
      body = undefined;
      sent = true;
      return builder;
    },
    build: (): TestHTTPResponse => ({
      status,
      headers: new Headers(responseHeaders),
      body,
      sent,
    }),
  };

  return builder;
}
