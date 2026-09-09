/**
 * Defensive parsing of JSON that came from a provider.
 *
 * @module oauthSecurity/oauthJson
 *
 * A provider response is untrusted input. `JSON.parse` itself is safe, but
 * anything that later merges or spreads the result can be steered by
 * `__proto__`, `constructor` or `prototype` keys, so those keys are stripped
 * from every object before the payload is handed on. Depth and breadth are
 * also bounded, so a deeply nested body cannot exhaust the stack.
 */

import { OAuthResponseError } from "../oauthErrors/index.js";

/** Keys removed from every object reconstructed from provider JSON. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/** Maximum nesting depth kept from a provider payload. */
const MAX_DEPTH = 12;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      out.push(sanitizeValue(item, depth + 1));
    }
    return out;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      out[key] = sanitizeValue(item, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Strip prototype-polluting keys from a JSON-derived object graph.
 *
 * @param value - Any value produced by `JSON.parse`.
 * @returns A structurally identical value with the forbidden keys removed.
 */
export function sanitizeJsonValue(value: unknown): unknown {
  return sanitizeValue(value, 0);
}

/**
 * Parse a provider body as a JSON object and sanitize it.
 *
 * @param text - The (already size-capped) response body.
 * @param label - Endpoint name for the error message. Never a secret.
 * @returns A plain object with prototype-polluting keys removed.
 * @throws {OAuthResponseError} If the body is not JSON, or is not an object
 *   (a top-level array, string, number or `null` is rejected).
 */
export function parseJsonObject(
  text: string,
  label: string,
): Record<string, unknown> {
  const sanitized = parseJsonValue(text, label);
  if (sanitized === null || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    throw new OAuthResponseError(`${label} did not return a JSON object.`);
  }
  return sanitized as Record<string, unknown>;
}

/**
 * Parse any JSON body and sanitize it, allowing a top-level array.
 *
 * Needed for endpoints that legitimately return a list — GitHub's
 * `/user/emails`, for one.
 *
 * @throws {OAuthResponseError} If the body is not valid JSON.
 */
export function parseJsonValue(text: string, label: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OAuthResponseError(`${label} did not return valid JSON.`);
  }
  return sanitizeValue(parsed, 0);
}
