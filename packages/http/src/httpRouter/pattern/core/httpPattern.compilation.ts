/**
 * Route pattern compilation.
 *
 * @module httpRoute/pattern/compilation
 */

import type {
  RouteSegment,
  ParameterRouteSegment,
  WildcardRouteSegment,
  RoutePatternOptions,
  CompiledRoutePattern,
} from "./httpPattern.type.js";

import {
  RoutePatternError,
  DuplicateRouteParameterError,
} from "./httpPattern.type.js";

import { parseSegments } from "./httpPattern.segmentParsing.js";
import { buildRegex } from "./httpPattern.regexBuilding.js";

/**
 * Compiles a route pattern string into a CompiledRoutePattern.
 */
export function compileRoutePattern(
  pattern: string,
  options: RoutePatternOptions = {},
): CompiledRoutePattern {
  if (!pattern) {
    throw new RoutePatternError("Pattern cannot be empty", { pattern });
  }

  const segments = parseSegments(pattern);
  const paramNames = extractParamNames(segments);

  validateNoDuplicateParams(paramNames, pattern);

  const regex = buildRegex(segments, options);

  return {
    original: pattern,
    segments,
    regex,
    paramNames,
    options,
  };
}

function extractParamNames(
  segments: readonly RouteSegment[],
): readonly string[] {
  return segments
    .filter(
      (s): s is ParameterRouteSegment | WildcardRouteSegment =>
        s.type === "parameter" || s.type === "wildcard",
    )
    .map((s) => s.name);
}

function validateNoDuplicateParams(
  paramNames: readonly string[],
  pattern: string,
): void {
  const seen = new Set<string>();
  for (const name of paramNames) {
    if (name === "*") continue;
    if (seen.has(name)) {
      throw new DuplicateRouteParameterError(pattern, name);
    }
    seen.add(name);
  }
}
