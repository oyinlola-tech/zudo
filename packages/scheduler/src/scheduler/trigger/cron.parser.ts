/**
 * @zudojs/scheduler/trigger/cron
 *
 * Standard five-field cron expression parsing and next-fire computation.
 *
 * Fields, in order: minute, hour, day-of-month, month, day-of-week.
 * Each supports `*`, a value, a `a-b` range, a `a-b/n` or `*\/n` step, and a
 * comma-separated list of any of those. Month and day-of-week also accept the
 * usual three-letter names. A leading `@yearly`-style macro is expanded first.
 */

import { CronParseError } from "../errors/scheduler.errors.js";
import { LOCAL_ZONE, UTC_ZONE } from "./cron.zone.js";
import type { CronWallClock, CronZone } from "./cron.zone.js";

/** Inclusive bounds for each cron field. */
const FIELD_BOUNDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "dayOfMonth", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "dayOfWeek", min: 0, max: 6 },
] as const;

/** Named aliases accepted in the month field. */
const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** Named aliases accepted in the day-of-week field. */
const DAY_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Shorthand macros. */
const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

/** How far ahead {@link nextCronDate} will search before giving up. */
const MAX_SEARCH_YEARS = 5;

/** A parsed cron expression: the permitted values for each field. */
export interface ParsedCron {
  readonly minute: ReadonlySet<number>;
  readonly hour: ReadonlySet<number>;
  readonly dayOfMonth: ReadonlySet<number>;
  readonly month: ReadonlySet<number>;
  readonly dayOfWeek: ReadonlySet<number>;
  /** True when day-of-month was `*`, which changes how the two day fields combine. */
  readonly dayOfMonthUnrestricted: boolean;
  /** True when day-of-week was `*`. */
  readonly dayOfWeekUnrestricted: boolean;
}

/**
 * Parses a cron expression into the set of values each field permits.
 *
 * @param expression - A five-field cron expression or a supported macro.
 * @returns The parsed expression.
 * @throws {CronParseError} when the expression is not valid.
 */
export function parseCron(expression: string): ParsedCron {
  const trimmed = expression.trim().toLowerCase();
  if (trimmed.length === 0) {
    throw new CronParseError(expression, "Cron expression cannot be empty");
  }

  const expanded = MACROS[trimmed] ?? trimmed;
  const fields = expanded.split(/\s+/);

  if (fields.length !== 5) {
    throw new CronParseError(
      expression,
      `Cron expression must have 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`,
    );
  }

  const sets = FIELD_BOUNDS.map((bounds, index) =>
    parseField(fields[index] ?? "", bounds, expression),
  );

  return {
    minute: sets[0] ?? new Set(),
    hour: sets[1] ?? new Set(),
    dayOfMonth: sets[2] ?? new Set(),
    month: sets[3] ?? new Set(),
    dayOfWeek: sets[4] ?? new Set(),
    dayOfMonthUnrestricted: (fields[2] ?? "") === "*",
    dayOfWeekUnrestricted: (fields[4] ?? "") === "*",
  };
}

/** Parses a single cron field into the set of values it permits. */
function parseField(
  field: string,
  bounds: (typeof FIELD_BOUNDS)[number],
  expression: string,
): Set<number> {
  if (field.length === 0) {
    throw new CronParseError(
      expression,
      `Cron field "${bounds.name}" is empty`,
    );
  }

  const values = new Set<number>();
  const isDayOfWeek = bounds.name === "dayOfWeek";

  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");

    if (stepPart !== undefined && !/^\d+$/.test(stepPart)) {
      throw new CronParseError(
        expression,
        `Cron field "${bounds.name}" has an invalid step: "${part}"`,
      );
    }
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (step === 0) {
      throw new CronParseError(
        expression,
        `Cron field "${bounds.name}" has a zero step: "${part}"`,
      );
    }

    let start: number;
    let end: number;

    if (rangePart === "*" || rangePart === undefined || rangePart === "") {
      start = bounds.min;
      end = bounds.max;
    } else if (rangePart.includes("-")) {
      const [from, to] = rangePart.split("-");
      // Range endpoints keep their raw day-of-week spelling: normalising 7
      // to 0 before the endpoints are compared turned "0-7" into Sunday
      // alone and made "1-7" an inverted range.
      start = resolveValue(from ?? "", bounds, expression, isDayOfWeek);
      end = resolveValue(to ?? "", bounds, expression, isDayOfWeek);

      // "mon-sun" names Monday through Sunday: the end is the week's last
      // day, not its first. "sun-sat" is left alone — it already ascends.
      if (isDayOfWeek && end === 0 && start > end) {
        end = 7;
      }

      if (start > end) {
        throw new CronParseError(
          expression,
          `Cron field "${bounds.name}" has an inverted range: "${rangePart}"`,
        );
      }
    } else {
      start = resolveValue(rangePart, bounds, expression);
      // A bare value with a step means "from here to the end of the field".
      end = stepPart === undefined ? start : bounds.max;
    }

    for (let v = start; v <= end; v += step) {
      // Both 0 and 7 are Sunday; the set only ever holds 0.
      values.add(isDayOfWeek && v === 7 ? 0 : v);
    }
  }

  if (values.size === 0) {
    throw new CronParseError(
      expression,
      `Cron field "${bounds.name}" matches no values: "${field}"`,
    );
  }

  return values;
}

