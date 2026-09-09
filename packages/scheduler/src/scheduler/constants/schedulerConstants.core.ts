import type { MisfirePolicy } from "../types/schedulerTypes.core.js";

import type { OverlapPolicy } from "../types/schedulerTypes.core.js";

/**
 * @zudojs/scheduler/constants
 *
 * Shared constants for the scheduler package.
 */

/**
 * Default timeout for job executions (30 seconds).
 */
export const DEFAULT_JOB_TIMEOUT = 30_000;

/**
 * Maximum number of concurrent job executions.
 */
export const DEFAULT_MAX_CONCURRENCY = 10;

/**
 * Maximum number of retries for failed jobs.
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Default retry delay in milliseconds.
 */
export const DEFAULT_RETRY_DELAY = 1_000;

/**
 * Maximum timer delay in milliseconds (to avoid timer drift issues).
 */
export const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * Maximum number of jobs allowed in the registry.
 */
export const MAX_JOBS = 4096;

/**
 * Maximum number of schedules allowed.
 */
export const MAX_SCHEDULES = 4096;

/**
 * Maximum execution history to keep in memory per job.
 */
export const MAX_EXECUTION_HISTORY = 100;

/**
 * Default misfire policy.
 */
export const DEFAULT_MISFIRE_POLICY: MisfirePolicy = "run-once";

/**
 * Default overlap policy.
 */
export const DEFAULT_OVERLAP_POLICY: OverlapPolicy = "allow";
