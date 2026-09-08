/**
 * HTTP method definitions and helpers.
 *
 * This module provides a strongly typed representation of standard HTTP
 * methods together with utilities for classification and validation.
 */

/* -------------------------------------------------------------------------- */
/* Standard Methods                                                           */
/* -------------------------------------------------------------------------- */

export const HTTP_METHODS = {
  GET: "GET",
  HEAD: "HEAD",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  OPTIONS: "OPTIONS",
  TRACE: "TRACE",
  CONNECT: "CONNECT",
  QUERY: "QUERY",
} as const;

export type HTTPMethod = (typeof HTTP_METHODS)[keyof typeof HTTP_METHODS];

/* -------------------------------------------------------------------------- */
/* Method Groups                                                              */
/* -------------------------------------------------------------------------- */

export const SAFE_METHODS = [
  HTTP_METHODS.GET,
  HTTP_METHODS.HEAD,
  HTTP_METHODS.OPTIONS,
  HTTP_METHODS.TRACE,
  HTTP_METHODS.QUERY,
] as const;

export type SafeHTTPMethod = (typeof SAFE_METHODS)[number];

export const IDEMPOTENT_METHODS = [
  HTTP_METHODS.GET,
  HTTP_METHODS.HEAD,
  HTTP_METHODS.PUT,
  HTTP_METHODS.DELETE,
  HTTP_METHODS.OPTIONS,
  HTTP_METHODS.TRACE,
  HTTP_METHODS.QUERY,
] as const;

export type IdempotentHTTPMethod = (typeof IDEMPOTENT_METHODS)[number];

export const BODY_METHODS = [
  HTTP_METHODS.POST,
  HTTP_METHODS.PUT,
  HTTP_METHODS.PATCH,
  HTTP_METHODS.QUERY,
] as const;

export type BodyHTTPMethod = (typeof BODY_METHODS)[number];

export const METHODS_WITH_OPTIONAL_BODY = [
  HTTP_METHODS.POST,
  HTTP_METHODS.PUT,
  HTTP_METHODS.PATCH,
  HTTP_METHODS.DELETE,
  HTTP_METHODS.QUERY,
] as const;

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

export function normalizeMethod(method: string): string {
  return method.trim().toUpperCase();
}

