/**
 * Base transaction error class.
 *
 * Owned by `@zudojs/errors` (round 10 INF-16) and re-exported here, so
 * `instanceof TransactionError` matches whichever package a caller imports
 * it from. Name, constructor, `code` defaults and category are unchanged.
 */

export { TransactionError, type TransactionErrorOptions } from "@zudojs/errors";
