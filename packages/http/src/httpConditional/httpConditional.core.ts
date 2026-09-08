/**
 * HTTP conditional request utilities.
 *
 * Handles ETag, If-None-Match, If-Match, If-Modified-Since,
 * If-Unmodified-Since and related conditional request semantics.
 */

import { createHash } from "node:crypto";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface EntityTag {
  readonly value: string;
  readonly weak: boolean;
}

export interface ConditionalHeaders {
  readonly ifMatch?: string;
  readonly ifNoneMatch?: string;
  readonly ifModifiedSince?: string;
  readonly ifUnmodifiedSince?: string;
  readonly ifRange?: string;
}

export interface ConditionalResource {
  readonly etag?: string;
  readonly lastModified?: Date | string;
}

export interface ConditionalResult {
  readonly matched: boolean;
  readonly notModified: boolean;
  readonly preconditionFailed: boolean;
  readonly statusCode?: 304 | 412;
  /**
   * Whether a `Range` header may be honoured for this request.
   *
   * `false` when an `If-Range` condition was supplied and did not match the
   * current representation; RFC 9110 section 13.1.5 then requires the server
   * to ignore `Range` and return the full 200 response.
   */
  readonly rangeApplicable: boolean;
}

export type ConditionalMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "TRACE"
  | "CONNECT";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const NOT_MODIFIED_STATUS = 304;

export const PRECONDITION_FAILED_STATUS = 412;

/* -------------------------------------------------------------------------- */
/* ETag Parsing                                                               */
/* -------------------------------------------------------------------------- */

export function parseEntityTag(
  value: string | undefined | null,
): EntityTag | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length < 2) {
    return undefined;
  }

  let weak = false;
  let tag = trimmed;

  if (tag.startsWith("W/") || tag.startsWith("w/")) {
    weak = true;
    tag = tag.slice(2).trim();
  }

  if (tag.length < 2 || !tag.startsWith('"') || !tag.endsWith('"')) {
    return undefined;
  }

  return {
    value: tag.slice(1, -1),
    weak,
  };
}

/**
 * RFC 9110 section 8.8.3 `etagc = "!" / %x23-7E / obs-text`.
 *
 * DQUOTE is not a member and there is no `quoted-pair` inside an entity-tag,
 * so a value containing one cannot be represented and must be rejected
 * rather than escaped.
 */
const ETAGC_PATTERN = /^[\u0021\u0023-\u007e\u0080-\u00ff]*$/;

/**
 * Formats an entity tag for the wire.
 *
 * @param tag - The tag value, or a parsed {@link EntityTag}.
 * @param weak - Whether to emit the `W/` weakness indicator.
 * @returns The formatted entity tag.
 * @throws {TypeError} If the value contains a character outside `etagc` —
 *   notably DQUOTE, CR, LF or NUL, which would otherwise split the response.
 */
export function formatEntityTag(tag: EntityTag | string, weak = false): string {
  if (typeof tag === "object") {
    weak = tag.weak;
    tag = tag.value;
  }

  if (!ETAGC_PATTERN.test(tag)) {
    throw new TypeError(
      "Entity tag values must contain only RFC 9110 etagc characters.",
    );
  }

  return `${weak ? "W/" : ""}"${tag}"`;
}

/* -------------------------------------------------------------------------- */
/* ETag Lists                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Parses an entity-tag list header into its tags.
 *
 * @remarks
 * The wildcard `*` yields an **empty** list, which is indistinguishable from
 * "no parseable tags". Callers making a precondition decision must use
 * {@link parseEntityTagCondition}, or pair this with {@link isWildcardETag};
 * treating an empty result as "no precondition" turns `If-Match: *` — the
 * strongest possible precondition — into no precondition at all.
 *
 * @param value - The raw header value.
 * @returns The parsed entity tags.
 */
export function parseEntityTagList(
  value: string | undefined | null,
): readonly EntityTag[] {
  if (value === undefined || value === null) {
    return [];
  }

  const trimmed = value.trim();

  if (trimmed === "*") {
    return [];
  }

  return splitCommaSeparated(trimmed)
    .map((item) => parseEntityTag(item))
    .filter((tag): tag is EntityTag => tag !== undefined);
}

