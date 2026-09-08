/**
 * @zudojs/api/constants
 *
 * Shared constants for the API package.
 */

/**
 * Default timeout for API operations (30 seconds).
 */
export const DEFAULT_OPERATION_TIMEOUT = 30_000;

/**
 * Maximum number of interceptors allowed in a pipeline.
 * Enforced by the APIExecutor constructor.
 */
export const MAX_INTERCEPTORS = 32;

/**
 * Maximum number of policies allowed on a single operation.
 * Reserved for the policy system — not yet enforced.
 */
export const MAX_POLICIES = 16;
