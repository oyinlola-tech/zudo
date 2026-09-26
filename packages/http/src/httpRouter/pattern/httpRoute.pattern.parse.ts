/**
 * Route pattern parsing for the router core.
 *
 * Compiles a route path into an ordered list of segments that
 * {@link matchCompiledRoute} can evaluate against an incoming request path.
 *
 * Supported syntax:
 * - `/users/:id`            required parameter
 * - `/users/:id?`           optional parameter
 * - `/users/:id(\\d+)`       parameter constrained by a regular expression
 * - `/files/{name}`         brace parameter
 * - `/files/{name?:\\w+}`    optional, constrained brace parameter
 * - `/assets/*path`         trailing wildcard
 */

import type {
  CompiledSegment,
  CompiledSegmentParameter,
} from "../core/types/httpRouter.type.js";

import { DuplicateRouteParameterError } from "@zudojs/errors";

import { InvalidRoutePatternError } from "../core/error/httpRouter.error.js";

import {
  hasTrailingSlash,
  splitRoutePattern,
  validateParameterName,
} from "../core/util/httpRoute.util.js";

/**
 * A route path compiled into matchable segments.
 */
export interface CompiledRoutePath {
  readonly segments: readonly CompiledSegment[];
  readonly score: number;
  readonly strictTrailingSlash: boolean;
  readonly expectsTrailingSlash: boolean;
}

const SEGMENT_SCORE_LITERAL = 6;
const SEGMENT_SCORE_CONSTRAINED_PARAMETER = 5;
const SEGMENT_SCORE_PARAMETER = 4;
const SEGMENT_SCORE_ABSENT = 3;
const SEGMENT_SCORE_OPTIONAL_PARAMETER = 2;
const SEGMENT_SCORE_WILDCARD = 1;

/**
 * Compiles a route path into its segments.
 *
 * Rejects a pattern that reuses a parameter or wildcard name
 * ({@link DuplicateRouteParameterError}: `/bad/:a/:a` registered and the
 * second value silently won) and a wildcard that is not the final segment
 * ({@link InvalidRoutePatternError}: `/files/*rest/more` matched `/files/a/b`
 * with `more` never checked).
 */
export function compileRouteSegments(path: string): readonly CompiledSegment[] {
  const segments: CompiledSegment[] = [];

  const parts = splitRoutePattern(path);

  const names = new Set<string>();

  const claim = (name: string): void => {
    if (names.has(name)) {
      throw new DuplicateRouteParameterError(path, name);
    }

    names.add(name);
  };

  for (const [index, part] of parts.entries()) {
    if (part.startsWith(":")) {
      const parameter = parseParameter(part, path);

      claim(parameter.name);

      segments.push(parameter);
    } else if (part.startsWith("{")) {
      const parameter = parseBraceParameter(part, path);

      claim(parameter.name);

      segments.push(parameter);
    } else if (part.startsWith("*")) {
      if (index !== parts.length - 1) {
        throw new InvalidRoutePatternError(
          path,
          `A wildcard segment "${part}" must be the last segment.`,
        );
      }

      const name = part.slice(1) || "*";

      claim(name);

      segments.push({ type: "wildcard", name });
    } else {
      segments.push({
        type: "literal",
        value: part,
      });
    }
  }

  return Object.freeze(segments);
}

/**
 * Compiles a route path into segments plus a specificity score.
 *
 * Higher scores are more specific and are matched first.
 */
export function compileRoute(
  path: string,
  strictTrailingSlash: boolean,
): CompiledRoutePath {
  const segments = compileRouteSegments(path);

  return Object.freeze({
    segments,
    score: scoreSegments(segments),
    strictTrailingSlash,
    expectsTrailingSlash: hasTrailingSlash(path),
  });
}

/**
 * Scores compiled segments by specificity.
 */