export function isWildcardETag(value: string | undefined | null): boolean {
  return value?.trim() === "*";
}

/**
 * Parses an entity-tag list header, distinguishing the `*` wildcard from an
 * empty or unparseable list.
 *
 * @param value - The raw header value.
 * @returns The wildcard flag, whether the header was present, and the tags.
 */
export function parseEntityTagCondition(value: string | undefined | null): {
  readonly present: boolean;
  readonly wildcard: boolean;
  readonly tags: readonly EntityTag[];
} {
  if (value === undefined || value === null) {
    return { present: false, wildcard: false, tags: [] };
  }

  if (isWildcardETag(value)) {
    return { present: true, wildcard: true, tags: [] };
  }

  return { present: true, wildcard: false, tags: parseEntityTagList(value) };
}

/* -------------------------------------------------------------------------- */
/* ETag Comparison                                                            */
/* -------------------------------------------------------------------------- */

export function strongETagMatch(
  left: EntityTag | string | undefined,
  right: EntityTag | string | undefined,
): boolean {
  const leftTag = normalizeEntityTag(left);

  const rightTag = normalizeEntityTag(right);

  if (!leftTag || !rightTag) {
    return false;
  }

  return !leftTag.weak && !rightTag.weak && leftTag.value === rightTag.value;
}

export function weakETagMatch(
  left: EntityTag | string | undefined,
  right: EntityTag | string | undefined,
): boolean {
  const leftTag = normalizeEntityTag(left);

  const rightTag = normalizeEntityTag(right);

  if (!leftTag || !rightTag) {
    return false;
  }

  return leftTag.value === rightTag.value;
}

export function matchesETagList(
  header: string | undefined | null,
  currentETag: string | EntityTag | undefined,
  strong = false,
): boolean {
  if (isWildcardETag(header)) {
    return currentETag !== undefined;
  }

  if (currentETag === undefined) {
    return false;
  }

  const tags = parseEntityTagList(header);

  return tags.some((tag) =>
    strong
      ? strongETagMatch(tag, currentETag)
      : weakETagMatch(tag, currentETag),
  );
}

/* -------------------------------------------------------------------------- */
/* Date Parsing                                                               */
/* -------------------------------------------------------------------------- */

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const IMF_FIXDATE =
  /^[A-Za-z]{3}, (\d{2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

const RFC850_DATE =
  /^[A-Za-z]+day, (\d{2})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

const ASCTIME_DATE =
  /^[A-Za-z]{3} ([A-Za-z]{3}) ([\d ]\d) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/;

/**
 * Parses an HTTP-date.
 *
 * Only the three formats RFC 9110 section 5.6.7 defines are accepted:
 * IMF-fixdate, the obsolete RFC 850 form, and the asctime form. Every one is
 * interpreted as UTC — `Date.parse` reads asctime as *server-local* time, so
 * delegating to it silently skews every `If-Modified-Since` comparison on a
 * server that is not running in UTC.
 *
 * @param value - The raw header value.
 * @returns The parsed instant, or `undefined` if it is not an HTTP-date.
 */
export function parseHTTPDate(
  value: string | undefined | null,
): Date | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  const imf = IMF_FIXDATE.exec(trimmed);

  if (imf) {
    return buildUTCDate(imf[3], imf[2], imf[1], imf[4], imf[5], imf[6]);
  }

  const rfc850 = RFC850_DATE.exec(trimmed);

  if (rfc850) {
    const twoDigitYear = Number(rfc850[3]);

    /*
     * RFC 9110 section 5.6.7: a two-digit year more than 50 years in the
     * future is interpreted as the most recent year in the past with the
     * same last two digits.
     */
    const century = twoDigitYear >= 70 ? 1900 : 2000;

    return buildUTCDate(
      String(century + twoDigitYear),
      rfc850[2],
      rfc850[1],
      rfc850[4],
      rfc850[5],
      rfc850[6],
    );
  }

  const asctime = ASCTIME_DATE.exec(trimmed);

  if (asctime) {
    return buildUTCDate(
      asctime[6],
      asctime[1],
      asctime[2],
      asctime[3],
      asctime[4],
      asctime[5],
    );
  }

  return undefined;
}

/**
 * Builds a UTC instant from captured HTTP-date components.
 *
 * @param year - Four-digit year.
 * @param month - Three-letter English month abbreviation.
 * @param day - Day of month.
 * @param hour - Hour.
 * @param minute - Minute.
 * @param second - Second.
 * @returns The instant, or `undefined` if any component is out of range.
 */
function buildUTCDate(
  year: string | undefined,
  month: string | undefined,
  day: string | undefined,
  hour: string | undefined,
  minute: string | undefined,
  second: string | undefined,
): Date | undefined {
  const monthIndex = MONTH_NAMES.indexOf((month ?? "").toLowerCase());

  if (monthIndex === -1) {
    return undefined;
  }

  const numericYear = Number(year);

  const numericDay = Number((day ?? "").trim());

  const numericHour = Number(hour);

  const numericMinute = Number(minute);

  const numericSecond = Number(second);

  if (
    numericDay < 1 ||
    numericDay > 31 ||
    numericHour > 23 ||
    numericMinute > 59 ||
    numericSecond > 60
  ) {
    return undefined;
  }

  const timestamp = Date.UTC(
    numericYear,
    monthIndex,
    numericDay,
    numericHour,
    numericMinute,
    Math.min(numericSecond, 59),
  );

  const date = new Date(timestamp);

  if (date.getUTCDate() !== numericDay || date.getUTCMonth() !== monthIndex) {
    return undefined;
  }

  return date;
}

export function normalizeHTTPDate(value: Date | string): Date | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return undefined;
    }

    return new Date(value.getTime());
  }

  return parseHTTPDate(value);
}

