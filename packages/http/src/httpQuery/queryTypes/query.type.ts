/**
 * Query value shapes produced by {@link parseQuery}.
 *
 * `QueryValue` is recursive on purpose. A query string may address the same
 * name both as a scalar and as a bracket path (`?a[b]=1&a=2`), so an array
 * element can itself be an object. Typing the array as `QueryPrimitive[]`
 * described a shape the parser could not actually produce, and callers that
 * trusted it crashed on the mixed array.
 */
export type QueryPrimitive = string | number | boolean | null;

export type QueryValue = QueryPrimitive | QueryValue[] | QueryObject;

export interface QueryObject {
  readonly [key: string]: QueryValue;
}

/**
 * Limits applied to every query string this module parses.
 *
 * All limits are enforced, on both the string and the `URLSearchParams` entry
 * points. Exceeding one throws {@link HTTPQueryLimitError}, which carries a
 * 414 status code so a server layer can map it to a response instead of a 500.
 */
export interface QueryLimitOptions {
  /** Maximum number of parameters, counted after comma expansion. Default 1000. */
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
  | QueryStringPrimitive
  | readonly QueryStringPrimitive[];

export interface QueryStringParseOptions extends QueryLimitOptions {
  /** Decode `+` as a space. Default `true`. */
  readonly decodePlusAsSpace?: boolean;

  /** Keep parameters whose name decodes to the empty string. Default `true`. */
  readonly allowEmptyKeys?: boolean;
}

/**
 * Bounds applied when serializing an object back into a query string.
 *
 * The parser is iterative and depth-capped, so it cannot be made to overflow
 * the stack. The serializer walks the same shapes and needs the same bounds:
 * without them a cyclic or deeply nested object threw a bare `RangeError`
 * instead of a typed, catchable failure.
 */
export interface QueryStringifyOptions {
  /** Maximum nesting depth of the object being serialized. Default 10. */
  readonly maxDepth?: number;
}
