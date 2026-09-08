/**
 * HTTP Content-Type parser.
 */

import type { ContentType } from "./httpContentType.type.js";
import {
  splitParameters,
  parseParameter,
  isValidToken,
} from "./httpContentType.parserHelpers.js";

export function parseContentType(
  value: string | undefined | null,
): ContentType | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const input = value.trim();

  if (input.length === 0) {
    return undefined;
  }

  const parts = splitParameters(input);

  const mediaType = parts.shift();

  if (!mediaType) {
    return undefined;
  }

  const separator = mediaType.indexOf("/");

  if (separator <= 0 || separator === mediaType.length - 1) {
    return undefined;
  }

  const type = mediaType.slice(0, separator).trim().toLowerCase();

  const subtype = mediaType
    .slice(separator + 1)
    .trim()
    .toLowerCase();

  if (!isValidToken(type) || !isValidToken(subtype)) {
    return undefined;
  }

  const parameters = Object.create(null) as Record<string, string>;

  for (const parameter of parts) {
    const parsed = parseParameter(parameter);

    if (!parsed) {
      continue;
    }

    parameters[parsed.name] = parsed.value;
  }

  return {
    type,
    subtype,
    parameters,
  };
}
