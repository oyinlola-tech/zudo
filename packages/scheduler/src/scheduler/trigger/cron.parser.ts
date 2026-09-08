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
    throw new CronParseError("Cron expression cannot be empty", expression);
  }

  const expanded = MACROS[trimmed] ?? trimmed;
  const fields = expanded.split(/\s+/);

  if (fields.length !== 5) {
    throw new CronParseError(
      `Cron expression must have 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`,
      expression,
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
      `Cron field "${bounds.name}" is empty`,
      expression,
    );
  }

  const values = new Set<number>();

  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");

    if (stepPart !== undefined && !/^\d+$/.test(stepPart)) {
      throw new CronParseError(
        `Cron field "${bounds.name}" has an invalid step: "${part}"`,
        expression,
      );
    }
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (step === 0) {
      throw new CronParseError(
        `Cron field "${bounds.name}" has a zero step: "${part}"`,
        expression,
      );
    }

    let start: number;
    let end: number;

    if (rangePart === "*" || rangePart === undefined || rangePart === "") {
      start = bounds.min;
      end = bounds.max;
    } else if (rangePart.includes("-")) {
      const [from, to] = rangePart.split("-");
      start = resolveValue(from ?? "", bounds, expression);
      end = resolveValue(to ?? "", bounds, expression);
      if (start > end) {
        throw new CronParseError(
          `Cron field "${bounds.name}" has an inverted range: "${rangePart}"`,
          expression,
        );
      }
    } else {
      start = resolveValue(rangePart, bounds, expression);
      // A bare value with a step means "from here to the end of the field".
      end = stepPart === undefined ? start : bounds.max;
    }

    for (let v = start; v <= end; v += step) {
      values.add(v);
    }
  }

  if (values.size === 0) {
    throw new CronParseError(
      `Cron field "${bounds.name}" matches no values: "${field}"`,
      expression,
    );
  }

  return values;
}

/** Resolves a numeric or named field value, checking it against the bounds. */
function resolveValue(
  raw: string,
  bounds: (typeof FIELD_BOUNDS)[number],
  expression: string,
): number {
  let value: number;

  if (/^\d+$/.test(raw)) {
    value = Number(raw);
    // Both 0 and 7 are Sunday in common cron dialects.
    if (bounds.name === "dayOfWeek" && value === 7) {
      value = 0;
    }
  } else if (bounds.name === "month" && raw in MONTH_NAMES) {
    value = MONTH_NAMES[raw] as number;
  } else if (bounds.name === "dayOfWeek" && raw in DAY_NAMES) {
    value = DAY_NAMES[raw] as number;
  } else {
    throw new CronParseError(
      `Cron field "${bounds.name}" has an invalid value: "${raw}"`,
      expression,
    );
  }

  if (value < bounds.min || value > bounds.max) {
    throw new CronParseError(
      `Cron field "${bounds.name}" value ${value} is outside ${bounds.min}-${bounds.max}`,
      expression,
    );
  }

  return value;
}

/**
 * Computes the next time a parsed cron expression fires, strictly after `after`.
 *
 * Search is minute-by-minute with whole-field skips, bounded by
 * {@link MAX_SEARCH_YEARS} so an unsatisfiable expression (30 February) fails
 * rather than looping.
 *
 * @param parsed - The parsed expression.
 * @param after - The instant to search forward from (exclusive).
 * @param utc - Interpret the fields in UTC rather than local time.
 * @returns The next fire time, or null when none exists within the horizon.
 */
export function nextCronDate(
  parsed: ParsedCron,
  after: Date,
  utc = false,
): Date | null {
  const get = {
    minute: (d: Date) => (utc ? d.getUTCMinutes() : d.getMinutes()),
    hour: (d: Date) => (utc ? d.getUTCHours() : d.getHours()),
    date: (d: Date) => (utc ? d.getUTCDate() : d.getDate()),
    month: (d: Date) => (utc ? d.getUTCMonth() : d.getMonth()) + 1,
    day: (d: Date) => (utc ? d.getUTCDay() : d.getDay()),
    year: (d: Date) => (utc ? d.getUTCFullYear() : d.getFullYear()),
  };

  // Start at the next whole minute after `after`, with seconds cleared.
  const candidate = new Date(after.getTime());
  candidate.setSeconds(0, 0);
  candidate.setTime(candidate.getTime() + 60_000);

  const limitYear = get.year(after) + MAX_SEARCH_YEARS;

  while (get.year(candidate) <= limitYear) {
    if (!parsed.month.has(get.month(candidate))) {
      advanceMonth(candidate, utc);
      continue;
    }

    if (!matchesDay(parsed, candidate, get.date, get.day)) {
      advanceDay(candidate, utc);
      continue;
    }

    if (!parsed.hour.has(get.hour(candidate))) {
      advanceHour(candidate);
      continue;
    }

    if (!parsed.minute.has(get.minute(candidate))) {
      candidate.setTime(candidate.getTime() + 60_000);
      continue;
    }

    return candidate;
  }

  return null;
}

/**
 * Applies the cron day-matching rule.
 *
 * When both day-of-month and day-of-week are restricted, cron matches if
 * *either* does — an inconsistency in the original spec that every
 * implementation preserves, because `0 0 1,15 * mon` is widely used to mean
 * "the 1st, the 15th, and every Monday".
 */
function matchesDay(
  parsed: ParsedCron,
  candidate: Date,
  getDate: (d: Date) => number,
  getDay: (d: Date) => number,
): boolean {
  const domMatches = parsed.dayOfMonth.has(getDate(candidate));
  const dowMatches = parsed.dayOfWeek.has(getDay(candidate));

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

/** Moves to 00:00 on the first day of the next month. */
function advanceMonth(candidate: Date, utc: boolean): void {
  if (utc) {
    candidate.setUTCDate(1);
    candidate.setUTCHours(0, 0, 0, 0);
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  } else {
    candidate.setDate(1);
    candidate.setHours(0, 0, 0, 0);
    candidate.setMonth(candidate.getMonth() + 1);
  }
}

/** Moves to 00:00 on the next day. */
function advanceDay(candidate: Date, utc: boolean): void {
  if (utc) {
    candidate.setUTCHours(0, 0, 0, 0);
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  } else {
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() + 1);
  }
}

/**
 * Moves to the top of the next hour.
 *
 * Uses wall-clock arithmetic rather than adding an hour of milliseconds, so a
 * DST transition does not skip or repeat an hour of scheduling.
 */
function advanceHour(candidate: Date): void {
  candidate.setMinutes(0, 0, 0);
  candidate.setTime(candidate.getTime() + 3_600_000);
  candidate.setMinutes(0, 0, 0);
}
