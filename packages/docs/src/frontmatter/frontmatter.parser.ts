/**
 * Frontmatter parser for markdown documentation.
 *
 * Parses YAML-like frontmatter delimited by `---` markers
 * and extracts metadata alongside the remaining content.
 *
 * Supported subset:
 * - `key: scalar` (strings, canonical numbers, booleans, null)
 * - single- and double-quoted strings with escapes
 * - `key:` followed by `- item` lines (list of scalars)
 * - one level of nested mapping (`key:` followed by indented `sub: value`)
 * - `#` comments (outside quotes)
 *
 * Anything else is kept as a plain string. Keys that would alter the
 * result object's prototype (`__proto__`, `constructor`, `prototype`)
 * are rejected.
 */

import type {
  ParsedFrontmatter,
  FrontmatterMetadata,
} from "./frontmatter.types.js";

const FRONTMATTER_DELIMITER = "---";

/** Keys that must never be assigned onto a plain object. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Valid frontmatter key syntax. */
const KEY_PATTERN = /^[A-Za-z_][\w.-]*$/;

/** Canonical number: optional sign, no leading zeros, optional fraction. */
const CANONICAL_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/**
 * Keys whose values are declared as strings in `FrontmatterMetadata`.
 * Their scalars are never coerced, so `version: 1.0` stays `"1.0"`.
 */
const STRING_KEYS = new Set([
  "title",
  "description",
  "category",
  "version",
  "status",
  "deprecatedMessage",
  "visibility",
]);

/** Keys whose list items are always strings. */
const STRING_LIST_KEYS = new Set(["tags"]);

/**
 * Parses YAML-like frontmatter from a markdown string.
 *
 * The opening delimiter must be exactly `---` on the first non-blank
 * line and the closing delimiter must be `---` on its own line.
 * Documents without a well-formed block are returned unchanged with
 * empty metadata.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const lines = raw.split(/\r?\n/);

  let start = 0;
  while (start < lines.length && lines[start]?.trim() === "") {
    start++;
  }

  if (lines[start]?.trim() !== FRONTMATTER_DELIMITER) {
    return { metadata: Object.freeze({}), content: raw };
  }

  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]?.trim() === FRONTMATTER_DELIMITER) {
      end = i;
      break;
    }
  }

  if (end === -1) {
    return { metadata: Object.freeze({}), content: raw };
  }

  const yamlLines = lines.slice(start + 1, end);
  const remainingContent = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\s*\n/, "")
    .trimStart();

  const metadata = parseYamlLike(yamlLines);

  return { metadata, content: remainingContent };
}

/**
 * Minimal YAML-like parser for frontmatter key-value pairs.
 */
function parseYamlLike(lines: readonly string[]): FrontmatterMetadata {
  const result: Record<string, unknown> = Object.create(null);

  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;
  let currentMap: Record<string, unknown> | null = null;

  const flush = (): void => {
    if (currentKey === null) return;

    if (currentArray) {
      result[currentKey] = Object.freeze(currentArray);
    } else if (currentMap) {
      result[currentKey] = Object.freeze(currentMap);
    } else {
      result[currentKey] = "";
    }

    currentKey = null;
    currentArray = null;
    currentMap = null;
  };

  for (const rawLine of lines) {
    const line = stripComment(rawLine);
    const trimmed = line.trim();

    if (trimmed === "") continue;

    const indented = /^\s/.test(line);

    if (currentKey !== null) {
      if (trimmed.startsWith("- ") || trimmed === "-") {
        if (currentMap) {
          flush();
        } else {
          currentArray ??= [];
          const item = trimmed.slice(1).trim();
          currentArray.push(
            STRING_LIST_KEYS.has(currentKey)
              ? parseStringScalar(item)
              : parseScalar(item),
          );
          continue;
        }
      } else if (indented && !currentArray) {
        const entry = splitKeyValue(trimmed);
        if (entry) {
          currentMap ??= Object.create(null) as Record<string, unknown>;
          if (isAllowedKey(entry.key)) {
            currentMap[entry.key] = parseScalar(entry.value);
          }
          continue;
        }
        flush();
      } else {
        flush();
      }
    }

    const entry = splitKeyValue(trimmed);
    if (!entry) continue;

    if (!isAllowedKey(entry.key)) continue;

    if (entry.value === "") {
      currentKey = entry.key;
      continue;
    }

    result[entry.key] = STRING_KEYS.has(entry.key)
      ? parseStringScalar(entry.value)
      : parseScalar(entry.value);
  }

  flush();

  return Object.freeze({ ...result }) as FrontmatterMetadata;
}

/** Splits `key: value` into its parts; returns undefined when not a pair. */
function splitKeyValue(
  line: string,
): { key: string; value: string } | undefined {
  const match = line.match(/^([^:]+?)\s*:(?:\s+(.*)|\s*)$/);
  if (!match) return undefined;

  const key = match[1]?.trim() ?? "";
  const value = match[2]?.trim() ?? "";

  if (key === "") return undefined;

  return { key, value };
}

/** Rejects prototype-polluting and syntactically invalid keys. */
function isAllowedKey(key: string): boolean {
  return !FORBIDDEN_KEYS.has(key) && KEY_PATTERN.test(key);
}

/** Removes a trailing `# comment` that is not inside quotes. */
function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === "\\" && inDouble) {
      i++;
      continue;
    }

    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (
      ch === "#" &&
      !inSingle &&
      !inDouble &&
      (i === 0 || /\s/.test(line[i - 1] ?? ""))
    ) {
      return line.slice(0, i);
    }
  }

  return line;
}

/**
 * Parses a scalar YAML value into its appropriate JS type.
 *
 * Quoted strings are unquoted (with escape handling) and never coerced.
 * Only canonical numbers within the safe-integer range become numbers;
 * anything else stays a string.
 */
function parseScalar(value: string): string | number | boolean | null {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];

    if (first === '"' && last === '"') {
      return unescapeDoubleQuoted(value.slice(1, -1));
    }

    if (first === "'" && last === "'") {
      return value.slice(1, -1).replace(/''/g, "'");
    }
  }

  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;

  if (CANONICAL_NUMBER.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && Math.abs(parsed) <= Number.MAX_SAFE_INTEGER) {
      return parsed;
    }
  }

  return value;
}

/** Parses a scalar that must remain a string (unquotes, never coerces). */
function parseStringScalar(value: string): string {
  const parsed = parseScalar(value);
  if (typeof parsed === "string") return parsed;
  if (parsed === null) return "";
  return value;
}

/** Handles `\"`, `\\`, `\n`, `\t`, `\r` escapes in double-quoted strings. */
function unescapeDoubleQuoted(value: string): string {
  return value.replace(/\\(["\\nrt])/g, (_, ch: string) => {
    switch (ch) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return ch;
    }
  });
}
