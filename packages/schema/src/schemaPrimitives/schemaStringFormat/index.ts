/**
 * @zudojs/schema/primitives/stringFormat
 *
 * Checks behind the string formats that a pattern alone cannot express:
 * real calendar dates and clock times, and URL schemes.
 */

export {
  isCalendarDate,
  isCalendarDateTime,
  isClockTime,
} from "./schemaStringFormat.dateTime.js";
export {
  normalizeUrlProtocols,
  isUrlWithProtocol,
  type StringUrlOptions,
  type UrlProtocolPolicy,
} from "./schemaStringFormat.url.js";
