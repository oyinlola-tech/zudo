import {
  parseConfigBoolean,
  parseConfigNumber,
} from "../configValue/configValue.core.js";

import type { AnyConfigSchema } from "./configSchema.type.js";

import { ConfigValueType } from "./configSchema.type.js";

/**
 * Returns whether a schema type (single or union) includes `candidate`.
 */
function includesType(
  type: ConfigValueType | readonly ConfigValueType[],
  candidate: ConfigValueType,
): boolean {
  return Array.isArray(type) ? type.includes(candidate) : type === candidate;
}

/**
 * Strictly coerces string input for `NUMBER` and `BOOLEAN` schemas.
 *
 * Environment-style sources only ever produce strings. The value is
 * returned unchanged when it is not a string, when the schema opted out
 * with `coerce: false`, when the schema also accepts strings (or any
 * value), or when the string does not parse; the type check that follows
 * then reports the mismatch as before.
 *
 * `NUMBER` is tried before `BOOLEAN`, so `"1"` against
 * `[NUMBER, BOOLEAN]` becomes `1`.
 */
export function coerceConfigInput(
  value: unknown,
  schema: AnyConfigSchema,
): unknown {
  if (typeof value !== "string" || schema.coerce === false) {
    return value;
  }

  const { type } = schema;

  if (
    includesType(type, ConfigValueType.STRING) ||
    includesType(type, ConfigValueType.ANY)
  ) {
    return value;
  }

  if (includesType(type, ConfigValueType.NUMBER)) {
    const parsed = parseConfigNumber(value);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  if (includesType(type, ConfigValueType.BOOLEAN)) {
    const parsed = parseConfigBoolean(value);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return value;
}
