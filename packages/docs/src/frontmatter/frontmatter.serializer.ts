/**
 * Frontmatter serializer — converts metadata back to YAML-like format.
 *
 * Every value is quoted when it could otherwise be misread by the
 * parser (newlines, `:`/`#`, leading list markers, surrounding
 * whitespace, or text that looks like a number/boolean/null), so
 * `parseFrontmatter(serializeFrontmatter(m, c))` round-trips `m`.
 */

import type { FrontmatterMetadata } from "./frontmatter.types.js";

const FRONTMATTER_DELIMITER = "---";

/** Keys that are never written. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Valid frontmatter key syntax (must match the parser). */
const KEY_PATTERN = /^[A-Za-z_][\w.-]*$/;

/**
 * Serializes metadata back into a frontmatter string.
 *
 * Nested plain objects are written as a one-level mapping; other
 * non-scalar values (Dates, class instances) are written as their
 * JSON/ISO representation in quotes. Keys that are not valid
 * frontmatter keys are skipped.
 */
export function serializeFrontmatter(
  metadata: FrontmatterMetadata | Readonly<Record<string, unknown>>,
  content: string,
): string {
  const lines: string[] = [FRONTMATTER_DELIMITER];

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    if (!isSerializableKey(key)) continue;

    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${formatScalar(item)}`);
      }
    } else if (isPlainObject(value)) {
      lines.push(`${key}:`);
      for (const [subKey, subValue] of Object.entries(value)) {
        if (subValue === undefined || subValue === null) continue;
        if (!isSerializableKey(subKey)) continue;
        lines.push(`  ${subKey}: ${formatScalar(subValue)}`);
      }
    } else {
      lines.push(`${key}: ${formatScalar(value)}`);
    }
  }

  lines.push(FRONTMATTER_DELIMITER);
  lines.push("");
  lines.push(content);

  return lines.join("\n");
}

/** Formats a single scalar, quoting whenever the parser could misread it. */
export function formatScalar(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : quote(String(value));
  }

  if (typeof value === "string") {
    return needsQuotes(value) ? quote(value) : value;
  }

  if (value instanceof Date) {
    return quote(
      Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString(),
    );
  }

  if (value === null || value === undefined) return quote("");

  try {
    return quote(JSON.stringify(value) ?? String(value));
  } catch {
    return quote(String(value));
  }
}

function needsQuotes(value: string): boolean {
  if (value === "") return true;
  if (value !== value.trim()) return true;
  if (/[\n\r\t"'\\]/.test(value)) return true;
  if (/(^|\s)#/.test(value)) return true;
  if (/:(\s|$)/.test(value)) return true;
  if (/^[-?[\]{}*&!|>%@`,]/.test(value)) return true;
  if (value === "true" || value === "false") return true;
  if (value === "null" || value === "~") return true;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) return true;
  return false;
}

function quote(value: string): string {
  return (
    '"' +
    value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t") +
    '"'
  );
}

function isSerializableKey(key: string): boolean {
  return !FORBIDDEN_KEYS.has(key) && KEY_PATTERN.test(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
