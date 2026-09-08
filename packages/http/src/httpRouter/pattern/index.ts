/**
 * HTTP router pattern compilation.
 *
 * Two complementary compilers live here:
 *
 * - `compileRoutePattern` (regex based) powers standalone pattern matching.
 * - `compileRoute` (segment based) powers the router core, and additionally
 *   supports per-parameter regular expression constraints.
 */

export {
  RoutePatternError,
  DuplicateRouteParameterError,
} from "./core/httpPattern.type.js";

export type {
  RouteSegment,
  StaticRouteSegment,
  ParameterRouteSegment,
  WildcardRouteSegment,
  RoutePatternOptions,
  CompiledRoutePattern,
  RouteMatch,
} from "./core/httpPattern.type.js";

export { compileRoutePattern } from "./core/httpPattern.compilation.js";

export { parseSegments } from "./core/httpPattern.segmentParsing.js";

export { buildRegex } from "./core/httpPattern.regexBuilding.js";

export {
  testRoutePattern,
  matchRoutePattern,
  matchRoutePatterns,
  testRoutePatterns,
} from "./core/httpPattern.matching.js";

export {
  createRoutePattern,
  createStrictRoutePattern,
  createCaseInsensitiveRoutePattern,
} from "./httpPattern.factory.js";

export {
  compileRoute,
  compileRouteSegments,
  scoreSegments,
} from "./httpRoute.pattern.parse.js";

export type { CompiledRoutePath } from "./httpRoute.pattern.parse.js";
