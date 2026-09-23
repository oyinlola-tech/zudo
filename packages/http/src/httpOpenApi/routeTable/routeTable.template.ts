/**
 * Translation of compiled router patterns into OpenAPI path templates.
 *
 * Built from the compiled segments rather than the pattern string, so every
 * syntax the router accepts — `:id`, `{id}`, `:id(\\d+)`, `:id?`, `*rest` —
 * is read the way the router itself reads it.
 */

import type { RouteParameterMetadata } from "@zudojs/openapi";

import type { CompiledRoute } from "../../httpRouter/core/types/httpRouter.type.js";

/** How wildcard (`*rest`) segments are documented. */
export type HttpOpenAPIWildcardMode = "parameter" | "exclude";

/** One documented path for a route. */
export interface HttpOpenAPIPathVariant {
  /** The OpenAPI path template, e.g. `/users/{id}`. */
  readonly path: string;
  /** Constraints the pattern itself declares (regex, wildcard tail). */
  readonly inferredParameters: readonly RouteParameterMetadata[];
}

interface Draft {
  readonly parts: readonly string[];
  readonly parameters: readonly RouteParameterMetadata[];
}

/** The template slot name for a wildcard; a bare `*` becomes `wildcard`. */
export function wildcardParameterName(name: string): string {
  return name === "*" || name === "" ? "wildcard" : name;
}

/**
 * Lists the OpenAPI paths a compiled route answers.
 *
 * OpenAPI has no optional path parameters, so each optional segment doubles
 * the variants (with and without it). A wildcard becomes one templated slot
 * described as matching the rest of the path, or — with `wildcards:
 * "exclude"` — removes the route from the document (an empty list).
 */
export function routePathVariants(
  route: CompiledRoute,
  wildcards: HttpOpenAPIWildcardMode = "parameter",
): readonly HttpOpenAPIPathVariant[] {
  let drafts: Draft[] = [{ parts: [], parameters: [] }];

  for (const segment of route.segments) {
    if (segment.type === "literal") {
      drafts = drafts.map((draft) => ({
        ...draft,
        parts: [...draft.parts, segment.value],
      }));
      continue;
    }

    if (segment.type === "wildcard") {
      if (wildcards === "exclude") return [];
      const name = wildcardParameterName(segment.name);
      const parameter: RouteParameterMetadata = {
        name,
        in: "path",
        description: 'The rest of the path; may contain "/".',
        schema: { type: "string" },
      };
      drafts = drafts.map((draft) => ({
        parts: [...draft.parts, `{${name}}`],
        parameters: [...draft.parameters, parameter],
      }));
      continue;
    }

    const parameters: readonly RouteParameterMetadata[] =
      segment.pattern === undefined
        ? []
        : [
            {
              name: segment.name,
              in: "path",
              schema: { type: "string", pattern: segment.pattern.source },
            },
          ];
    const withSegment = drafts.map((draft) => ({
      parts: [...draft.parts, `{${segment.name}}`],
      parameters: [...draft.parameters, ...parameters],
    }));
    drafts = segment.optional ? [...drafts, ...withSegment] : withSegment;
  }

  const trailing =
    route.strictTrailingSlash && route.expectsTrailingSlash === true ? "/" : "";

  return drafts.map((draft) => ({
    path:
      draft.parts.length === 0 ? "/" : `/${draft.parts.join("/")}${trailing}`,
    inferredParameters: draft.parameters,
  }));
}
