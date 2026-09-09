/**
 * @zudojs/adapters/scheduler
 *
 * Scheduler adapter contracts — bridges Zudojs to scheduling providers.
 */

import type { Adapter, AdapterOperationOptions } from "../index.js";

/**
 * Scheduler adapter — manages scheduled tasks.
 */
export interface SchedulerAdapter extends Adapter {
  /** Schedules a task. */
  schedule(
    name: string,
    task: ScheduledTask,
    options?: AdapterOperationOptions,
  ): Promise<ScheduledJob>;

  /** Cancels a scheduled job. */
  cancel(job: ScheduledJob, options?: AdapterOperationOptions): Promise<void>;

  /** Lists all scheduled jobs. */
  list(options?: AdapterOperationOptions): Promise<readonly ScheduledJob[]>;
}

/**
 * A scheduled task definition.
 */
export interface ScheduledTask {
  readonly name: string;
  readonly cron?: string;
  readonly interval?: number;
  readonly handler: () => Promise<void> | void;
}

/**
 * A scheduled job handle.
 */
export interface ScheduledJob {
  readonly id: string;
  readonly name: string;
  readonly nextRun: number;
  cancel(): Promise<void>;
}
