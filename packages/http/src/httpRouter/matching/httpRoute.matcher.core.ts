/**
 * Compiled-route matching.
 *
 * Matches a request path against a route's compiled segments, honouring
 * case sensitivity, optional parameters, per-parameter regular expression
 * constraints, and trailing wildcards.
 */

import type { CompiledRoute } from "../core/types/httpRouter.type.js";

import {
  decodeRouteSegment,
  hasTrailingSlash,
  normalizePath,
  splitPath,
} from "../core/util/httpRoute.util.js";

export function matchCompiledRoute(
  route: CompiledRoute,
  path: string,
  caseSensitive: boolean,
): Readonly<Record<string, string>> | undefined {
  /*
   * `strictTrailingSlash` used to be compiled and stored but never read, so a
   * strict router still answered `/users/` with the `/users` route. The
   * request path reaches this function with its trailing slash intact
   * (`normalizeMatchPath`), so the two spellings can finally be told apart.
   */
  if (
    route.strictTrailingSlash &&
    hasTrailingSlash(path) !== (route.expectsTrailingSlash ?? false)
  ) {
    return undefined;
  }

  const routePath = normalizePath(path);

  const inputSegments = splitPath(routePath);

  const output: Record<string, string> = {};

  const routeSegments = route.segments;

  let inputIndex = 0;

  for (let segmentIndex = 0; segmentIndex < routeSegments.length; segmentIndex += 1) {
    const segment = routeSegments[segmentIndex];

    if (segment === undefined) {
      continue;
    }

    if (segment.type === "wildcard") {
      /*
       * Decode each segment separately and re-join. Decoding the joined tail
       * in one go would turn an encoded `%2f` into a real separator and let a
       * `%2e%2e` segment become `..`, so the tail a handler receives could
       * escape the prefix the wildcard was anchored to.
       */
      const decodedTail: string[] = [];

      for (const raw of inputSegments.slice(inputIndex)) {
        const decoded = decodeRouteSegment(raw);

        if (decoded === undefined) {
          return undefined;
        }

        decodedTail.push(decoded);
      }

      output[segment.name] = decodedTail.join("/");

      inputIndex = inputSegments.length;

      break;
    }

    const input = inputSegments[inputIndex];

    if (segment.type === "parameter" && segment.optional) {
      /*
       * An optional parameter only claims a segment when the segments that
       * follow it still have enough input left. Without that check
       * `/account/:id?/profile` swallowed `profile` as the id and then found
       * nothing to match its literal tail.
       */
      const remainingInput = inputSegments.length - inputIndex;

      if (
        input === undefined ||
        remainingInput <= requiredSegments(routeSegments, segmentIndex + 1)
      ) {
        continue;
      }
    }

    if (input === undefined) {
      return undefined;
    }

    if (segment.type === "literal") {
      const expected = caseSensitive
        ? segment.value
        : segment.value.toLowerCase();

      const actual = caseSensitive ? input : input.toLowerCase();

      if (expected !== actual) {
        return undefined;
      }

      inputIndex += 1;

      continue;
    }

    if (segment.type === "parameter") {
      const decoded = decodeRouteSegment(input);

      if (decoded === undefined) {
        return undefined;
      }

      if (segment.pattern && !segment.pattern.test(decoded)) {
        return undefined;
      }

      output[segment.name] = decoded;

      inputIndex += 1;
    }
  }

  if (inputIndex !== inputSegments.length) {
    return undefined;
  }

  return Object.freeze(output);
}

/**
 * Counts the segments from `start` onwards that must consume input.
 *
 * Optional parameters and wildcards can match nothing, so they do not count.
 *
 * @param segments - The route's compiled segments.
 * @param start - The index to count from.
 * @returns The number of segments that require an input segment.
 */
function requiredSegments(
  segments: readonly CompiledRoute["segments"][number][],
  start: number,
): number {
  let required = 0;

  for (let index = start; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment === undefined || segment.type === "wildcard") {
      continue;
    }

    if (segment.type === "parameter" && segment.optional) {
      continue;
    }

    required += 1;
  }

  return required;
}
