/**
 * Route tree enumeration helpers.
 *
 * @module httpRoute/tree/enumerate
 */

import type { MutableRouteTreeNode } from "./httpTree.type.js";

import { literalKey } from "./httpTree.nodeCreation.js";

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
        ? `${path}/:${child.param ?? key}`
        : child.type === "wildcard"
          ? `${path}/*${child.param ?? ""}`
          : `${path}/${child.name}`;
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
  return node.children.get(literalKey(name, false)) ?? node.children.get(name);
}
