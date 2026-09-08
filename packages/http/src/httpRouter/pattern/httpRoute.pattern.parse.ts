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

import { InvalidRoutePatternError } from "../core/error/httpRouter.error.js";

import {
  splitPath,
  validateParameterName,
} from "../core/util/httpRoute.util.js";

/**
 * A route path compiled into matchable segments.
 */
export interface CompiledRoutePath {
  readonly segments: readonly CompiledSegment[];
  readonly score: number;
  readonly strictTrailingSlash: boolean;
}

const SEGMENT_SCORE_LITERAL = 3;
const SEGMENT_SCORE_PARAMETER = 2;
const SEGMENT_SCORE_WILDCARD = 1;

/**
 * Compiles a route path into its segments.
 */
export function compileRouteSegments(path: string): readonly CompiledSegment[] {
  const segments: CompiledSegment[] = [];

  const parts = splitPath(path);

  for (const part of parts) {
    if (part.startsWith(":")) {
      segments.push(parseParameter(part, path));
    } else if (part.startsWith("{")) {
      segments.push(parseBraceParameter(part, path));
    } else if (part.startsWith("*")) {
      segments.push({
        type: "wildcard",
        name: part.slice(1) || "*",
      });
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
  });
}

/**
 * Scores compiled segments by specificity.
 */
export function scoreSegments(segments: readonly CompiledSegment[]): number {
  let score = 0;

  for (const segment of segments) {
    if (segment.type === "literal") {
      score += SEGMENT_SCORE_LITERAL;
    } else if (segment.type === "parameter") {
      score += SEGMENT_SCORE_PARAMETER;
    } else {
      score += SEGMENT_SCORE_WILDCARD;
    }
  }

  return score;
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
