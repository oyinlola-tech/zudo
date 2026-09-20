/**
 * @zudojs/http/httpQuery/queryTypes
 *
 * Query value types, parser limits, and the prototype-safe container
 * primitives every other query module builds on.
 */

export type {
  QueryLimitOptions,
  QueryObject,
  QueryParseOptions,
  QueryPrimitive,
  QueryStringParseOptions,
  QueryStringPrimitive,
  QueryStringifyOptions,
  QueryStringValue,
  QueryValue,
} from "./query.type.js";

export {
  DEFAULT_QUERY_MAX_DEPTH,
  DEFAULT_QUERY_MAX_KEY_LENGTH,
  DEFAULT_QUERY_MAX_KEYS,
  DEFAULT_QUERY_MAX_TOTAL_LENGTH,
  DEFAULT_QUERY_MAX_VALUE_LENGTH,
  HTTPQueryLimitError,
  resolveLimits,
} from "./query.limit.js";

export type { QueryLimits } from "./query.limit.js";

export {
  createQueryContainer,
  isForbiddenQueryKey,
  isQueryObject,
  ownValue,
  queryValueToString,
} from "./query.container.js";
