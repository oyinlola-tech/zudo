/**
 * Route pattern matching.
 *
 * @module httpRoute/pattern/matching
 */

import type {
  CompiledRoutePattern,
  RouteMatch,
  RouteSegment,
} from "./httpPattern.type.js";

const TRAVERSAL_CHARS = /[\\\u0000]/;

/**
 * Decodes a captured pattern group.
 *
 * Matching happens against the still-encoded path, so `%2e%2e%2f` satisfies a
 * `[^/]+` parameter and only becomes `../` afterwards. Anything that decodes
 * into a traversal payload, or that is not valid percent-encoding at all,
 * fails the match rather than reaching a handler.
 */
function decodeCapture(
  value: string,
  kind: RouteSegment["type"],
): string | undefined {
  let decoded: string;

  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }

  if (TRAVERSAL_CHARS.test(decoded)) {
    return undefined;
  }

  const parts = kind === "wildcard" ? decoded.split("/") : [decoded];

  for (const part of parts) {
    if (part === "." || part === "..") {
      return undefined;
    }

    if (kind !== "wildcard" && part.includes("/")) {
      return undefined;
    }
  }

  return decoded;
}

/**
 * Tests if a path matches a compiled route pattern.
 */
export function testRoutePattern(
  pattern: CompiledRoutePattern,
  path: string,
): boolean {
  return pattern.regex.test(path);
}

/**
 * Matches a path against a compiled route pattern.
 */
export function matchRoutePattern(
  pattern: CompiledRoutePattern,
  path: string,
): RouteMatch | undefined {
  const match = path.match(pattern.regex);

  if (!match) {
    return undefined;
  }

  const params: Record<string, string> = {};

  const kinds = new Map<string, RouteSegment["type"]>();

  for (const segment of pattern.segments) {
    if (segment.type !== "static") {
      kinds.set(segment.name, segment.type);
    }
  }

  for (const name of pattern.paramNames) {
    const value = match.groups?.[name];

    if (value === undefined) {
      continue;
    }

    const decoded = decodeCapture(value, kinds.get(name) ?? "parameter");

    if (decoded === undefined) {
      return undefined;
    }

    params[name] = decoded;
  }

  return {
    params,
    path,
    pattern: pattern.original,
  };
}

/**
 * Matches a path against multiple compiled route patterns.
 */
export function matchRoutePatterns(
  patterns: readonly CompiledRoutePattern[],
  path: string,
): RouteMatch | undefined {
  for (const pattern of patterns) {
    const match = matchRoutePattern(pattern, path);
    if (match) {
      return match;
    }
  }
  return undefined;
}

/**
 * Tests if a path matches any of the compiled route patterns.
 */
export function testRoutePatterns(
  patterns: readonly CompiledRoutePattern[],
  path: string,
): boolean {
  return patterns.some((p) => testRoutePattern(p, path));
}