export function formatHTTPDate(value: Date | string): string {
  const date = normalizeHTTPDate(value);

  if (!date) {
    throw new TypeError("Invalid HTTP date.");
  }

  return date.toUTCString();
}

/* -------------------------------------------------------------------------- */
/* If-Modified-Since                                                          */
/* -------------------------------------------------------------------------- */

export function isNotModifiedSince(
  lastModified: Date | string | undefined,
  ifModifiedSince: string | undefined,
): boolean {
  if (lastModified === undefined || ifModifiedSince === undefined) {
    return false;
  }

  const resourceDate = normalizeHTTPDate(lastModified);

  const conditionDate = parseHTTPDate(ifModifiedSince);

  if (!resourceDate || !conditionDate) {
    return false;
  }

  return (
    truncateToSeconds(resourceDate).getTime() <=
    truncateToSeconds(conditionDate).getTime()
  );
}

/* -------------------------------------------------------------------------- */
/* If-Unmodified-Since                                                        */
/* -------------------------------------------------------------------------- */

export function isModifiedSince(
  lastModified: Date | string | undefined,
  ifUnmodifiedSince: string | undefined,
): boolean {
  if (lastModified === undefined || ifUnmodifiedSince === undefined) {
    return false;
  }

  const resourceDate = normalizeHTTPDate(lastModified);

  const conditionDate = parseHTTPDate(ifUnmodifiedSince);

  if (!resourceDate || !conditionDate) {
    return false;
  }

  return (
    truncateToSeconds(resourceDate).getTime() >
    truncateToSeconds(conditionDate).getTime()
  );
}

/* -------------------------------------------------------------------------- */
/* If-Range                                                                   */
/* -------------------------------------------------------------------------- */

export function matchesIfRange(
  ifRange: string | undefined,
  resource: ConditionalResource | undefined,
): boolean {
  if (!ifRange || !resource) {
    return false;
  }

  const trimmed = ifRange.trim();

  const tag = parseEntityTag(trimmed);

  if (tag) {
    /*
     * If-Range requires a strong comparison for entity tags.
     */
    return strongETagMatch(tag, resource.etag);
  }

  const rangeDate = parseHTTPDate(trimmed);

  const resourceDate = resource.lastModified
    ? normalizeHTTPDate(resource.lastModified)
    : undefined;

  if (!rangeDate || !resourceDate) {
    return false;
  }

  return (
    truncateToSeconds(resourceDate).getTime() <=
    truncateToSeconds(rangeDate).getTime()
  );
}

