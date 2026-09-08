/**
 * HTTP content negotiation utilities.
 *
 * Implements parsing and matching for common HTTP negotiation headers:
 *
 *   Accept
 *   Accept-Encoding
 *   Accept-Language
 *   Accept-Charset
 *
 * The implementation intentionally keeps the API framework agnostic so it can
 * be used by both the HTTP server and HTTP client layers.
 */

import { escapeHeaderQuotedString } from "../httpHeaders/security/httpHeaders.security.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface NegotiationPreference {
  readonly value: string;
  readonly quality: number;
  readonly parameters: Readonly<Record<string, string>>;
  readonly specificity: number;
  readonly order: number;
}

export interface NegotiationMatch<T = string> {
  readonly value: T;
  readonly preference: NegotiationPreference;
  readonly score: number;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_NEGOTIATION_QUALITY = 1;

export const MIN_NEGOTIATION_QUALITY = 0;

export const MAX_NEGOTIATION_QUALITY = 1;

/* -------------------------------------------------------------------------- */
/* Generic Parsing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Maximum number of alternatives parsed from one negotiation header.
 *
 * An `Accept` header costs the attacker nothing to send and every entry is
 * parsed character by character and then sorted, so the list length has to be
 * bounded.
 */
export const MAX_NEGOTIATION_ENTRIES = 64;

/**
 * Parses a negotiation header into its preferences.
 *
 * The list split honours `quoted-string`, so a comma inside a quoted
 * parameter (`profile="a,b"`) no longer tears one preference into three.
 *
 * @param header - The raw header value.
 * @returns The preferences, sorted by quality then specificity.
 */
export function parseNegotiationHeader(
  header: string | undefined | null,
): NegotiationPreference[] {
  if (header === undefined || header === null || header.trim().length === 0) {
    return [];
  }

  return splitOutsideQuotes(header, ",")
    .slice(0, MAX_NEGOTIATION_ENTRIES)
    .map((part, index) => parsePreference(part, index))
    .filter((preference) => preference.value.length > 0)
    .sort(comparePreferences);
}

/**
 * Reports whether a negotiation header was sent with an empty value.
 *
 * RFC 9110 section 12.5.3: an empty `Accept-Encoding` means the client wants
 * no content coding at all, which is a different statement from omitting the
 * header.
 *
 * @param header - The raw header value.
 * @returns `true` if the header is present but empty.
 */
export function isEmptyNegotiationHeader(
  header: string | undefined | null,
): boolean {
  return header !== undefined && header !== null && header.trim().length === 0;
}

export function parsePreference(
  value: string,
  order = 0,
): NegotiationPreference {
  const parts = splitParameters(value);

  const token = parts.shift()?.trim() ?? "";

  const parameters = Object.create(null) as Record<string, string>;

  let quality = DEFAULT_NEGOTIATION_QUALITY;

  for (const parameter of parts) {
    const separator = parameter.indexOf("=");

    if (separator === -1) {
      const key = parameter.trim().toLowerCase();

      if (key.length > 0) {
        parameters[key] = "";
      }

      continue;
    }

    const key = parameter.slice(0, separator).trim().toLowerCase();

    const rawValue = parameter.slice(separator + 1).trim();

    const parsedValue = unquote(rawValue);

    if (key === "q") {
      quality = parseQuality(parsedValue);
      continue;
    }

    if (key.length > 0) {
      parameters[key] = parsedValue;
    }
  }

  return {
    value: unquote(token),
    quality,
    parameters,
    specificity: calculateSpecificity(token, parameters),
    order,
  };
}

/* -------------------------------------------------------------------------- */
/* Quality                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * RFC 9110 section 12.4.2 `qvalue`.
 */
const QVALUE_PATTERN = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

/**
 * Parses a `q` parameter value.
 *
 * A weight that does not match the `qvalue` grammar is treated as
 * unacceptable (`0`) rather than as the default `1`; otherwise a garbage
 * weight makes an alternative *maximally* preferred, which lets a client
 * steer negotiation deterministically.
 *
 * @param value - The raw weight.
 * @returns The quality in `[0, 1]`.
 */
export function parseQuality(value: string): number {
  const normalized = value.trim();

  if (!QVALUE_PATTERN.test(normalized)) {
    return 0;
  }

  return clamp(
    Number(normalized),
    MIN_NEGOTIATION_QUALITY,
    MAX_NEGOTIATION_QUALITY,
  );
}

export function formatQuality(quality: number): string {
  const normalized = clamp(
    quality,
    MIN_NEGOTIATION_QUALITY,
    MAX_NEGOTIATION_QUALITY,
  );

  if (normalized === 1) {
    return "1";
  }

  if (normalized === 0) {
    return "0";
  }

  return normalized.toFixed(3).replace(/\.?0+$/, "");
}

export function isAcceptableQuality(quality: number): boolean {
  return Number.isFinite(quality) && quality > 0;
}

/* -------------------------------------------------------------------------- */
/* Preference Sorting                                                          */
/* -------------------------------------------------------------------------- */

export function comparePreferences(
  left: NegotiationPreference,
  right: NegotiationPreference,
): number {
  if (left.quality !== right.quality) {
    return right.quality - left.quality;
  }

  if (left.specificity !== right.specificity) {
    return right.specificity - left.specificity;
  }

  return left.order - right.order;
}

export function sortPreferences(
  preferences: readonly NegotiationPreference[],
): NegotiationPreference[] {
  return [...preferences].sort(comparePreferences);
}

/* -------------------------------------------------------------------------- */
/* Accept                                                                     */
/* -------------------------------------------------------------------------- */

export function parseAccept(
  header: string | undefined | null,
): NegotiationPreference[] {
  return parseNegotiationHeader(header);
}

export function matchesAccept(accepted: string, available: string): boolean {
  const left = normalizeMediaType(accepted);

  const right = normalizeMediaType(available);

  if (left === right) {
    return true;
  }

  const leftParts = splitMediaType(left);

  const rightParts = splitMediaType(right);

  if (!leftParts || !rightParts) {
    return false;
  }

  const [leftType, leftSubtype] = leftParts;

  const [rightType, rightSubtype] = rightParts;

  if (leftType === "*" && leftSubtype === "*") {
    return true;
  }

  if (leftType !== "*" && leftType !== rightType) {
    return false;
  }

  if (leftSubtype === "*") {
    return true;
  }

  if (leftSubtype === rightSubtype) {
    return true;
  }

  /*
   * Structured syntax suffix wildcard:
   *
   * application/*+json
   */
  if (leftSubtype.startsWith("*+")) {
    return rightSubtype.endsWith(leftSubtype.slice(1));
  }

  return false;
}

export function negotiateAccept(
  header: string | undefined | null,
  available: readonly string[],
): string | undefined {
  return negotiate(parseAccept(header), available, matchesAccept);
}

/* -------------------------------------------------------------------------- */
/* Accept-Encoding                                                            */
/* -------------------------------------------------------------------------- */

export function parseAcceptEncoding(
  header: string | undefined | null,
): NegotiationPreference[] {
  return parseNegotiationHeader(header);
}

export function matchesEncoding(accepted: string, available: string): boolean {
  const left = normalizeToken(accepted);

  const right = normalizeToken(available);

  return left === "*" || left === right;
}

export function negotiateEncoding(
  header: string | undefined | null,
  available: readonly string[],
): string | undefined {
  if (isEmptyNegotiationHeader(header)) {
    /*
     * RFC 9110 section 12.5.3: an empty Accept-Encoding means no content
     * coding is acceptable, so only identity may be served.
     */
    return available.find((value) => isIdentityEncoding(value));
  }

  const preferences = parseAcceptEncoding(header);

  if (preferences.length === 0) {
    return available[0];
  }

  return negotiate(preferences, available, matchesEncoding);
}

export function getEncodingQuality(
  header: string | undefined | null,
  encoding: string,
): number {
  const preferences = parseAcceptEncoding(header);

  if (preferences.length === 0) {
    return 1;
  }

  return getPreferenceQuality(preferences, encoding, matchesEncoding);
}

/* -------------------------------------------------------------------------- */
/* Accept-Language                                                            */
/* -------------------------------------------------------------------------- */

export function parseAcceptLanguage(
  header: string | undefined | null,
): NegotiationPreference[] {
  return parseNegotiationHeader(header);
}

export function matchesLanguage(accepted: string, available: string): boolean {
  const left = normalizeLanguageTag(accepted);

  const right = normalizeLanguageTag(available);

  if (left === "*" || left === right) {
    return true;
  }

  /*
   * RFC-style basic language range matching:
   *
   * en matches en-US
   * en-US matches en-US
   * en-US does not match en-GB
   */
  return right.startsWith(`${left}-`);
}

export function negotiateLanguage(
  header: string | undefined | null,
  available: readonly string[],
): string | undefined {
  return negotiate(parseAcceptLanguage(header), available, matchesLanguage);
}

export function getLanguageQuality(
  header: string | undefined | null,
  language: string,
): number {
  const preferences = parseAcceptLanguage(header);

  if (preferences.length === 0) {
    return 1;
  }

  return getPreferenceQuality(preferences, language, matchesLanguage);
}

/* -------------------------------------------------------------------------- */
/* Accept-Charset                                                             */
/* -------------------------------------------------------------------------- */

export function parseAcceptCharset(
  header: string | undefined | null,
): NegotiationPreference[] {
  return parseNegotiationHeader(header);
}

export function matchesCharset(accepted: string, available: string): boolean {
  const left = normalizeToken(accepted);

  const right = normalizeToken(available);

  return left === "*" || left === right;
}

export function negotiateCharset(
  header: string | undefined | null,
  available: readonly string[],
): string | undefined {
  return negotiate(parseAcceptCharset(header), available, matchesCharset);
}

/* -------------------------------------------------------------------------- */
/* Generic Negotiation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Selects the best available alternative for a preference list.
 *
 * A `q=0` preference is an **exclusion**, not merely a skipped entry:
 * RFC 9110 section 12.4.2 requires a more specific `q=0` to override a
 * broader wildcard, so `*\/*, text/html;q=0` must not yield `text/html`.
 *
 * @param preferences - The parsed preferences.
 * @param available - The alternatives the server can produce.
 * @param matcher - Matches a preference value against an alternative.
 * @returns The selected alternative, or `undefined` if none is acceptable.
 */
export function negotiate<T>(
  preferences: readonly NegotiationPreference[],
  available: readonly T[],
  matcher: (accepted: string, available: T) => boolean,
): T | undefined {
  if (available.length === 0) {
    return undefined;
  }

  const sorted = sortPreferences(preferences);

  const rejections = sorted.filter(
    (preference) => !isAcceptableQuality(preference.quality),
  );

  for (const preference of sorted) {
    if (!isAcceptableQuality(preference.quality)) {
      continue;
    }

    for (const candidate of available) {
      if (!matcher(preference.value, candidate)) {
        continue;
      }

      if (isExcluded(candidate, preference, rejections, matcher)) {
        continue;
      }

      return candidate;
    }
  }

  return undefined;
}

/**
 * Reports whether a `q=0` preference at least as specific as the selecting
 * one rejects this candidate.
 *
 * @param candidate - The alternative under consideration.
 * @param selected - The preference that would select it.
 * @param rejections - Every `q=0` preference from the same header.
 * @param matcher - Matches a preference value against an alternative.
 * @returns `true` if the candidate is excluded.
 */
function isExcluded<T>(
  candidate: T,
  selected: NegotiationPreference,
  rejections: readonly NegotiationPreference[],
  matcher: (accepted: string, available: T) => boolean,
): boolean {
  return rejections.some(
    (rejection) =>
      rejection.specificity >= selected.specificity &&
      matcher(rejection.value, candidate),
  );
}

export function getPreferenceQuality<T>(
  preferences: readonly NegotiationPreference[],
  value: T,
  matcher: (accepted: string, available: T) => boolean,
): number {
  let best: NegotiationPreference | undefined;

  for (const preference of preferences) {
    if (matcher(preference.value, value)) {
      if (
        !best ||
        preference.quality > best.quality ||
        (preference.quality === best.quality &&
          preference.specificity > best.specificity)
      ) {
        best = preference;
      }
    }
  }

  return best?.quality ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Media Type Helpers                                                         */
/* -------------------------------------------------------------------------- */

export function normalizeMediaType(value: string): string {
  return (value.trim().split(";", 1)[0] ?? "").trim().toLowerCase();
}

export function splitMediaType(value: string): [string, string] | undefined {
  const normalized = normalizeMediaType(value);

  const separator = normalized.indexOf("/");

  if (separator <= 0 || separator === normalized.length - 1) {
    return undefined;
  }

  return [normalized.slice(0, separator), normalized.slice(separator + 1)];
}

export function mediaTypeSpecificity(value: string): number {
  const parts = splitMediaType(value);

  if (!parts) {
    return 0;
  }

  const [type, subtype] = parts;

  if (type === "*" && subtype === "*") {
    return 0;
  }

  if (subtype === "*") {
    return 1;
  }

  if (subtype.startsWith("*+")) {
    return 2;
  }

  return 3;
}

/* -------------------------------------------------------------------------- */
/* Language Helpers                                                           */
/* -------------------------------------------------------------------------- */

export function normalizeLanguageTag(value: string): string {
  return value.trim().replace(/_/g, "-").toLowerCase();
}

export function languageSpecificity(value: string): number {
  const normalized = normalizeLanguageTag(value);

  if (normalized === "*") {
    return 0;
  }

  return normalized.split("-").filter(Boolean).length;
}

/* -------------------------------------------------------------------------- */
/* Encoding Helpers                                                           */
/* -------------------------------------------------------------------------- */

export function normalizeEncoding(value: string): string {
  return normalizeToken(value);
}

export function isIdentityEncoding(value: string): boolean {
  return normalizeEncoding(value) === "identity";
}

export function isWildcardEncoding(value: string): boolean {
  return normalizeEncoding(value) === "*";
}

/* -------------------------------------------------------------------------- */
/* Preference Construction                                                    */
/* -------------------------------------------------------------------------- */

export function createPreference(
  value: string,
  options: {
    readonly quality?: number;
    readonly parameters?: Readonly<Record<string, string>>;
    readonly order?: number;
    readonly specificity?: number;
  } = {},
): NegotiationPreference {
  const parameters = options.parameters ?? {};

  return {
    value: value.trim(),
    quality: options.quality ?? DEFAULT_NEGOTIATION_QUALITY,
    parameters,
    specificity: options.specificity ?? calculateSpecificity(value, parameters),
    order: options.order ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Header Formatting                                                          */
/* -------------------------------------------------------------------------- */

export function formatNegotiationPreferences(
  preferences: readonly NegotiationPreference[],
): string {
  return preferences.map(formatPreference).join(", ");
}

export function formatPreference(preference: NegotiationPreference): string {
  const parameters = Object.entries(preference.parameters).map(
    ([key, value]) => `${key}=${quoteIfNeeded(value)}`,
  );

  if (preference.quality !== DEFAULT_NEGOTIATION_QUALITY) {
    parameters.push(`q=${formatQuality(preference.quality)}`);
  }

  return [preference.value, ...parameters].join("; ");
}

/* -------------------------------------------------------------------------- */
/* Internal Helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Scores how specific a preference value is.
 *
 * Only a media type (which contains `/`) gets media-type scoring. A bare
 * token is scored as a plain token even when it contains a hyphen: sniffing
 * "is this a language tag?" from a hyphen ranks `x-gzip` above `gzip` and
 * `iso-8859-1` above `utf-8` at equal weight.
 *
 * @param value - The preference value.
 * @param parameters - The preference's parameters.
 * @returns The specificity score.
 */
function calculateSpecificity(
  value: string,
  parameters: Readonly<Record<string, string>>,
): number {
  const normalized = value.trim().toLowerCase();

  const parameterCount = Object.keys(parameters).length;

  if (normalized.includes("/")) {
    return mediaTypeSpecificity(normalized) + parameterCount;
  }

  return (normalized === "*" ? 0 : 1) + parameterCount;
}

/**
 * Splits a header value on a delimiter, ignoring delimiters inside a
 * `quoted-string`.
 *
 * A backslash escape is honoured only inside quotes, per RFC 9110
 * section 5.6.6 — outside a `quoted-string` a backslash is an ordinary
 * character.
 *
 * @param value - The raw header value.
 * @param delimiter - The single-character delimiter.
 * @returns The split fragments, with quotes preserved.
 */
function splitOutsideQuotes(value: string, delimiter: string): string[] {
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

    if (character === delimiter && !quoted) {
      result.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  result.push(current);

  return result;
}

/**
 * Splits a preference into its token and parameters.
 *
 * @param value - One preference fragment.
 * @returns The token followed by each parameter.
 */
function splitParameters(value: string): string[] {
  return splitOutsideQuotes(value, ";");
}

function unquote(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  return trimmed;
}

/**
 * Emits a parameter value as a token or a `quoted-string`.
 *
 * @param value - The raw value.
 * @returns The token or quoted-string form.
 * @throws {TypeError} If the value contains a forbidden control character.
 */
function quoteIfNeeded(value: string): string {
  if (/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)) {
    return value;
  }

  return `"${escapeHeaderQuotedString(value)}"`;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
