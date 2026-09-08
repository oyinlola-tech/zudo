/**
 * Route tree traversal functions.
 *
 * @module httpRoute/tree/traversal
 */

import type { MutableRouteTreeNode } from "./httpTree.type.js";

/**
 * Collects candidates from the tree.
 */
export function collectCandidates(
  node: MutableRouteTreeNode,
  segments: readonly string[],
): MutableRouteTreeNode[] {
  if (segments.length === 0) {
    return [node];
  }

  const [segment, ...rest] = segments;

  if (segment === undefined) {
    return [node];
  }

  const candidates: MutableRouteTreeNode[] = [];

  const staticChild = node.children.get(segment);
  if (staticChild) {
    candidates.push(...collectCandidates(staticChild, rest));
  }

  for (const child of node.children.values()) {
    if (child.type === "parameter") {
      candidates.push(...collectCandidates(child, rest));
    }
    if (child.type === "wildcard") {
      candidates.push(child);
    }
    if (child.type === "optional") {
      candidates.push(...collectCandidates(child, rest));
      candidates.push(child);
    }
  }

  return candidates;
}

/**
 * Collects optional routes from the tree.
 */
export function collectOptionalRoutes(
  node: MutableRouteTreeNode,
): MutableRouteTreeNode[] {
  const results: MutableRouteTreeNode[] = [];

  for (const child of node.children.values()) {
    if (child.type === "optional" || child.wildcard) {
      results.push(child);
      results.push(...collectOptionalRoutes(child));
    }
  }

  return results;
}

/**
 * Collects all routes from the tree.
 */
export function collectRoutes(
  node: MutableRouteTreeNode,
  path: string,
): Array<{ readonly path: string; readonly node: MutableRouteTreeNode }> {
  const results: Array<{
    readonly path: string;
    readonly node: MutableRouteTreeNode;
  }> = [];

  if (node.handler) {
    results.push({ path, node });
  }

  for (const [key, child] of node.children) {
    const childPath =
      child.type === "parameter"
        ? `${path}:${key}`
        : child.type === "wildcard"
          ? `${path}*`
          : `${path}/${key}`;
    results.push(...collectRoutes(child, childPath));
  }

  return results;
}

/**
 * Finds a static child node.
 */
export function findStaticChild(
  node: MutableRouteTreeNode,
  name: string,
): MutableRouteTreeNode | undefined {
  return node.children.get(name);
}
