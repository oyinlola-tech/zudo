/**
 * Route tree traversal functions.
 *
 * @module httpRoute/tree/traversal
 */

import type { MutableRouteTreeNode } from "./httpTree.type.js";

import { literalKey } from "./httpTree.nodeCreation.js";

/**
 * A node that matched a path, with every parameter captured on the way.
 */
export interface RouteTreeCandidate {
  readonly node: MutableRouteTreeNode;
  readonly params: Readonly<Record<string, string>>;
}

/**
 * Collects the nodes matching `segments`, most specific first: at each level
 * a literal child, then parameter children, then an optional child skipped,
 * then a wildcard. Parameters are accumulated along the path — the old
 * traversal returned bare nodes, so only the last parameter was ever
 * reported — and a wildcard captures the rest of the path.
 */
export function collectMatches(
  node: MutableRouteTreeNode,
  segments: readonly string[],
  caseSensitive: boolean,
  index = 0,
  params: Readonly<Record<string, string>> = {},
): RouteTreeCandidate[] {
  const matches: RouteTreeCandidate[] = [];

  const recurse = (
    child: MutableRouteTreeNode,
    next: number,
    captured: Readonly<Record<string, string>>,
  ): void => {
    matches.push(...collectMatches(child, segments, caseSensitive, next, captured));
  };

  const segment = segments[index];

  if (segment === undefined) {
    if (node.handler !== undefined) {
      matches.push({ node, params });
    }

    for (const child of node.children.values()) {
      if (child.type === "optional") {
        recurse(child, index, params);
      } else if (child.type === "wildcard" && child.handler !== undefined) {
        matches.push({ node: child, params: { ...params, [child.param ?? "*"]: "" } });
      }
    }

    return matches;
  }

  const literal = node.children.get(literalKey(segment, caseSensitive));

  if (literal && literal.param === undefined && literal.type !== "wildcard") {
    recurse(literal, index + 1, params);
  }

  for (const child of node.children.values()) {
    if (child.param !== undefined && child.type !== "wildcard") {
      recurse(child, index + 1, { ...params, [child.param]: decodeSegment(segment) });
    }
  }

  for (const child of node.children.values()) {
    if (child.type === "optional") {
      recurse(child, index, params);
    }
  }

  for (const child of node.children.values()) {
    if (child.type === "wildcard" && child.handler !== undefined) {
      const rest = segments.slice(index).map(decodeSegment).join("/");

      matches.push({ node: child, params: { ...params, [child.param ?? "*"]: rest } });
    }
  }

  return matches;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Collects candidate nodes for `segments`, in priority order.
 *
 * Kept for compatibility; {@link collectMatches} also reports parameters.
 */
export function collectCandidates(
  node: MutableRouteTreeNode,
  segments: readonly string[],
): MutableRouteTreeNode[] {
  return collectMatches(node, segments, false).map((match) => match.node);
}
