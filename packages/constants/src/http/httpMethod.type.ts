/**
 * HTTP method constants and type-safe method type.
 *
 * @module http/httpMethod
 */

import { ImmutableSet } from "../internal/immutableSet.js";

/** Type-safe HTTP method string. */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "TRACE"
  | "CONNECT";

/**
 * All supported HTTP methods as an object map for runtime use.
 */
export const HttpMethods = Object.freeze({
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
  TRACE: "TRACE",
  CONNECT: "CONNECT",
} as const);

/** Set of all HTTP methods for quick membership checks (immutable at runtime). */
export const HTTP_METHODS: ReadonlySet<HttpMethod> =
  new ImmutableSet<HttpMethod>(Object.values(HttpMethods));

/** HTTP methods that are safe (no side effects). Immutable at runtime. */
export const SAFE_HTTP_METHODS: ReadonlySet<HttpMethod> =
  new ImmutableSet<HttpMethod>([
    HttpMethods.GET,
    HttpMethods.HEAD,
    HttpMethods.OPTIONS,
  ]);

/** HTTP methods that are idempotent. Immutable at runtime. */
export const IDEMPOTENT_HTTP_METHODS: ReadonlySet<HttpMethod> =
  new ImmutableSet<HttpMethod>([
    HttpMethods.GET,
    HttpMethods.HEAD,
    HttpMethods.PUT,
    HttpMethods.DELETE,
    HttpMethods.OPTIONS,
    HttpMethods.TRACE,
  ]);