/* -------------------------------------------------------------------------- */
/* If-Match                                                                   */
/* -------------------------------------------------------------------------- */

export function evaluateIfMatch(
  header: string | undefined,
  currentETag: string | EntityTag | undefined,
): boolean {
  if (header === undefined) {
    return true;
  }

  if (isWildcardETag(header)) {
    return currentETag !== undefined;
  }

  return matchesETagList(header, currentETag, true);
}

/* -------------------------------------------------------------------------- */
/* If-None-Match                                                              */
/* -------------------------------------------------------------------------- */

export function evaluateIfNoneMatch(
  header: string | undefined,
  currentETag: string | EntityTag | undefined,
): boolean {
  if (header === undefined) {
    return false;
  }

  return matchesETagList(header, currentETag, false);
}

/* -------------------------------------------------------------------------- */
/* Conditional Request Evaluation                                             */
/* -------------------------------------------------------------------------- */

/**
 * Evaluates every conditional request header in RFC 9110 section 13.2.2
 * precedence order.
 *
 * `If-Range` is evaluated last and reported through
 * {@link ConditionalResult.rangeApplicable}: when it is present and does not
 * match the current representation, the caller must ignore the `Range`
 * header and send the full 200 response.
 *
 * @param method - The request method.
 * @param headers - The conditional request headers.
 * @param resource - The current representation's validators.
 * @returns The evaluation outcome.
 */
export function evaluateConditionalRequest(
  method: string | undefined,
  headers: ConditionalHeaders,
  resource: ConditionalResource,
): ConditionalResult {
  const normalizedMethod = (method ?? "GET").trim().toUpperCase();

  /*
   * A Range may only be honoured when either no If-Range was sent or the
   * If-Range condition matches the current representation.
   */
  const rangeApplicable =
    headers.ifRange === undefined || matchesIfRange(headers.ifRange, resource);

  /*
   * If-Match takes precedence over If-Unmodified-Since.
   */
  if (
    headers.ifMatch !== undefined &&
    !evaluateIfMatch(headers.ifMatch, resource.etag)
  ) {
    return {
      matched: false,
      notModified: false,
      preconditionFailed: true,
      statusCode: PRECONDITION_FAILED_STATUS,
      rangeApplicable,
    };
  }

  /*
   * If-Unmodified-Since is only considered when If-Match is absent.
   */
  if (
    headers.ifMatch === undefined &&
    headers.ifUnmodifiedSince !== undefined &&
    isModifiedSince(resource.lastModified, headers.ifUnmodifiedSince)
  ) {
    return {
      matched: false,
      notModified: false,
      preconditionFailed: true,
      statusCode: PRECONDITION_FAILED_STATUS,
      rangeApplicable,
    };
  }

  /*
   * If-None-Match takes precedence over If-Modified-Since.
   */
  if (
    headers.ifNoneMatch !== undefined &&
    evaluateIfNoneMatch(headers.ifNoneMatch, resource.etag)
  ) {
    const safeMethod =
      normalizedMethod === "GET" || normalizedMethod === "HEAD";

    if (safeMethod) {
      return {
        matched: true,
        notModified: true,
        preconditionFailed: false,
        statusCode: NOT_MODIFIED_STATUS,
        rangeApplicable,
      };
    }

    return {
      matched: true,
      notModified: false,
      preconditionFailed: true,
      statusCode: PRECONDITION_FAILED_STATUS,
      rangeApplicable,
    };
  }

  if (
    headers.ifNoneMatch === undefined &&
    (normalizedMethod === "GET" || normalizedMethod === "HEAD") &&
    headers.ifModifiedSince !== undefined &&
    isNotModifiedSince(resource.lastModified, headers.ifModifiedSince)
  ) {
    return {
      matched: true,
      notModified: true,
      preconditionFailed: false,
      statusCode: NOT_MODIFIED_STATUS,
      rangeApplicable,
    };
  }

  return {
    matched: false,
    notModified: false,
    preconditionFailed: false,
    rangeApplicable,
  };
}

