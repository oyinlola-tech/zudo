/**
 * Route shadow detection: a route at least as general as one tried before
 * it, for the same method, can never be reached. Only an exact duplicate
 * used to be refused, so `/x/:id` followed by `/x/:slug` registered without
 * complaint and the second handler never ran.
 */

import type {
  CompiledRoute,
  CompiledSegment,
  CompiledSegmentParameter,
  HttpMethod,
} from "../types/httpRouter.type.js";

/**
 * Whether `first`, which the router tries before `second`, matches every
 * request `second` matches, leaving `second` unreachable. Deliberately
 * conservative: only a shadow provable from the two patterns alone is
 * reported, so `/x/:id(\\d+)` before `/x/:slug` never is.
 *
 * @param first - The route tried first.
 * @param second - The route tried afterwards.
 * @param caseSensitive - The router's literal comparison mode.
 */
export function shadowsRoute(
  first: CompiledRoute,
  second: CompiledRoute,
  caseSensitive: boolean,
): boolean {
  if (!methodCovers(first.definition.method, second.definition.method)) {
    return false;
  }

  if (first.strictTrailingSlash !== second.strictTrailingSlash) {
    return false;
  }

  if (
    first.strictTrailingSlash &&
    (first.expectsTrailingSlash ?? false) !==
      (second.expectsTrailingSlash ?? false)
  ) {
    return false;
  }

  return segmentsCover(first.segments, second.segments, caseSensitive);
}

function methodCovers(
  first: HttpMethod | "*",
  second: HttpMethod | "*",
): boolean {
  return first === "*" || first === second;
}

function segmentsCover(
  first: readonly CompiledSegment[],
  second: readonly CompiledSegment[],
  caseSensitive: boolean,
): boolean {
  const length = Math.max(first.length, second.length);

  for (let index = 0; index < length; index += 1) {
    const left = first[index];

    const right = second[index];

    if (left === undefined) {
      return false;
    }

    if (left.type === "wildcard") {
      return true;
    }

    if (right === undefined) {
      return tailMatchesNothing(first, index);
    }

    if (!segmentCovers(left, right, caseSensitive)) {
      return false;
    }
  }

  return true;
}

function tailMatchesNothing(
  segments: readonly CompiledSegment[],
  start: number,
): boolean {
  for (let index = start; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment === undefined || segment.type === "wildcard") {
      continue;
    }

    if (segment.type === "literal" || !segment.optional) {
      return false;
    }
  }

  return true;
}

function segmentCovers(
  left: Exclude<CompiledSegment, { type: "wildcard" }>,
  right: CompiledSegment,
  caseSensitive: boolean,
): boolean {
  if (right.type === "wildcard") {
    return false;
  }

  if (left.type === "literal") {
    return (
      right.type === "literal" &&
      (caseSensitive
        ? left.value === right.value
        : left.value.toLowerCase() === right.value.toLowerCase())
    );
  }

  if (right.type === "literal") {
    return left.pattern === undefined || left.pattern.test(right.value);
  }

  if (right.optional && !left.optional) {
    return false;
  }

  return constraintCovers(left, right);
}

function constraintCovers(
  left: CompiledSegmentParameter,
  right: CompiledSegmentParameter,
): boolean {
  if (left.pattern === undefined) {
    return true;
  }

  return (
    right.pattern !== undefined &&
    right.pattern.source === left.pattern.source &&
    right.pattern.flags === left.pattern.flags
  );
}
