/**
 * Route tree node creation utilities.
 *
 * @module httpRoute/tree/nodeCreation
 */

import type { MutableRouteTreeNode } from "./httpTree.type.js";

const BRACE_PARAMETER = /^\{([a-zA-Z_][a-zA-Z0-9_-]*)(\?)?(?::.+)?\}$/;

/**
 * The key a literal segment is stored under. Literals are compared
 * case-insensitively unless the tree is case sensitive, matching the router's
 * default; the tree used to match `/PAYMENTS/x` against nothing.
 */
export function literalKey(segment: string, caseSensitive: boolean): string {
  return caseSensitive ? segment : segment.toLowerCase();
}

/**
 * The key a pattern segment is stored under: literals by
 * {@link literalKey}, parameters and wildcards by their spelling.
 */
export function childKey(segment: string, caseSensitive: boolean): string {
  if (
    segment.startsWith(":") ||
    segment.startsWith("*") ||
    segment.startsWith("{")
  ) {
    return segment;
  }

  return literalKey(segment.endsWith("?") ? segment.slice(0, -1) : segment, caseSensitive);
}

function node(
  fields: Pick<MutableRouteTreeNode, "name" | "type" | "optional" | "wildcard"> &
    Partial<Pick<MutableRouteTreeNode, "param">>,
): MutableRouteTreeNode {
  return {
    ...fields,
    children: new Map(),
    methods: new Set(),
    metadata: {},
  };
}

/**
 * Creates a child node based on the segment.
 *
 * Understands every spelling the router does: `:id`, `:id?`, `{name}`,
 * `{name?}`, `*rest` (a named wildcard; only a bare `*` used to count, so
 * `/admin/*rest` was stored as a literal segment) and a static `name?`.
 */
export function createChildNode(segment: string): MutableRouteTreeNode {
  if (segment.startsWith(":")) {
    const optional = segment.endsWith("?");

    const name = segment.slice(1, optional ? -1 : undefined);

    return node({
      name,
      type: optional ? "optional" : "parameter",
      optional,
      wildcard: false,
      param: name,
    });
  }

  const brace = BRACE_PARAMETER.exec(segment);

  if (brace && brace[1] !== undefined) {
    const optional = brace[2] !== undefined;

    return node({
      name: brace[1],
      type: optional ? "optional" : "parameter",
      optional,
      wildcard: false,
      param: brace[1],
    });
  }

  if (segment.startsWith("*")) {
    const name = segment.slice(1) || "*";

    return node({ name, type: "wildcard", optional: false, wildcard: true, param: name });
  }

  if (segment.endsWith("?")) {
    return node({
      name: segment.slice(0, -1),
      type: "optional",
      optional: true,
      wildcard: false,
    });
  }

  return node({ name: segment, type: "static", optional: false, wildcard: false });
}
