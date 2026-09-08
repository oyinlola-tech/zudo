/**
 * Route tree helper functions.
 *
 * @module httpRoute/tree/helpers
 */

import type { MutableRouteTreeNode } from "./httpTree.type.js";

import { createChildNode } from "./httpTree.nodeCreation.js";

/**
 * Gets pattern segments from a path.
 */
export function getPatternSegments(path: string): readonly string[] {
  return path.split("/").filter(Boolean);
}

/**
 * Inserts a segment into the tree.
 */
export function insertSegment(
  node: MutableRouteTreeNode,
  segments: readonly string[],
  handler: unknown,
  methods: readonly string[],
  metadata: Record<string, unknown>,
): void {
  if (segments.length === 0) {
    node.handler = handler;
    for (const method of methods) {
      node.methods.add(method);
    }
    Object.assign(node.metadata, metadata);
    return;
  }

  const [segment, ...rest] = segments;

  if (segment === undefined) {
    return;
  }

  let child = node.children.get(segment);

  if (!child) {
    child = createChildNode(segment);
    node.children.set(segment, child);
  }

  insertSegment(child, rest, handler, methods, metadata);
}

/**
 * Removes a route from the tree.
 */
export function removeRouteFromTree(
  node: MutableRouteTreeNode,
  segments: readonly string[],
): boolean {
  if (segments.length === 0) {
    if (node.handler) {
      node.handler = undefined;
      node.methods.clear();
      return true;
    }
    return false;
  }

  const [segment, ...rest] = segments;

  if (segment === undefined) {
    return false;
  }

  const child = node.children.get(segment);

  if (!child) {
    return false;
  }

  const removed = removeRouteFromTree(child, rest);

  if (removed && isEmptyNode(child)) {
    node.children.delete(segment);
  }

  return removed;
}

/**
 * Checks if a node is empty.
 */
export function isEmptyNode(node: MutableRouteTreeNode): boolean {
  return node.children.size === 0 && !node.handler && node.methods.size === 0;
}

/**
 * Checks if a method matches.
 */
export function matchesMethod(
  node: MutableRouteTreeNode,
  method: string,
): boolean {
  return node.methods.has(method) || node.methods.has("*");
}

/**
 * Splits a path into segments.
 */
export function splitPath(path: string): readonly string[] {
  return path.split("/").filter(Boolean);
}
