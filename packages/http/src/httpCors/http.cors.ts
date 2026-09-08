/**
 * HTTP CORS utilities.
 *
 * Provides parsing, validation, policy evaluation, and response-header
 * generation for Cross-Origin Resource Sharing.
 */

import { assertSafeHeaderValue } from "../httpHeaders/security/index.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type CorsOrigin =
  string | readonly string[] | ((origin: string) => boolean | Promise<boolean>);

export type CorsMethods = string | readonly string[];

export type CorsHeaders = string | readonly string[];

export interface CorsOptions {
  readonly origin?: CorsOrigin;
  readonly methods?: CorsMethods;
  readonly allowedHeaders?: CorsHeaders;
  readonly exposedHeaders?: CorsHeaders;
  readonly credentials?: boolean;
  readonly maxAge?: number;
  readonly preflightContinue?: boolean;
  readonly optionsSuccessStatus?: number;
}

export interface CorsRequest {
  readonly origin?: string;
  readonly method?: string;
  readonly requestMethod?: string;
  readonly requestHeaders?: string;
}

export interface CorsResult {
  readonly allowed: boolean;
  readonly headers: Readonly<Record<string, string>>;
  readonly preflight: boolean;
  readonly vary: readonly string[];
}

export interface CorsPolicy {
  readonly origin: CorsOrigin;
  readonly methods: readonly string[];
  readonly allowedHeaders: readonly string[];
  readonly exposedHeaders: readonly string[];
  readonly credentials: boolean;
  readonly maxAge?: number;
  /**
   * True when the configured origin allows every origin — whether written as
   * the string `"*"` or as a `"*"` element inside an array. Credentials can
   * never be combined with it.
   */
  readonly wildcard: boolean;
  readonly preflightContinue: boolean;
  readonly optionsSuccessStatus: number;
}

/**
 * The decision a CORS-aware middleware needs in order to act.
 */
export interface CorsDecision {
  /** True when the request carried an `Origin` header at all. */
  readonly isCorsRequest: boolean;
  readonly preflight: boolean;
  /** True when the origin (and, for a preflight, the method/headers) passed. */
  readonly allowed: boolean;
  /**
   * True when the middleware should answer the request itself rather than
   * calling `next()`. Only ever true for a preflight with
   * `preflightContinue: false`.
   */
  readonly terminate: boolean;
  /** Status to answer a terminated preflight with. */
  readonly status: number;
  /**
   * Headers to apply to the response, `Vary` already merged in. Always
   * contains `Vary: Origin` for any origin-dependent response, including a
   * rejected one, so a shared cache cannot serve one origin's CORS grant to
   * another.
   */
  readonly headers: Readonly<Record<string, string>>;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const CORS_ORIGIN_HEADER = "Access-Control-Allow-Origin";

export const CORS_METHODS_HEADER = "Access-Control-Allow-Methods";

export const CORS_HEADERS_HEADER = "Access-Control-Allow-Headers";

export const CORS_EXPOSE_HEADERS_HEADER = "Access-Control-Expose-Headers";

export const CORS_CREDENTIALS_HEADER = "Access-Control-Allow-Credentials";

export const CORS_MAX_AGE_HEADER = "Access-Control-Max-Age";

export const CORS_REQUEST_METHOD_HEADER = "Access-Control-Request-Method";

export const CORS_REQUEST_HEADERS_HEADER = "Access-Control-Request-Headers";

export const CORS_VARY_HEADER = "Vary";

export const DEFAULT_CORS_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "PUT",
  "PATCH",
  "POST",
  "DELETE",
]);

export const DEFAULT_OPTIONS_SUCCESS_STATUS = 204;

/* -------------------------------------------------------------------------- */
/* Origin                                                                     */
/* -------------------------------------------------------------------------- */

export function normalizeOrigin(
  origin: string | undefined | null,
): string | undefined {
  if (origin === undefined || origin === null) {
    return undefined;
  }

  const value = origin.trim();

  if (value.length === 0) {
    return undefined;
  }

  return value;
}

