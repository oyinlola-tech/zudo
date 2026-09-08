/**
 * HTTP Content-Type charset parameter helpers.
 */

import type { ContentType } from "./httpContentType.type.js";
import { parseContentType } from "./httpContentType.parser.js";
import { formatContentType } from "./httpContentType.formatter.js";
import { isValidToken } from "./httpContentType.parserHelpers.js";

export function getCharset(
  value: string | ContentType | undefined | null,
): string | undefined {
  const parsed = typeof value === "string" ? parseContentType(value) : value;

  return parsed?.parameters.charset;
}

export function hasCharset(
  value: string | ContentType | undefined | null,
): boolean {
  return getCharset(value) !== undefined;
}

export function withCharset(
  value: string | ContentType,
  charset: string,
): string {
  const parsed = typeof value === "string" ? parseContentType(value) : value;

  if (!parsed) {
    throw new TypeError("Invalid content type.");
  }

  const normalizedCharset = charset.trim().toLowerCase();

  /*
   * A charset is a token per RFC 9110 section 8.3.2; rejecting anything else
   * here is what stops an interior CR/LF from reaching the response header.
   */
  if (!isValidToken(normalizedCharset)) {
    throw new TypeError(`Invalid charset: ${JSON.stringify(charset)}`);
  }

  const parameters = {
    ...parsed.parameters,
    charset: normalizedCharset,
  };

  return formatContentType({
    ...parsed,
    parameters,
  });
}
