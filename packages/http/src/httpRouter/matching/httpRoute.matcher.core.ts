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
  normalizePath,
  splitPath,
} from "../core/util/httpRoute.util.js";

export function matchCompiledRoute(
  route: CompiledRoute,
  path: string,
  caseSensitive: boolean,
): Readonly<Record<string, string>> | undefined {
  const routePath = normalizePath(path);

  const inputSegments = splitPath(routePath);

  const output: Record<string, string> = {};

  const routeSegments = route.segments;

  let inputIndex = 0;

  for (const segment of routeSegments) {
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

    if (
      input === undefined &&
      segment.type === "parameter" &&
      segment.optional
    ) {
      continue;
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
