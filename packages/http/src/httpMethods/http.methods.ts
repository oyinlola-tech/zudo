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

  if (!isHTTPMethod(normalized)) {
    throw new TypeError(`Unsupported HTTP method: ${method}`);
  }

  return normalized;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export function isHTTPMethod(method: string): method is HTTPMethod {
  const normalized = normalizeMethod(method);

  return Object.values(HTTP_METHODS).includes(normalized as HTTPMethod);
}

export function assertHTTPMethod(method: string): asserts method is HTTPMethod {
  if (!isHTTPMethod(method)) {
    throw new TypeError(`Unsupported HTTP method: ${method}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Method Classification                                                      */
/* -------------------------------------------------------------------------- */

export function isSafeMethod(method: string): method is SafeHTTPMethod {
  const normalized = normalizeMethod(method);

  return (SAFE_METHODS as readonly string[]).includes(normalized);
}

export function isIdempotentMethod(
  method: string,
): method is IdempotentHTTPMethod {
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

export function formatAllowHeader(
  methods: readonly string[] | undefined,
): string {
  if (!methods || methods.length === 0) {
    return "";
  }

  const normalized = methods.map(normalizeMethod);

  return [...new Set(normalized)].join(", ");
}

export function parseAllowHeader(value: string | undefined): HTTPMethod[] {
  if (!value) {
    return [];
  }

  const result: HTTPMethod[] = [];

  for (const method of value.split(",")) {
    const normalized = normalizeMethod(method);

    if (isHTTPMethod(normalized) && !result.includes(normalized)) {
      result.push(normalized);
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

export function resolveMethodOverride(
  originalMethod: string,
  override: string | undefined,
): HTTPMethod {
  const original = normalizeHTTPMethod(originalMethod);

  if (!override || !isMethodOverrideAllowed(original)) {
    return original;
  }

  return normalizeHTTPMethod(override);
}
