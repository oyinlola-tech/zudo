/**
 * @zudojs/testing — HTTP request builder for testing.
 *
 * Provides a fluent API for constructing test HTTP requests.
 */

import type {
  HTTPMethod,
  HTTPRequestBuilder,
  TestHTTPRequest,
} from "./httpRequest.type.js";

/**
 * Creates a new HTTP request builder.
 *
 * @returns An HTTPRequestBuilder instance.
 */
export function createTestHTTPRequest(): HTTPRequestBuilder {
  let method: HTTPMethod = "GET";
  let path = "/";
  const headers = new Headers();
  const query: Record<string, string> = {};
  const params: Record<string, string> = {};
  let body: unknown = undefined;

  const target =
    (verb: HTTPMethod) =>
    (p: string): HTTPRequestBuilder => {
      method = verb;
      path = p;
      return builder;
    };

  const builder: HTTPRequestBuilder = {
    GET: target("GET"),
    POST: target("POST"),
    PUT: target("PUT"),
    PATCH: target("PATCH"),
    DELETE: target("DELETE"),
    HEAD: target("HEAD"),
    OPTIONS: target("OPTIONS"),

    withHeader: (key: string, value: string) => {
      headers.set(key, value);
      return builder;
    },

    withHeaders: (h: Headers | Record<string, string>) => {
      new Headers(h).forEach((value, key) => {
        headers.set(key, value);
      });
      return builder;
    },

    withQuery: (q: Record<string, string>) => {
      Object.assign(query, q);
      return builder;
    },

    withParam: (key: string, value: string) => {
      params[key] = value;
      return builder;
    },

    withBody: (b: unknown) => {
      body = b;
      return builder;
    },

    build: (): TestHTTPRequest => ({
      method,
      path,
      headers: new Headers(headers),
      query: { ...query },
      body,
      params: { ...params },
    }),
  };

  return builder;
}
