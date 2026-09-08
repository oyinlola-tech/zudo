import type { HTTPRequest } from "../httpTypes/http.types.js";

import { HttpError } from "@zudojs/errors";

/* -------------------------------------------------------------------------- */
/* Query Types                                                                */
/* -------------------------------------------------------------------------- */

export type QueryPrimitive = string | number | boolean | null;

export type QueryValue = QueryPrimitive | QueryPrimitive[] | QueryObject;

export interface QueryObject {
  readonly [key: string]: QueryValue;
}

/**
 * Limits applied to every query string this module parses.
 *
 * All limits are enforced. Exceeding one throws {@link HTTPQueryLimitError},
 * which carries a 414 status code so a server layer can map it to a response
 * instead of a 500.
 */
export interface QueryLimitOptions {
  /** Maximum number of parameters. Default 1000. */
  readonly maxKeys?: number;

  /** Maximum decoded length of a parameter name. Default 4096. */
  readonly maxKeyLength?: number;

  /** Maximum decoded length of a parameter value. Default 16384. */
  readonly maxValueLength?: number;

  /** Maximum length of the whole query string. Default 1 MiB. */
  readonly maxTotalLength?: number;
}

export interface QueryParseOptions extends QueryLimitOptions {
  /** Split values on `,` into an array. Default `false`. */
  readonly commaSeparated?: boolean;

  /** Decode `+` as a space. Default `true`. */
  readonly plusAsSpace?: boolean;

  /** Percent-decode names and values. Default `true`. */
  readonly decode?: boolean;

  /** Maximum bracket-path nesting depth. Default 10. */
  readonly maxDepth?: number;
}

export type QueryStringPrimitive = string | number | boolean | null | undefined;

export type QueryStringValue =
  QueryStringPrimitive | readonly QueryStringPrimitive[];

export interface QueryStringParseOptions extends QueryLimitOptions {
  /** Decode `+` as a space. Default `true`. */
  readonly decodePlusAsSpace?: boolean;

