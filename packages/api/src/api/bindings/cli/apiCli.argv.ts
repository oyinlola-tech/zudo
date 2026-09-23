import { createSerializer } from "@zudojs/serialization";
import type { Serializer } from "@zudojs/serialization";

import { isPlainObject } from "@zudojs/types";

import { assignOption, camelCase, coerceOptionValue, parseJson } from "./apiCli.values.js";

/**
 * Parsed command line: the operation named on it (when the CLI serves
 * several), the input object built from flags, and whether help was asked
 * for. A malformed command line is reported as `{ ok: false, message }`.
 */
export type APICliParseResult =
  | {
      readonly ok: true;
      readonly operation?: string;
      readonly input: unknown;
      readonly help: boolean;
    }
  | { readonly ok: false; readonly message: string };

const DEFAULT_SERIALIZER = createSerializer("json", { maxSize: 1024 * 1024, maxDepth: 64 });

const KEY_SEGMENT = /^[A-Za-z_$][\w$-]*$/;

const UNSAFE_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Parses CLI arguments into operation input.
 *
 * - `--name value`, `--name=value`: sets `input.name`. Kebab-case becomes
 *   camelCase (`--first-name` → `firstName`); dots nest
 *   (`--address.city Paris`).
 * - A value that is a JSON number, `true`, `false` or `null`, or starts
 *   with `{`, `[` or `"`, is parsed as JSON; anything else stays a string.
 * - `--flag` with no value is `true`; `--no-flag` is `false`.
 * - A repeated flag collects an array.
 * - `--json '<object>'` supplies a base input object the flags merge over,
 *   or any JSON input when no other flags are given.
 * - `--help` / `-h` requests help.
 *
 * @param expectOperation Whether the first positional argument names the
 * operation.
 * @param serializer JSON parser for values. Defaults to a size- and
 * depth-limited `@zudojs/serialization` JSON serializer.
 */
export function parseApiCliArgs(
  argv: readonly string[],
  expectOperation: boolean,
  serializer: Serializer<unknown, string> = DEFAULT_SERIALIZER,
): APICliParseResult {
  const fields: Record<string, unknown> = {};
  let base: unknown;
  let operation: string | undefined;
  let help = false;
  let flagCount = 0;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      if (expectOperation && operation === undefined) {
        operation = token;
        continue;
      }
      return { ok: false, message: `Unexpected argument "${token}".` };
    }

    const eq = token.indexOf("=");
    const rawKey = eq === -1 ? token.slice(2) : token.slice(2, eq);
    const next = argv[i + 1];
    let raw: string | undefined = eq === -1 ? undefined : token.slice(eq + 1);
    if (raw === undefined && next !== undefined && !next.startsWith("--")) {
      raw = next;
      i += 1;
    }

    if (rawKey === "json") {
      const parsed = parseJson(raw, serializer);
      if (!parsed.ok) {
        return { ok: false, message: "--json must be followed by valid JSON." };
      }
      base = parsed.value;
      continue;
    }

    const negated = raw === undefined && rawKey.startsWith("no-");
    const path = (negated ? rawKey.slice(3) : rawKey).split(".").map(camelCase);
    if (path.some((segment) => !KEY_SEGMENT.test(segment) || UNSAFE_KEYS.has(segment))) {
      return { ok: false, message: `Invalid option "--${rawKey}".` };
    }

    const value = raw === undefined ? !negated : coerceOptionValue(raw, serializer);
    if (!assignOption(fields, path, value)) {
      return { ok: false, message: `Option "--${rawKey}" conflicts with another option.` };
    }
    flagCount += 1;
  }

  if (flagCount > 0 && base !== undefined && !isPlainObject(base)) {
    return { ok: false, message: "--json must be an object when combined with other options." };
  }

  const input = flagCount === 0 ? (base ?? {}) : { ...(isPlainObject(base) ? base : {}), ...fields };
  return { ok: true, ...(operation !== undefined ? { operation } : {}), input, help };
}
