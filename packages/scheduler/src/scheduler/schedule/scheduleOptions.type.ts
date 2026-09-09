import type {
  MisfirePolicy,
  OverlapPolicy,
} from "../types/schedulerTypes.core.js";

/**
 * Options for a schedule.
 */
export interface ScheduleOptions {
  /** IANA timezone name. Only "UTC" is currently honoured by CronTrigger. */
  readonly timezone?: string;

  /**
   * How to handle a fire time that has already passed (default: "run-once").
   *
   * `"skip"` refuses the schedule, `"run-once"` fires once immediately and
   * then resumes from now, and `"catch-up"` replays every occurrence that was
   * missed, one per tick, until the schedule has caught up with the clock.
   */
  readonly misfire?: MisfirePolicy;

  /**
   * How to handle a fire time arriving while a previous run is still going.
   *
   * `"allow"` (default) starts it anyway, `"skip"` drops it, `"queue"` holds
   * it until the running execution finishes, and `"replace"` aborts the
   * running execution. Overrides `JobOptions.overlap` for this schedule.
   */
  readonly overlap?: OverlapPolicy;

  /**
   * Relative priority, breaking ties between schedules due at the same
   * instant. Higher runs first; the default is 0. It does not let a schedule
   * jump ahead of one that is due earlier.
   */
  readonly priority?: number;

  /** Payload handed to the job handler as `context.data`. */
  readonly data?: unknown;
}
