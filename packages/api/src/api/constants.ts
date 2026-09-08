/**
 * @zudojs/api/constants
 *
 * Shared constants for the API package.
 */

/**
 * Default timeout for API operations (30 seconds).
 *
 * Applied by {@link defineOperation} when no explicit timeout is given, and
 * by the executor as a fail-safe for hand-rolled operation objects.
 */
export const DEFAULT_OPERATION_TIMEOUT = 30_000;

/**
 * Maximum timeout accepted for a single operation (1 hour).
 *
 * Enforced by `defineOperation`. A larger value is almost always a unit
 * mistake (seconds vs milliseconds) rather than an intentional deadline.
 */
export const MAX_OPERATION_TIMEOUT = 3_600_000;

/**
 * Maximum number of interceptors allowed in a pipeline.
 * Enforced by the APIExecutor constructor.
 */
export const MAX_INTERCEPTORS = 32;

/**
 * Maximum number of validation issues carried on an `APIValidationError`
 * produced by the executor.
 *
 * Schema libraries emit one issue per failing element, so an array input
 * can produce an unbounded number of issues. The executor truncates the
 * list at this many entries and appends a single marker entry recording
 * how many were dropped.
 */
export const MAX_VALIDATION_ISSUES = 20;

/**
 * Maximum length of a single validation issue string produced by the
 * executor. Longer strings are truncated with an ellipsis.
 */
export const MAX_VALIDATION_ISSUE_LENGTH = 200;

/**
 * Maximum length of an operation name accepted by `defineOperation`.
 */
export const MAX_OPERATION_NAME_LENGTH = 128;

/**
 * Maximum length of a request id accepted by `createAPIContext`.
 */
export const MAX_REQUEST_ID_LENGTH = 128;
