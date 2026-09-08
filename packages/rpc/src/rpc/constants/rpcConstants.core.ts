/**
 * @zudojs/rpc/constants
 *
 * Shared constants for the RPC package.
 */

/**
 * Default timeout for RPC operations (30 seconds).
 */
export const DEFAULT_RPC_TIMEOUT = 30_000;

/**
 * Maximum payload size for RPC messages (1MB).
 */
export const MAX_RPC_PAYLOAD_SIZE = 1024 * 1024;

/**
 * Maximum number of pending requests allowed in the client.
 */
export const MAX_PENDING_REQUESTS = 1024;

/**
 * Maximum number of middleware entries allowed in a stack.
 */
export const MAX_MIDDLEWARE = 32;

/**
 * Maximum number of procedures allowed in a registry.
 */
export const MAX_PROCEDURES = 4096;

/**
 * Procedure name pattern: dot-separated lowercase identifiers.
 */
export const PROCEDURE_NAME_PATTERN =
  /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

/**
 * Maximum length of a procedure name, checked before the pattern so a
 * pathological name cannot drive regex backtracking.
 */
export const MAX_PROCEDURE_NAME_LENGTH = 256;

/**
 * Largest delay Node's timer subsystem accepts. A larger delay overflows
 * a signed 32-bit integer and is silently clamped to `1`.
 */
export const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * Message returned to callers for an unexpected server-side failure.
 *
 * Internal exception text may name hosts, paths, credentials or queries,
 * so it is logged rather than returned. Callers correlate with the
 * request id instead.
 */
export const INTERNAL_ERROR_MESSAGE =
  "The server encountered an internal error while handling this request.";
