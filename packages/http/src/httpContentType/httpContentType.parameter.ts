/**
 * HTTP Content-Type generic parameter helpers.
 */

import type { ContentType } from "./httpContentType.type.js";
import { parseContentType } from "./httpContentType.parser.js";

export function getParameter(
  value: string | ContentType | undefined | null,
  name: string,
): string | undefined {
  const parsed = typeof value === "string" ? parseContentType(value) : value;

  if (!parsed) {
    return undefined;
  }

  const key = name.trim().toLowerCase();

  if (!Object.prototype.hasOwnProperty.call(parsed.parameters, key)) {
    return undefined;
  }

  const found: unknown = parsed.parameters[key];

  return typeof found === "string" ? found : undefined;
}

export function hasParameter(
  value: string | ContentType | undefined | null,
  name: string,
): boolean {
  return getParameter(value, name) !== undefined;
}
