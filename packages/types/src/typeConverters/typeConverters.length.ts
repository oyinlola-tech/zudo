/**
 * String length helpers that count what a person or the wire sees rather
 * than UTF-16 code units.
 *
 * @module typeConverters/length
 */

/** Control characters that `JSON.stringify` writes as a two-byte escape. */
const SHORT_ESCAPES: ReadonlySet<number> = new Set([
  0x08, 0x09, 0x0a, 0x0c, 0x0d,
]);

/** A string JSON writes byte-for-byte: printable ASCII without `"` or `\`. */
const PLAIN_ASCII = /^[\x20\x21\x23-\x5b\x5d-\x7e]*$/;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Number of Unicode code points in a string.
 *
 * `String.prototype.length` counts UTF-16 code units, so an emoji or any
 * other character outside the Basic Multilingual Plane counts as two. A
 * constraint phrased in "characters" should count with this instead.
 *
 * @example
 * characterLength("abc");  // 3
 * characterLength("🛒🛒"); // 2 ("🛒🛒".length is 4)
 */
export function characterLength(value: string): number {
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    if (
      isHighSurrogate(value.charCodeAt(i)) &&
      i + 1 < value.length &&
      isLowSurrogate(value.charCodeAt(i + 1))
    ) {
      i++;
    }
    count++;
  }
  return count;
}

/**
 * Bytes that `JSON.stringify(value)` occupies when encoded as UTF-8, the
 * surrounding quotes and JSON escapes included.
 *
 * `value.length * 2` (the UTF-16 size) undercounts every character above
 * U+07FF: "₦" is three bytes on the wire, so a payload limit measured that
 * way let bodies half again larger than the limit through. Lone surrogates
 * are counted as `JSON.stringify` writes them, as a `\uXXXX` escape.
 *
 * @example
 * jsonStringByteLength("ab");   // 4  — "ab" with quotes
 * jsonStringByteLength("₦");    // 5  — 3 bytes plus quotes
 * jsonStringByteLength("\n");   // 4  — written as \n
 */
export function jsonStringByteLength(value: string): number {
  if (PLAIN_ASCII.test(value)) return value.length + 2;

  let bytes = 2;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20) {
      bytes += SHORT_ESCAPES.has(code) ? 2 : 6;
    } else if (code < 0x80) {
      bytes += code === 0x22 || code === 0x5c ? 2 : 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (
      isHighSurrogate(code) &&
      i + 1 < value.length &&
      isLowSurrogate(value.charCodeAt(i + 1))
    ) {
      bytes += 4;
      i++;
    } else if (isHighSurrogate(code) || isLowSurrogate(code)) {
      bytes += 6;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
