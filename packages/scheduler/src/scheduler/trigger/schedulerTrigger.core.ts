import type { Trigger } from "./trigger.type.js";
import { parseCron, nextCronDate } from "./cron.parser.js";
import type { ParsedCron } from "./cron.parser.js";
import { InvalidScheduleError } from "../errors/scheduler.errors.js";

/**
 * Trigger that fires once at a specific date.
 *
 * A date already in the past yields `null` from {@link DateTrigger.next}, which
 * the scheduler interprets through the schedule's misfire policy rather than
 * treating as an error.
 */
export class DateTrigger implements Trigger {
  private readonly date: Date;

  constructor(date: Date) {
    if (Number.isNaN(date.getTime())) {
      throw new InvalidScheduleError(
        "DateTrigger requires a valid Date",
        "date-trigger",
      );
    }
    this.date = new Date(date.getTime());
  }

  /** The instant this trigger fires at. */
  get fireAt(): Date {
    return new Date(this.date.getTime());
  }

  next(after: Date): Date | null {
    if (after.getTime() >= this.date.getTime()) {
      return null;
    }
    return new Date(this.date.getTime());
  }
}

/**
 * Trigger that fires after a fixed delay from the given date.
 */
export class DelayTrigger implements Trigger {
  private readonly delayMs: number;

  constructor(delayMs: number) {
    assertUsableInterval(delayMs, "DelayTrigger");
    this.delayMs = delayMs;
  }

  next(after: Date): Date {
    return new Date(after.getTime() + this.delayMs);
  }
}

/**
 * Trigger that fires at fixed intervals.
 */
export class IntervalTrigger implements Trigger {
  private readonly intervalMs: number;

  constructor(intervalMs: number) {
    assertUsableInterval(intervalMs, "IntervalTrigger");
    this.intervalMs = intervalMs;
  }

  /** The interval, in milliseconds. */
  get interval(): number {
    return this.intervalMs;
  }

  next(after: Date): Date {
    return new Date(after.getTime() + this.intervalMs);
  }
}

/**
 * Trigger that fires according to a cron expression.
 *
 * The expression is parsed once at construction, so an invalid one fails where
 * the schedule is declared rather than silently firing on some other cadence.
 */
export class CronTrigger implements Trigger {
  private readonly expression: string;
  private readonly parsed: ParsedCron;
  private readonly utc: boolean;

  /**
   * @param expression - A five-field cron expression, or a macro such as `@daily`.
   * @param timezone - Pass `"UTC"` to interpret the fields in UTC. Any other
   *   value is rejected: honouring an arbitrary IANA zone needs real zone data,
   *   and silently ignoring the argument is what made the previous
   *   implementation's `timezone` parameter meaningless.
   */
  constructor(expression: string, timezone?: string) {
    this.expression = expression;
    this.parsed = parseCron(expression);

    if (timezone === undefined) {
      this.utc = false;
    } else if (/^utc$/i.test(timezone) || timezone === "Etc/UTC") {
      this.utc = true;
    } else {
      throw new InvalidScheduleError(
        `CronTrigger supports only "UTC" or the system local zone, got "${timezone}"`,
        expression,
      );
    }
  }

  /** The expression this trigger was built from. */
  get source(): string {
    return this.expression;
  }

  next(after: Date): Date | null {
    return nextCronDate(this.parsed, after, this.utc);
  }
}

/**
 * Rejects an interval that cannot produce a usable schedule.
 *
 * A zero or negative interval would fire continuously, and one large enough to
 * overflow the Date range produces an invalid date whose `getTime()` is `NaN` —
 * which then poisons every comparison in the scheduler's heap.
 */
function assertUsableInterval(ms: number, what: string): void {
  if (!Number.isFinite(ms)) {
    throw new InvalidScheduleError(
      `${what} requires a finite interval, got: ${ms}`,
      what,
    );
  }
  if (ms <= 0) {
    throw new InvalidScheduleError(
      `${what} requires a positive interval, got: ${ms}`,
      what,
    );
  }
  // The Date range is ±8.64e15 ms from the epoch; anything approaching it
  // cannot be added to "now" and still yield a valid date.
  if (ms > 8.64e15) {
    throw new InvalidScheduleError(
      `${what} interval ${ms}ms exceeds the representable date range`,
      what,
    );
  }
}
