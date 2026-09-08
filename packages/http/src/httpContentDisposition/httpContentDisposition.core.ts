/**
 * HTTP Content-Disposition utilities.
 *
 * Provides parsing and formatting helpers for Content-Disposition headers,
 * including attachment filenames and RFC 5987-style filename* parameters.
 */

import {
  containsForbiddenHeaderChars,
  escapeHeaderQuotedString,
} from "../httpHeaders/security/httpHeaders.security.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ContentDispositionType = "inline" | "attachment" | "form-data";

export interface ContentDispositionParameter {
  readonly name: string;
  readonly value: string;
  readonly extended: boolean;
}

export interface ContentDisposition {
  readonly type: ContentDispositionType | string;
  readonly parameters: readonly ContentDispositionParameter[];
}

export interface ContentDispositionOptions {
  readonly type?: ContentDispositionType | string;
  readonly filename?: string;
  readonly filenameStar?: string;
  readonly name?: string;
  readonly parameters?: Readonly<Record<string, string>>;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const CONTENT_DISPOSITION_HEADER = "Content-Disposition";

export const DEFAULT_DISPOSITION_TYPE = "inline";

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

export function parseContentDisposition(
  value: string | undefined | null,
): ContentDisposition | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const parts = splitParameters(value);

  if (parts.length === 0) {
    return undefined;
  }

  const type = parts[0]?.trim().toLowerCase();

  if (!type) {
    return undefined;
  }

  const parameters: ContentDispositionParameter[] = [];

  for (let index = 1; index < parts.length; index += 1) {
    const parameter = parseParameter(parts[index]);

    if (parameter) {
      parameters.push(parameter);
    }
  }

  return {
    type,
    parameters,
  };
}

export function parseContentDispositionParameter(
  value: string,
): ContentDispositionParameter | undefined {
  return parseParameter(value);
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function formatContentDisposition(
  options: ContentDispositionOptions,
): string {
  const type = normalizeDispositionType(
    options.type ?? DEFAULT_DISPOSITION_TYPE,
  );

  const parts: string[] = [type];

  if (options.name !== undefined) {
    parts.push(`name=${formatParameterValue(options.name)}`);
  }

  if (options.filename !== undefined) {
    parts.push(`filename=${formatFilename(options.filename)}`);
  }

  if (options.filenameStar !== undefined) {
    parts.push(`filename*=${formatRFC5987Value(options.filenameStar)}`);
  }

  for (const [name, parameterValue] of Object.entries(
    options.parameters ?? {},
  )) {
    if (isReservedParameter(name)) {
      continue;
    }

    parts.push(
      `${normalizeParameterName(name)}=${formatParameterValue(parameterValue)}`,
    );
  }

  return parts.join("; ");
}

export function formatContentDispositionHeader(
  type: ContentDispositionType | string,
  parameters: Readonly<Record<string, string>> = {},
): string {
  return formatContentDisposition({
    type,
    parameters,
  });
}

/* -------------------------------------------------------------------------- */
/* Filename Helpers                                                           */
/* -------------------------------------------------------------------------- */

export function getFilename(
  disposition: ContentDisposition | string | undefined | null,
): string | undefined {
  const parsed = normalizeDisposition(disposition);

  if (!parsed) {
    return undefined;
  }

  const raw = getRawFilename(parsed);

  if (raw === undefined) {
    return undefined;
  }

  return sanitizeFilename(raw);
}

/**
 * Reads the filename exactly as it appeared on the wire.
 *
 * @remarks
 * The result is **untrusted**: it may contain path separators, `..` or a
 * drive prefix, because `filename*` percent-decoding can reconstruct a
 * traversal path that no textual filter on the raw header would catch. Use
 * {@link getFilename} unless you specifically need the wire value, and never
 * join this result to a directory without sanitising it.
 *
 * @param disposition - The parsed or raw Content-Disposition.
 * @returns The undecorated filename, or `undefined`.
 */
export function getRawFilename(
  disposition: ContentDisposition | string | undefined | null,
): string | undefined {
  const parsed = normalizeDisposition(disposition);

  if (!parsed) {
    return undefined;
  }

  /*
   * filename* is preferred because it supports Unicode.
   */
  const extended = getParameter(parsed, "filename*");

  if (extended !== undefined) {
    const decoded = decodeRFC5987Value(extended);

    if (decoded !== undefined) {
      return decoded;
    }
  }

  return getParameter(parsed, "filename");
}

export function getFilenameStar(
  disposition: ContentDisposition | string | undefined | null,
): string | undefined {
  const parsed = normalizeDisposition(disposition);

  if (!parsed) {
    return undefined;
  }

  const value = getParameter(parsed, "filename*");

  if (value === undefined) {
    return undefined;
  }

  return decodeRFC5987Value(value) ?? value;
}

export function getFormDataName(
  disposition: ContentDisposition | string | undefined | null,
): string | undefined {
  const parsed = normalizeDisposition(disposition);

  if (!parsed) {
    return undefined;
  }

  return getParameter(parsed, "name");
}

export function isAttachment(
  disposition: ContentDisposition | string | undefined | null,
): boolean {
  return getDispositionType(disposition) === "attachment";
}

export function isInline(
  disposition: ContentDisposition | string | undefined | null,
): boolean {
  return getDispositionType(disposition) === "inline";
}

export function isFormData(
  disposition: ContentDisposition | string | undefined | null,
): boolean {
  return getDispositionType(disposition) === "form-data";
}

/* -------------------------------------------------------------------------- */
/* Disposition Type                                                            */
/* -------------------------------------------------------------------------- */

export function getDispositionType(
  disposition: ContentDisposition | string | undefined | null,
): string | undefined {
  const parsed = normalizeDisposition(disposition);

  return parsed?.type;
}

export function isValidDispositionType(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized === "inline" ||
    normalized === "attachment" ||
    normalized === "form-data"
  );
}

