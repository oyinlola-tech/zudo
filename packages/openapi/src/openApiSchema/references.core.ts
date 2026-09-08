import type { OpenAPIReference } from "../openApiTypes/openApiTypes.core.js";
import { COMPONENT_REF_PREFIX } from "../openApiConstants/openApiConstants.core.js";

/** The component sections a `$ref` may point into. */
export type ComponentSection =
  | "schemas"
  | "responses"
  | "parameters"
  | "requestBodies"
  | "headers"
  | "examples"
  | "securitySchemes"
  | "links"
  | "callbacks";

/**
 * Escapes a component name for use inside a JSON Pointer.
 *
 * RFC 6901 reserves `~` and `/`; a component called `Order/Line` produces a
 * pointer that resolves to the wrong place — or nowhere — unless they are
 * escaped. The `~0` substitution must come first, or the `~1` it introduces
 * would be escaped again.
 */
export function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Reverses {@link escapeJsonPointerSegment}. */
export function unescapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Creates an OpenAPI component reference.
 *
 * This is the single `$ref` builder in the package — the registry and the
 * schema registry both delegate here, so escaping cannot be right in one
 * place and missing in another.
 *
 * @param section - The component section (e.g., "schemas", "responses")
 * @param name - The component name
 */
export function createComponentReference(
  section: ComponentSection | string,
  name: string,
): OpenAPIReference {
  return {
    $ref: `${COMPONENT_REF_PREFIX}/${escapeJsonPointerSegment(section)}/${escapeJsonPointerSegment(name)}`,
  };
}
