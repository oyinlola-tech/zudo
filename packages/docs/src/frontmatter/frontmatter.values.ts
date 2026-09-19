/**
 * Value rules shared by the frontmatter parser and serializer.
 *
 * - List keys (`tags`) always parse to a string array: `tags: http` is
 *   `["http"]`, `tags:` and `tags: []` are `[]`, and `tags: [a, b]` is
 *   `["a", "b"]`. A string here used to reach `createDocument`, which spread
 *   it into one-character tags.
 * - `[]` and `{}` are the empty collections, so the serializer can write an
 *   empty array or object and get it back (they used to come back as `""`).
 * - A bare numeric literal becomes a number only when `String(Number(text))`
 *   gives the text back, so the conversion is lossless both ways (`1e+21`
 *   and `1.5e-7` round-trip; `007` and 20-digit IDs stay strings).
 */

/** Keys whose value is always a list of strings. */
export const STRING_LIST_KEYS: ReadonlySet<string> = new Set(["tags"]);

/** Plain decimal or exponent notation; the text round-trip decides the rest. */
const NUMERIC_LITERAL = /^-?(?:\d+)(?:\.\d+)?(?:e[+-]?\d+)?$/;

/** The number a literal denotes, when converting it loses nothing. */
export function losslessNumber(text: string): number | undefined {
  if (!NUMERIC_LITERAL.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) && String(parsed) === text
    ? parsed
    : undefined;
}

/** `[]` or `{}` written as a value: the empty collection it denotes. */
export function emptyCollection(
  value: string,
): readonly never[] | Readonly<Record<string, never>> | undefined {
  if (value === "[]") return Object.freeze([]);
  if (value === "{}")
    return Object.freeze(Object.create(null) as Record<string, never>);
  return undefined;
}

/**
 * Parses the inline value of a list key into items. `[a, "b, c"]` is a flow
 * list; anything else is a single item. Items go through `parseItem`.
 */
export function parseInlineList(
  value: string,
  parseItem: (item: string) => string,
): readonly string[] {
  if (!(value.startsWith("[") && value.endsWith("]"))) {
    return Object.freeze([parseItem(value)]);
  }
  const items: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (const ch of value.slice(1, -1)) {
    if (quote) {
      if (ch === quote) quote = undefined;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      items.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  items.push(current);
  return Object.freeze(
    items
      .map((item) => item.trim())
      .filter((item) => item !== "")
      .map(parseItem),
  );
}
