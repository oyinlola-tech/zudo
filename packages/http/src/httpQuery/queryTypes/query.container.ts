import type { QueryObject, QueryValue } from "./query.type.js";

/**
 * Key names that would mutate a prototype chain if assigned to an object.
 *
 * `__proto__` is the direct pollution vector. `constructor` and `prototype`
 * are blocked as defence in depth so no future container type re-opens the
 * hole.
 */
const FORBIDDEN_QUERY_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export function isForbiddenQueryKey(key: string): boolean {
  return FORBIDDEN_QUERY_KEYS.has(key);
}

export function createQueryContainer(): Record<string, QueryValue> {
  return Object.create(null) as Record<string, QueryValue>;
}

export function ownValue<T>(
  target: Record<string, T>,
  key: string,
): T | undefined {
  return Object.prototype.hasOwnProperty.call(target, key)
    ? target[key]
    : undefined;
}

export function isQueryObject(
  value: QueryValue | undefined,
): value is QueryObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Stringifies a parsed query value without invoking `String()` on it.
 *
 * Every container this module builds has a `null` prototype, so it inherits
 * neither `toString` nor `valueOf`; `String(container)` throws
 * `TypeError: Cannot convert object to primitive value`. Because the shape of
 * a parsed value is attacker-chosen (`?a[b]=1&a=2` yields an array holding an
 * object), that throw was reachable from any request.
 */
export function queryValueToString(value: QueryValue): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(queryValueToString).join(",");
  }

  return `[object Object]`;
}
