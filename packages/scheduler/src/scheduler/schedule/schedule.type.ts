import type { ScheduleOptions } from "./scheduleOptions.type.js";

import type {
  ScheduleState,
  ScheduleType,
} from "../types/schedulerTypes.core.js";

export type { ScheduleType };

/**
 * Schedule definition.
 */
export interface Schedule {
  readonly id: string;

  readonly jobId: string;

  readonly type: ScheduleType;

  readonly expression?: string;

  readonly nextRunAt: Date;

  readonly lastRunAt?: Date;

  readonly state: ScheduleState;

  readonly options?: ScheduleOptions;
}

/**
 * Creates a schedule.
 *
 * @param id - Schedule identifier.
 * @param jobId - The job this schedule fires.
 * @param type - The kind of schedule.
 * @param nextRunAt - The first fire time.
 * @param options - Schedule options.
 * @param expression - The cron expression, for cron schedules.
 * @returns A frozen, active schedule.
 */
export function createSchedule(
  id: string,
  jobId: string,
  type: ScheduleType,
  nextRunAt: Date,
  options: ScheduleOptions = {},
  expression?: string,
): Schedule {
  return Object.freeze({
    id,
    jobId,
    type,
    nextRunAt,
    state: "active" as const,
    options: Object.freeze(options),
    ...(expression === undefined ? {} : { expression }),
  });
}
