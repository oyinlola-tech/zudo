/**
 * HTTP Content-Type validation.
 *
 * Validates media-type syntax (type/subtype) per RFC 7231.
 */

import type { HTTPValidationResult } from "./httpValidationTypes.type.js";
import { isHTTPToken } from "./httpValidationToken.js";

export function isValidContentType(value: string | undefined | null): boolean {
  if (value === undefined || value === null || value.trim().length === 0) {
    return false;
  }

  const mediaType = (value.split(";", 1)[0] ?? "").trim();

  const separator = mediaType.indexOf("/");

  if (separator <= 0 || separator === mediaType.length - 1) {
    return false;
  }

  const type = mediaType.slice(0, separator);

  const subtype = mediaType.slice(separator + 1);

  return isHTTPToken(type) && isHTTPToken(subtype);
}

export function validateContentType(value: string): HTTPValidationResult {
  if (!isValidContentType(value)) {
    return {
      valid: false,
      reason: "Invalid Content-Type value.",
    };
  }

  return {
    valid: true,
    value: value.trim(),
  };
}
