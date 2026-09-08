/**
 * Segment parsing for route patterns.
 *
 * @module httpRoute/pattern/segmentParsing
 */

import type { RouteSegment } from "./httpPattern.type.js";

import { RoutePatternError } from "./httpPattern.type.js";

/**
 * Parses a route pattern string into segments.
 */
export function parseSegments(pattern: string): readonly RouteSegment[] {
  const segments: RouteSegment[] = [];
  let i = 0;
  let wildcardIndex = 0;

  while (i < pattern.length) {
    if (pattern[i] === ":") {
      const result = compileColonParameter(pattern, i);
      segments.push(result.segment);
      i = result.endIndex;
    } else if (pattern[i] === "{") {
      const result = compileBraceParameter(pattern, i);
      segments.push(result.segment);
      i = result.endIndex;
    } else if (pattern[i] === "*") {
      /*
       * `*` is not a legal JavaScript regex group name, so a wildcard that
       * kept it could never be captured — the compiled pattern used a plain
       * `(.*)` and `match.groups["*"]` was always undefined. Give each
       * wildcard a real, unique name instead.
       */
      segments.push({
        type: "wildcard",
        name: `wildcard${wildcardIndex}`,
        optional: false,
      });
      wildcardIndex += 1;
      i++;
    } else {
      let value = "";
      while (
        i < pattern.length &&
        pattern[i] !== ":" &&
        pattern[i] !== "{" &&
        pattern[i] !== "*"
      ) {
        value += pattern[i];
        i++;
      }
      if (value) {
        segments.push({ type: "static", value });
      }
    }
  }

  return segments;
}

interface CompileResult {
  readonly segment: RouteSegment;
  readonly endIndex: number;
}

function compileColonParameter(
  pattern: string,
  startIndex: number,
): CompileResult {
  let i = startIndex + 1;
  let name = "";
  let optional = false;

  if (i < pattern.length && pattern[i] === "?") {
    optional = true;
    i++;
  }

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === undefined || !isValidParamChar(char)) {
      break;
    }

    name += char;
    i++;
  }

  if (!name) {
    throw new RoutePatternError("Parameter name cannot be empty", {
      pattern,
      position: startIndex,
    });
  }

  return {
    segment: { type: "parameter", name, optional },
    endIndex: i,
  };
}

function compileBraceParameter(
  pattern: string,
  startIndex: number,
): CompileResult {
  let i = startIndex + 1;
  let name = "";
  let optional = false;

  while (i < pattern.length && pattern[i] !== "}") {
    if (pattern[i] === "?" && i === startIndex + 1) {
      optional = true;
    } else {
      name += pattern[i];
    }
    i++;
  }

  if (i >= pattern.length) {
    throw new RoutePatternError("Unclosed brace parameter", {
      pattern,
      position: startIndex,
    });
  }

  i++; // Skip closing brace

  if (!name) {
    throw new RoutePatternError("Parameter name cannot be empty", {
      pattern,
      position: startIndex,
    });
  }

  return {
    segment: { type: "parameter", name, optional },
    endIndex: i,
  };
}

function isValidParamChar(char: string): boolean {
  return /[a-zA-Z0-9_]/.test(char);
}