/**
 * Reports whether a `Range` header may be honoured for this request.
 *
 * @param headers - The conditional request headers.
 * @param resource - The current representation's validators.
 * @returns `false` when `If-Range` was sent and does not match.
 */
export function isRangeApplicable(
  headers: ConditionalHeaders,
  resource: ConditionalResource,
): boolean {
  return headers.ifRange === undefined
    ? true
    : matchesIfRange(headers.ifRange, resource);
}

/* -------------------------------------------------------------------------- */
/* Header Object Helpers                                                      */
/* -------------------------------------------------------------------------- */

export function extractConditionalHeaders(
  headers: Headers | Readonly<Record<string, string | undefined>>,
): ConditionalHeaders {
  return {
    ifMatch: getHeaderValue(headers, "if-match"),
    ifNoneMatch: getHeaderValue(headers, "if-none-match"),
    ifModifiedSince: getHeaderValue(headers, "if-modified-since"),
    ifUnmodifiedSince: getHeaderValue(headers, "if-unmodified-since"),
    ifRange: getHeaderValue(headers, "if-range"),
  };
}

/* -------------------------------------------------------------------------- */
/* Conditional Response Helpers                                               */
/* -------------------------------------------------------------------------- */

export function shouldReturnNotModified(
  method: string | undefined,
  resource: ConditionalResource,
  headers: ConditionalHeaders,
): boolean {
  return evaluateConditionalRequest(method, headers, resource).notModified;
}

export function shouldReturnPreconditionFailed(
  method: string | undefined,
  resource: ConditionalResource,
  headers: ConditionalHeaders,
): boolean {
  return evaluateConditionalRequest(method, headers, resource)
    .preconditionFailed;
}

/* -------------------------------------------------------------------------- */
/* ETag Generation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Number of hex characters kept from the SHA-256 digest (128 bits).
 */
const ETAG_DIGEST_LENGTH = 32;

/**
 * Generates an entity tag from a representation.
 *
 * The digest is SHA-256 truncated to 128 bits. A 32-bit non-cryptographic
 * hash is unusable here: a strong ETag asserts byte equality, and a 2^32
 * output space makes a colliding representation findable in roughly 2^16
 * trials, which is a cache-poisoning primitive.
 *
 * @param value - The representation to digest.
 * @param weak - Whether to emit a weak validator.
 * @returns The formatted entity tag.
 */
export function generateETag(value: string | Uint8Array, weak = false): string {
  const digest = createHash("sha256")
    .update(typeof value === "string" ? Buffer.from(value, "utf8") : value)
    .digest("hex")
    .slice(0, ETAG_DIGEST_LENGTH);

  return formatEntityTag(digest, weak);
}

/* -------------------------------------------------------------------------- */
/* Cache Validators                                                           */
/* -------------------------------------------------------------------------- */

export function createConditionalResource(
  options: ConditionalResource | undefined = {},
): ConditionalResource {
  return {
    etag: options.etag,
    lastModified: options.lastModified
      ? normalizeHTTPDate(options.lastModified)
      : undefined,
  };
}

export function isFresh(
  resource: ConditionalResource,
  headers: ConditionalHeaders,
): boolean {
  return evaluateConditionalRequest("GET", headers, resource).notModified;
}

/* -------------------------------------------------------------------------- */
/* Internal Helpers                                                           */
/* -------------------------------------------------------------------------- */

function normalizeEntityTag(
  value: EntityTag | string | undefined,
): EntityTag | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "object") {
    return value;
  }

  return parseEntityTag(value);
}

function truncateToSeconds(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1_000) * 1_000);
}

function splitCommaSeparated(value: string): string[] {
  const result: string[] = [];

  let current = "";
  let quoted = false;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (quoted && character === "\\") {
      current += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }

    if (character === "," && !quoted) {
      if (current.trim().length > 0) {
        result.push(current.trim());
      }

      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim().length > 0) {
    result.push(current.trim());
  }

  return result;
}

function getHeaderValue(
  headers: Headers | Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const key = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === name.toLowerCase(),
  );

  return key ? (headers as Record<string, string | undefined>)[key] : undefined;
}
