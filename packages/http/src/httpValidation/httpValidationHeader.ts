/**
 * HTTP header validation.
 *
 * These are thin, result-returning wrappers over the single hardened
 * definition of "valid header name/value" in `httpHeaders/security`. They
 * deliberately do not carry their own character classes: this module used to
 * check only CR/LF, which let every other C0 control and DEL through into
 * header values built by `httpProtocol` and `httpProxy`.
 */

import type {
  HTTPHeaderValidationResult,
  HTTPValidationResult,
} from "./httpValidationTypes.type.js";

import {
  containsForbiddenHeaderChars,
  isValidHeaderFieldName,
} from "../httpHeaders/security/index.js";

export function isValidHeaderName(
  name: string | undefined | null,
): name is string {
  if (name === undefined || name === null) {
    return false;
  }

  return isValidHeaderFieldName(name);
}

export function validateHeaderName(name: string): HTTPValidationResult {
  if (!isValidHeaderName(name)) {
    return {
      valid: false,
      reason: "Invalid HTTP header name.",
    };
  }

  return {
    valid: true,
    value: name.toLowerCase(),
  };
}

export function isValidHeaderValue(
  value: string | undefined | null,
): value is string {
  if (value === undefined || value === null) {
    return false;
  }

  /*
   * Rejects CR, LF, NUL, every other C0 control and DEL. Horizontal tab is
   * permitted by HTTP field-value rules.
   */
  return !containsForbiddenHeaderChars(value);
}

export function validateHeaderValue(value: string): HTTPValidationResult {
  if (!isValidHeaderValue(value)) {
    return {
      valid: false,
      reason:
        "Header value contains a control character that is invalid in an HTTP field value.",
    };
  }

  return {
    valid: true,
    value,
  };
}

export function validateHeader(
  name: string,
  value: string,
): HTTPHeaderValidationResult {
  const nameResult = validateHeaderName(name);

  if (!nameResult.valid) {
    return {
      valid: false,
      name,
      headerValue: value,
      reason: nameResult.reason,
    };
  }

  const valueResult = validateHeaderValue(value);

  if (!valueResult.valid) {
    return {
      valid: false,
      name: nameResult.value,
      headerValue: value,
      reason: valueResult.reason,
    };
  }

  return {
    valid: true,
    name: nameResult.value,
    headerValue: value,
    value: `${nameResult.value}: ${value}`,
  };
}
