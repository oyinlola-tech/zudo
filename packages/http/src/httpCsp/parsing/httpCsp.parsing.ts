/**
 * CSP parsing functions.
 */

import type { CSPDirectives } from "../types/httpCsp.type.js";
import { splitPolicy, freezeDirectives } from "../internal/httpCsp.internal.js";

export function parseCSP(value: string | undefined | null): CSPDirectives {
  const result: Record<string, readonly string[]> = {};

  if (!value || value.trim().length === 0) {
    return Object.freeze(result);
  }

  for (const directive of splitPolicy(value)) {
    const parts = directive.trim().split(/\s+/);
    const name = parts.shift();

    if (!name) {
      continue;
    }

    const normalized = name.toLowerCase();

    if (result[normalized]) {
      result[normalized] = [...result[normalized], ...parts];
    } else {
      result[normalized] = parts;
    }
  }

  return freezeDirectives(result);
}

export function getCSPDirective(
  policy: string | CSPDirectives,
  directive: string,
): readonly string[] {
  const directives = typeof policy === "string" ? parseCSP(policy) : policy;

  return directives[directive.trim().toLowerCase()] ?? [];
}

export function hasCSPDirective(
  policy: string | CSPDirectives,
  directive: string,
): boolean {
  /*
   * The `length >= 0` conjunct this replaced was always true, so the function
   * was really just the hasOwnProperty check with a misleading first half.
   */
  return Object.prototype.hasOwnProperty.call(
    typeof policy === "string" ? parseCSP(policy) : policy,
    directive.trim().toLowerCase(),
  );
}

function getFallbackDirective(directive: string): string | undefined {
  const map: Record<string, string> = {
    "script-src-elem": "script-src",
    "script-src-attr": "script-src",
    "style-src-elem": "style-src",
    "style-src-attr": "style-src",
    "child-src": "default-src",
    "worker-src": "child-src",
    "frame-src": "child-src",
  };
  return map[directive];
}

export function getEffectiveDirective(
  policy: string | CSPDirectives,
  directive: string,
): readonly string[] {
  const directives = typeof policy === "string" ? parseCSP(policy) : policy;

  const normalized = directive.trim().toLowerCase();

  if (directives[normalized]) {
    return directives[normalized];
  }

  const fallback = getFallbackDirective(normalized);
  if (fallback && directives[fallback]) {
    return directives[fallback];
  }

  return directives["default-src"] ?? [];
}
