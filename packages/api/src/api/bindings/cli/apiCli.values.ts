import type { Serializer } from "@zudojs/serialization";

import { isPlainObject } from "@zudojs/types";

const JSON_LITERAL = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)$/;

/** Converts a kebab-case option segment to camelCase. */
export function camelCase(segment: string): string {
  return segment.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/** Parses JSON text, reporting failure instead of throwing. */
export function parseJson(
  raw: string | undefined,
  serializer: Serializer<unknown, string>,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  if (raw === undefined) {
    return { ok: false };
  }
  try {
    return { ok: true, value: serializer.deserialize(raw) };
  } catch {
    return { ok: false };
  }
}

/**
 * Parses an option value that looks like JSON (a number, `true`, `false`,
 * `null`, or text starting with `{`, `[` or `"`); keeps anything else, and
 * any number JSON would round, as the string typed.
 */
export function coerceOptionValue(raw: string, serializer: Serializer<unknown, string>): unknown {
  const looksJson = JSON_LITERAL.test(raw) || /^[[{"]/.test(raw);
  if (!looksJson) {
    return raw;
  }
  const parsed = parseJson(raw, serializer);
  return parsed.ok && !isLossyNumber(parsed.value) ? parsed.value : raw;
}

/**
 * A number JSON cannot hand back faithfully — an integer beyond 2^53 or
 * an overflow to Infinity — is kept as the string the user typed.
 */
function isLossyNumber(value: unknown): boolean {
  return (
    typeof value === "number" &&
    (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
  );
}

/**
 * Sets `value` at a dotted `path`, collecting repeats into an array.
 * Returns `false` when the path collides with an existing scalar or
 * object. Only own properties count, so `--to-string` cannot collide
 * with `Object.prototype`.
 */
export function assignOption(target: Record<string, unknown>, path: readonly string[], value: unknown): boolean {
  let node = target;
  for (const segment of path.slice(0, -1)) {
    const child = Object.hasOwn(node, segment) ? node[segment] : undefined;
    if (child === undefined) {
      node[segment] = {};
    } else if (!isPlainObject(child)) {
      return false;
    }
    node = node[segment] as Record<string, unknown>;
  }
  const leaf = path[path.length - 1]!;
  const existing = Object.hasOwn(node, leaf) ? node[leaf] : undefined;
  if (existing === undefined) {
    node[leaf] = value;
  } else if (isPlainObject(existing)) {
    return false;
  } else {
    node[leaf] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return true;
}
