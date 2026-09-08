/**
 * Internal CSP helpers for splitting, normalizing, and freezing directives.
 */

import type {
  CSPDirectiveValue,
  CSPDirectives,
} from "../types/httpCsp.type.js";
import { normalizeDirectiveName } from "../validation/httpCsp.validation.js";

export function splitPolicy(value: string): string[] {
  const result: string[] = [];
  let current = "";

  for (const character of value) {
    if (character === ";") {
      if (current.trim().length > 0) {
        result.push(current.trim());
      }
      current = "";
      continue;
    }
    current += character;
  }

  if (current.trim().length > 0) {
    result.push(current.trim());
  }

  return result;
}

/**
 * Characters that must never appear inside a directive value.
 *
 * `;` starts a new directive and `,` starts a new policy, so a value carrying
 * either injects structure into the header — `img-src` set to
 * `"https://cdn.example; script-src 'unsafe-inline'"` grants inline script.
 * CR/LF and the other C0 controls are a header-injection primitive.
 */
const FORBIDDEN_DIRECTIVE_VALUE = /[;,\u0000-\u001f\u007f]/;

/**
 * Splits and trims a directive value, rejecting anything that could change the
 * shape of the resulting header.
 *
 * The check lives here, at the single point every directive value passes
 * through, so no code path can construct an injected directive object in the
 * first place — rather than relying on a validator that a caller might skip.
 */
export function normalizeDirectiveValues(values: CSPDirectiveValue): string[] {
  const result =
    typeof values === "string"
      ? values.trim().split(/\s+/)
      : values.map((value) => value.trim());

  const filtered = result.filter(Boolean);

  for (const value of filtered) {
    if (FORBIDDEN_DIRECTIVE_VALUE.test(value)) {
      throw new TypeError(
        `Invalid CSP directive value: ${JSON.stringify(value)}. Values cannot contain ";", "," or control characters.`,
      );
    }
  }

  return filtered;
}

export function freezeDirectives(
  directives: Record<string, readonly string[]>,
): CSPDirectives {
  const result: Record<string, readonly string[]> = {};

  for (const [name, values] of Object.entries(directives)) {
    result[name] = Object.freeze([...values]);
  }

  return Object.freeze(result);
}

export function addOptionalDirective(
  target: Record<string, readonly string[]>,
  name: string,
  value: CSPDirectiveValue | undefined,
): void {
  if (value === undefined) {
    return;
  }
  target[name] = normalizeDirectiveValues(value);
}

export function mergeDirectives(
  target: Record<string, readonly string[]>,
  source: Readonly<Record<string, CSPDirectiveValue>>,
): void {
  for (const [rawName, rawValue] of Object.entries(source)) {
    const name = normalizeDirectiveName(rawName);
    target[name] = normalizeDirectiveValues(rawValue);
  }
}

export function sourceMatchesHost(
  configured: string,
  requested: string,
): boolean {
  if (configured === requested) {
    return true;
  }

  if (configured.startsWith("*.")) {
    const suffix = configured.slice(1);
    return requested.endsWith(suffix);
  }

  return false;
}
