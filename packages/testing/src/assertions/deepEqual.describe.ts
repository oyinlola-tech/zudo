/**
 * @zudojs/testing — Rendering values for assertion messages.
 *
 * Assertion failures name the path and the difference, so both sides have to
 * render without throwing — including the circular and BigInt values that
 * `JSON.stringify` refuses.
 *
 * @module assertions/deepEqual.describe
 */

/** Where two values first differed. */
export interface Difference {
  /** Dotted path to the differing node. */
  readonly path: string;
  /** Human-readable description of the mismatch. */
  readonly reason: string;
}

/** Renders a value for an assertion message without throwing. */
export function describeValue(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "bigint":
      return `${value}n`;
    case "number":
    case "boolean":
      return String(value);
    case "symbol":
      return value.toString();
    case "function":
      return `[Function ${value.name || "anonymous"}]`;
  }

  if (depth > 2) return "…";
  if (value instanceof Date) return `Date(${value.toISOString()})`;
  if (value instanceof RegExp) return String(value);
  if (value instanceof Map) {
    return `Map(${value.size}) {${[...value]
      .slice(0, 4)
      .map(
        ([k, v]) =>
          ` ${describeValue(k, depth + 1)} => ${describeValue(v, depth + 1)}`,
      )
      .join(",")} }`;
  }
  if (value instanceof Set) {
    return `Set(${value.size}) {${[...value]
      .slice(0, 4)
      .map((entry) => ` ${describeValue(entry, depth + 1)}`)
      .join(",")} }`;
  }
  if (Array.isArray(value)) {
    return `[${value
      .slice(0, 6)
      .map((entry) => describeValue(entry, depth + 1))
      .join(", ")}${value.length > 6 ? ", …" : ""}]`;
  }

  const keys = Object.keys(value as Record<string, unknown>);
  return `{${keys
    .slice(0, 6)
    .map(
      (key) =>
        ` ${key}: ${describeValue((value as Record<string, unknown>)[key], depth + 1)}`,
    )
    .join(",")}${keys.length > 6 ? ", …" : ""} }`;
}