  /** Keep parameters whose name decodes to the empty string. Default `true`. */
  readonly allowEmptyKeys?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

export const DEFAULT_QUERY_MAX_KEYS = 1000;

export const DEFAULT_QUERY_MAX_KEY_LENGTH = 4096;

export const DEFAULT_QUERY_MAX_VALUE_LENGTH = 16384;

export const DEFAULT_QUERY_MAX_TOTAL_LENGTH = 1024 * 1024;

export const DEFAULT_QUERY_MAX_DEPTH = 10;

/**
 * Thrown when a query string exceeds one of the parser's limits.
 *
 * Carries `statusCode: 414` so an error handler can answer with
 * `414 URI Too Long` rather than treating the rejection as an internal fault.
 */
export class HTTPQueryLimitError extends HttpError {
  public constructor(message: string) {
    super(message, {
      statusCode: 414,
      code: "HTTP_QUERY_LIMIT",
      expose: true,
      isOperational: true,
    });

    this.name = "HTTPQueryLimitError";
  }
}

/* -------------------------------------------------------------------------- */
/* Prototype Safety                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Key names that would mutate a prototype chain if assigned to an object.
 *
 * `__proto__` is the direct pollution vector. `constructor` and `prototype`
 * are blocked as defence in depth so no future container type re-opens the
 * hole.
 */
const FORBIDDEN_QUERY_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export function isForbiddenQueryKey(key: string): boolean {
  return FORBIDDEN_QUERY_KEYS.has(key);
}

function createQueryContainer(): Record<string, QueryValue> {
  return Object.create(null) as Record<string, QueryValue>;
}

function ownValue<T>(target: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(target, key)
    ? target[key]
    : undefined;
}

/* -------------------------------------------------------------------------- */
/* Tokenizer                                                                  */
/* -------------------------------------------------------------------------- */

interface QueryLimits {
  readonly maxKeys: number;
  readonly maxKeyLength: number;
  readonly maxValueLength: number;
  readonly maxTotalLength: number;
}

function resolveLimits(options: QueryLimitOptions): QueryLimits {
  return {
    maxKeys: options.maxKeys ?? DEFAULT_QUERY_MAX_KEYS,
    maxKeyLength: options.maxKeyLength ?? DEFAULT_QUERY_MAX_KEY_LENGTH,
    maxValueLength: options.maxValueLength ?? DEFAULT_QUERY_MAX_VALUE_LENGTH,
    maxTotalLength: options.maxTotalLength ?? DEFAULT_QUERY_MAX_TOTAL_LENGTH,
  };
}

/**
 * Percent-decodes a query component.
 *
 * A malformed sequence such as `%ZZ` makes `decodeURIComponent` throw a
 * `URIError`. Any client can send one, so the raw component is returned
 * instead of propagating an unhandled error onto the request path. The raw
 * bytes are never interpolated into an error message.
 */
export function decodeQueryComponent(
  value: string,
  decode = true,
  plusAsSpace = true,
): string {
  const input = plusAsSpace ? value.replace(/\+/g, " ") : value;

  if (!decode) {
    return input;
  }

  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

/**
 * Splits a raw query string into decoded `[name, value]` pairs, enforcing
 * every configured limit as it goes.
 *
 * This is the single tokenizer for the module: both {@link parseQuery} and
 * {@link parseQueryString} are built on it, so the limits and the decoding
 * rules cannot drift apart.
 */
function tokenizeQuery(
  query: string,
  limits: QueryLimits,
  decode: boolean,
  plusAsSpace: boolean,
  commaSeparated: boolean,
): Array<readonly [string, string]> {
  if (query.length > limits.maxTotalLength) {
    throw new HTTPQueryLimitError(
      "Query string exceeds the maximum allowed length.",
    );
  }

  const entries: Array<readonly [string, string]> = [];

  let count = 0;

  for (const part of query.split("&")) {
    if (part === "") {
      continue;
    }

    count += 1;

    if (count > limits.maxKeys) {
      throw new HTTPQueryLimitError(
        "Query string contains too many parameters.",
      );
    }

    const separator = part.indexOf("=");

    const rawKey = separator === -1 ? part : part.slice(0, separator);

    const rawValue = separator === -1 ? "" : part.slice(separator + 1);

    const key = decodeQueryComponent(rawKey, decode, plusAsSpace);

    if (key.length > limits.maxKeyLength) {
      throw new HTTPQueryLimitError(
        "Query parameter name exceeds the maximum allowed length.",
      );
    }

    const value = decodeQueryComponent(rawValue, decode, plusAsSpace);

    if (value.length > limits.maxValueLength) {
      throw new HTTPQueryLimitError(
        "Query parameter value exceeds the maximum allowed length.",
      );
    }

    if (commaSeparated && value.includes(",")) {
      for (const item of value.split(",")) {
        entries.push([key, item]);
      }

      continue;
    }

    entries.push([key, value]);
  }

  return entries;
}

export function stripQueryPrefix(input: string): string {
  let value = input;

  if (value.startsWith("?")) {
    value = value.slice(1);
  }

  const hashIndex = value.indexOf("#");

  if (hashIndex !== -1) {
    value = value.slice(0, hashIndex);
  }

  return value;
}

/* -------------------------------------------------------------------------- */
/* Query Parser                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Parses a query string into a nested object.
 *
 * The returned objects have a `null` prototype: a parameter named
 * `__proto__` can never reach `Object.prototype`, and a lookup of an
 * unrelated key can never return an inherited member.
 */
export function parseQuery(
  query: string | URLSearchParams | undefined,
  options: QueryParseOptions = {},
): QueryObject {
  if (query === undefined) {
    return createQueryContainer();
  }

  const limits = resolveLimits(options);

  const maxDepth = options.maxDepth ?? DEFAULT_QUERY_MAX_DEPTH;

  const entries =
    query instanceof URLSearchParams
      ? limitSearchParams(query, limits)
      : tokenizeQuery(
          stripQueryPrefix(query),
          limits,
          options.decode !== false,
          options.plusAsSpace !== false,
          options.commaSeparated === true,
        );

  const result = createQueryContainer();

  for (const [key, value] of entries) {
    appendQueryValue(result, parseQueryKey(key), value, maxDepth);
  }

  return result;
}

function limitSearchParams(
  params: URLSearchParams,
  limits: QueryLimits,
): Array<readonly [string, string]> {
  const entries: Array<readonly [string, string]> = [];

  let count = 0;

  for (const [key, value] of params.entries()) {
    count += 1;

    if (count > limits.maxKeys) {
      throw new HTTPQueryLimitError(
        "Query string contains too many parameters.",
      );
    }

    if (key.length > limits.maxKeyLength) {
      throw new HTTPQueryLimitError(
        "Query parameter name exceeds the maximum allowed length.",
      );
    }

    if (value.length > limits.maxValueLength) {
      throw new HTTPQueryLimitError(
        "Query parameter value exceeds the maximum allowed length.",
      );
    }

    entries.push([key, value]);
  }

  return entries;
}

/**
 * Parses a query string into a flat record of decoded values.
 *
 * Unlike {@link parseQuery} this applies no bracket-path nesting and no value
 * coercion: every value is the decoded string, and a repeated name yields an
 * array. Both functions share one tokenizer and one set of limits.
 */
export function parseQueryString(
  input: string | undefined | null,
  options: QueryStringParseOptions = {},
): Record<string, string | string[]> {
  const result = createQueryContainer() as Record<string, string | string[]>;

  if (input === undefined || input === null || input === "") {
    return result;
  }

  const value = stripQueryPrefix(input);

  if (value.length === 0) {
    return result;
  }

  const allowEmptyKeys = options.allowEmptyKeys ?? true;

  const entries = tokenizeQuery(
    value,
    resolveLimits(options),
    true,
    options.decodePlusAsSpace !== false,
    false,
  );

  for (const [key, item] of entries) {
    if (!allowEmptyKeys && key.length === 0) {
      continue;
    }

    if (isForbiddenQueryKey(key)) {
      continue;
    }

    const existing = ownValue(result, key);

    if (existing === undefined) {
      result[key] = item;

      continue;
    }

    if (Array.isArray(existing)) {
      existing.push(item);

      continue;
    }

    result[key] = [existing, item];
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Request Query Helpers                                                      */
/* -------------------------------------------------------------------------- */

export function getQuery(
  request: HTTPRequest,
  options: QueryParseOptions = {},
): QueryObject {
  const url = request.url;

  if (!url) {
    return createQueryContainer();
  }

  const queryIndex = url.indexOf("?");

  if (queryIndex === -1) {
    return createQueryContainer();
  }

  const hashIndex = url.indexOf("#", queryIndex + 1);

  const query = url.slice(
    queryIndex + 1,
    hashIndex === -1 ? undefined : hashIndex,
  );

  return parseQuery(query, options);
}

export function getQueryValue(
  request: HTTPRequest,
  key: string,
): QueryValue | undefined {
  return ownValue(getQuery(request) as Record<string, QueryValue>, key);
}

export function getQueryString(
  request: HTTPRequest,
  key: string,
): string | undefined {
  const value = getQueryValue(request, key);

  if (value === undefined || Array.isArray(value)) {
    return undefined;
  }

  if (value === null) {
    return null as unknown as string;
  }

  return String(value);
}

export function getQueryStrings(request: HTTPRequest, key: string): string[] {
  const value = getQueryValue(request, key);

  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return [String(value)];
}

/* -------------------------------------------------------------------------- */
/* Search Params                                                               */
/* -------------------------------------------------------------------------- */

export function getSearchParams(request: HTTPRequest): URLSearchParams {
  const url = request.url ?? "";

  const queryIndex = url.indexOf("?");

  if (queryIndex === -1) {
    return new URLSearchParams();
  }

  const hashIndex = url.indexOf("#", queryIndex + 1);

  const query = url.slice(
    queryIndex + 1,
    hashIndex === -1 ? undefined : hashIndex,
  );

  return new URLSearchParams(query);
}

/* -------------------------------------------------------------------------- */
/* Query String Serialization                                                 */
/* -------------------------------------------------------------------------- */

export function stringifyQuery(
  query: QueryObject | Record<string, unknown>,
): string {
  const params = new URLSearchParams();

  appendObjectToSearchParams(params, query);

  return params.toString();
}

export function buildQueryString(
  query: QueryObject | Record<string, unknown>,
): string {
  const value = stringifyQuery(query);

  return value ? `?${value}` : "";
}

/* -------------------------------------------------------------------------- */
/* Query Value Access                                                         */
/* -------------------------------------------------------------------------- */

export function hasQuery(request: HTTPRequest, key: string): boolean {
  return getSearchParams(request).has(key);
}

export function querySize(request: HTTPRequest): number {
  let size = 0;

  for (const _ of getSearchParams(request)) {
    size += 1;
  }

  return size;
}

/* -------------------------------------------------------------------------- */
/* Query Key Parsing                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Splits a bracket/dot path such as `a[b][c]` into its segments.
 *
 * A path containing `__proto__`, `constructor` or `prototype` yields an empty
 * array, which callers treat as "drop this parameter entirely".
 */
export function parseQueryKey(key: string): string[] {
  if (!key) {
    return [""];
  }

  const normalized = key.replace(/\]/g, "");

  const segments = normalized
    .split(/[.[\]]+/)
    .filter((part) => part.length > 0);

  if (segments.some(isForbiddenQueryKey)) {
    return [];
  }

  return segments;
}

/* -------------------------------------------------------------------------- */
/* Nested Query Values                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Writes one value into the nested result object.
 *
 * Iterative rather than recursive so a deeply nested key cannot overflow the
 * stack, depth-capped so it cannot allocate without bound, and every level is
 * a null-prototype container read through `hasOwnProperty`.
 */
function appendQueryValue(
  target: Record<string, QueryValue>,
  path: readonly string[],
  value: string,
  maxDepth: number,
): void {
  if (path.length === 0) {
    return;
  }

  if (path.length > maxDepth) {
    throw new HTTPQueryLimitError(
      "Query parameter nesting exceeds the maximum allowed depth.",
    );
  }

  let current = target;

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];

    if (segment === undefined) {
      continue;
    }

    const existing = ownValue(current, segment);

    if (isQueryObject(existing)) {
      current = existing as Record<string, QueryValue>;

      continue;
    }

    const next = createQueryContainer();

    current[segment] = next;

    current = next;
  }

  const leaf = path[path.length - 1];

  if (leaf === undefined) {
    return;
  }

  const existing = ownValue(current, leaf);

  if (existing === undefined) {
    current[leaf] = normalizeQueryValue(value);

    return;
  }

  if (Array.isArray(existing)) {
    existing.push(normalizeQueryValue(value));

    return;
  }

  current[leaf] = [existing as QueryPrimitive, normalizeQueryValue(value)];
}

/* -------------------------------------------------------------------------- */
/* Query Value Normalization                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Coerces the well-known literals and numbers that round-trip exactly.
 *
 * A numeric literal is only converted when `String(Number(value)) === value`,
 * so a 20-digit identifier stays the string it arrived as instead of being
 * silently rewritten to a different number.
 */
export function normalizeQueryValue(value: string): QueryPrimitive {
  if (value === "null") {
    return null;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    const number = Number(value);

    if (Number.isFinite(number) && String(number) === value) {
      return number;
    }
  }

  return value;
}

function isQueryObject(value: QueryValue | undefined): value is QueryObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

function appendObjectToSearchParams(
  params: URLSearchParams,
  object: Record<string, unknown>,
  prefix?: string,
): void {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}[${key}]` : key;

    if (value === undefined) {
      continue;
    }

    if (value === null) {
      params.append(path, "null");

      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined) {
          continue;
        }

        if (isPlainObject(item)) {
          appendObjectToSearchParams(
            params,
            item as Record<string, unknown>,
            path,
          );
        } else {
          params.append(path, serializeQueryPrimitive(item));
        }
      }

      continue;
    }

    if (isPlainObject(value)) {
      appendObjectToSearchParams(
        params,
        value as Record<string, unknown>,
        path,
      );

      continue;
    }

    params.append(path, serializeQueryPrimitive(value));
  }
}

/* -------------------------------------------------------------------------- */
/* Primitive Serialization                                                    */
/* -------------------------------------------------------------------------- */

function serializeQueryPrimitive(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/* -------------------------------------------------------------------------- */
/* Query Utilities                                                            */
/* -------------------------------------------------------------------------- */

export function cloneQuery(query: QueryObject): QueryObject {
  return JSON.parse(JSON.stringify(query)) as QueryObject;
}

export function mergeQuery(...queries: QueryObject[]): QueryObject {
  const result = createQueryContainer();

  for (const query of queries) {
    mergeQueryObject(result, query);
  }

  return result;
}

function mergeQueryObject(
  target: Record<string, QueryValue>,
  source: QueryObject,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (isForbiddenQueryKey(key)) {
      continue;
    }

    const existing = ownValue(target, key);

    if (isQueryObject(existing) && isQueryObject(value)) {
      mergeQueryObject(
        existing as Record<string, QueryValue>,
        value as QueryObject,
      );

      continue;
    }

    target[key] = value;
  }
}
