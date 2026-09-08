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

  /** How to handle a fire time that has already passed (default: "run-once"). */
  readonly misfire?: MisfirePolicy;

  /** How to handle a fire time arriving while a previous run is still going. */
  readonly overlap?: OverlapPolicy;

  /** Relative priority. Reserved; the queue orders strictly by fire time. */
  readonly priority?: number;

  /** Payload handed to the job handler as `context.data`. */
  readonly data?: unknown;
}