export function scoreSegments(segments: readonly CompiledSegment[]): number {
  let score = 0;

  for (const segment of segments) {
    score += segmentScore(segment);
  }

  return score;
}

/**
 * Scores one segment by how narrowly it matches: a literal, then a parameter
 * with a regular expression constraint, then a plain parameter, then the end
 * of the pattern, then an optional parameter, then a wildcard.
 *
 * A constrained parameter used to score the same as an unconstrained one, so
 * `/x/:slug` registered before `/x/:id(\\d+)` left the id route unreachable.
 * The end of a pattern used to score lowest of all, so `/files/*path` (whose
 * wildcard matches an empty tail) and `/users/:id?` were tried before the
 * exact `/files` and `/users` routes, which could then never answer.
 */
export function segmentScore(segment: CompiledSegment | undefined): number {
  if (segment === undefined) {
    return SEGMENT_SCORE_ABSENT;
  }

  if (segment.type === "literal") {
    return SEGMENT_SCORE_LITERAL;
  }

  if (segment.type === "parameter") {
    if (segment.pattern !== undefined) {
      return SEGMENT_SCORE_CONSTRAINED_PARAMETER;
    }

    return segment.optional
      ? SEGMENT_SCORE_OPTIONAL_PARAMETER
      : SEGMENT_SCORE_PARAMETER;
  }

  return SEGMENT_SCORE_WILDCARD;
}

/**
 * Compares two compiled patterns by specificity, most specific first.
 *
 * Segments are compared left to right by kind (literal, then parameter, then
 * wildcard), which is how a router is expected to rank patterns. Summing the
 * kinds into one scalar — as this used to — let a longer but entirely
 * parameterised pattern such as `/:p/:q/:r/:s` outrank a literal-anchored
 * `/admin/*rest`, so a request to `/admin/a/b/c` bypassed the admin route and
 * every guard registered on it.
 *
 * @param left - The first pattern's segments.
 * @param right - The second pattern's segments.
 * @returns A negative number when `left` is more specific.
 */
export function compareSegmentSpecificity(
  left: readonly CompiledSegment[],
  right: readonly CompiledSegment[],
): number {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference = segmentScore(right[index]) - segmentScore(left[index]);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function parseParameter(
  segment: string,
  path: string,
): CompiledSegmentParameter {
  let value = segment.slice(1);

  let optional = false;

  if (value.endsWith("?")) {
    optional = true;

    value = value.slice(0, -1);
  }

  const patternStart = value.indexOf("(");

  if (patternStart >= 0 && value.endsWith(")")) {
    const name = value.slice(0, patternStart);

    const expression = value.slice(patternStart + 1, -1);

    validateParameterName(name, path);

    return {
      type: "parameter",
      name,
      optional,
      pattern: compileExpression(expression, path),
    };
  }

  validateParameterName(value, path);

  return {
    type: "parameter",
    name: value,
    optional,
    pattern: undefined,
  };
}

function parseBraceParameter(
  segment: string,
  path: string,
): CompiledSegmentParameter {
  const match = /^\{([a-zA-Z_][a-zA-Z0-9_-]*)(\?)?(?::(.+))?\}$/.exec(segment);

  if (!match) {
    throw new InvalidRoutePatternError(
      path,
      `Invalid parameter segment "${segment}".`,
    );
  }

  const [, name, optionalMarker, expression] = match;

  if (name === undefined) {
    throw new InvalidRoutePatternError(
      path,
      `Invalid parameter segment "${segment}".`,
    );
  }

  const optional = Boolean(optionalMarker);

  validateParameterName(name, path);

  return {
    type: "parameter",
    name,
    optional,
    pattern:
      expression === undefined
        ? undefined
        : compileExpression(expression, path),
  };
}

function compileExpression(expression: string, path: string): RegExp {
  try {
    return new RegExp(`^(?:${expression})$`);
  } catch (error) {
    throw new InvalidRoutePatternError(
      path,
      `Invalid parameter expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