export function isWildcardOrigin(origin: string | undefined | null): boolean {
  return normalizeOrigin(origin) === "*";
}

/**
 * Canonicalises an origin for comparison.
 *
 * An origin is scheme + host + port. Scheme and host are case-insensitive, the
 * default port is implicit, and there is no path — so `HTTPS://App.Example.com`
 * and `https://app.example.com:443/` are the same origin and must compare
 * equal, while anything that is not a parseable http(s) origin falls back to a
 * trimmed, lower-cased literal so that `"null"` still compares by value.
 */
export function canonicalizeOrigin(
  origin: string | undefined | null,
): string | undefined {
  const normalized = normalizeOrigin(origin);

  if (!normalized) {
    return undefined;
  }

  if (normalized === "*" || normalized.toLowerCase() === "null") {
    return normalized === "*" ? "*" : "null";
  }

  try {
    const url = new URL(normalized);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return normalized.toLowerCase();
    }

    return url.origin.toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
}

/**
 * Expands a configured origin into its literal entries. A `"*"` anywhere in an
 * array is a wildcard for the whole list — the previous code only recognised
 * the bare-string form, so `{ origin: ["*"], credentials: true }` passed the
 * wildcard-plus-credentials guard and then reflected any origin verbatim.
 */
function configuredOriginList(
  configured: CorsOrigin | undefined,
): readonly string[] | undefined {
  if (configured === undefined || typeof configured === "function") {
    return undefined;
  }

  return typeof configured === "string" ? [configured] : [...configured];
}

/**
 * True when the configured origin permits every origin.
 */
export function hasWildcardOrigin(configured: CorsOrigin | undefined): boolean {
  const list = configuredOriginList(configured);

  if (!list) {
    return false;
  }

  return list.some((entry) => entry.trim() === "*");
}

export function isNullOrigin(origin: string | undefined | null): boolean {
  return normalizeOrigin(origin) === "null";
}

