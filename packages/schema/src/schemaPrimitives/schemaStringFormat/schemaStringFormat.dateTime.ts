/**
 * @zudojs/schema/primitives/stringFormat/dateTime
 *
 * Calendar and clock range checks for the `date`, `datetime` and `time`
 * string formats. The format patterns only check the shape
 * (`\d{4}-\d{2}-\d{2}`), so `"2026-02-30"` and `"25:61"` used to pass.
 */

const DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;

const TIME_PARTS = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

const OFFSET_PARTS = /^[+-](\d{2}):(\d{2})$/;

/** Whether `year` is a Gregorian leap year. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of days in `month` (1-12) of `year`. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Whether `value` is a real `YYYY-MM-DD` calendar date: month 01-12 and a
 * day that exists in that month, with 29 February only in leap years.
 */
export function isCalendarDate(value: string): boolean {
  const match = DATE_PARTS.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/**
 * Whether `value` is a real `HH:mm`, `HH:mm:ss` or `HH:mm:ss.sss` time of
 * day: hours 00-23, minutes and seconds 00-59.
 */
export function isClockTime(value: string): boolean {
  const match = TIME_PARTS.exec(value);
  if (!match) return false;
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  return Number(match[1]) <= 23 && Number(match[2]) <= 59 && seconds <= 59;
}

/** Whether `value` is `Z` or a `±hh:mm` offset with hh 00-23, mm 00-59. */
function isOffset(value: string): boolean {
  if (value === "Z" || value === "") return true;
  const match = OFFSET_PARTS.exec(value);
  return match !== null && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

/**
 * Whether `value` (already matching the `datetime` shape
 * `YYYY-MM-DDTHH:mm:ss[.fff][Z|±hh:mm]`) names a real instant: a valid
 * calendar date, a valid clock time and a valid offset.
 */
export function isCalendarDateTime(value: string): boolean {
  const separator = value.indexOf("T");
  if (separator === -1) return false;
  const date = value.slice(0, separator);
  const rest = value.slice(separator + 1);
  const offsetStart = rest.search(/[Z+-]/);
  const time = offsetStart === -1 ? rest : rest.slice(0, offsetStart);
  const offset = offsetStart === -1 ? "" : rest.slice(offsetStart);
  return isCalendarDate(date) && isClockTime(time) && isOffset(offset);
}
