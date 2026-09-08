/**
 * HTTP Content-Type formatting and creation.
 */

import type { ContentType } from "./httpContentType.type.js";
import {
  isValidToken,
  quoteParameterValue,
} from "./httpContentType.parserHelpers.js";

export function formatContentType(contentType: ContentType): string {
  const mediaType = `${contentType.type}/${contentType.subtype}`;

  const parameters = Object.entries(contentType.parameters);

  if (parameters.length === 0) {
    return mediaType;
  }

  const formatted: string[] = [mediaType];

  for (const [name, value] of parameters) {
    const normalizedName = name.trim().toLowerCase();

    if (!isValidToken(normalizedName)) {
      throw new TypeError(`Invalid content type parameter name: ${name}`);
    }

    formatted.push(`${normalizedName}=${quoteParameterValue(value)}`);
  }

  return formatted.join("; ");
}

export function createContentType(
  type: string,
  subtype: string,
  parameters: Record<string, string> = {},
): ContentType {
  const normalizedType = type.trim().toLowerCase();

  const normalizedSubtype = subtype.trim().toLowerCase();

  if (!isValidToken(normalizedType)) {
    throw new TypeError(`Invalid media type: ${type}`);
  }

  if (!isValidToken(normalizedSubtype)) {
    throw new TypeError(`Invalid media subtype: ${subtype}`);
  }

  const normalizedParameters = Object.create(null) as Record<string, string>;

  for (const [name, value] of Object.entries(parameters)) {
    const normalizedName = name.trim().toLowerCase();

    if (!isValidToken(normalizedName)) {
      throw new TypeError(`Invalid content type parameter: ${name}`);
    }

    normalizedParameters[normalizedName] = String(value);
  }

  return {
    type: normalizedType,
    subtype: normalizedSubtype,
    parameters: normalizedParameters,
  };
}
