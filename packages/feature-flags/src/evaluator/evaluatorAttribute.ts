/**
 * Attribute matching for feature flag targeting rules.
 *
 * Supports dot-notation traversal for nested attributes and all comparison operators.
 *
 * @module evaluator/evaluatorAttribute
 */

import type { FeatureFlagOperator } from "../featureFlagTypes/featureFlagRule/featureFlagRule.type.js";

/**
 * Path segments that must never be traversed.
 *
 * Evaluation context attributes come from request data, and a rule's
 * attribute path comes from flag configuration. Either side reaching the
 * prototype chain turns a targeting rule into a universal one.
 */
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Safely resolve a dot-notation path from an object.
 *
 * Only own, enumerable-or-not *own* properties are traversed: `toString`,
 * `constructor` and friends live on the prototype, and resolving them made
 * `{ attribute: "toString", operator: "exists" }` match every context there
 * has ever been — a targeting rule that silently targets everyone.
 *
 * @param obj - The object to traverse.
 * @param path - Dot-separated path (e.g. "user.country").
 * @returns The value at the path, or undefined.
 */
export function resolvePath(obj: unknown, path: string): unknown {
  if (path === "") return undefined;
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (FORBIDDEN_SEGMENTS.has(part)) return undefined;
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    if (!Object.hasOwn(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/** Longest pattern accepted by the `matches` operator. */
const MAX_PATTERN_LENGTH = 512;

/**
 * Compiled patterns, so a rule evaluated on every request does not recompile
 * its regular expression every time.
 */
const patternCache = new Map<string, RegExp | null>();

/** Cap on distinct cached patterns, since flag config can change at runtime. */
const MAX_CACHED_PATTERNS = 256;

/**
 * Compile a rule pattern, or return `null` when it cannot be used.
 *
 * A pattern that does not compile used to throw out of rule evaluation and
 * out of `isEnabled()` with it. A flag whose configuration is broken must
 * fall back to its default, not take the caller down.
 */
function compilePattern(pattern: string): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null;

  const cached = patternCache.get(pattern);
  if (cached !== undefined) return cached;

  let compiled: RegExp | null;
  try {
    compiled = new RegExp(pattern);
  } catch {
    compiled = null;
  }

  if (patternCache.size >= MAX_CACHED_PATTERNS) patternCache.clear();
  patternCache.set(pattern, compiled);
  return compiled;
}

/**
 * Evaluate an attribute rule against a context value.
 *
 * @param actual - The actual value from context.
 * @param operator - The comparison operator.
 * @param expected - The expected value from the rule.
 * @returns Whether the condition matches.
 */
export function matchAttribute(
  actual: unknown,
  operator: FeatureFlagOperator,
  expected: unknown,
): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;

    case "not_equals":
      return actual !== expected;

    case "contains":
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        actual.includes(expected)
      );

    case "starts_with":
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        actual.startsWith(expected)
      );

    case "ends_with":
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        actual.endsWith(expected)
      );

    case "in":
      return Array.isArray(expected) && expected.includes(actual);

    case "not_in":
      // A malformed rule must not match everyone: `not_in` with a non-array
      // expectation is unusable, so it matches nobody.
      return Array.isArray(expected) && !expected.includes(actual);

    case "greater_than":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual > expected
      );

    case "greater_than_or_equal":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual >= expected
      );

    case "less_than":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual < expected
      );

    case "less_than_or_equal":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual <= expected
      );

    case "exists":
      return actual !== undefined && actual !== null;

    case "matches": {
      if (typeof actual !== "string" || typeof expected !== "string") {
        return false;
      }
      const pattern = compilePattern(expected);
      return pattern !== null && pattern.test(actual);
    }

    default:
      return false;
  }
}