/* -------------------------------------------------------------------------- */
/* Parameter Access                                                            */
/* -------------------------------------------------------------------------- */

export function getParameter(
  disposition: ContentDisposition,
  name: string,
): string | undefined {
  const normalized = name.trim().toLowerCase();

  const parameter = disposition.parameters.find(
    (item) => item.name.toLowerCase() === normalized,
  );

  return parameter?.value;
}

export function hasParameter(
  disposition: ContentDisposition,
  name: string,
): boolean {
  return getParameter(disposition, name) !== undefined;
}

export function getParameters(
  disposition: ContentDisposition,
): Readonly<Record<string, string>> {
  const result = Object.create(null) as Record<string, string>;

  for (const parameter of disposition.parameters) {
    result[parameter.name] = parameter.value;
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* RFC 5987 / RFC 8187                                                        */
/* -------------------------------------------------------------------------- */

export function formatRFC5987Value(
  value: string,
  charset = "UTF-8",
  language = "",
): string {
  const encoded = encodeRFC5987(value);

  return `${charset}'${language}'${encoded}`;
}

export function decodeRFC5987Value(value: string): string | undefined {
  const trimmed = value.trim();

  const firstQuote = trimmed.indexOf("'");

  if (firstQuote === -1) {
    return undefined;
  }

  const secondQuote = trimmed.indexOf("'", firstQuote + 1);

  if (secondQuote === -1) {
    return undefined;
  }

  const charset = trimmed.slice(0, firstQuote).trim().toLowerCase();

  const encoded = trimmed.slice(secondQuote + 1);

  if (charset !== "utf-8" && charset !== "us-ascii") {
    return undefined;
  }

  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

export function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Filename Formatting                                                        */
/* -------------------------------------------------------------------------- */

export function formatFilename(filename: string): string {
  const sanitized = sanitizeFilename(filename);

  /*
   * Use a quoted-string for the traditional filename parameter.
   */
  return `"${escapeQuotedString(sanitized)}"`;
}

/**
 * Maximum filename length in bytes, matching the common `NAME_MAX`.
 */
const MAX_FILENAME_BYTES = 255;

/**
 * Reduces a filename to a safe, path-free basename.
 *
 * Strips control characters, replaces path separators, neutralises the
 * relative names `.` and `..`, removes a Windows drive-relative prefix, and
 * truncates to `NAME_MAX` bytes.
 *
 * @param filename - The untrusted filename.
 * @returns A filename that is safe to join to a directory.
 */
export function sanitizeFilename(filename: string): string {
  const stripped = filename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^[A-Za-z]:/, "")
    .replace(/[/\\]/g, "_")
    .trim();

  if (stripped.length === 0 || stripped === "." || stripped === "..") {
    return "_";
  }

  return truncateFilename(stripped);
}

/**
 * Truncates a filename to {@link MAX_FILENAME_BYTES} bytes without splitting
 * a UTF-8 sequence.
 *
 * @param value - The filename to truncate.
 * @returns The possibly-truncated filename.
 */
function truncateFilename(value: string): string {
  const encoded = Buffer.from(value, "utf8");

  if (encoded.length <= MAX_FILENAME_BYTES) {
    return value;
  }

  return new TextDecoder("utf-8", { fatal: false })
    .decode(encoded.subarray(0, MAX_FILENAME_BYTES))
    .replace(/\ufffd+$/, "");
}

/**
 * Escapes a value for emission inside a `quoted-string`.
 *
 * Delegates to `httpHeaders/security`, so CR, LF, NUL and every other C0/DEL
 * control character are rejected rather than passed through — a
 * `quoted-string` has no escape for them, and letting them through is
 * response splitting.
 *
 * @param value - The raw value.
 * @returns The escaped value without surrounding quotes.
 * @throws {TypeError} If the value contains a forbidden control character.
 */
export function escapeQuotedString(value: string): string {
  return escapeHeaderQuotedString(value);
}

/* -------------------------------------------------------------------------- */
/* Safe Download Header                                                       */
/* -------------------------------------------------------------------------- */

export function createAttachmentDisposition(filename: string): string {
  const sanitized = sanitizeFilename(filename);

  const fallback = createASCIIFilename(sanitized);

  const parts = ["attachment", `filename=${formatFilename(fallback)}`];

  if (sanitized !== fallback) {
    parts.push(`filename*=${formatRFC5987Value(sanitized)}`);
  }

  return parts.join("; ");
}

export function createInlineDisposition(filename: string | undefined): string {
  if (filename === undefined || filename.length === 0) {
    return "inline";
  }

  const sanitized = sanitizeFilename(filename);

  const fallback = createASCIIFilename(sanitized);

  const parts = ["inline", `filename=${formatFilename(fallback)}`];

  if (sanitized !== fallback) {
    parts.push(`filename*=${formatRFC5987Value(sanitized)}`);
  }

  return parts.join("; ");
}

/* -------------------------------------------------------------------------- */
/* Multipart Helpers                                                          */
/* -------------------------------------------------------------------------- */

export function createFormDataDisposition(
  name: string,
  filename: string | undefined,
): string {
  const parts = ["form-data", `name=${formatParameterValue(name)}`];

  if (filename !== undefined) {
    parts.push(`filename=${formatFilename(filename)}`);
  }

  return parts.join("; ");
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export function validateContentDisposition(
  disposition: ContentDisposition | string,
): boolean {
  const parsed = normalizeDisposition(disposition);

  if (!parsed) {
    return false;
  }

  if (parsed.type.length === 0 || !isToken(parsed.type)) {
    return false;
  }

  const seen = new Set<string>();

  for (const parameter of parsed.parameters) {
    const name = parameter.name.trim().toLowerCase();

    if (name.length === 0 || seen.has(name)) {
      return false;
    }

    if (containsForbiddenHeaderChars(parameter.value)) {
      return false;
    }

    seen.add(name);
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* Internal Helpers                                                           */
/* -------------------------------------------------------------------------- */

function normalizeDisposition(
  value: ContentDisposition | string | undefined | null,
): ContentDisposition | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return parseContentDisposition(value);
  }

  return value;
}

function normalizeDispositionType(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    throw new TypeError("Content-Disposition type cannot be empty.");
  }

  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(normalized)) {
    throw new TypeError("Invalid Content-Disposition type.");
  }

  return normalized;
}

function normalizeParameterName(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    throw new TypeError("Content-Disposition parameter name cannot be empty.");
  }

  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z*]+$/.test(normalized)) {
    throw new TypeError(`Invalid Content-Disposition parameter name: ${value}`);
  }

  return normalized;
}

function formatParameterValue(value: string): string {
  if (isToken(value)) {
    return value;
  }

  return `"${escapeQuotedString(value)}"`;
}

function isToken(value: string): boolean {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value);
}

function parseParameter(
  value: string | undefined,
): ContentDispositionParameter | undefined {
  if (!value) {
    return undefined;
  }

  const separator = value.indexOf("=");

  if (separator === -1) {
    return undefined;
  }

  const rawName = value.slice(0, separator).trim();

  const rawValue = value.slice(separator + 1).trim();

  if (rawName.length === 0) {
    return undefined;
  }

  const extended = rawName.endsWith("*");

  const name = rawName.toLowerCase();

  const decoded = unquote(rawValue);

  return {
    name,
    value: decoded,
    extended,
  };
}

function splitParameters(value: string): string[] {
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

    if (character === ";" && !quoted) {
      result.push(current.trim());
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

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  return value;
}

function isReservedParameter(name: string): boolean {
  const normalized = name.trim().toLowerCase();

  return (
    normalized === "name" ||
    normalized === "filename" ||
    normalized === "filename*"
  );
}

function createASCIIFilename(filename: string): string {
  const ascii = filename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[/\\]/g, "_")
    .trim();

  return ascii || "download";
}