export function normalizeHTTPMethod(method: string): HTTPMethod {
  const normalized = normalizeMethod(method);

  const resolved = toHTTPMethod(normalized);

  if (resolved === undefined) {
    throw new TypeError(`Unsupported HTTP method: ${method}`);
  }

  return resolved;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a method string to its canonical {@link HTTPMethod}.
 *
 * @param method - The raw method string, in any case.
 * @returns The canonical method, or `undefined` if it is not standard.
 */
export function toHTTPMethod(method: string): HTTPMethod | undefined {
  const normalized = normalizeMethod(method);

  return (Object.values(HTTP_METHODS) as readonly string[]).includes(normalized)
    ? (normalized as HTTPMethod)
    : undefined;
}

/**
 * Checks whether a string names a standard HTTP method.
 *
 * @remarks
 * This deliberately returns a plain `boolean` rather than narrowing
 * `method is HTTPMethod`: the check is case-insensitive, so `"get"` passes
 * while its runtime value is still `"get"` and every downstream
 * `method === "GET"` comparison fails. Use {@link toHTTPMethod} when the
 * narrowed value is what you need.
 *
 * @param method - The raw method string.
 * @returns `true` if the method is standard.
 */
export function isHTTPMethod(method: string): boolean {
  return toHTTPMethod(method) !== undefined;
}

/**
 * Asserts that a string names a standard HTTP method.
 *
 * @param method - The raw method string.
 * @throws {TypeError} If the method is not standard.
 */
export function assertHTTPMethod(method: string): void {
  if (!isHTTPMethod(method)) {
    throw new TypeError(`Unsupported HTTP method: ${method}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Method Classification                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Checks whether a method is safe per RFC 9110 section 9.2.1.
 *
 * @param method - The raw method string.
 * @returns `true` if the method is safe.
 */
export function isSafeMethod(method: string): boolean {
  const normalized = normalizeMethod(method);

  return (SAFE_METHODS as readonly string[]).includes(normalized);
}

/**
 * Checks whether a method is idempotent per RFC 9110 section 9.2.2.
 *
 * @param method - The raw method string.
 * @returns `true` if the method is idempotent.
 */
export function isIdempotentMethod(method: string): boolean {
  const normalized = normalizeMethod(method);

  return (IDEMPOTENT_METHODS as readonly string[]).includes(normalized);
}

export function hasRequestBody(method: string): boolean {
  const normalized = normalizeMethod(method);

  return (BODY_METHODS as readonly string[]).includes(normalized);
}

export function mayHaveRequestBody(method: string): boolean {
  const normalized = normalizeMethod(method);

  return (METHODS_WITH_OPTIONAL_BODY as readonly string[]).includes(normalized);
}

/* -------------------------------------------------------------------------- */
/* Specific Method Helpers                                                    */
/* -------------------------------------------------------------------------- */

export function isGET(method: string): boolean {
  return normalizeMethod(method) === HTTP_METHODS.GET;
}

export function isHEAD(method: string): boolean {
  return normalizeMethod(method) === HTTP_METHODS.HEAD;
}

export function isPOST(method: string): boolean {
  return normalizeMethod(method) === HTTP_METHODS.POST;
}

export function isPUT(method: string): boolean {
  return normalizeMethod(method) === HTTP_METHODS.PUT;
}

export function isPATCH(method: string): boolean {
  return normalizeMethod(method) === HTTP_METHODS.PATCH;
}

export function isDELETE(method: string): boolean {
  return normalizeMethod(method) === HTTP_METHODS.DELETE;
}

export function isOPTIONS(method: string): boolean {
  return normalizeMethod(method) === HTTP_METHODS.OPTIONS;
}

export function isTRACE(method: string): boolean {
  return normalizeMethod(method) === HTTP_METHODS.TRACE;
}

export function isCONNECT(method: string): boolean {
  return normalizeMethod(method) === HTTP_METHODS.CONNECT;
}

export function isQUERY(method: string): boolean {
  return normalizeMethod(method) === HTTP_METHODS.QUERY;
}

/* -------------------------------------------------------------------------- */
/* Routing Helpers                                                            */
/* -------------------------------------------------------------------------- */

export function methodsEqual(left: string, right: string): boolean {
  return normalizeMethod(left) === normalizeMethod(right);
}

export function methodMatches(
  actual: string,
  expected: string | readonly string[],
): boolean {
  const normalized = normalizeMethod(actual);

  if (typeof expected === "string") {
    return normalized === normalizeMethod(expected);
  }

  return expected.some((method) => normalized === normalizeMethod(method));
}

/* -------------------------------------------------------------------------- */
/* Method Lists                                                               */
/* -------------------------------------------------------------------------- */

export function getAllHTTPMethods(): HTTPMethod[] {
  return Object.values(HTTP_METHODS);
}

export function getSafeHTTPMethods(): SafeHTTPMethod[] {
  return [...SAFE_METHODS];
}

export function getIdempotentHTTPMethods(): IdempotentHTTPMethod[] {
  return [...IDEMPOTENT_METHODS];
}

export function getBodyHTTPMethods(): BodyHTTPMethod[] {
  return [...BODY_METHODS];
}

/* -------------------------------------------------------------------------- */
/* Allow Header                                                               */
/* -------------------------------------------------------------------------- */

/**
 * RFC 9110 section 5.6.2 `token`, the grammar for a method name.
 */
const METHOD_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Formats an `Allow` header value.
 *
 * Entries that are not valid method tokens are dropped rather than joined.
 * Without that filter an interior CR/LF in a caller-supplied method name
 * would be emitted verbatim into a response header.
 *
 * @param methods - The allowed methods.
 * @returns The header value, or the empty string when nothing is allowed.
 */
export function formatAllowHeader(
  methods: readonly string[] | undefined,
): string {
  if (!methods || methods.length === 0) {
    return "";
  }

  const normalized = methods
    .map(normalizeMethod)
    .filter((method) => METHOD_TOKEN.test(method));

  return [...new Set(normalized)].join(", ");
}

export function parseAllowHeader(value: string | undefined): HTTPMethod[] {
  if (!value) {
    return [];
  }

  const result: HTTPMethod[] = [];

  for (const method of value.split(",")) {
    const resolved = toHTTPMethod(method);

    if (resolved !== undefined && !result.includes(resolved)) {
      result.push(resolved);
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Method Override                                                            */
/* -------------------------------------------------------------------------- */

export function isMethodOverrideAllowed(method: string): boolean {
  const normalized = normalizeMethod(method);

  return (
    normalized === HTTP_METHODS.POST ||
    normalized === HTTP_METHODS.PUT ||
    normalized === HTTP_METHODS.PATCH
  );
}

/**
 * Methods an `X-HTTP-Method-Override` may name.
 *
 * The override target is attacker-controlled, so it is whitelisted to the
 * three methods the mechanism exists for. Allowing an arbitrary target would
 * let a POST that has already passed CSRF validation, body parsing and
 * POST-specific authorization be rewritten into GET, TRACE or CONNECT
 * afterwards.
 */
export const METHOD_OVERRIDE_TARGETS = [
  HTTP_METHODS.PUT,
  HTTP_METHODS.PATCH,
  HTTP_METHODS.DELETE,
] as const;

/**
 * Resolves an `X-HTTP-Method-Override` against the original method.
 *
 * An unrecognised or non-whitelisted override is ignored, not thrown on: the
 * value comes from the client, so throwing turns any request into a 500.
 *
 * @param originalMethod - The method actually used on the wire.
 * @param override - The requested override, if any.
 * @returns The effective method.
 */
export function resolveMethodOverride(
  originalMethod: string,
  override: string | undefined,
): HTTPMethod {
  const original = normalizeHTTPMethod(originalMethod);

  if (!override || !isMethodOverrideAllowed(original)) {
    return original;
  }

  const target = toHTTPMethod(override);

  if (
    target === undefined ||
    !(METHOD_OVERRIDE_TARGETS as readonly string[]).includes(target)
  ) {
    return original;
  }

  return target;
}
