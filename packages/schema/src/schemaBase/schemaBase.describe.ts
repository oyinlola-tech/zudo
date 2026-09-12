/**
 * @zudojs/schema/describe
 *
 * Throw-proof value rendering for issue messages.
 *
 * `JSON.stringify` throws for a BigInt and for a circular structure, and
 * `String(value)` throws for a null-prototype object. Issue messages used
 * these directly, so a hostile or merely unusual input made `safeParse`
 * throw a `TypeError` instead of returning a failure.
 */

/** Renders a value for an issue message without ever throwing. */
export function describeValue(value: unknown): string {
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return "[function]";
  if (typeof value === "undefined") return "undefined";

  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
  } catch {
    // Circular structure, a `toJSON` that throws, or a nested BigInt.
  }

  if (Array.isArray(value)) return "[array]";
  return value === null ? "null" : "[object]";
}

/** Produces a message for an arbitrary thrown value without ever throwing. */
export function describeThrown(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return describeValue(value);
  }
}
