/**
 * HTTP Content-Type matching utilities.
 */

import type {
  ContentType,
  ContentTypeMatchOptions,
} from "./httpContentType.type.js";
import { parseContentType } from "./httpContentType.parser.js";

/**
 * Matches one media-type token against a pattern token.
 *
 * The wildcard is only meaningful in `expected` — the pattern. A wildcard in
 * `actual` comes from the observed (untrusted) header, and honouring it would
 * let `Content-Type: * /*` satisfy every content-type guard at once.
 *
 * @param actual - The observed token.
 * @param expected - The pattern token.
 * @param allowWildcard - Whether `*` in the pattern matches anything.
 * @returns `true` if the observed token matches the pattern.
 */
function matchesToken(
  actual: string,
  expected: string,
  allowWildcard: boolean,
): boolean {
  if (actual === expected) {
    return true;
  }

  if (!allowWildcard) {
    return false;
  }

  return expected === "*";
}

export function matchesContentType(
  value: string | ContentType | undefined | null,
  expected: string | ContentType,
  options: ContentTypeMatchOptions = {},
): boolean {
  const actual = typeof value === "string" ? parseContentType(value) : value;

  const target =
    typeof expected === "string" ? parseContentType(expected) : expected;

  if (!actual || !target) {
    return false;
  }

  const allowWildcard = options.allowWildcard ?? true;

  if (!matchesToken(actual.type, target.type, allowWildcard)) {
    return false;
  }

  if (!matchesToken(actual.subtype, target.subtype, allowWildcard)) {
    return false;
  }

  if (options.ignoreParameters) {
    return true;
  }

  for (const [name, expectedValue] of Object.entries(target.parameters)) {
    const actualValue = actual.parameters[name];

    if (actualValue === undefined) {
      return false;
    }

    if (actualValue.toLowerCase() !== expectedValue.toLowerCase()) {
      return false;
    }
  }

  return true;
}
