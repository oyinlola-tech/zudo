/**
 * @zudojs/http/httpQuery/queryRequest
 *
 * Accessors that read the query component of an {@link HTTPRequest}. Every
 * accessor here answers about the same parsed object, so middleware and a
 * handler asking the same question get the same answer.
 */

export {
  getQuery,
  getQueryString,
  getQueryStrings,
  getQueryValue,
  getSearchParams,
  hasQuery,
  querySize,
} from "./query.request.js";
