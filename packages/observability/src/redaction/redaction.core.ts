/**
 * @zudojs/observability — Redaction
 *
 * Redacts sensitive fields from log contexts and trace attributes.
 *
 * The rules that make this safe rather than decorative:
 *   - arrays are traversed, because secrets usually arrive inside one
 *     (`headers: [{ authorization: "Bearer …" }]`);
 *   - traversal is cycle-aware and depth-capped, because a request object in
 *     a log context is a graph, not a tree;
 *   - class instances are not walked as plain objects, so an `Error` or a
 *     `Date` survives instead of collapsing to `{}`;
 *   - matching is substring-based by default, so `userPassword` and
 *     `x-api-key` are caught, not just the exact names in the list.
 */

import type { RedactionConfig } from "../types.js";

/** Default sensitive field names, matched case-insensitively. */
export const DEFAULT_SENSITIVE_FIELDS: readonly string[] = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "auth",
  "cookie",
  "session",
  "credential",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "private_key",
  "client_secret",
  "credit_card",
  "creditcard",
  "card_number",
  "cardnumber",
  "cvv",
  "ssn",
  "social_security",
  "pin",
  "otp",
];

const DEFAULT_REPLACEMENT = "[REDACTED]";
const DEFAULT_MAX_DEPTH = 8;

/** Marker used in place of a structure that was too deep or already seen. */
export const CIRCULAR_MARKER = "[CIRCULAR]";
export const MAX_DEPTH_MARKER = "[MAX_DEPTH]";

/**
 * Splits a field name into its lowercase words.
 *
 * `x-api-key`, `api_key` and `apiKey` all reduce to `["api", "key"]`, and a
 * digit run is its own word so `token2` yields `["token", "2"]`.
 */
function words(key: string): readonly string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-zA-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Every run of consecutive words in `key`, joined.
 *
 * Matching on these rather than on a raw substring is what keeps
 * `shippingAddress` out of the `pin` rule and `authorId` out of the `auth`
 * rule, while still catching `userPassword`, `x-api-key` and `accessToken`.
 * A plain `normalized.includes(field)` test redacts every one of those — a
 * silent, permanent loss of legitimate log data that looks exactly like the
 * field never being logged.
 */
function wordJoins(key: string): readonly string[] {
  const parts = words(key);
  const joins: string[] = [];
  for (let start = 0; start < parts.length; start++) {
    let joined = "";
    for (let end = start; end < parts.length; end++) {
      joined += parts[end] ?? "";
      joins.push(joined);
    }
  }
  return joins;
}

/** A field matcher compiled once from a {@link RedactionConfig}. */
interface CompiledRedaction {
  readonly isSensitive: (key: string) => boolean;
  readonly replacement: string;
  readonly maxDepth: number;
  readonly customRedactor?: (key: string, value: unknown) => unknown;
}

function compile(config?: RedactionConfig): CompiledRedaction {
  const fields = (config?.fields ?? DEFAULT_SENSITIVE_FIELDS).map((field) =>
    field.toLowerCase(),
  );
  const patterns = config?.patterns ?? [];
  const matchMode = config?.matchMode ?? "contains";
  const exact = new Set(fields);

  const normalizedFields = new Set(
    fields.map((field) => field.replace(/[^a-z0-9]/g, "")).filter(Boolean),
  );

  const isSensitive = (key: string): boolean => {
    const lower = key.toLowerCase();
    if (exact.has(lower)) return true;
    if (matchMode === "contains") {
      for (const candidate of wordJoins(key)) {
        if (normalizedFields.has(candidate)) return true;
        // Tolerate a plural: `passwords` is the `password` field.
        if (
          candidate.endsWith("s") &&
          normalizedFields.has(candidate.slice(0, -1))
        ) {
          return true;
        }
      }
    }
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(key)) return true;
    }
    return false;
  };

  return {
    isSensitive,
    replacement: config?.replacement ?? DEFAULT_REPLACEMENT,
    maxDepth: config?.maxDepth ?? DEFAULT_MAX_DEPTH,
    customRedactor: config?.customRedactor,
  };
}

/**
 * Creates a redactor that replaces sensitive values for a single field.
 *
 * This is the leaf-level decision. Use {@link redactObject} to walk a
 * structure — it applies this to every field it reaches.
 */
export function createRedactor(
  config?: RedactionConfig,
): (key: string, value: unknown) => unknown {
  const compiled = compile(config);
  return (key: string, value: unknown): unknown =>
    redactField(key, value, compiled);
}

function redactField(
  key: string,
  value: unknown,
  compiled: CompiledRedaction,
): unknown {
  if (compiled.customRedactor) {
    const result = compiled.customRedactor(key, value);
    if (result !== value) return result;
  }
  if (compiled.isSensitive(key)) return compiled.replacement;
  return value;
}

/** True when a value should be walked rather than treated as a leaf. */
function isPlainContainer(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  // Walk plain objects and null-prototype bags; leave Error, Date, Map, Set,
  // Buffer and every other class instance intact.
  return prototype === Object.prototype || prototype === null;
}

function walk(
  value: unknown,
  compiled: CompiledRedaction,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth > compiled.maxDepth) return MAX_DEPTH_MARKER;

  if (Array.isArray(value)) {
    if (seen.has(value)) return CIRCULAR_MARKER;
    seen.add(value);
    const result = value.map((entry) => walk(entry, compiled, depth + 1, seen));
    seen.delete(value);
    return result;
  }

  if (isPlainContainer(value)) {
    if (seen.has(value)) return CIRCULAR_MARKER;
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const redacted = redactField(key, entry, compiled);
      // A field the matcher replaced is done — never walk into it, or a
      // nested object under a sensitive key would leak through its children.
      result[key] =
        redacted === entry ? walk(entry, compiled, depth + 1, seen) : redacted;
    }
    seen.delete(value);
    return result;
  }

  return value;
}

/**
 * Redacts sensitive fields from a structure.
 *
 * Returns a new value; the input is never mutated. Arrays are traversed,
 * cycles become {@link CIRCULAR_MARKER}, and anything deeper than
 * `maxDepth` becomes {@link MAX_DEPTH_MARKER}.
 */
export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  config?: RedactionConfig,
): T {
  return walk(obj, compile(config), 0, new WeakSet()) as T;
}

/**
 * Redacts any value, not just a plain object — an array of headers, a scalar,
 * a nested mix.
 */
export function redactValue(value: unknown, config?: RedactionConfig): unknown {
  return walk(value, compile(config), 0, new WeakSet());
}

/** Checks if a field name is sensitive under the given configuration. */
export function isSensitiveField(
  fieldName: string,
  config?: RedactionConfig,
): boolean {
  return compile(config).isSensitive(fieldName);
}

/**
 * Compiles a configuration once into a reusable structure redactor.
 *
 * Prefer this on a hot path: {@link redactObject} recompiles the field
 * matcher on every call.
 */
export function createStructureRedactor(
  config?: RedactionConfig,
): (value: unknown) => unknown {
  const compiled = compile(config);
  return (value: unknown) => walk(value, compiled, 0, new WeakSet());
}