/**
 * Resolves a numeric or named field value, checking it against the bounds.
 *
 * @param raw - The literal from the expression.
 * @param bounds - The field being parsed.
 * @param expression - The whole expression, for error reporting.
 * @param rawDayOfWeek - Keeps day-of-week `7` as 7 and accepts it as a bound,
 *   for a range endpoint that the caller expands and normalises itself.
 */
function resolveValue(
  raw: string,
  bounds: (typeof FIELD_BOUNDS)[number],
  expression: string,
  rawDayOfWeek = false,
): number {
  let value: number;

  if (/^\d+$/.test(raw)) {
    value = Number(raw);
    // Both 0 and 7 are Sunday in common cron dialects.
    if (bounds.name === "dayOfWeek" && value === 7 && !rawDayOfWeek) {
      value = 0;
    }
  } else if (bounds.name === "month" && raw in MONTH_NAMES) {
    value = MONTH_NAMES[raw] as number;
  } else if (bounds.name === "dayOfWeek" && raw in DAY_NAMES) {
    value = DAY_NAMES[raw] as number;
  } else {
    throw new CronParseError(
      expression,
      `Cron field "${bounds.name}" has an invalid value: "${raw}"`,
    );
  }

  const max = rawDayOfWeek && bounds.name === "dayOfWeek" ? 7 : bounds.max;
  if (value < bounds.min || value > max) {
    throw new CronParseError(
      expression,
      `Cron field "${bounds.name}" value ${value} is outside ${bounds.min}-${bounds.max}`,
    );
  }

  return value;
}

/**
 * Computes the next time a parsed cron expression fires, strictly after `after`.
 *
 * Search is minute-by-minute with whole-field skips, bounded by
 * {@link MAX_SEARCH_YEARS} so an unsatisfiable expression (30 February) fails
 * rather than looping. Every skip is computed in wall-clock terms of the
 * schedule's zone, so a DST transition neither skips nor repeats an hour of
 * scheduling, and a half-hour zone (Asia/Kolkata) still visits every minute.
 *
 * @param parsed - The parsed expression.
 * @param after - The instant to search forward from (exclusive).
 * @param zone - The zone the fields are read in: a {@link CronZone}, or for
 *   compatibility `true` for UTC and `false` (the default) for local time.
 * @returns The next fire time, or null when none exists within the horizon.
 */
export function nextCronDate(
  parsed: ParsedCron,
  after: Date,
  zone: CronZone | boolean = false,
): Date | null {
  const clock: CronZone =
    typeof zone === "boolean" ? (zone ? UTC_ZONE : LOCAL_ZONE) : zone;

  // Start at the next whole minute after `after`, with seconds cleared.
  let candidate = Math.floor(after.getTime() / 60_000) * 60_000 + 60_000;

  const limitYear = clock.fields(after.getTime()).year + MAX_SEARCH_YEARS;

  for (;;) {
    const now = clock.fields(candidate);

    if (now.year > limitYear) {
      return null;
    }

    if (!parsed.month.has(now.month)) {
      candidate = advanceTo(
        candidate,
        clock.instantOf(now.year, now.month + 1, 1, 0, 0),
      );
      continue;
    }

    if (!matchesDay(parsed, now)) {
      candidate = advanceTo(
        candidate,
        clock.instantOf(now.year, now.month, now.date + 1, 0, 0),
      );
      continue;
    }

    if (!parsed.hour.has(now.hour)) {
      candidate = advanceHour(candidate, now.minute, clock);
      continue;
    }

    if (!parsed.minute.has(now.minute)) {
      candidate += 60_000;
      continue;
    }

    return new Date(candidate);
  }
}

/**
 * Applies the cron day-matching rule.
 *
 * When both day-of-month and day-of-week are restricted, cron matches if
 * *either* does — an inconsistency in the original spec that every
 * implementation preserves, because `0 0 1,15 * mon` is widely used to mean
 * "the 1st, the 15th, and every Monday".
 */
function matchesDay(parsed: ParsedCron, now: CronWallClock): boolean {
  const domMatches = parsed.dayOfMonth.has(now.date);
  const dowMatches = parsed.dayOfWeek.has(now.day);

  if (parsed.dayOfMonthUnrestricted && parsed.dayOfWeekUnrestricted) {
    return true;
  }
  if (parsed.dayOfMonthUnrestricted) {
    return dowMatches;
  }
  if (parsed.dayOfWeekUnrestricted) {
    return domMatches;
  }
  return domMatches || dowMatches;
}

/**
 * Moves the search to `target`, never backwards.
 *
 * A wall-clock midnight that does not exist in the zone (a DST gap at
 * 00:00) can resolve to an instant before the candidate; falling back to
 * the next minute keeps the search advancing until the gap is behind it.
 */
function advanceTo(candidate: number, target: number): number {
  return Number.isFinite(target) && target > candidate
    ? target
    : candidate + 60_000;
}

/**
 * Moves to the top of the next hour.
 *
 * Uses wall-clock arithmetic rather than adding an hour of milliseconds, so a
 * DST transition does not skip or repeat an hour of scheduling. The top of the
 * hour is taken in the schedule's zone: a host on a half-hour offset
 * (Asia/Kolkata) evaluating a UTC schedule would otherwise land every skip
 * on :30 UTC and never visit minutes 0-29 of a restricted hour.
 */
function advanceHour(candidate: number, minute: number, clock: CronZone): number {
  const nextHour = candidate - minute * 60_000 + 3_600_000;
  return nextHour - clock.fields(nextHour).minute * 60_000;
}
