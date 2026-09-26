/**
 * Wall-clock arithmetic for cron evaluation in a named time zone.
 *
 * A cron expression is written in wall-clock terms (09:00 on Mondays), so
 * computing its next fire time needs two operations: reading the wall-clock
 * fields of an instant in the schedule's zone, and turning a wall-clock time
 * back into an instant. Node ships full IANA zone data through `Intl`, which
 * is what makes `Africa/Lagos` or `America/New_York` work without a
 * dependency.
 *
 * @module scheduler/trigger/cron.zone
 */

/** The wall-clock fields cron matches against. Month is 1-12, day 0-6. */
export interface CronWallClock {
  readonly year: number;
  readonly month: number;
  readonly date: number;
  readonly hour: number;
  readonly minute: number;
  readonly day: number;
}

/** A time zone as the cron evaluator sees it. */
export interface CronZone {
  /** Canonical IANA name, `"UTC"`, or `undefined` for the host's local zone. */
  readonly name: string | undefined;
  /** Wall-clock fields of `instant` in this zone. */
  fields(instant: number): CronWallClock;
  /**
   * The instant at which the given wall-clock time occurs in this zone.
   * A time inside a DST gap resolves to the instant the clocks jumped to; a
   * repeated time resolves to its first occurrence. Overflowing fields
   * (month 13, date 32) roll over like `Date.UTC`.
   */
  instantOf(
    year: number,
    month: number,
    date: number,
    hour: number,
    minute: number,
  ): number;
}

/** Freezes a zone while keeping its methods contextually typed. */
function defineZone(zone: CronZone): CronZone {
  return Object.freeze(zone);
}

/** The host's local zone, as `Date`'s local accessors report it. */
export const LOCAL_ZONE: CronZone = defineZone({
  name: undefined,
  fields(instant: number): CronWallClock {
    const d = new Date(instant);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      date: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
      day: d.getDay(),
    };
  },
  instantOf(year, month, date, hour, minute): number {
    return new Date(year, month - 1, date, hour, minute).getTime();
  },
});

/** Coordinated Universal Time. */
export const UTC_ZONE: CronZone = defineZone({
  name: "UTC",
  fields(instant: number): CronWallClock {
    const d = new Date(instant);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      date: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      day: d.getUTCDay(),
    };
  },
  instantOf(year, month, date, hour, minute): number {
    return Date.UTC(year, month - 1, date, hour, minute);
  },
});

const PART_TYPES = ["year", "month", "day", "hour", "minute"] as const;

/** Builds a zone backed by `Intl` zone data; `undefined` for an unknown name. */
export function createIntlZone(timezone: string): CronZone | undefined {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  } catch {
    return undefined;
  }

  const name = formatter.resolvedOptions().timeZone;

  const wallAsUtc = (instant: number): number => {
    const values: Record<string, number> = {};
    for (const part of formatter.formatToParts(new Date(instant))) {
      if ((PART_TYPES as readonly string[]).includes(part.type)) {
        values[part.type] = Number(part.value);
      }
    }
    return Date.UTC(
      values.year ?? 1970,
      (values.month ?? 1) - 1,
      values.day ?? 1,
      (values.hour ?? 0) % 24,
      values.minute ?? 0,
    );
  };

  const offsetAt = (instant: number): number => wallAsUtc(instant) - instant;

  return defineZone({
    name,
    fields(instant: number): CronWallClock {
      const wall = new Date(wallAsUtc(instant));
      return {
        year: wall.getUTCFullYear(),
        month: wall.getUTCMonth() + 1,
        date: wall.getUTCDate(),
        hour: wall.getUTCHours(),
        minute: wall.getUTCMinutes(),
        day: wall.getUTCDay(),
      };
    },
    instantOf(year, month, date, hour, minute): number {
      const wall = Date.UTC(year, month - 1, date, hour, minute);
      const guess = wall - offsetAt(wall);
      return wall - offsetAt(guess);
    },
  });
}

/**
 * Resolves the zone a cron schedule is evaluated in.
 *
 * `undefined` selects the host's local zone, `"UTC"` (any case) or
 * `"Etc/UTC"` selects UTC, and any other value is looked up as an IANA name.
 *
 * @returns The zone, or `undefined` when the name is not a known zone.
 */
export function resolveCronZone(timezone?: string): CronZone | undefined {
  if (timezone === undefined) {
    return LOCAL_ZONE;
  }
  if (/^utc$/i.test(timezone) || timezone === "Etc/UTC") {
    return UTC_ZONE;
  }
  return createIntlZone(timezone);
}