export function isValidOrigin(origin: string | undefined | null): boolean {
  const normalized = normalizeOrigin(origin);

  if (!normalized) {
    return false;
  }

  if (normalized === "*" || normalized === "null") {
    return true;
  }

  try {
    const url = new URL(normalized);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Methods                                                                    */
/* -------------------------------------------------------------------------- */

export function normalizeMethods(
  methods: CorsMethods | undefined,
): readonly string[] {
  if (methods === undefined) {
    return DEFAULT_CORS_METHODS;
  }

  const values =
    typeof methods === "string" ? splitHeaderList(methods) : methods;

  return uniqueCaseInsensitive(
    values.map((method) => method.trim().toUpperCase()).filter(Boolean),
  );
}

export function isMethodAllowed(
  method: string | undefined | null,
  allowedMethods: CorsMethods,
): boolean {
  if (!method) {
    return false;
  }

  const normalized = method.trim().toUpperCase();

  return normalizeMethods(allowedMethods).some(
    (allowed) => allowed === normalized,
  );
}

/* -------------------------------------------------------------------------- */
/* Headers                                                                    */
/* -------------------------------------------------------------------------- */

export function normalizeHeaderNames(
  headers: CorsHeaders | undefined,
): readonly string[] {
  if (headers === undefined) {
    return [];
  }

  const values =
    typeof headers === "string" ? splitHeaderList(headers) : headers;

  return uniqueCaseInsensitive(
    values.map((header) => header.trim().toLowerCase()).filter(Boolean),
  );
}

export function areHeadersAllowed(
  requestedHeaders: CorsHeaders | undefined,
  allowedHeaders: CorsHeaders,
): boolean {
  const requested = normalizeHeaderNames(requestedHeaders);

  if (requested.length === 0) {
    return true;
  }

  const allowed = normalizeHeaderNames(allowedHeaders);

  if (allowed.includes("*")) {
    return true;
  }

  return requested.every((header) => allowed.includes(header));
}

export function parseRequestedHeaders(
  value: string | undefined | null,
): readonly string[] {
  return normalizeHeaderNames(value ?? undefined);
}

/* -------------------------------------------------------------------------- */
/* Origin Matching                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Decides whether a request origin is permitted by the configured origin.
 *
 * Matching is **exact on the canonical origin**. It is deliberately not
 * `startsWith`, `endsWith`, `includes` or an unescaped regex built from the
 * configured value: against `https://example.com`, all of those admit
 * `https://evil-example.com.attacker.com`, `https://example.com.evil.tld` or
 * `https://example.como`. A caller that needs subdomain matching must supply a
 * predicate function and take responsibility for anchoring it.
 *
 * The opaque origin `null` (sandboxed iframes, `file://`, some redirects) is
 * only allowed when `"null"` is configured explicitly. It is never covered by
 * `"*"`, because reflecting it grants access to content any page can produce.
 */
export async function matchesOrigin(
  configured: CorsOrigin | undefined,
  requestOrigin: string | undefined,
): Promise<boolean> {
  if (!requestOrigin || configured === undefined) {
    return false;
  }

  const origin = normalizeOrigin(requestOrigin);

  if (!origin) {
    return false;
  }

  if (typeof configured === "function") {
    return Boolean(await configured(origin));
  }

  const canonical = canonicalizeOrigin(origin);

  if (!canonical) {
    return false;
  }

  const list = configuredOriginList(configured) ?? [];

  const explicit = list.some(
    (entry) => canonicalizeOrigin(entry) === canonical,
  );

  if (explicit) {
    return true;
  }

  if (canonical === "null") {
    return false;
  }

  return list.some((entry) => entry.trim() === "*");
}

/* -------------------------------------------------------------------------- */
/* Policy                                                                     */
/* -------------------------------------------------------------------------- */

export function createCorsPolicy(
  options: CorsOptions | undefined = {},
): CorsPolicy {
  const origin = options.origin ?? "*";

  const methods = normalizeMethods(options.methods);

  const allowedHeaders = normalizeHeaderNames(options.allowedHeaders);

  const exposedHeaders = normalizeHeaderNames(options.exposedHeaders);

  const credentials = options.credentials ?? false;

  const wildcard = hasWildcardOrigin(origin);

  /*
   * Checked against the whole normalised set, not just the bare-string form:
   * `{ origin: ["*"], credentials: true }` used to pass here and then reflect
   * the request origin verbatim alongside
   * `Access-Control-Allow-Credentials: true`, which is a total same-origin
   * policy bypass for every origin on the internet.
   */
  if (credentials && wildcard) {
    throw new TypeError(
      "Wildcard CORS origin cannot be used with credentials.",
    );
  }

  if (options.maxAge !== undefined) {
    validateMaxAge(options.maxAge);
  }

  return {
    origin,
    methods,
    allowedHeaders,
    exposedHeaders,
    credentials,
    maxAge: options.maxAge,
    wildcard,
    preflightContinue: options.preflightContinue ?? false,
    optionsSuccessStatus: getPreflightStatus(options),
  };
}

/* -------------------------------------------------------------------------- */
/* Request Classification                                                     */
/* -------------------------------------------------------------------------- */

export function isCorsRequest(request: CorsRequest): boolean {
  return Boolean(normalizeOrigin(request.origin));
}

export function isPreflightRequest(request: CorsRequest): boolean {
  return Boolean(
    normalizeOrigin(request.origin) &&
    request.method?.trim().toUpperCase() === "OPTIONS" &&
    request.requestMethod,
  );
}

export function isSimpleCorsRequest(request: CorsRequest): boolean {
  return isCorsRequest(request) && !isPreflightRequest(request);
}

/* -------------------------------------------------------------------------- */
/* Preflight                                                                  */
/* -------------------------------------------------------------------------- */

export function validatePreflight(
  request: CorsRequest,
  policy: CorsPolicy,
): boolean {
  if (!isPreflightRequest(request)) {
    return false;
  }

  if (
    !request.requestMethod ||
    !isMethodAllowed(request.requestMethod, policy.methods)
  ) {
    return false;
  }

  const requestedHeaders = parseRequestedHeaders(request.requestHeaders);

  return areHeadersAllowed(requestedHeaders, policy.allowedHeaders);
}

/* -------------------------------------------------------------------------- */
/* Response Headers                                                           */
/* -------------------------------------------------------------------------- */

export async function createCorsHeaders(
  request: CorsRequest,
  policy: CorsPolicy,
): Promise<Readonly<Record<string, string>>> {
  const origin = normalizeOrigin(request.origin);

  if (!origin) {
    return {};
  }

  const originAllowed = await matchesOrigin(policy.origin, origin);

  if (!originAllowed) {
    return {};
  }

  const headers: Record<string, string> = {};

  const wildcardOrigin = policy.wildcard ?? hasWildcardOrigin(policy.origin);

  if (wildcardOrigin && !policy.credentials) {
    headers[CORS_ORIGIN_HEADER] = "*";
  } else {
    /*
     * Reflection. The value came off the wire, so it goes through the single
     * hardened header validator before it can reach a response.
     */
    assertSafeHeaderValue(origin);

    headers[CORS_ORIGIN_HEADER] = origin;
  }

  if (policy.credentials) {
    headers[CORS_CREDENTIALS_HEADER] = "true";
  }

  if (policy.exposedHeaders.length > 0) {
    headers[CORS_EXPOSE_HEADERS_HEADER] = policy.exposedHeaders.join(", ");
  }

  if (isPreflightRequest(request)) {
    if (policy.methods.length > 0) {
      headers[CORS_METHODS_HEADER] = policy.methods.join(", ");
    }

    if (policy.allowedHeaders.length > 0) {
      headers[CORS_HEADERS_HEADER] = policy.allowedHeaders.join(", ");
    }

    if (policy.maxAge !== undefined) {
      headers[CORS_MAX_AGE_HEADER] = String(policy.maxAge);
    }
  }

  return headers;
}

/* -------------------------------------------------------------------------- */
/* Full Evaluation                                                            */
/* -------------------------------------------------------------------------- */

export async function evaluateCors(
  request: CorsRequest,
  options: CorsOptions | CorsPolicy,
): Promise<CorsResult> {
  const policy = isCorsPolicy(options) ? options : createCorsPolicy(options);

  const origin = normalizeOrigin(request.origin);

  if (!origin) {
    return {
      allowed: false,
      headers: {},
      preflight: false,
      vary: [],
    };
  }

  const originAllowed = await matchesOrigin(policy.origin, origin);

  if (!originAllowed) {
    return {
      allowed: false,
      headers: {},
      preflight: isPreflightRequest(request),
      /* A rejection is always origin-dependent, so it always varies. */
      vary: [...new Set(["Origin", ...getCorsVaryHeaders(request, policy)])],
    };
  }

  const preflight = isPreflightRequest(request);

  if (preflight && !validatePreflight(request, policy)) {
    return {
      allowed: false,
      headers: {},
      preflight: true,
      vary: ["Origin", CORS_REQUEST_METHOD_HEADER, CORS_REQUEST_HEADERS_HEADER],
    };
  }

  const headers = await createCorsHeaders(request, policy);

  const vary = getCorsVaryHeaders(request, policy);

  return {
    allowed: true,
    headers,
    preflight,
    vary,
  };
}

/* -------------------------------------------------------------------------- */
/* Vary                                                                       */
/* -------------------------------------------------------------------------- */

export function getCorsVaryHeaders(
  request: CorsRequest,
  policy: CorsPolicy,
): readonly string[] {
  const vary = new Set<string>();

  const wildcardOrigin = policy.wildcard ?? hasWildcardOrigin(policy.origin);

  /*
   * `Vary: Origin` is omitted only when the response genuinely does not depend
   * on the origin, i.e. a credential-less wildcard that always emits `*`.
   * Anything else — reflection, an allowlist, a predicate — must vary, or a
   * shared cache will hand one origin's grant to every later requester.
   */
  if (!wildcardOrigin || policy.credentials) {
    vary.add("Origin");
  }

  if (isPreflightRequest(request)) {
    vary.add(CORS_REQUEST_METHOD_HEADER);

    if (request.requestHeaders) {
      vary.add(CORS_REQUEST_HEADERS_HEADER);
    }
  }

  return [...vary];
}

export function formatVaryHeader(values: readonly string[]): string {
  return uniqueCaseInsensitive(values).join(", ");
}

/* -------------------------------------------------------------------------- */
/* Middleware Helpers                                                         */
/* -------------------------------------------------------------------------- */

export function shouldHandlePreflight(request: CorsRequest): boolean {
  return isPreflightRequest(request);
}

export function getPreflightStatus(
  options: CorsOptions | undefined = {},
): number {
  const status = options.optionsSuccessStatus ?? DEFAULT_OPTIONS_SUCCESS_STATUS;

  if (!Number.isInteger(status) || status < 200 || status > 299) {
    throw new RangeError(
      "optionsSuccessStatus must be a valid 2xx HTTP status.",
    );
  }

  return status;
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

export function serializeCorsHeaders(
  headers: Readonly<Record<string, string>>,
  vary: readonly string[] | undefined,
): Readonly<Record<string, string>> {
  const result = {
    ...headers,
  };

  if (vary && vary.length > 0) {
    result[CORS_VARY_HEADER] = formatVaryHeader(vary);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Middleware Decision                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Evaluates a request against a CORS policy and returns everything a
 * middleware needs: whether to answer the request itself, with what status,
 * and which headers to set.
 *
 * This is the function a CORS middleware should be built on. It differs from
 * the naive "always set `Access-Control-Allow-Origin: *`" approach in four
 * ways that each matter:
 *
 * 1. A request with no `Origin` gets no CORS headers at all.
 * 2. A disallowed origin gets no `Access-Control-Allow-Origin`, so the browser
 *    blocks the read — rather than the server advertising a grant it did not
 *    intend.
 * 3. `Vary: Origin` is emitted on every origin-dependent response, allowed or
 *    not, so a CDN cannot serve one origin's grant to another.
 * 4. A preflight is answered here, before the router can 404/405 it.
 */
export async function evaluateCorsDecision(
  request: CorsRequest,
  options: CorsOptions | CorsPolicy,
): Promise<CorsDecision> {
  const policy = isCorsPolicy(options) ? options : createCorsPolicy(options);

  const preflight = isPreflightRequest(request);

  if (!isCorsRequest(request)) {
    return {
      isCorsRequest: false,
      preflight: false,
      allowed: false,
      terminate: false,
      status: policy.optionsSuccessStatus ?? DEFAULT_OPTIONS_SUCCESS_STATUS,
      headers: {},
    };
  }

  const result = await evaluateCors(request, policy);

  const vary = result.vary.length > 0 ? result.vary : ["Origin"];

  const status = policy.optionsSuccessStatus ?? DEFAULT_OPTIONS_SUCCESS_STATUS;

  return {
    isCorsRequest: true,
    preflight,
    allowed: result.allowed,
    terminate: preflight && !(policy.preflightContinue ?? false),
    status,
    headers: serializeCorsHeaders(result.headers, vary),
  };
}

/* -------------------------------------------------------------------------- */
/* Internal Helpers                                                           */
/* -------------------------------------------------------------------------- */

function splitHeaderList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueCaseInsensitive(values: readonly string[]): string[] {
  const result: string[] = [];

  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim();

    if (normalized.length === 0) {
      continue;
    }

    const key = normalized.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    result.push(normalized);
  }

  return result;
}

function validateMaxAge(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("CORS maxAge must be a non-negative safe integer.");
  }
}

function isCorsPolicy(value: CorsOptions | CorsPolicy): value is CorsPolicy {
  return (
    "methods" in value &&
    Array.isArray(value.methods) &&
    "allowedHeaders" in value &&
    "exposedHeaders" in value &&
    "credentials" in value
  );
}
